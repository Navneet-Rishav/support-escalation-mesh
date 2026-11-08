# Deploying (free tiers)

MongoDB Atlas (database) → Render (Express API) → Vercel (React app). About 20 minutes the first time. Never paste secrets into the repo; they only go into the dashboards below.

## 1. MongoDB Atlas (free M0 cluster)

1. Sign up at https://www.mongodb.com/cloud/atlas/register (Google sign-in is fine).
2. Create a deployment → **M0 Free** → provider AWS, region **Mumbai (ap-south-1)** → name `mesh`.
3. **Database user:** username `mesh-api`, click *Autogenerate Secure Password*, copy it somewhere safe.
4. **Network access:** add `0.0.0.0/0` (Render's free tier has no fixed outbound IP; the database user password protects access).
5. *Connect* → *Drivers* → copy the connection string, insert the password, and add the database name `mesh` before the `?`:
   `mongodb+srv://mesh-api:<password>@mesh.xxxxx.mongodb.net/mesh?retryWrites=true&w=majority`

## 2. Render (Express API)

1. Sign up at https://render.com with GitHub and give it access to `support-escalation-mesh`.
2. *New* → **Blueprint** → pick the repo. Render reads `render.yaml`.
3. When asked for the `sync: false` values:
   - `MONGODB_URI` = the Atlas string from step 1
   - `CORS_ORIGIN` = leave as `http://localhost:5173` for now (updated in step 4)
   - `SARVAM_API_KEY` = leave empty for now (the app runs on the fake provider)
4. Deploy. When it is live, open `https://<service>.onrender.com/healthz`; it should show `{"status":"ok","db":"up"}`.
5. Seed demo data once: Render dashboard → the service → **Shell** → `node dist/scripts/seed.js`.

## 3. Vercel (React app)

From `frontend/`:

```bash
vercel login                      # once
vercel link                       # create project "support-escalation-mesh", root = frontend
vercel env add VITE_API_URL production   # paste https://<service>.onrender.com
vercel --prod
```

Or in the dashboard: *Add New Project* → import the repo → **Root Directory: `frontend`** → add env var `VITE_API_URL` → Deploy.

## 4. Connect them

- Render → service → *Environment* → set `CORS_ORIGIN` to the Vercel URL (comma-separate several, e.g. production + preview).
- Open the Vercel URL → **Try demo as Agent** → the queue should fill within a few seconds.

## 5. Switch on Sarvam (optional, uses API credits)

Render → *Environment*: `SARVAM_API_KEY=<your key>`, `LLM_PROVIDER=sarvam`. Optionally set `LLM_COST_PER_1K_TOKENS_INR` to your real price so evals report cost. Then log in as **Demo Admin** → *Evals* → run v1 and v2, and copy the numbers into the README.

## Smoke test checklist

- [ ] `/healthz` returns ok
- [ ] Demo agent login → queue shows tickets
- [ ] Open a "Needs approval" ticket → Approve & send → shows "Reply sent"
- [ ] Open an escalated ticket → Take over → send a reply
- [ ] Submit a ticket from `/submit` while logged out → appears in the queue
- [ ] Evals tab loads; demo admin can start a run
- [ ] All of the above at phone width (375px)
