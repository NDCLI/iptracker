import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
} from "firebase/firestore";
import fs from "fs";
import path from "path";

let db: any = null;

// Initialize Firebase using the configuration file synchronously if possible
function initFirebase() {
  if (getApps().length > 0) {
    db = getFirestore(getApps()[0]);
    return;
  }
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);

      const app = initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
      db = getFirestore(app, config.firestoreDatabaseId || "(default)");
      console.log("Firebase initialized successfully");
    }
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
}

const HISTORY_FILE = path.join(process.cwd(), "data", "visitors_history.json");

async function loadHistoryLocal(): Promise<Record<string, any>> {
  try {
    if (!fs.existsSync(path.dirname(HISTORY_FILE))) {
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    }
    if (fs.existsSync(HISTORY_FILE)) {
      const content = await fs.promises.readFile(HISTORY_FILE, "utf-8");
      return JSON.parse(content);
    }
    return {};
  } catch (error) {
    return {};
  }
}

async function saveHistoryLocal(history: Record<string, any>) {
  try {
    if (!fs.existsSync(path.dirname(HISTORY_FILE))) {
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    }
    await fs.promises.writeFile(
      HISTORY_FILE,
      JSON.stringify(history, null, 2),
      "utf-8",
    );
  } catch (error) {
    console.error("Failed to save local history backup:", error);
  }
}

async function loadHistory(): Promise<Record<string, any>> {
  if (db) {
    try {
      const querySnapshot = await getDocs(collection(db, "visitors"));
      const history: Record<string, any> = {};
      querySnapshot.forEach((doc: any) => {
        history[doc.id] = doc.data();
      });
      if (Object.keys(history).length > 0) {
        await saveHistoryLocal(history);
      }
      return history;
    } catch (error) {
      console.error(
        "Failed to load history from Firestore, using local backup:",
        error,
      );
    }
  }
  return loadHistoryLocal();
}

export default async function handler(req: any, res: any) {
  initFirebase();

  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  const history = await loadHistory();

  if (!personalApiKey || !projectId) {
    const savedVisitors = Object.values(history).sort(
      (a: any, b: any) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );
    return res.json({
      visitors: savedVisitors,
      recentEvents: savedVisitors,
      warning:
        "Missing POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID env variables. Showing cached history.",
    });
  }

  try {
    const url = `https://app.posthog.com/api/projects/${projectId}/events/?limit=100`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${personalApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      let errorDetail = `Failed to fetch from PostHog: ${response.statusText}`;
      try {
        const jsonErr = JSON.parse(text);
        if (jsonErr.detail) errorDetail = jsonErr.detail;
      } catch (e) {}

      const savedVisitors = Object.values(history).sort(
        (a: any, b: any) =>
          new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
      );
      return res.json({
        visitors: savedVisitors,
        recentEvents: savedVisitors,
        error: `PostHog API Error: ${errorDetail}. Loaded cached history.`,
      });
    }

    const data = await response.json();
    const results = data.results || [];
    let hasNewData = false;

    const recentEvents = results
      .map((event: any) => {
        const props = event.properties || {};
        return {
          ip: props["$ip"] || props["ip"],
          city: props["$geoip_city_name"] || "Unknown City",
          country: props["$geoip_country_name"] || "Unknown Country",
          os: props["$os"] || "Unknown OS",
          browser: props["$browser"] || "Unknown Browser",
          url: props["$current_url"] || props["url"] || "Unknown URL",
          lastSeen: event.timestamp || new Date().toISOString(),
        };
      })
      .filter((e: any) => e.ip && e.ip !== "127.0.0.1" && e.ip !== "::1");

    for (const event of results) {
      const props = event.properties || {};
      const ip = props["$ip"] || props["ip"];

      if (ip && ip !== "127.0.0.1" && ip !== "::1") {
        const timestamp = event.timestamp || new Date().toISOString();
        const existing = history[ip];

        if (!existing || new Date(timestamp) > new Date(existing.lastSeen)) {
          const visitorData = {
            ip,
            city: props["$geoip_city_name"] || existing?.city || "Unknown City",
            country:
              props["$geoip_country_name"] ||
              existing?.country ||
              "Unknown Country",
            os: props["$os"] || existing?.os || "Unknown OS",
            browser:
              props["$browser"] || existing?.browser || "Unknown Browser",
            url: props["$current_url"] || props["url"] || existing?.url || "Unknown URL",
            lastSeen: timestamp,
          };

          history[ip] = visitorData;
          hasNewData = true;

          if (db) {
            try {
              await setDoc(doc(db, "visitors", ip), visitorData);
            } catch (fsErr) {
              console.error(
                `Failed to write visitor ${ip} to Firestore:`,
                fsErr,
              );
            }
          }
        }
      }
    }

    if (hasNewData) {
      await saveHistoryLocal(history);
    }

    const visitors = Object.values(history).sort(
      (a: any, b: any) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );

    res.json({ visitors, recentEvents });
  } catch (error) {
    const savedVisitors = Object.values(history).sort(
      (a: any, b: any) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );
    res.json({
      visitors: savedVisitors,
      recentEvents: savedVisitors,
      error:
        "Internal server error connecting to PostHog. Loaded cached history.",
    });
  }
}
