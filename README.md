# Smart Xerox Queue Management System

A full-stack web application to automate the printing workflow for students and Xerox shop owners.

## Project Structure
```
xerox-queue/
├── backend/          ← Node.js + Express API
│   ├── server.js
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── controllers/
│   ├── uploads/      ← auto-created
│   └── .env          ← configure this
└── frontend/
    └── pages/
        ├── index.html     ← Login / Register
        ├── dashboard.html ← Student: upload + order
        ├── orders.html    ← Student: track orders
        └── owner.html     ← Owner: queue management
```

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
npm install
```

Edit `.env`:
```
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/xerox_queue
JWT_SECRET=your_secret_key_here
CLIENT_URL=http://localhost:3000
```

Start the server:
```bash
npm start
# or for development with hot-reload:
npm run dev
```

### 2. Frontend Setup
Open `frontend/pages/index.html` directly in a browser,
or serve with a static server:
```bash
npx serve frontend/pages
```

### 3. Register Users
- Open index.html → Register as **Student** or **Shop Owner**
- Owner dashboard auto-redirects after login with owner role

## Features
- Student: Upload PDF/DOCX/PPT, select print settings (whole or page-by-page), live cost calculator, payment selection, token + live status tracking
- Owner: Live queue (FIFO), one-click status updates, smart header info, payment tracking, analytics
- Real-time updates via Socket.IO
- Auto file deletion after order completion (1 hour timer)
- JWT authentication

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | HTML, Tailwind CSS, Vanilla JS |
| Backend | Node.js, Express.js |
| Database | MongoDB (via Mongoose) |
| Auth | JWT |
| Real-time | Socket.IO |
| File Upload | Multer |
| Deployment | Vercel (frontend), Render (backend), MongoDB Atlas |
