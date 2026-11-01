# Rollcall

Volleyball attendance for Camtech Volleyball Club. React + Vite PWA, Supabase (Postgres, auth, row-level security), hosted on Vercel.

## Features
- Today: one tap per player (P/L/E/A), search, "unmarked only", fill the rest present/absent, notes.
- Training days (default Tue/Fri, set in History) and normal days tracked as two separate percentages.
- Works offline: marks are queued on the device and sync automatically; the last data is cached so the app opens without signal.
- QR self check-in: coach opens check-in (optional "late after" time); players scan, tap their name, done. Public RPCs `checkin_info` / `checkin` validate an expiring code.
- Share to Telegram: session summary and monthly report.
- Co-coaches: owner adds another account by email as "can mark" or "view only" (`coaches` table + RLS via `is_coach_of`).
- Player pages: training/normal %, last sessions, streaks, notes. CSV export.
- Password reset.

## Dev
- `npm install && npm run dev`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable key is safe in the browser; RLS protects data)
- Each % = (present + late) / (present + late + absent). Excused never counts against a player.
