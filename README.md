# sched rcc app

Monthly shift scheduling app built with React + Vite + Firebase.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill Firebase values.
3. Run locally: `npm run dev`

## Access Control (Firestore-driven)

Access is controlled by Firestore document:

- `appConfig/security`
- field: `allowedEmails` (array of lowercase emails)

Default admin emails:

- `ranyakar@gmail.com`
- `rcchaifa@gmail.com`

How to add users (no code changes):

1. Open Firebase Console -> Firestore.
2. Edit document `appConfig/security`.
3. Add/remove emails in `allowedEmails`.
4. Save.

If `allowedEmails` is missing/empty, access is denied by default.

## Theme Persistence

Theme settings are saved per user in Firestore:

- path: `users/{uid}/settings/ui`
- field: `theme`

After login, the app loads theme automatically. Theme changes are auto-saved (debounced).

## Firestore Rules

Rules are in `firestore.rules`.
Paste that file in Firebase Console -> Firestore Rules and click **Publish**.

## Deploy (GitHub Pages)

Deployment is automatic via GitHub Actions on every push to `main`.

- Workflow: `.github/workflows/deploy.yml`
- Build output: `dist`
- Site URL: `https://ranylabs.github.io/jrcc-shift-scheduler/`

No manual copy to `docs` is required.
