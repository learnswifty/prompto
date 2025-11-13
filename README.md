# Prompto - Firebase Cloud Functions API

Firebase Cloud Functions API for managing prompt categories and details with Firestore backend.

## 🚀 Quick Start

### 1. Migrate Data to Firestore

```bash
npm run migrate
```

### 2. Verify Database

```bash
npm run verify
```

### 3. Test APIs

```bash
npm run test:api
```

## 📚 Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Complete setup guide with data structure details
- **[FIRESTORE_SETUP.md](./FIRESTORE_SETUP.md)** - Firestore migration documentation

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `npm run migrate` | Run migration (update mode - skip existing) |
| `npm run migrate:force` | Force migration (overwrite all) |
| `npm run verify` | Check database state |
| `npm run inspect` | Inspect JSON files in Storage |
| `npm run test:api` | Test all API endpoints |
| `npm run deploy` | Deploy functions to Firebase |

## 🎯 API Endpoints

- `GET /getCategory` - Get all categories
- `POST /getCategoryList` - Get prompts for a category (with pagination)
- `POST /getPromptDetails` - Get details for a specific prompt

## 📦 Project Structure

```
.
├── index.js                      # Main API endpoints
├── migrate-to-firestore-v2.js    # Improved migration script
├── verify-firestore.js           # Database verification
├── test-apis.js                  # API testing script
├── inspect-json-files.js         # JSON structure inspector
└── SETUP_GUIDE.md                # Complete setup documentation
```

## 🔧 Development

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed setup instructions.