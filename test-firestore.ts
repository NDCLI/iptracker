import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function check() {
  const querySnapshot = await getDocs(collection(db, "visitors"));
  console.log(`There are ${querySnapshot.docs.length} documents left.`);
}

check();
