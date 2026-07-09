import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const HISTORY_FILE = path.join(process.cwd(), "data", "visitors_history.json");

// Helper to ensure data directory exists and load history
async function loadHistory(): Promise<Record<string, any>> {
  try {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    const content = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return {};
  }
}

// Helper to save history
async function saveHistory(history: Record<string, any>) {
  try {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save history file:", error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API to fetch recent visitors from PostHog and merge with saved history
  app.get("/api/visitors", async (req, res) => {
    const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;

    // Load previously saved history first
    const history = await loadHistory();

    if (!personalApiKey || !projectId) {
      // If environment variables are not set, at least return the saved history
      const savedVisitors = Object.values(history).sort(
        (a: any, b: any) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      );
      return res.json({ 
        visitors: savedVisitors,
        warning: "Missing POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID env variables. Showing cached offline history."
      });
    }

    try {
      // Fetch the 100 most recent events directly from the hot ingestion pipeline (real-time)
      const url = `https://app.posthog.com/api/projects/${projectId}/events/?limit=100`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${personalApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("PostHog API Error:", text);
        let errorDetail = `Failed to fetch from PostHog: ${response.statusText}`;
        try {
          const jsonErr = JSON.parse(text);
          if (jsonErr.detail) errorDetail = jsonErr.detail;
        } catch(e) {}
        
        // On API error, gracefully fall back to returning saved history
        const savedVisitors = Object.values(history).sort(
          (a: any, b: any) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
        );
        return res.json({ 
          visitors: savedVisitors,
          error: `PostHog API Error: ${errorDetail}. Loaded cached history.`
        });
      }

      const data = await response.json();
      const results = data.results || [];
      let hasNewData = false;
      
      for (const event of results) {
        const props = event.properties || {};
        const ip = props['$ip'] || props['ip'];
        
        if (ip && ip !== '127.0.0.1' && ip !== '::1') {
          const timestamp = event.timestamp || new Date().toISOString();
          const existing = history[ip];

          // If IP is new, or the event timestamp is newer than our recorded one
          if (!existing || new Date(timestamp) > new Date(existing.lastSeen)) {
            history[ip] = {
              ip,
              city: props['$geoip_city_name'] || existing?.city || 'Unknown City',
              country: props['$geoip_country_name'] || existing?.country || 'Unknown Country',
              os: props['$os'] || existing?.os || 'Unknown OS',
              browser: props['$browser'] || existing?.browser || 'Unknown Browser',
              lastSeen: timestamp
            };
            hasNewData = true;
          }
        }
      }

      // If we found newer IP visits, persist them to the JSON file
      if (hasNewData) {
        await saveHistory(history);
      }

      // Return the complete merged history sorted by lastSeen descending
      const visitors = Object.values(history).sort(
        (a: any, b: any) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      );

      res.json({ visitors });
    } catch (error) {
      console.error("Server Error:", error);
      // Fallback to local cached data on connection exceptions
      const savedVisitors = Object.values(history).sort(
        (a: any, b: any) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
      );
      res.json({ 
        visitors: savedVisitors, 
        error: "Internal server error connecting to PostHog. Loaded cached history." 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
