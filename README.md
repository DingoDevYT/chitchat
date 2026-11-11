# Chitchat

A cozy, fast Discord alternative for friend groups. Messages type out in Animal Crossing–style "Animalese",
and every avatar talks like a PNGtuber.

**Stack:** React + Vite on GitHub Pages (free), Supabase for auth, Postgres, realtime and file storage (free tier),
and peer-to-peer WebRTC for voice (free, best for up to ~6–8 people per call).

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests for markdown + message-list logic
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Database

The full schema, row-level security and realtime policies are in `supabase/migrations/001_init.sql`.
The publishable key in `src/lib/supabase.js` is safe to ship: every table is locked down by RLS.

## Cost notes

- Free tier covers ~500 MB database, 1 GB file storage, 200 concurrent realtime connections, 50k monthly users.
- Images are resized to webp (max 2048px) before upload to stretch storage.
- Voice never touches a server. If people on strict networks can't connect, add a TURN server.
