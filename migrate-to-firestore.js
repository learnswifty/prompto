#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Dynamic Firestore Migration Script
// ------------------------------------------------------------
// This script automatically discovers and migrates JSON files
// from Firebase Storage (data/ folder) to Firestore
//
// Usage:
//   node migrate-to-firestore.js [mode]
//
// Modes:
//   fresh    - Delete all data and re-import everything (default for first run)
//   update   - Only add new documents, skip existing ones (recommended)
//   force    - Update all documents, overwrite existing ones
//
// Examples:
//   node migrate-to-firestore.js           # Auto-detect mode
//   node migrate-to-firestore.js update    # Incremental update
//   node migrate-to-firestore.js fresh     # Fresh import
//   node migrate-to-firestore.js force     # Force update all
//
// Prerequisites:
//   1. Firebase Admin SDK initialized
//   2. JSON files uploaded to Firebase Storage in data/ folder
//   3. Service account credentials configured (serviceAccountKey.json)
//
// File naming conventions:
//   - *category*.json → categories collection
//   - prompts_*.json → prompts collection
//   - promptDetails_*.json → promptDetails collection
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

// Parse command line arguments
const args = process.argv.slice(2);
const MIGRATION_MODE = args[0] || "auto"; // auto, fresh, update, force

// ------------------------------------------------------------
// 🔹 Helper: Check if collection has data
// ------------------------------------------------------------
async function hasExistingData(collectionName) {
  try {
    const snapshot = await db.collection(collectionName).limit(1).get();
    return !snapshot.empty;
  } catch (error) {
    return false;
  }
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
// 🔹 Helper: Determine migration mode
// ------------------------------------------------------------
async function determineMigrationMode() {
  if (MIGRATION_MODE !== "auto") {
    return MIGRATION_MODE;
  }

  // Auto-detect: if any collection has data, use 'update' mode, otherwise 'fresh'
  const hasCategories = await hasExistingData(COLLECTIONS.CATEGORIES);
  const hasPrompts = await hasExistingData(COLLECTIONS.PROMPTS);
  const hasDetails = await hasExistingData(COLLECTIONS.PROMPT_DETAILS);

  if (hasCategories || hasPrompts || hasDetails) {
    console.log("🔍 Detected existing data. Using 'update' mode (incremental).");
    return "update";
  } else {
    console.log("🔍 No existing data found. Using 'fresh' mode.");
    return "fresh";
  }
}

// ------------------------------------------------------------
// 🔹 Helper: List all files in Storage
// ------------------------------------------------------------
async function listFilesInStorage(prefix = DATA_FOLDER) {
  try {
    console.log(`\n🔍 Discovering files in Storage: ${prefix}`);
    const [files] = await storage.getFiles({ prefix });

    const jsonFiles = files
      .filter(file => file.name.endsWith(".json"))
      .map(file => file.name.replace(prefix, ""));

    console.log(`✅ Found ${jsonFiles.length} JSON files:`);
    jsonFiles.forEach(file => console.log(`   📄 ${file}`));

    return jsonFiles;
  } catch (error) {
    console.error(`❌ Error listing files:`, error.message);
    throw error;
  }
}

// ------------------------------------------------------------
// 🔹 Helper: Categorize files by type
// ------------------------------------------------------------
function categorizeFiles(fileNames) {
  const categorized = {
    categories: [],
    prompts: [],
    promptDetails: []
  };

  fileNames.forEach(fileName => {
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
// 🔹 Helper: Extract category name from filename
// ------------------------------------------------------------
function extractCategoryName(fileName) {
  // Extract category name from patterns like:
  // "prompts_Trending.json" → "Trending"
  // "promptDetails_DualPortrait.json" → "DualPortrait"
  const match = fileName.match(/(?:prompts_|promptDetails_)(.+)\.json$/i);
  return match ? match[1] : null;
}

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
// 🔹 Helper: Extract Array from JSON (handles various structures)
// ------------------------------------------------------------
function extractArrayFromJSON(data, fileName) {
  // If data is already an array, return it
  if (Array.isArray(data)) {
    console.log(`   ✅ Direct array structure detected (${data.length} items)`);
    return data;
  }

  // If data is an object, try to find the array inside
  if (typeof data === "object" && data !== null) {
    // Try common property names
    const possibleKeys = [
      "data",
      "items",
      "results",
      "categories",
      "prompts",
      "promptDetails",
      "list",
      "records"
    ];

    for (const key of possibleKeys) {
      if (Array.isArray(data[key])) {
        console.log(`   ✅ Found array in property '${key}' (${data[key].length} items)`);
        return data[key];
      }
    }

    // If no common keys found, try to get the first array property
    const keys = Object.keys(data);
    for (const key of keys) {
      if (Array.isArray(data[key])) {
        console.log(`   ✅ Found array in property '${key}' (${data[key].length} items)`);
        return data[key];
      }
    }

    // If still no array found, log the structure
    console.error(`   ❌ Could not find array in JSON structure.`);
    console.error(`   Available properties: ${keys.join(", ")}`);
    console.error(`   File: ${fileName}`);
    throw new Error(`No array found in JSON file: ${fileName}`);
  }

  throw new Error(`Invalid JSON structure in file: ${fileName}`);
}

// ------------------------------------------------------------
// 🔹 Helper: Batch Write to Firestore (with incremental support)
// ------------------------------------------------------------
async function batchWriteToFirestore(collectionName, data, useIdField = true, mode = "fresh") {
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

  const batchSize = 500; // Firestore batch limit
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = db.batch();
    const chunk = data.slice(i, i + batchSize);
    let batchCount = 0;

    chunk.forEach((item) => {
      try {
        // Use _id from data if available, otherwise auto-generate
        const docId = useIdField && item._id ? item._id : undefined;

        // Skip if in update mode and document already exists
        if (mode === "update" && docId && existingIds.has(docId)) {
          skippedCount++;
          return;
        }

        const docRef = docId
          ? db.collection(collectionName).doc(docId)
          : db.collection(collectionName).doc();

        // Remove _id from data if it exists (it's stored as document ID)
        // eslint-disable-next-line no-unused-vars
        const { _id, ...dataWithoutId } = item;

        // Use set with merge in force mode, regular set otherwise
        if (mode === "force") {
          batch.set(docRef, dataWithoutId, { merge: true });
        } else {
          batch.set(docRef, dataWithoutId);
        }

        batchCount++;
      } catch (error) {
        console.error(`❌ Error preparing document:`, error.message);
        errorCount++;
      }
    });

    // Only commit if there are documents in the batch
    if (batchCount > 0) {
      try {
        await batch.commit();
        successCount += batchCount;
        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} committed (${batchCount} documents)`);
      } catch (error) {
        console.error(`❌ Batch commit failed:`, error.message);
        errorCount += batchCount;
        successCount -= batchCount;
      }
    } else if (chunk.length > 0) {
      console.log(`⏭️  Batch ${Math.floor(i / batchSize) + 1} skipped (all ${chunk.length} documents already exist)`);
    }
  }

  console.log(`\n📊 Collection: ${collectionName}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);

  return { successCount, errorCount, skippedCount };
}

// ------------------------------------------------------------
// 🔹 Build Category Name to ID mapping
// ------------------------------------------------------------
async function buildCategoryMapping(categoriesData, mode = "fresh") {
  const mapping = {};

  // If in update mode and we have existing categories in Firestore, fetch them
  if (mode === "update") {
    try {
      console.log(`\n🗺️  Building category mapping from Firestore...`);
      const snapshot = await db.collection(COLLECTIONS.CATEGORIES).get();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const name = data.name || data.categoryName || data.title;
        const id = doc.id;

        if (name && id) {
          mapping[name] = id;
          // Also add lowercase version for case-insensitive matching
          mapping[name.toLowerCase()] = id;
        }
      });

      console.log(`   ✅ Loaded ${snapshot.size} categories from Firestore`);
      console.log(`\n🗺️  Category mapping:`);
      Object.entries(mapping).forEach(([name, id]) => {
        if (name === name.toLowerCase()) return; // Skip lowercase duplicates in display
        console.log(`   ${name} → ${id}`);
      });

      return mapping;
    } catch (error) {
      console.error(`❌ Error fetching categories from Firestore:`, error.message);
      // Fall back to using categoriesData
    }
  }

  // Fresh mode or fallback: use provided categoriesData
  categoriesData.forEach(category => {
    // Try multiple possible name fields
    const name = category.name || category.categoryName || category.title;
    const id = category._id || category.id;

    if (name && id) {
      mapping[name] = id;
      // Also add lowercase version for case-insensitive matching
      mapping[name.toLowerCase()] = id;
    }
  });

  console.log(`\n🗺️  Category mapping created:`);
  Object.entries(mapping).forEach(([name, id]) => {
    if (name === name.toLowerCase()) return; // Skip lowercase duplicates in display
    console.log(`   ${name} → ${id}`);
  });

  return mapping;
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
    return { successCount: 0, errorCount: 0, skippedCount: 0, data: [] };
  }

  let allCategoriesData = [];

  for (const fileName of categoryFiles) {
    const rawData = await fetchJSONFromStorage(fileName);
    const data = extractArrayFromJSON(rawData, fileName);

    const transformedData = data.map(item => ({
      ...item,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }));

    allCategoriesData = [...allCategoriesData, ...transformedData];
  }

  const result = await batchWriteToFirestore(COLLECTIONS.CATEGORIES, allCategoriesData, true, mode);

  return { ...result, data: allCategoriesData };
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

  let totalSuccess = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const fileName of promptFiles) {
    console.log(`\n📂 Processing ${fileName}...`);

    // Extract category name from filename
    const categoryName = extractCategoryName(fileName);
    let categoryId = null;

    if (categoryName && categoryMapping) {
      // Try exact match first, then case-insensitive
      categoryId = categoryMapping[categoryName] || categoryMapping[categoryName.toLowerCase()];

      if (categoryId) {
        console.log(`   🔗 Linked to category: ${categoryName} (${categoryId})`);
      } else {
        console.warn(`   ⚠️  Could not find category ID for: ${categoryName}`);
      }
    }

    const rawData = await fetchJSONFromStorage(fileName);
    const data = extractArrayFromJSON(rawData, fileName);

    const transformedData = data.map(item => ({
      ...item,
      ...(categoryId && { categoryId }), // Add categoryId if found
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }));

    const result = await batchWriteToFirestore(COLLECTIONS.PROMPTS, transformedData, true, mode);
    totalSuccess += result.successCount;
    totalErrors += result.errorCount;
    totalSkipped += result.skippedCount;
  }

  console.log(`\n📊 TOTAL PROMPTS:`);
  console.log(`   ✅ Success: ${totalSuccess}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   ❌ Failed: ${totalErrors}`);

  return { successCount: totalSuccess, errorCount: totalErrors, skippedCount: totalSkipped };
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

  let totalSuccess = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const fileName of promptDetailFiles) {
    console.log(`\n📂 Processing ${fileName}...`);
    const rawData = await fetchJSONFromStorage(fileName);
    const data = extractArrayFromJSON(rawData, fileName);

    const transformedData = data.map(item => ({
      ...item,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }));

    const result = await batchWriteToFirestore(COLLECTIONS.PROMPT_DETAILS, transformedData, true, mode);
    totalSuccess += result.successCount;
    totalErrors += result.errorCount;
    totalSkipped += result.skippedCount;
  }

  console.log(`\n📊 TOTAL PROMPT DETAILS:`);
  console.log(`   ✅ Success: ${totalSuccess}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   ❌ Failed: ${totalErrors}`);

  return { successCount: totalSuccess, errorCount: totalErrors, skippedCount: totalSkipped };
}

