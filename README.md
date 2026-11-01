# Rollcall

Volleyball training attendance. React + Vite PWA, Supabase (Postgres, auth, row-level security), hosted on Vercel.

- `npm install && npm run dev` to run locally
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable key is safe in the browser; RLS protects data)
- Only training days count (default Tuesday and Friday, changeable in History). Other days are optional sessions, shown as a bonus.
- Attendance % = (present + late) / (present + late + absent) over training-day sessions. Excused never counts against a player.

## Schema
`players`, `sessions` (one per date), `attendance` (session × player, status P/L/E/A, optional note). Every row has `owner = auth.uid()` enforced by RLS.
