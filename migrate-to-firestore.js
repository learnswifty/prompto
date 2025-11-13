#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Firestore Migration Script
// ------------------------------------------------------------
// This script migrates JSON files from Firebase Storage to Firestore
//
// Usage:
//   node migrate-to-firestore.js
//
// Prerequisites:
//   1. Firebase Admin SDK initialized
//   2. JSON files in Firebase Storage at data/ folder
//   3. Service account credentials configured
// ------------------------------------------------------------

import admin from "firebase-admin";
// import { readFileSync } from "fs";
// import { resolve } from "path";

// ------------------------------------------------------------
// 🔹 Initialize Firebase Admin SDK
// ------------------------------------------------------------
// Uncomment and configure your service account
// const serviceAccount = JSON.parse(
//   readFileSync(resolve("./serviceAccountKey.json"), "utf8")
// );

if (!admin.apps.length) {
  admin.initializeApp({
    // credential: admin.credential.cert(serviceAccount),
    storageBucket: "prompto-4b381.firebasestorage.app",
  });
}

const db = admin.firestore();
const storage = admin.storage().bucket();

// ------------------------------------------------------------
// 🔹 Configuration
// ------------------------------------------------------------
const COLLECTIONS = {
  CATEGORIES: "categories",
  PROMPTS: "prompts",
  PROMPT_DETAILS: "promptDetails"
};

// Mapping of your JSON files to Firestore collections
const MIGRATION_CONFIG = {
  categories: {
    file: "pt_category.json",
    collection: COLLECTIONS.CATEGORIES,
    // Optional: transform function to modify data before upload
    transform: (item) => ({
      ...item,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })
  },
  prompts: {
    files: [
      { name: "prompts_Trending.json", categoryId: "68b02e0a58d4d99aeb2854a7" },
      { name: "prompts_DualPortrait.json", categoryId: "69130574acb1236b2a7a40d8" },
      { name: "prompts_Editorial.json", categoryId: "33be2fab88f08eabfdfcdbd1" }
    ],
    collection: COLLECTIONS.PROMPTS,
    transform: (item, categoryId) => ({
      ...item,
      categoryId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })
  },
  promptDetails: {
    files: [
      "promptDetails_Trending.json",
      "promptDetails_DualPortrait.json",
      "promptDetails_Editorial.json"
    ],
    collection: COLLECTIONS.PROMPT_DETAILS,
    transform: (item) => ({
      ...item,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })
  }
};

// ------------------------------------------------------------
// 🔹 Helper: Fetch JSON from Storage
// ------------------------------------------------------------
async function fetchJSONFromStorage(fileName) {
  try {
    console.log(`📥 Downloading ${fileName}...`);
    const file = storage.file(`data/${fileName}`);
    const [exists] = await file.exists();

    if (!exists) {
      throw new Error(`FILE_NOT_FOUND: ${fileName}`);
    }

    const [contents] = await file.download();
    return JSON.parse(contents.toString());
  } catch (error) {
    console.error(`❌ Error fetching ${fileName}:`, error.message);
    throw error;
  }
}

// ------------------------------------------------------------
// 🔹 Helper: Batch Write to Firestore
// ------------------------------------------------------------
async function batchWriteToFirestore(collectionName, data, useIdField = true) {
  console.log(`\n📝 Writing ${data.length} documents to ${collectionName}...`);

  const batchSize = 500; // Firestore batch limit
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = db.batch();
    const chunk = data.slice(i, i + batchSize);

    chunk.forEach((item) => {
      try {
        // Use _id from data if available, otherwise auto-generate
        const docId = useIdField && item._id ? item._id : undefined;
        const docRef = docId
          ? db.collection(collectionName).doc(docId)
          : db.collection(collectionName).doc();

        // Remove _id from data if it exists (it's stored as document ID)
        const { ...dataWithoutId } = item;

        batch.set(docRef, dataWithoutId);
        successCount++;
      } catch (error) {
        console.error(`❌ Error preparing document:`, error.message);
        errorCount++;
      }
    });

    try {
      await batch.commit();
      console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} committed (${chunk.length} documents)`);
    } catch (error) {
      console.error(`❌ Batch commit failed:`, error.message);
      errorCount += chunk.length;
      successCount -= chunk.length;
    }
  }

  console.log(`\n📊 Collection: ${collectionName}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);

  return { successCount, errorCount };
}

