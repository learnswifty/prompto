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
// 🔹 Initialize Firebase Admin SDK with custom bucket
// ------------------------------------------------------------
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "prompto-4b381.firebasestorage.app", // ✅ your bucket
  });
}

// Use default bucket (defined above)
const storage = admin.storage().bucket();

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
// 🔹 Configuration: Dynamic Config from Firebase Storage
// ------------------------------------------------------------
let configCache = null;
let configLastFetched = null;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// ✅ Fetch configuration dynamically from Firebase Storage
async function getConfig() {
  const now = Date.now();

  // Return cached config if still valid
  if (configCache && configLastFetched && (now - configLastFetched < CONFIG_CACHE_TTL)) {
    return configCache;
  }

  try {
    console.log("📥 Fetching fresh configuration from Firebase Storage...");
    const config = await fetchJSONFromStorage("config.json");

    // ✅ Validate configuration structure
    if (!config.categoryMap || !config.promptDetailsFiles) {
      throw new Error("Invalid config structure: missing categoryMap or promptDetailsFiles");
    }

    configCache = config;
    configLastFetched = now;
    console.log("✅ Configuration loaded successfully");

    return config;
  } catch (error) {
    console.error("❌ Failed to fetch configuration:", error.message);

    // If we have cached config, use it even if expired
    if (configCache) {
      console.warn("⚠️ Using expired cache due to fetch error");
      return configCache;
    }

    throw new Error("Configuration unavailable and no cache exists");
  }
}

// ------------------------------------------------------------
// 🔹 Helper: Fetch JSON from Firebase Storage
// ------------------------------------------------------------
async function fetchJSONFromStorage(fileName) {
  try {
    const file = storage.file(`data/${fileName}`);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`FILE_NOT_FOUND: ${fileName}`);
    }

    const [contents] = await file.download();
    return JSON.parse(contents.toString());
  } catch (error) {
    console.error("⚠️ Error fetching JSON:", error.message);
    throw error;
  }
}

// ------------------------------------------------------------
// 🔹 Helper: Pagination with Validation
// ------------------------------------------------------------
function paginate(array, page = 1, limit = 10) {
  // ✅ Validate and sanitize inputs
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Max 100 items per page
  
  const start = (page - 1) * limit;
  const end = start + limit;
  
  return {
    page,
    limit,
    total: array.length,
    totalPages: Math.ceil(array.length / limit),
    data: array.slice(start, end),
  };
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
    const data = await fetchJSONFromStorage("pt_category.json");
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

    // ✅ Get dynamic configuration
    const config = await getConfig();

    // ✅ Check if category exists
    const fileName = config.categoryMap[id];
    if (!fileName) {
      return sendErrorResponse(res, 404, "Invalid category id");
    }

    const data = await fetchJSONFromStorage(fileName);
    const paginated = paginate(data, page, limit);

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

    // ✅ Get dynamic configuration
    const config = await getConfig();

    // ✅ Search across ALL prompt detail files from config
    let foundItem = null;

    for (const fileName of config.promptDetailsFiles) {
      try {
        const data = await fetchJSONFromStorage(fileName);
        const item = data.find((entry) => entry._id === _id);

        if (item) {
          foundItem = item;
          break; // Found it, stop searching
        }
      } catch (fileError) {
        // If file doesn't exist, continue to next file
        console.warn(`⚠️ Could not fetch ${fileName}:`, fileError.message);
        continue;
      }
    }

    if (!foundItem) {
      return sendErrorResponse(res, 404, "Prompt not found");
    }

    res.json({
      success: true,
      message: "Prompt details fetched successfully",
      data: foundItem,
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
