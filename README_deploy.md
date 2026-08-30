# OQEAN Stock Card — going live

You now have three things:
1. `schema.sql` + `products_seed.sql` — your database (see previous message on how to run these in Supabase's SQL Editor if you haven't already).
2. `oqean-stock-card.zip` — the actual app, wired to Supabase, ready to deploy.

## 1. Get your Supabase keys

Supabase dashboard → Settings → API. Copy:
- **Project URL**
- **anon public** key

## 2. Get the code onto GitHub (Netlify deploys from a repo)

1. Unzip `oqean-stock-card.zip` somewhere on your computer.
2. Create a new empty repo on GitHub (e.g. `oqean-stock-card`).
3. From inside the unzipped folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/oqean-stock-card.git
   git push -u origin main
   ```

## 3. Connect Netlify

1. Netlify → Add new site → Import an existing project → pick your GitHub repo.
2. Build settings should auto-fill from `netlify.toml` (build command `npm run build`, publish `dist`) — leave as is.
3. Before deploying, go to **Site settings → Environment variables** and add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
4. Deploy. Every push to `main` redeploys automatically.

## 4. Try it locally first (optional but recommended)

```
npm install
cp .env.example .env    # then fill in your real Supabase URL + key
npm run dev
```
Opens at `http://localhost:5173`.

## What's wired up

- **Summary** — live totals from the stock ledger and this month's sales.
- **Stock by Location** — pick a location, see what's actually there.
- **Deliveries & Returns** — create, edit while Draft, Approve → Sent (which writes the stock movement automatically), print.
- **Sales Entry** — logs a sale and reduces stock in the same action; edit/delete keeps the ledger in sync.
- **Invoices** — pulls real sales for a consignee + month, computes commission from that consignee's rate, prints.
- **Stock Opname** — counts against real current stock, submitting writes an adjustment movement.
- **Master Data** — Products (catalog + per-location drill-down), Locations (add new, edit commission %).

## What's not in this pass

- No login/auth screen yet — right now anyone with the URL can use it. The schema has RLS enabled for `authenticated` users, so the natural next step is adding Supabase Auth (email/password) in front of it. Say the word and I'll wire that in.
- No image upload for products yet (the "paste from clipboard" cell from the mockup isn't carried over) — would need Supabase Storage wired in.
- No CSV/Excel export button yet, per our conversation about keeping cross-location analytics in spreadsheets.

None of these block going live for basic use — they're just the next round.
