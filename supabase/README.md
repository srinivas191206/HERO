# HERO State Cloud Setup (Vercel + Supabase)

## 1. Supabase Setup
1. Create a Supabase project.
2. Run [`schema.sql`](./schema.sql) in the **Supabase SQL Editor**.
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy district-sync
   ```
4. Set secrets for the Edge Function (Supabase automatically injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`).

## 2. Local District Node Configuration (`backend/.env`)
On each District Laptop / Mini-PC running the Electron Command Center or Node server:
```env
PORT=5001
JWT_SECRET=replace-with-strong-secret
DISTRICT_ID=d_vzg
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
DISTRICT_NODE_KEY=hk_generated_from_state_admin_portal
```
- While internet is available (staging), the District Node syncs roster & queued data with `district-sync`.
- During internet blackouts, all operations run 100% locally in SQLite and queue into `cloud_sync_queue`.
- Once internet returns, `CloudSyncService` automatically pushes the offline backlog to Supabase.

## 3. Vercel Frontend Hosting
Deploy `frontend/` to Vercel with static export (`output: 'export'`):
- Build command: `npm run build`
- Output directory: `out`
- Optional env vars for State Portal Supabase client (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