// ------------------------------------------------------------
// 🔹 Migrate Categories
// ------------------------------------------------------------
async function migrateCategories() {
  console.log("\n" + "=".repeat(60));
  console.log("🏷️  MIGRATING CATEGORIES");
  console.log("=".repeat(60));

  const config = MIGRATION_CONFIG.categories;
  const data = await fetchJSONFromStorage(config.file);

  const transformedData = config.transform
    ? data.map(item => config.transform(item))
    : data;

  return await batchWriteToFirestore(config.collection, transformedData, true);
}

// ------------------------------------------------------------
// 🔹 Migrate Prompts
// ------------------------------------------------------------
async function migratePrompts() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 MIGRATING PROMPTS");
  console.log("=".repeat(60));

  const config = MIGRATION_CONFIG.prompts;
  let totalSuccess = 0;
  let totalErrors = 0;

  for (const fileConfig of config.files) {
    console.log(`\n📂 Processing ${fileConfig.name}...`);
    const data = await fetchJSONFromStorage(fileConfig.name);

    const transformedData = config.transform
      ? data.map(item => config.transform(item, fileConfig.categoryId))
      : data.map(item => ({ ...item, categoryId: fileConfig.categoryId }));

    const result = await batchWriteToFirestore(config.collection, transformedData, true);
    totalSuccess += result.successCount;
    totalErrors += result.errorCount;
  }

  console.log(`\n📊 TOTAL PROMPTS:`);
  console.log(`   ✅ Success: ${totalSuccess}`);
  console.log(`   ❌ Failed: ${totalErrors}`);

  return { successCount: totalSuccess, errorCount: totalErrors };
}

// ------------------------------------------------------------
// 🔹 Migrate Prompt Details
// ------------------------------------------------------------
async function migratePromptDetails() {
  console.log("\n" + "=".repeat(60));
  console.log("📄 MIGRATING PROMPT DETAILS");
  console.log("=".repeat(60));

  const config = MIGRATION_CONFIG.promptDetails;
  let totalSuccess = 0;
  let totalErrors = 0;

  for (const fileName of config.files) {
    console.log(`\n📂 Processing ${fileName}...`);
    const data = await fetchJSONFromStorage(fileName);

    const transformedData = config.transform
      ? data.map(item => config.transform(item))
      : data;

    const result = await batchWriteToFirestore(config.collection, transformedData, true);
    totalSuccess += result.successCount;
    totalErrors += result.errorCount;
  }

  console.log(`\n📊 TOTAL PROMPT DETAILS:`);
  console.log(`   ✅ Success: ${totalSuccess}`);
  console.log(`   ❌ Failed: ${totalErrors}`);

  return { successCount: totalSuccess, errorCount: totalErrors };
}

// ------------------------------------------------------------
// 🔹 Create Firestore Indexes
// ------------------------------------------------------------
async function createIndexes() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 FIRESTORE INDEXES NEEDED");
  console.log("=".repeat(60));
  console.log("\nFor optimal performance, create these indexes:");
  console.log("\n1. Collection: prompts");
  console.log("   Fields: categoryId (Ascending), createdAt (Descending)");
  console.log("\n2. To create indexes, go to:");
  console.log("   Firebase Console → Firestore Database → Indexes");
  console.log("\nOr use the Firebase CLI:");
  console.log("   firebase deploy --only firestore:indexes");
}

// ------------------------------------------------------------
// 🔹 Main Migration Function
// ------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 STARTING FIRESTORE MIGRATION");
  console.log("=".repeat(60));

  try {
    const results = {
      categories: await migrateCategories(),
      prompts: await migratePrompts(),
      promptDetails: await migratePromptDetails()
    };

    console.log("\n" + "=".repeat(60));
    console.log("✅ MIGRATION COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📊 SUMMARY:");
    console.log(`   Categories: ${results.categories.successCount} success, ${results.categories.errorCount} errors`);
    console.log(`   Prompts: ${results.prompts.successCount} success, ${results.prompts.errorCount} errors`);
    console.log(`   Prompt Details: ${results.promptDetails.successCount} success, ${results.promptDetails.errorCount} errors`);

    await createIndexes();

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL DONE!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run migration
main();
