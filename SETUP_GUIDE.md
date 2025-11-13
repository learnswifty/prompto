# Complete Setup Guide - Fresh Start

This guide will help you set up your Firestore database from scratch with the correct data structure.

## 🎯 Goal

Set up a properly structured Firestore database that works with your API:

```
✅ GET  /getCategory       → Returns all categories
✅ POST /getCategoryList   → Returns prompts for a category
✅ POST /getPromptDetails  → Returns details for a specific prompt
```

---

## 📊 Required Data Structure

### 1. Categories Collection

```
Collection: categories
Document ID: {category_id}  (e.g., "68b02e0a58d4d99aeb2854a7")
Data:
{
  category_name: "Trending",
  trending: 0,
  default: 0,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 2. Prompts Collection

```
Collection: prompts
Document ID: {prompt_id}  (e.g., "686915440aef20c8236201d9")
Data:
{
  categoryId: "68b02e0a58d4d99aeb2854a7",  ← MUST link to category
  prompt: "Short description...",
  fullprompt: "Full prompt text...",
  thumb_url: "https://...",
  display: 1,
  is_delete: 0,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 3. PromptDetails Collection

```
Collection: promptDetails
Document ID: {prompt_id}  ← SAME as the prompt's _id
Data:
{
  prompt: "Short description...",
  fullprompt: "Full prompt text...",
  thumb_url: "https://...",
  // ... all prompt detail fields (flat structure, NOT nested)
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**⚠️ IMPORTANT:** The promptDetails document ID MUST match the prompt's _id

---

## 🚀 Migration Steps

### Step 1: Clean Database (Already Done)

You mentioned you cleaned all data from Firebase ✅

### Step 2: Verify JSON Files Exist in Storage

Make sure your JSON files are uploaded to Firebase Storage in the `data/` folder:

```
data/
├── pt_category.json              (or any file with "category" in name)
├── prompts_Music.json            (must start with "prompts_")
├── prompts_Rooftop.json
├── promptDetails_Music.json      (must start with "promptDetails_")
└── promptDetails_Rooftop.json
```

### Step 3: Run the Improved Migration Script

```bash
node migrate-to-firestore-v2.js
```

This new script will:
- ✅ Extract data correctly from nested structures
- ✅ Use the `_id` field as the document ID
- ✅ Link prompts to categories using `categoryId`
- ✅ Create flat data structures (no nesting)
- ✅ Skip existing documents (incremental mode)

---

## 🧪 Testing After Migration

### Test 1: Get All Categories

```bash
curl --location 'https://us-central1-prompto-4b381.cloudfunctions.net/api/getCategory' \
--header 'x-api-key: 4aD8fB72kQz3NwE'
```

**Expected:** List of categories with `_id` and `category_name`

### Test 2: Get Prompts for a Category

```bash
curl --location 'https://us-central1-prompto-4b381.cloudfunctions.net/api/getCategoryList' \
--header 'Content-Type: application/json' \
--header 'x-api-key: 4aD8fB72kQz3NwE' \
--data '{
  "id": "CATEGORY_ID_FROM_TEST_1"
}'
```

**Expected:** List of prompts with pagination info

### Test 3: Get Prompt Details

```bash
curl --location 'https://us-central1-prompto-4b381.cloudfunctions.net/api/getPromptDetails' \
--header 'Content-Type: application/json' \
--header 'x-api-key: 4aD8fB72kQz3NwE' \
--data '{
  "_id": "PROMPT_ID_FROM_TEST_2"
}'
```

**Expected:** Full prompt details

---

## 🔧 Utility Scripts

### verify-firestore.js
Checks what data exists in your database:
```bash
node verify-firestore.js
```

### inspect-json-files.js
Shows the structure of your JSON files in Storage:
```bash
node inspect-json-files.js
```

---

## ❓ Common Issues & Solutions

### Issue 1: "Prompt not found" when calling getPromptDetails

**Cause:** PromptDetails document ID doesn't match the prompt _id

**Solution:** The new migration script fixes this automatically. It uses the `_id` field from your JSON as the document ID.

### Issue 2: getCategoryList returns empty data

**Cause:** Prompts don't have `categoryId` field

**Solution:**
1. The new migration script automatically links prompts to categories based on filename
2. File `prompts_Music.json` will be linked to the "Music" category

### Issue 3: categoryId not linking correctly

**Cause:** Category name in filename doesn't match category name in database

**Solution:**
- Ensure `prompts_Music.json` matches a category with `category_name: "Music"`
- The migration script tries case-insensitive matching

---

## 📁 File Naming Conventions

For automatic category linking to work:

```
✅ prompts_Music.json        → Links to category "Music"
✅ prompts_Rooftop.json      → Links to category "Rooftop"
✅ promptDetails_Music.json  → Details for Music prompts
❌ prompts-music.json        → Won't be recognized (use underscore)
❌ music_prompts.json        → Won't be recognized (must start with "prompts_")
```

---

## 🎯 Expected Results After Migration

After running `migrate-to-firestore-v2.js`, you should see:

```
============================================================
✅ MIGRATION COMPLETE
============================================================

📊 SUMMARY:
   Categories: 26 added, 0 skipped
   Prompts: 100 added, 0 skipped
   Prompt Details: 100 added, 0 skipped

   📈 TOTAL: 226 documents added

============================================================
🎉 ALL DONE!
============================================================
```

Then verify with:
```bash
node verify-firestore.js
```

You should see non-zero counts for all three collections.

---

## 📞 Need Help?

If you encounter issues:

1. Run `node verify-firestore.js` to see current state
2. Run `node inspect-json-files.js` to check JSON structure
3. Check that file names follow the naming convention
4. Ensure JSON files have `_id` fields in the data

---

## 🔄 Re-running Migration

If you need to re-import:

**Update mode** (skip existing documents):
```bash
node migrate-to-firestore-v2.js update
```

**Force mode** (overwrite all):
```bash
node migrate-to-firestore-v2.js force
```

**Fresh mode** (clean and re-import):
```bash
# First, clean the database manually in Firebase Console
node migrate-to-firestore-v2.js fresh
```
