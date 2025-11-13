#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Improved Firestore Migration Script v2
// ------------------------------------------------------------
// Properly migrates JSON files from Firebase Storage to Firestore
// with correct data structure
//
// Usage:
//   node migrate-to-firestore-v2.js [mode]
//
// Modes:
//   fresh    - Delete all data and re-import everything
//   update   - Only add new documents, skip existing ones (default)
//   force    - Update all documents, overwrite existing ones
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
// 🔹 Configuration
// ------------------------------------------------------------
const COLLECTIONS = {
  CATEGORIES: "categories",
  PROMPTS: "prompts",
  PROMPT_DETAILS: "promptDetails"
};

const DATA_FOLDER = "data/";
const args = process.argv.slice(2);
const MIGRATION_MODE = args[0] || "update";

// ------------------------------------------------------------
// 🔹 Helper: Fetch JSON from Storage
// ------------------------------------------------------------
async function fetchJSONFromStorage(fileName) {
  try {
    console.log(`📥 Downloading ${fileName}...`);
    const file = storage.file(`${DATA_FOLDER}${fileName}`);
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
// 🔹 Helper: Extract Array from JSON
// ------------------------------------------------------------
function extractArrayFromJSON(data, fileName) {
  // If data is already an array, return it
  if (Array.isArray(data)) {
    console.log(`   ✅ Direct array structure (${data.length} items)`);
    return data;
  }

  // If data is an object, try to find the array inside
  if (typeof data === "object" && data !== null) {
    const possibleKeys = ["data", "items", "results", "categories", "prompts", "promptDetails", "list"];

    for (const key of possibleKeys) {
      if (Array.isArray(data[key])) {
        console.log(`   ✅ Found array in '${key}' property (${data[key].length} items)`);
        return data[key];
      }
    }

    // Try to get first array property
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        console.log(`   ✅ Found array in '${key}' property (${data[key].length} items)`);
        return data[key];
      }
    }

    throw new Error(`No array found in JSON file: ${fileName}`);
  }

  throw new Error(`Invalid JSON structure in file: ${fileName}`);
}

// ------------------------------------------------------------
// 🔹 Helper: Get existing document IDs
// ------------------------------------------------------------
async function getExistingDocIds(collectionName) {
  try {
    const snapshot = await db.collection(collectionName).select().get();
    return new Set(snapshot.docs.map(doc => doc.id));
  } catch (error) {
    console.error(`❌ Error getting existing IDs:`, error.message);
    return new Set();
  }
}

// ------------------------------------------------------------
// 🔹 Helper: Batch Write to Firestore
// ------------------------------------------------------------
async function batchWriteToFirestore(collectionName, data, mode = "update") {
  if (!data || data.length === 0) {
    console.log(`⚠️  No data to write to ${collectionName}`);
    return { successCount: 0, errorCount: 0, skippedCount: 0 };
  }

  console.log(`\n📝 Processing ${data.length} documents for ${collectionName} (mode: ${mode})...`);

  // Get existing document IDs if in update mode
  let existingIds = new Set();
  if (mode === "update") {
    console.log(`   🔍 Checking existing documents...`);
    existingIds = await getExistingDocIds(collectionName);
    console.log(`   ℹ️  Found ${existingIds.size} existing documents`);
  }

  const batchSize = 500;
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = db.batch();
    const chunk = data.slice(i, i + batchSize);
    let batchCount = 0;

    chunk.forEach((item) => {
      try {
        const docId = item.docId; // Use pre-assigned docId
        const docData = item.data; // Use pre-processed data

        // Skip if in update mode and document already exists
        if (mode === "update" && docId && existingIds.has(docId)) {
          skippedCount++;
          return;
        }

        const docRef = db.collection(collectionName).doc(docId);

        if (mode === "force") {
          batch.set(docRef, docData, { merge: true });
        } else {
          batch.set(docRef, docData);
        }

        batchCount++;
      } catch (error) {
        console.error(`❌ Error preparing document:`, error.message);
        errorCount++;
      }
    });

    if (batchCount > 0) {
      try {
        await batch.commit();
        successCount += batchCount;
        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} committed (${batchCount} documents)`);
      } catch (error) {
        console.error(`❌ Batch commit failed:`, error.message);
        errorCount += batchCount;
      }
    } else if (chunk.length > 0) {
      console.log(`⏭️  Batch ${Math.floor(i / batchSize) + 1} skipped (all ${chunk.length} documents exist)`);
    }
  }

  console.log(`\n📊 Collection: ${collectionName}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);

  return { successCount, errorCount, skippedCount };
}