// ------------------------------------------------------------
// 🔹 Display Index Instructions
// ------------------------------------------------------------
function displayIndexInstructions() {
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
  console.log("🚀 DYNAMIC FIRESTORE MIGRATION");
  console.log("=".repeat(60));

  try {
    // Step 1: Determine migration mode
    const mode = await determineMigrationMode();
    console.log(`\n📋 Migration Mode: ${mode.toUpperCase()}`);

    if (mode === "fresh") {
      console.log("   ➜ Will import all data (delete and re-import)");
    } else if (mode === "update") {
      console.log("   ➜ Will only add new documents (skip existing)");
    } else if (mode === "force") {
      console.log("   ➜ Will update all documents (overwrite existing)");
    }

    // Step 2: Discover all JSON files in storage
    const allFiles = await listFilesInStorage();

    if (allFiles.length === 0) {
      console.log("\n⚠️  No JSON files found in storage. Please upload your files to the 'data/' folder.");
      return;
    }

    // Step 3: Categorize files by type
    const categorizedFiles = categorizeFiles(allFiles);

    // Step 4: Migrate categories first
    const categoriesResult = await migrateCategories(categorizedFiles.categories, mode);

    // Step 5: Build category mapping for linking prompts
    let categoryMapping = null;
    if (mode === "update") {
      // In update mode, always try to build mapping from Firestore (even if no new categories)
      categoryMapping = await buildCategoryMapping(categoriesResult.data, mode);
    } else if (categoriesResult.data && categoriesResult.data.length > 0) {
      // In fresh/force mode, use the imported data
      categoryMapping = await buildCategoryMapping(categoriesResult.data, mode);
    }

    // Step 6: Migrate prompts with category links
    const promptsResult = await migratePrompts(categorizedFiles.prompts, categoryMapping, mode);

    // Step 7: Migrate prompt details
    const promptDetailsResult = await migratePromptDetails(categorizedFiles.promptDetails, mode);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ MIGRATION COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📊 SUMMARY:");
    console.log(`   Categories: ${categoriesResult.successCount} added, ${categoriesResult.skippedCount} skipped, ${categoriesResult.errorCount} errors`);
    console.log(`   Prompts: ${promptsResult.successCount} added, ${promptsResult.skippedCount} skipped, ${promptsResult.errorCount} errors`);
    console.log(`   Prompt Details: ${promptDetailsResult.successCount} added, ${promptDetailsResult.skippedCount} skipped, ${promptDetailsResult.errorCount} errors`);

    const totalAdded = categoriesResult.successCount + promptsResult.successCount + promptDetailsResult.successCount;
    const totalSkipped = categoriesResult.skippedCount + promptsResult.skippedCount + promptDetailsResult.skippedCount;
    const totalErrors = categoriesResult.errorCount + promptsResult.errorCount + promptDetailsResult.errorCount;

    console.log(`\n   📈 TOTALS: ${totalAdded} added, ${totalSkipped} skipped, ${totalErrors} errors`);

    displayIndexInstructions();

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL DONE!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  }
}

// Run migration
main();
