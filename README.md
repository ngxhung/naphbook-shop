# NAPH Bookstore

This workspace now contains a separated frontend and backend for the bookstore app.

## Setup

1. Start the backend:
   - Open a terminal in `d:\Công Nghệ WEB\backend`
   - Run `npm install`
   - Run `npm start`
   - Backend will run on `http://localhost:3000`
   - Backend now stores data in SQLite at `backend/data.db` and seeds initial content from `backend/db.json`.
   - Frontend is also served from the backend at `http://localhost:3000`

2. Start the frontend server (optional):
   - Open a terminal in `d:\Công Nghệ WEB\frontend`
   - Run `npm install`
   - Run `npm start`
   - Frontend will run on `http://localhost:8080`
   - The frontend is configured to use the backend API at `http://localhost:3000/api`.

## Admin login

- Email: `admin@example.com`
- Password: `admin123`
