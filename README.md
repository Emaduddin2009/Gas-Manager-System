# ⛽ Gas Manager Pro — Backend API

Secure Node.js/Express backend for Gas Manager Pro with SQLite database.
Supports multi-device login, user management, and full CRUD for gas records.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env and set your JWT_SECRET to a long random string
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Start the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs at: `http://localhost:3000`

---

## 📡 API Endpoints

### Auth
| Method | Endpoint           | Description                |
|--------|--------------------|----------------------------|
| POST   | /api/auth/signup   | Register new account       |
| POST   | /api/auth/login    | Login, returns JWT token   |
| GET    | /api/auth/me       | Verify token, refresh info |

### Customers (requires login + approved status)
| Method | Endpoint                          | Description               |
|--------|-----------------------------------|---------------------------|
| GET    | /api/customers                    | List all your customers   |
| GET    | /api/customers/:id                | Get one + full history    |
| POST   | /api/customers                    | Create new customer       |
| PUT    | /api/customers/:id                | Update customer           |
| DELETE | /api/customers/:id                | Delete customer           |

### Refill History
| Method | Endpoint                                  | Description              |
|--------|-------------------------------------------|--------------------------|
| GET    | /api/customers/:id/refills                | List refill logs         |
| POST   | /api/customers/:id/refills                | Log a new refill         |
| DELETE | /api/customers/:id/refills/:logId         | Delete a refill log      |
| GET    | /api/customers/:id/refills/range?from=&to=| Date-range analysis      |

### Owner Panel (owner code required)
| Method | Endpoint                          | Description               |
|--------|-----------------------------------|---------------------------|
| GET    | /api/owner/users                  | List all users + stats    |
| PATCH  | /api/owner/users/:id/status       | Approve / block user      |
| DELETE | /api/owner/users/:id              | Delete a user account     |
| GET    | /api/owner/stats                  | Global system stats       |

---

## 🔐 Security Notes

- Passwords are hashed with **bcrypt (12 rounds)** — never stored in plain text
- Every data query is **filtered by user_id** — users cannot access each other's data
- **JWT tokens** expire after 7 days (configurable in .env)
- Owner login uses the special OWNER_CODE (no password)
- SQLite **foreign keys + CASCADE** are enforced — deleting a user deletes their data

---

## 🔄 Frontend Migration

Replace your IndexedDB calls in index.html with fetch() calls:

```javascript
// Store token after login
const res  = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
const data = await res.json();
if (data.ok) localStorage.setItem('gmp_token', data.token);

// Use token for all subsequent calls
const token = localStorage.getItem('gmp_token');

const customers = await fetch('/api/customers', {
  headers: { Authorization: 'Bearer ' + token }
}).then(r => r.json());
```

---

## 📁 Project Structure

```
gas-manager-backend/
├── server.js            ← Entry point
├── db.js                ← SQLite connection + auto-schema
├── schema.sql           ← CREATE TABLE statements
├── .env.example         ← Copy to .env and fill in values
├── middleware/
│   └── auth.js          ← JWT verification middleware
└── routes/
    ├── auth.js          ← /api/auth/*
    ├── customers.js     ← /api/customers/*
    ├── refills.js       ← /api/customers/:id/refills/*
    └── owner.js         ← /api/owner/*
```
