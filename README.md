# sched rcc app

Monthly shift scheduling web app built with React + Vite + Firebase Firestore.

## Stack

- React (Vite)
- Firebase Firestore (modular SDK)
- Firebase Auth (Google)
- Local undo/redo state engine

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env` and fill Firebase values.
3. Run:
   - `npm run dev`

## Auth Access

Access is allowed only for:

- `ranyakar@gmail.com`
- `rcchaifa@gmail.com`

Users must sign in with Google. Unauthorized users are signed out and blocked.

## Deploy

Deploy is automatic via GitHub Actions on every push to `main`.

- Build output: `dist`
- No manual copy to `docs`
- Command flow: `git push`
