#!/usr/bin/env node

// ------------------------------------------------------------
// 🔹 API Test Script
// ------------------------------------------------------------
// Tests all three API endpoints after migration
// Usage: node test-apis.js
// ------------------------------------------------------------

import fetch from "node-fetch";

const API_BASE = "https://us-central1-prompto-4b381.cloudfunctions.net/api";
const API_KEY = "4aD8fB72kQz3NwE";

const headers = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY
};

// ------------------------------------------------------------
// Test 1: GET /getCategory
// ------------------------------------------------------------
async function testGetCategory() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 1: GET /getCategory");
  console.log("=".repeat(60));

  try {
    const response = await fetch(`${API_BASE}/getCategory`, {
      method: "GET",
      headers: { "x-api-key": API_KEY }
    });

    const data = await response.json();

    if (data.success && data.data && data.data.length > 0) {
      console.log(`✅ PASS: Found ${data.data.length} categories`);
      console.log(`\n📄 Sample category:`);
      console.log(`   ID: ${data.data[0]._id}`);
      console.log(`   Name: ${data.data[0].category_name}`);
      return data.data[0]._id; // Return first category ID for next test
    } else {
      console.log(`❌ FAIL: No categories found`);
      console.log(JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    return null;
  }
}

// ------------------------------------------------------------
// Test 2: POST /getCategoryList
// ------------------------------------------------------------
async function testGetCategoryList(categoryId) {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 2: POST /getCategoryList");
  console.log("=".repeat(60));

  if (!categoryId) {
    console.log(`⏭️  SKIP: No category ID available`);
    return null;
  }

  console.log(`📝 Using category ID: ${categoryId}`);

  try {
    const response = await fetch(`${API_BASE}/getCategoryList`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: categoryId })
    });

    const data = await response.json();

    if (data.success) {
      if (data.total > 0) {
        console.log(`✅ PASS: Found ${data.total} prompts in category`);
        console.log(`   Page: ${data.page}/${data.totalPages}`);
        console.log(`\n📄 Sample prompt:`);
        console.log(`   ID: ${data.data[0]._id}`);
        console.log(`   Prompt: ${(data.data[0].prompt || "").substring(0, 60)}...`);
        return data.data[0]._id; // Return first prompt ID for next test
      } else {
        console.log(`⚠️  WARNING: Category exists but has no prompts`);
        console.log(`   This might mean prompts weren't linked to categories`);
        return null;
      }
    } else {
      console.log(`❌ FAIL: ${data.message}`);
      console.log(JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    return null;
  }
}

// ------------------------------------------------------------
// Test 3: POST /getPromptDetails
// ------------------------------------------------------------
async function testGetPromptDetails(promptId) {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 TEST 3: POST /getPromptDetails");
  console.log("=".repeat(60));

  if (!promptId) {
    console.log(`⏭️  SKIP: No prompt ID available`);
    return false;
  }

  console.log(`📝 Using prompt ID: ${promptId}`);

  try {
    const response = await fetch(`${API_BASE}/getPromptDetails`, {
      method: "POST",
      headers,
      body: JSON.stringify({ _id: promptId })
    });

    const data = await response.json();

    if (data.success && data.data) {
      console.log(`✅ PASS: Found prompt details`);
      console.log(`   ID: ${data.data._id}`);
      console.log(`   Has prompt: ${data.data.prompt ? "Yes" : "No"}`);
      console.log(`   Has fullprompt: ${data.data.fullprompt ? "Yes" : "No"}`);
      return true;
    } else {
      console.log(`❌ FAIL: ${data.message}`);
      console.log(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    return false;
  }
}

// ------------------------------------------------------------
// Main Test Runner
// ------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 API TEST SUITE");
  console.log("=".repeat(60));
  console.log(`\nAPI Base: ${API_BASE}`);
  console.log(`API Key: ${API_KEY.substring(0, 4)}***`);

  const results = {
    getCategory: false,
    getCategoryList: false,
    getPromptDetails: false
  };

  // Test 1
  const categoryId = await testGetCategory();
  results.getCategory = categoryId !== null;

  // Test 2 (depends on Test 1)
  let promptId = null;
  if (categoryId) {
    promptId = await testGetCategoryList(categoryId);
    results.getCategoryList = promptId !== null;
  }

  // Test 3 (depends on Test 2)
  if (promptId) {
    results.getPromptDetails = await testGetPromptDetails(promptId);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  console.log(`\nResults:`);
  console.log(`   ${results.getCategory ? "✅" : "❌"} GET  /getCategory`);
  console.log(`   ${results.getCategoryList ? "✅" : "❌"} POST /getCategoryList`);
  console.log(`   ${results.getPromptDetails ? "✅" : "❌"} POST /getPromptDetails`);

  console.log(`\n📈 Score: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log(`\n🎉 ALL TESTS PASSED! Your API is working perfectly!`);
  } else {
    console.log(`\n⚠️  Some tests failed. Check the output above for details.`);

    if (!results.getCategoryList && results.getCategory) {
      console.log(`\n💡 Tip: getCategoryList failed but getCategory passed.`);
      console.log(`   This usually means prompts don't have categoryId fields.`);
      console.log(`   Make sure your migration script properly links prompts to categories.`);
    }

    if (!results.getPromptDetails && results.getCategoryList) {
      console.log(`\n💡 Tip: getPromptDetails failed but getCategoryList passed.`);
      console.log(`   This usually means promptDetails document IDs don't match prompt IDs.`);
      console.log(`   Make sure promptDetails uses the prompt's _id as the document ID.`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

main();
