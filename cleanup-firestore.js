#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Firestore Cleanup Script
// ------------------------------------------------------------
// This script deletes all documents from Firestore collections
//
// Usage:
//   node cleanup-firestore.js
//
// WARNING: This will permanently delete all data!
// ------------------------------------------------------------

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { resolve } from "path";

// ------------------------------------------------------------
// 🔹 Initialize Firebase Admin SDK
// ------------------------------------------------------------
const serviceAccount = JSON.parse(
  readFileSync(resolve("./serviceAccountKey.json"), "utf8")
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "prompto-4b381.firebasestorage.app",
  });
}

const db = admin.firestore();

// ------------------------------------------------------------
// 🔹 Configuration
// ------------------------------------------------------------
const COLLECTIONS = {
  CATEGORIES: "categories",
  PROMPTS: "prompts",
  PROMPT_DETAILS: "promptDetails"
};

// ------------------------------------------------------------
// 🔹 Helper: Delete all documents in a collection
// ------------------------------------------------------------
async function deleteCollection(collectionName) {
  console.log(`\n🗑️  Deleting all documents in '${collectionName}'...`);

  const batchSize = 500;
  let totalDeleted = 0;

  while (true) {
    const snapshot = await db.collection(collectionName)
      .limit(batchSize)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`   Deleted ${snapshot.size} documents (total: ${totalDeleted})`);

    // Small delay to avoid overwhelming Firestore
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Deleted ${totalDeleted} documents from '${collectionName}'`);
  return totalDeleted;
}

// ------------------------------------------------------------
// 🔹 Main Cleanup Function
// ------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("⚠️  FIRESTORE CLEANUP - DELETE ALL DATA");
  console.log("=".repeat(60));
  console.log("\nThis will permanently delete ALL documents from:");
  console.log("  - categories");
  console.log("  - prompts");
  console.log("  - promptDetails");
  console.log("\n" + "=".repeat(60));

  // Confirmation (auto-proceed in script)
  console.log("\n🚀 Starting cleanup in 3 seconds...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const results = {
      categories: await deleteCollection(COLLECTIONS.CATEGORIES),
      prompts: await deleteCollection(COLLECTIONS.PROMPTS),
      promptDetails: await deleteCollection(COLLECTIONS.PROMPT_DETAILS)
    };

    console.log("\n" + "=".repeat(60));
    console.log("✅ CLEANUP COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📊 SUMMARY:");
    console.log(`   Categories: ${results.categories} deleted`);
    console.log(`   Prompts: ${results.prompts} deleted`);
    console.log(`   Prompt Details: ${results.promptDetails} deleted`);

    const totalDeleted = results.categories + results.prompts + results.promptDetails;
    console.log(`\n   📈 TOTAL: ${totalDeleted} documents deleted`);

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Firestore is now clean!");
    console.log("=".repeat(60));
    console.log("\nNext step: Run the migration script in fresh mode:");
    console.log("   node migrate-to-firestore.js fresh\n");

  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  }
}

// Run cleanup
main();
