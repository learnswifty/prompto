#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Inspect JSON Files Structure
// ------------------------------------------------------------
// Download and inspect the structure of JSON files in Storage
// ------------------------------------------------------------

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { resolve } from "path";

const serviceAccount = JSON.parse(
  readFileSync(resolve("./serviceAccountKey.json"), "utf8")
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "prompto-4b381.firebasestorage.app",
  });
}

const storage = admin.storage().bucket();

async function inspectFile(fileName) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📄 File: ${fileName}`);
    console.log("=".repeat(60));

    const file = storage.file(`data/${fileName}`);
    const [exists] = await file.exists();

    if (!exists) {
      console.log(`❌ File not found`);
      return;
    }

    const [contents] = await file.download();
    const data = JSON.parse(contents.toString());

    console.log(`\n📊 Root structure type: ${Array.isArray(data) ? 'Array' : 'Object'}`);

    if (Array.isArray(data)) {
      console.log(`📊 Array length: ${data.length}`);
      if (data.length > 0) {
        console.log(`\n📝 First item structure:`);
        console.log(JSON.stringify(data[0], null, 2).substring(0, 500));
      }
    } else if (typeof data === 'object') {
      console.log(`📊 Object keys: ${Object.keys(data).join(', ')}`);

      // Check if any property is an array
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          console.log(`\n📝 Found array in property '${key}' with ${value.length} items`);
          if (value.length > 0) {
            console.log(`\n📝 First item in '${key}':`);
            console.log(JSON.stringify(value[0], null, 2).substring(0, 500));
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error inspecting ${fileName}:`, error.message);
  }
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 INSPECTING JSON FILES IN STORAGE");
  console.log("=".repeat(60));

  try {
    const [files] = await storage.getFiles({ prefix: "data/" });
    const jsonFiles = files
      .filter(file => file.name.endsWith(".json"))
      .map(file => file.name.replace("data/", ""));

    console.log(`\n📊 Found ${jsonFiles.length} JSON files`);

    for (const fileName of jsonFiles) {
      await inspectFile(fileName);
    }

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
