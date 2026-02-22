# sched rcc app

Monthly shift scheduling web app built with React + Vite + Firebase Firestore.

## Stack

- React (Vite)
- Firebase Firestore (modular SDK)
- Local undo/redo state engine
- Clean architecture separation:
  - `src/engine`: scheduling and validation logic
  - `src/services`: Firestore access
  - `src/state`: app state and history reducer
  - `src/ui/components`: modular UI

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env` and fill Firebase values.
3. Run:
   - `npm run dev`

## Core features in this initial implementation

- Monthly grid with day numbers + Hebrew weekday row (`� � � � � � �`)
- Employee CRUD with constraints and role (Operator/Responsible)
- Cell cycle: `Empty -> Morning -> Night -> X -> Empty`
- Weekend highlighting (Friday/Saturday)
- Alternating employee rows
- Validation engine with per-day `FIX` indicators
- Auto-fill generator with fairness + constraints
- Undo/Redo history
- Firestore save/load per month key (`YYYY-MM`)
- PDF export (single page, landscape A4)

## Notes

- Firestore functions will throw a clear error until `VITE_FIREBASE_*` env vars are configured.
- Manager override is supported by direct manual cell editing.
## Deploy

- הפריסה מתבצעת אוטומטית ל-GitHub Pages דרך GitHub Actions בכל `push` ל-`main`.
- אין צורך בהעתקה ידנית ל-`docs`.
