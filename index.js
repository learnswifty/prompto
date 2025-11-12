// ------------------------------------------------------------
// 🔹 Imports
// ------------------------------------------------------------
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// ------------------------------------------------------------
// 🔹 Define secure environment secret
// ------------------------------------------------------------
const API_KEY = defineSecret("API_KEY");

// ------------------------------------------------------------
// 🔹 Initialize Firebase Admin SDK
// ------------------------------------------------------------
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "prompto-4b381.firebasestorage.app", // ✅ your bucket
  });
}

// Initialize Firestore
const db = admin.firestore();

// Use default bucket (defined above)
// const storage = admin.storage().bucket();

// ------------------------------------------------------------
// 🔹 Express app setup
// ------------------------------------------------------------
const app = express();

// ✅ CORS Configuration - Restrict in production
// For development: origin: true
// For production: origin: ['https://yourapp.com', 'https://www.yourapp.com']
app.use(cors({
  origin: true,  // ⚠️ Change this in production to specific domains
  credentials: true
}));

// ✅ Use Express built-in JSON parser (bodyParser is deprecated)
app.use(express.json({ limit: "10mb" }));

// ------------------------------------------------------------
// 🔹 Middleware: Verify API Key
// ------------------------------------------------------------
const verifyAPIKey = (req, res, next) => {
  const receivedKey = req.headers["x-api-key"];
  const expectedKey = API_KEY.value();

  // ✅ SECURITY: Don't log actual keys - only log validation status
  if (!receivedKey || receivedKey !== expectedKey) {
    console.warn("❌ API Key validation failed - Forbidden request");
    return res.status(403).json({
      success: false,
      message: "Forbidden — Invalid or missing API key",
    });
  }

  console.log("✅ API key verified successfully");
  next();
};

app.use(verifyAPIKey);

// ------------------------------------------------------------
// 🔹 Firestore Collections
// ------------------------------------------------------------
const COLLECTIONS = {
  CATEGORIES: "categories",
  PROMPTS: "prompts",
  PROMPT_DETAILS: "promptDetails"
};

// ------------------------------------------------------------
// 🔹 Helper: Firestore Query with Pagination
// ------------------------------------------------------------
async function queryWithPagination(collectionRef, page = 1, limit = 10) {
  // ✅ Validate and sanitize inputs
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Max 100 items per page

  try {
    // Get total count
    const countSnapshot = await collectionRef.count().get();
    const total = countSnapshot.data().count;

    // Calculate pagination
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    // Fetch paginated data
    const snapshot = await collectionRef
      .offset(offset)
      .limit(limit)
      .get();

    const data = snapshot.docs.map(doc => ({
      _id: doc.id,
      ...doc.data()
    }));

    return {
      page,
      limit,
      total,
      totalPages,
      data
    };
  } catch (error) {
    console.error("❌ Firestore pagination error:", error.message);
    throw error;
  }
}


// ------------------------------------------------------------
// 🔹 Helper: Safe Error Response
// ------------------------------------------------------------
function sendErrorResponse(res, statusCode, message, logError = null) {
  if (logError) {
    console.error("❌ Error:", logError);
  }
  
  // ✅ Don't expose internal error details to clients
  res.status(statusCode).json({
    success: false,
    message,
  });
}

// ------------------------------------------------------------
// 🔹 0️⃣ GET: /health (Health Check)
// ------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

// ------------------------------------------------------------
// 🔹 1️⃣ GET: /getCategory
// ------------------------------------------------------------
app.get("/getCategory", async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.CATEGORIES).get();

    const data = snapshot.docs.map(doc => ({
      _id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      message: "Category list fetched successfully",
      data,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      "Error fetching categories",
      error
    );
  }
});

// ------------------------------------------------------------
// 🔹 2️⃣ POST: /getCategoryList
// ------------------------------------------------------------
app.post("/getCategoryList", async (req, res) => {
  try {
    const { id } = req.body;
    const page = req.query.page;
    const limit = req.query.limit;

    // ✅ Validate required parameters
    if (!id || typeof id !== "string") {
      return sendErrorResponse(res, 400, "Missing or invalid 'id' parameter");
    }

    // ✅ Query prompts by categoryId with pagination
    const promptsRef = db.collection(COLLECTIONS.PROMPTS)
      .where("categoryId", "==", id)
      .orderBy("createdAt", "desc");

    const paginated = await queryWithPagination(promptsRef, page, limit);

    res.json({
      success: true,
      message: "Category data fetched successfully",
      ...paginated,
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      "Error fetching category list",
      error
    );
  }
});

// ------------------------------------------------------------
// 🔹 3️⃣ POST: /getPromptDetails
// ------------------------------------------------------------
app.post("/getPromptDetails", async (req, res) => {
  try {
    const { _id } = req.body;

    // ✅ Validate required parameters
    if (!_id || typeof _id !== "string") {
      return sendErrorResponse(res, 400, "Missing or invalid '_id' parameter");
    }

    // ✅ Direct document lookup by ID (O(1) operation - super fast!)
    const docRef = db.collection(COLLECTIONS.PROMPT_DETAILS).doc(_id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return sendErrorResponse(res, 404, "Prompt not found");
    }

    res.json({
      success: true,
      message: "Prompt details fetched successfully",
      data: {
        _id: doc.id,
        ...doc.data()
      },
    });
  } catch (error) {
    sendErrorResponse(
      res,
      500,
      "Error fetching prompt details",
      error
    );
  }
});

// ------------------------------------------------------------
// 🔹 404 Handler - Catch all undefined routes
// ------------------------------------------------------------
app.all("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ------------------------------------------------------------
// 🔹 Export: Firebase Function v2 (Node.js 22+)
// ------------------------------------------------------------
export const api = onRequest(
  {
    secrets: [API_KEY],        // 🔐 Securely attach secret
    timeoutSeconds: 60,        // ⏱️ 60 second timeout
    memory: "256MiB",          // 💾 Memory allocation
    maxInstances: 100,         // 📊 Max concurrent instances
    cors: true,                // 🌐 Enable CORS at function level
  },
  app
);
