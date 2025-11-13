#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Firestore Database Verification Script
// ------------------------------------------------------------
// This script checks what data exists in your Firestore database
// Usage: node verify-firestore.js
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
const storage = admin.storage().bucket();

// ------------------------------------------------------------
// 🔹 Collections to check
// ------------------------------------------------------------
const COLLECTIONS = {
  CATEGORIES: "categories",
  PROMPTS: "prompts",
  PROMPT_DETAILS: "promptDetails"
};

// ------------------------------------------------------------
// 🔹 Check collection data
// ------------------------------------------------------------
async function checkCollection(collectionName) {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📦 Collection: ${collectionName}`);
    console.log("=".repeat(60));

    // Get count
    const countSnapshot = await db.collection(collectionName).count().get();
    const count = countSnapshot.data().count;

    console.log(`📊 Total documents: ${count}`);

    if (count > 0) {
      // Get first 3 documents as samples
      const snapshot = await db.collection(collectionName).limit(3).get();

      console.log(`\n📄 Sample documents (showing ${Math.min(3, count)} of ${count}):\n`);

      snapshot.docs.forEach((doc, index) => {
        console.log(`${index + 1}. Document ID: ${doc.id}`);
        const data = doc.data();

        // Show key fields only
        const keys = Object.keys(data).slice(0, 5);
        keys.forEach(key => {
          let value = data[key];
          if (typeof value === "object" && value !== null) {
            value = JSON.stringify(value).substring(0, 50) + "...";
          } else if (typeof value === "string" && value.length > 50) {
            value = value.substring(0, 50) + "...";
          }
          console.log(`   ${key}: ${value}`);
        });
        console.log("");
      });
    } else {
      console.log(`\n⚠️  Collection is EMPTY - no documents found`);
    }

    return count;
  } catch (error) {
    console.error(`❌ Error checking ${collectionName}:`, error.message);
    return 0;
  }
}

// ------------------------------------------------------------
// 🔹 Check Firebase Storage files
// ------------------------------------------------------------
async function checkStorageFiles() {
  try {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📁 Firebase Storage: data/ folder`);
    console.log("=".repeat(60));

    const [files] = await storage.getFiles({ prefix: "data/" });
    const jsonFiles = files.filter(file => file.name.endsWith(".json"));

    console.log(`📊 Total JSON files: ${jsonFiles.length}\n`);

    if (jsonFiles.length > 0) {
      // Categorize files
      const categories = {
        categories: [],
        prompts: [],
        promptDetails: [],
        other: []
      };

      jsonFiles.forEach(file => {
        const fileName = file.name.replace("data/", "");
        const lowerName = fileName.toLowerCase();

        if (lowerName.includes("category") || lowerName.startsWith("pt_category")) {
          categories.categories.push(fileName);
        } else if (lowerName.startsWith("prompts_")) {
          categories.prompts.push(fileName);
        } else if (lowerName.startsWith("promptdetails_")) {
          categories.promptDetails.push(fileName);
        } else {
          categories.other.push(fileName);
        }
      });

      console.log(`📁 File breakdown:`);
      console.log(`   Categories: ${categories.categories.length} files`);
      categories.categories.forEach(f => console.log(`      - ${f}`));

      console.log(`\n   Prompts: ${categories.prompts.length} files`);
      categories.prompts.forEach(f => console.log(`      - ${f}`));

      console.log(`\n   Prompt Details: ${categories.promptDetails.length} files`);
      categories.promptDetails.forEach(f => console.log(`      - ${f}`));

      if (categories.other.length > 0) {
        console.log(`\n   Other: ${categories.other.length} files`);
        categories.other.forEach(f => console.log(`      - ${f}`));
      }

      return categories;
    } else {
      console.log(`\n⚠️  No JSON files found in data/ folder`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error checking storage:`, error.message);
    return null;
  }
}

// ------------------------------------------------------------
// 🔹 Main verification function
// ------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 FIRESTORE DATABASE VERIFICATION");
  console.log("=".repeat(60));

  try {
    // Check all collections
    const categoriesCount = await checkCollection(COLLECTIONS.CATEGORIES);
    const promptsCount = await checkCollection(COLLECTIONS.PROMPTS);
    const promptDetailsCount = await checkCollection(COLLECTIONS.PROMPT_DETAILS);

    // Check storage files
    const storageFiles = await checkStorageFiles();

    // Summary
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log("\n🗄️  Firestore Database:");
    console.log(`   Categories: ${categoriesCount} documents`);
    console.log(`   Prompts: ${promptsCount} documents`);
    console.log(`   Prompt Details: ${promptDetailsCount} documents`);

    if (storageFiles) {
      console.log("\n📁 Firebase Storage (data/ folder):");
      console.log(`   Category files: ${storageFiles.categories.length}`);
      console.log(`   Prompt files: ${storageFiles.prompts.length}`);
      console.log(`   Prompt Detail files: ${storageFiles.promptDetails.length}`);
    }

    // Recommendations
    console.log(`\n${"=".repeat(60)}`);
    console.log("💡 RECOMMENDATIONS");
    console.log("=".repeat(60));

    if (promptsCount === 0 && promptDetailsCount === 0) {
      if (storageFiles && (storageFiles.prompts.length > 0 || storageFiles.promptDetails.length > 0)) {
        console.log("\n⚠️  Issue: Prompts and prompt details are missing from Firestore");
        console.log("✅ Solution: JSON files exist in Storage. Run migration:");
        console.log("   node migrate-to-firestore.js update");
      } else {
        console.log("\n❌ Issue: No prompt data in Firestore or Storage");
        console.log("⚠️  Action needed: Upload prompt JSON files to Firebase Storage data/ folder");
        console.log("   Then run: node migrate-to-firestore.js");
      }
    } else if (promptsCount > 0 && promptDetailsCount === 0) {
      console.log("\n⚠️  Issue: Prompts exist but prompt details are missing");
      console.log("✅ Solution: Run migration to import prompt details:");
      console.log("   node migrate-to-firestore.js update");
    } else if (categoriesCount > 0 && promptsCount > 0 && promptDetailsCount > 0) {
      console.log("\n✅ All collections have data!");
      console.log("📊 Your database is properly set up.");
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("✅ VERIFICATION COMPLETE");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\n❌ Verification failed:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  }
}

// Run verification
main();
