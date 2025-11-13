#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 Data Structure Checker
// ------------------------------------------------------------
// Check the actual structure of documents to identify issues
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

async function checkPrompts() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 CHECKING PROMPTS STRUCTURE");
  console.log("=".repeat(60));

  const snapshot = await db.collection("prompts").get();

  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`\n${index + 1}. Document ID: ${doc.id}`);
    console.log(`   Has categoryId: ${data.categoryId ? "✅ YES (" + data.categoryId + ")" : "❌ NO"}`);
    console.log(`   Has prompt: ${data.prompt ? "✅ YES" : "❌ NO"}`);
    console.log(`   Has thumb_url: ${data.thumb_url ? "✅ YES" : "❌ NO"}`);
  });
}

async function checkPromptDetails() {
  console.log("\n" + "=".repeat(60));
  console.log("📄 CHECKING PROMPT DETAILS STRUCTURE");
  console.log("=".repeat(60));

  const snapshot = await db.collection("promptDetails").get();

  console.log("\n🔍 Expected structure:");
  console.log("   Document ID should match prompt _id");
  console.log("   Document data should be the prompt details\n");

  console.log("🔍 Current structure:");

  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`\n${index + 1}. Document ID: ${doc.id}`);

    // Check if data has the nested structure
    if (data.data && Array.isArray(data.data)) {
      console.log(`   ❌ WRONG: Has nested 'data' array`);
      console.log(`   Array length: ${data.data.length}`);
      if (data.data.length > 0 && data.data[0]._id) {
        console.log(`   Real prompt _id: ${data.data[0]._id}`);
        console.log(`   Mismatch: Document ID (${doc.id}) ≠ Prompt ID (${data.data[0]._id})`);
      }
    } else {
      console.log(`   ✅ Correct structure`);
    }
  });
}

async function main() {
  try {
    await checkPrompts();
    await checkPromptDetails();

    console.log("\n" + "=".repeat(60));
    console.log("💡 ISSUES FOUND");
    console.log("=".repeat(60));
    console.log("\n1. Prompts missing categoryId field");
    console.log("   → Causes /getCategoryList to return empty");
    console.log("\n2. PromptDetails has wrong document ID structure");
    console.log("   → Causes /getPromptDetails to return 'not found'");
    console.log("\n" + "=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