// ------------------------------------------------------------
// 🔹 Build Category Mapping (Name → ID)
// ------------------------------------------------------------
async function buildCategoryMapping() {
  const mapping = {};

  try {
    console.log(`\n🗺️  Building category mapping from Firestore...`);
    const snapshot = await db.collection(COLLECTIONS.CATEGORIES).get();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const name = data.name || data.category_name || data.categoryName || data.title;
      const id = doc.id;

      if (name && id) {
        mapping[name] = id;
        mapping[name.toLowerCase()] = id;
      }
    });

    console.log(`   ✅ Loaded ${snapshot.size} categories from Firestore`);
    console.log(`\n🗺️  Category mapping:`);
    Object.entries(mapping).forEach(([name, id]) => {
      if (name === name.toLowerCase()) return;
      console.log(`   ${name} → ${id}`);
    });

    return mapping;
  } catch (error) {
    console.error(`❌ Error fetching categories:`, error.message);
    return mapping;
  }
}

// ------------------------------------------------------------
// 🔹 Migrate Categories
// ------------------------------------------------------------
async function migrateCategories(categoryFiles, mode) {
  console.log("\n" + "=".repeat(60));
  console.log("🏷️  MIGRATING CATEGORIES");
  console.log("=".repeat(60));

  if (categoryFiles.length === 0) {
    console.log("⚠️  No category files found");
    return { successCount: 0, errorCount: 0, skippedCount: 0 };
  }

  let allCategoriesData = [];

  for (const fileName of categoryFiles) {
    const rawData = await fetchJSONFromStorage(fileName);
    const items = extractArrayFromJSON(rawData, fileName);

    items.forEach(item => {
      const docId = item._id || item.id;
      if (!docId) {
        console.warn(`⚠️  Category without _id, skipping:`, item);
        return;
      }

      // Remove _id and id from data (they're used as document ID)
      // eslint-disable-next-line no-unused-vars
      const { _id, id, ...cleanData } = item;

      allCategoriesData.push({
        docId,
        data: {
          ...cleanData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });
    });
  }

  const result = await batchWriteToFirestore(COLLECTIONS.CATEGORIES, allCategoriesData, mode);
  return result;
}

// ------------------------------------------------------------
// 🔹 Migrate Prompts
// ------------------------------------------------------------
async function migratePrompts(promptFiles, categoryMapping, mode) {
  console.log("\n" + "=".repeat(60));
  console.log("📝 MIGRATING PROMPTS");
  console.log("=".repeat(60));

  if (promptFiles.length === 0) {
    console.log("⚠️  No prompt files found");
    return { successCount: 0, errorCount: 0, skippedCount: 0 };
  }

  let allPromptsData = [];

  for (const fileName of promptFiles) {
    console.log(`\n📂 Processing ${fileName}...`);

    // Extract category name from filename (e.g., "prompts_Music.json" → "Music")
    const categoryName = fileName.match(/prompts_(.+)\.json$/i)?.[1];
    let categoryId = null;

    if (categoryName && categoryMapping) {
      categoryId = categoryMapping[categoryName] || categoryMapping[categoryName.toLowerCase()];

      if (categoryId) {
        console.log(`   🔗 Linked to category: ${categoryName} (${categoryId})`);
      } else {
        console.warn(`   ⚠️  Could not find category ID for: ${categoryName}`);
      }
    }

    const rawData = await fetchJSONFromStorage(fileName);
    const items = extractArrayFromJSON(rawData, fileName);

    items.forEach(item => {
      const docId = item._id || item.id;
      if (!docId) {
        console.warn(`⚠️  Prompt without _id, skipping`);
        return;
      }

      // Remove _id and id from data (they're used as document ID)
      // eslint-disable-next-line no-unused-vars
      const { _id, id, ...cleanData } = item;

      allPromptsData.push({
        docId,
        data: {
          ...cleanData,
          ...(categoryId && { categoryId }), // Add categoryId if found
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });
    });
  }

  const result = await batchWriteToFirestore(COLLECTIONS.PROMPTS, allPromptsData, mode);
  return result;
}

// ------------------------------------------------------------
// 🔹 Migrate Prompt Details
// ------------------------------------------------------------
async function migratePromptDetails(promptDetailFiles, mode) {
  console.log("\n" + "=".repeat(60));
  console.log("📄 MIGRATING PROMPT DETAILS");
  console.log("=".repeat(60));

  if (promptDetailFiles.length === 0) {
    console.log("⚠️  No prompt detail files found");
    return { successCount: 0, errorCount: 0, skippedCount: 0 };
  }

  let allDetailsData = [];

  for (const fileName of promptDetailFiles) {
    console.log(`\n📂 Processing ${fileName}...`);

    const rawData = await fetchJSONFromStorage(fileName);
    const items = extractArrayFromJSON(rawData, fileName);

    items.forEach(item => {
      // The document ID MUST be the prompt's _id
      const docId = item._id || item.id;
      if (!docId) {
        console.warn(`⚠️  Prompt detail without _id, skipping`);
        return;
      }

      // Remove _id from data (it becomes the document ID)
      const { _id, id, ...cleanData } = item;

      allDetailsData.push({
        docId,
        data: {
          ...cleanData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });
    });
  }

  const result = await batchWriteToFirestore(COLLECTIONS.PROMPT_DETAILS, allDetailsData, mode);
  return result;
}

// ------------------------------------------------------------
// 🔹 List and Categorize Files
// ------------------------------------------------------------
async function listAndCategorizeFiles() {
  console.log(`\n🔍 Discovering files in Storage: ${DATA_FOLDER}`);
  const [files] = await storage.getFiles({ prefix: DATA_FOLDER });

  const jsonFiles = files
    .filter(file => file.name.endsWith(".json"))
    .map(file => file.name.replace(DATA_FOLDER, ""));

  console.log(`✅ Found ${jsonFiles.length} JSON files`);

  const categorized = {
    categories: [],
    prompts: [],
    promptDetails: []
  };

  jsonFiles.forEach(fileName => {
    const lowerName = fileName.toLowerCase();

    if (lowerName.includes("category") || lowerName.startsWith("pt_category")) {
      categorized.categories.push(fileName);
    } else if (lowerName.startsWith("prompts_")) {
      categorized.prompts.push(fileName);
    } else if (lowerName.startsWith("promptdetails_")) {
      categorized.promptDetails.push(fileName);
    } else {
      console.warn(`⚠️  Skipping unrecognized file: ${fileName}`);
    }
  });

  console.log(`\n📊 File categorization:`);
  console.log(`   Categories: ${categorized.categories.length} files`);
  console.log(`   Prompts: ${categorized.prompts.length} files`);
  console.log(`   Prompt Details: ${categorized.promptDetails.length} files`);

  return categorized;
}

// ------------------------------------------------------------
// 🔹 Main Migration Function
// ------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 IMPROVED FIRESTORE MIGRATION V2");
  console.log("=".repeat(60));
  console.log(`\n📋 Migration Mode: ${MIGRATION_MODE.toUpperCase()}`);

  try {
    // Step 1: Discover and categorize files
    const categorizedFiles = await listAndCategorizeFiles();

    if (categorizedFiles.categories.length === 0 &&
        categorizedFiles.prompts.length === 0 &&
        categorizedFiles.promptDetails.length === 0) {
      console.log("\n⚠️  No JSON files found. Upload files to Firebase Storage data/ folder.");
      return;
    }

    // Step 2: Migrate categories first
    const categoriesResult = await migrateCategories(categorizedFiles.categories, MIGRATION_MODE);

    // Step 3: Build category mapping for linking prompts
    let categoryMapping = null;
    if (categoriesResult.successCount > 0 || MIGRATION_MODE === "update") {
      categoryMapping = await buildCategoryMapping();
    }

    // Step 4: Migrate prompts with category links
    const promptsResult = await migratePrompts(categorizedFiles.prompts, categoryMapping, MIGRATION_MODE);

    // Step 5: Migrate prompt details
    const promptDetailsResult = await migratePromptDetails(categorizedFiles.promptDetails, MIGRATION_MODE);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ MIGRATION COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📊 SUMMARY:");
    console.log(`   Categories: ${categoriesResult.successCount} added, ${categoriesResult.skippedCount} skipped`);
    console.log(`   Prompts: ${promptsResult.successCount} added, ${promptsResult.skippedCount} skipped`);
    console.log(`   Prompt Details: ${promptDetailsResult.successCount} added, ${promptDetailsResult.skippedCount} skipped`);

    const totalAdded = categoriesResult.successCount + promptsResult.successCount + promptDetailsResult.successCount;
    console.log(`\n   📈 TOTAL: ${totalAdded} documents added`);

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL DONE!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  }
}

main();
