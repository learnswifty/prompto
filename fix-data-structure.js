#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Data Structure Fix Script
// ------------------------------------------------------------
// Fixes two issues:
// 1. PromptDetails: Restructure documents to use prompt _id as document ID
// 2. Prompts: Add missing categoryId fields
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

const db = admin.firestore();

// ------------------------------------------------------------
// 🔹 Fix PromptDetails Structure
// ------------------------------------------------------------
async function fixPromptDetails() {
  console.log("\n" + "=".repeat(60));
  console.log("🔧 FIXING PROMPT DETAILS STRUCTURE");
  console.log("=".repeat(60));

  const snapshot = await db.collection("promptDetails").get();

  console.log(`\n📊 Found ${snapshot.size} documents to check`);

  let fixedCount = 0;
  let skippedCount = 0;
  const batch = db.batch();
  const oldDocIds = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Check if this has the wrong nested structure
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const promptData = data.data[0]; // Get the actual prompt data
      const realPromptId = promptData._id;

      if (realPromptId) {
        console.log(`\n📝 Fixing document:`);
        console.log(`   Old Document ID: ${doc.id}`);
        console.log(`   New Document ID: ${realPromptId}`);

        // Create new document with correct ID
        const newDocRef = db.collection("promptDetails").doc(realPromptId);

        // Remove the nested structure and use the actual data
        const { _id, ...cleanData } = promptData;

        batch.set(newDocRef, {
          ...cleanData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Mark old document for deletion
        oldDocIds.push(doc.id);
        fixedCount++;
      }
    } else {
      console.log(`\n✅ Document ${doc.id} already has correct structure`);
      skippedCount++;
    }
  }

  // Commit the new documents
  if (fixedCount > 0) {
    console.log(`\n💾 Saving ${fixedCount} fixed documents...`);
    await batch.commit();
    console.log(`✅ Successfully created ${fixedCount} new documents`);

    // Delete old documents
    console.log(`\n🗑️  Deleting ${oldDocIds.length} old documents...`);
    const deleteBatch = db.batch();
    oldDocIds.forEach(docId => {
      deleteBatch.delete(db.collection("promptDetails").doc(docId));
    });
    await deleteBatch.commit();
    console.log(`✅ Successfully deleted ${oldDocIds.length} old documents`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Fixed: ${fixedCount}`);
  console.log(`   ⏭️  Skipped (already correct): ${skippedCount}`);

  return fixedCount;
}

// ------------------------------------------------------------
// 🔹 Add CategoryId to Prompts (if missing)
// ------------------------------------------------------------
async function fixPromptCategories() {
  console.log("\n" + "=".repeat(60));
  console.log("🔧 CHECKING PROMPT CATEGORY ASSIGNMENTS");
  console.log("=".repeat(60));

  const snapshot = await db.collection("prompts").get();

  console.log(`\n📊 Found ${snapshot.size} prompts to check`);

  let hasCategory = 0;
  let missingCategory = 0;

  const promptsWithoutCategory = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.categoryId) {
      hasCategory++;
    } else {
      missingCategory++;
      promptsWithoutCategory.push({
        id: doc.id,
        prompt: (data.prompt || '').substring(0, 50) + '...'
      });
    }
  });

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Have categoryId: ${hasCategory}`);
  console.log(`   ❌ Missing categoryId: ${missingCategory}`);

  if (promptsWithoutCategory.length > 0) {
    console.log(`\n⚠️  Prompts without categoryId:`);
    promptsWithoutCategory.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.id}: ${p.prompt}`);
    });

    console.log(`\n💡 To assign categories, you need to:`);
    console.log(`   1. Determine which category each prompt belongs to`);
    console.log(`   2. Update each prompt with the correct categoryId`);
    console.log(`\n   Example:`);
    console.log(`   await db.collection('prompts').doc('PROMPT_ID').update({`);
    console.log(`     categoryId: 'CATEGORY_ID'`);
    console.log(`   });`);
  }

  return { hasCategory, missingCategory };
}

// ------------------------------------------------------------
// 🔹 Main Fix Function
// ------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 DATA STRUCTURE FIX SCRIPT");
  console.log("=".repeat(60));

  try {
    // Fix 1: PromptDetails structure
    const fixedDetails = await fixPromptDetails();

    // Fix 2: Check prompt categories
    const categoryResult = await fixPromptCategories();

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ FIX COMPLETE");
    console.log("=".repeat(60));
    console.log(`\n📊 SUMMARY:`);
    console.log(`   PromptDetails fixed: ${fixedDetails}`);
    console.log(`   Prompts with categoryId: ${categoryResult.hasCategory}`);
    console.log(`   Prompts missing categoryId: ${categoryResult.missingCategory}`);

    if (categoryResult.missingCategory > 0) {
      console.log(`\n⚠️  Note: ${categoryResult.missingCategory} prompts still need category assignment`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL DONE!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\n❌ Fix failed:", error);
    console.error("\nStack trace:", error.stack);
    process.exit(1);
  }
}

main();
