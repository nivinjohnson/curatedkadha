# Supabase Catalog Integration Guide for Netlify

This guide details how your product catalog is hosted on **Supabase** and connected with **Netlify**.

---

## 1. Supabase Database Setup

1. Create a free account at [Supabase.com](https://supabase.com) and create a new project (e.g. `curated-kadha`).
2. Navigate to **SQL Editor** in your Supabase dashboard.
3. Open `supabase_schema.sql` from this repository, paste its contents into the SQL Editor, and click **Run**.
   - This creates the `product_info` table with all necessary columns (`group_id`, `title`, `description`, `price`, `active`, etc.) and Row-Level Security (RLS) policies.

---

## 2. Netlify Environment Variables Setup

In your Netlify Project Dashboard:
1. Go to **Site Configuration** -> **Environment variables**.
2. Add the following two variables:

| Key | Description | Example Location in Supabase |
|---|---|---|
| `SUPABASE_URL` | Your Supabase API URL | Project Settings -> API -> Project URL (`https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Secret (for Serverless Functions) | Project Settings -> API -> `service_role` secret |

*(Optional for client-side directly: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` can also be added if needed in the future).*

---

## 3. How the Supabase Integration Works

- **Fetching Catalog**:
  - The app calls `/api/product-catalog` (redirected via `netlify.toml` to Netlify Function `product-catalog.js`).
  - The Netlify function queries Supabase `product_info` table and returns JSON.
  - If Supabase is unreachable or during local offline dev, `app.js` gracefully falls back to reading `product_info/product_catalog.xlsx`.

- **Fetching & Syncing Excel Data to Database (Non-Destructive)**:
  - Clicking **"Fetch Excel & Update DB"** reads the product records directly from `product_info/product_catalog.xlsx`.
  - Clicking **"Upload Excel to DB"** allows selecting any custom `.xlsx` spreadsheet directly from your computer.
  - **Preserves Existing Products**: Uploads/syncs operate in **insert-only** mode. Any products that already exist in the database (matching `group_id`) are preserved without modifications (keeping their current pricing, descriptions, active status, and custom stock edits intact). Only new products are inserted into `public.product_info`.
  - **No reload needed**: `app.js` updates state instantly and re-renders the UI automatically.

---

## 4. Local Testing with Netlify CLI

To run and test locally with Netlify serverless functions:

```bash
npm install -g netlify-cli
netlify dev
```

Or test backend environment variables locally by populating `.env`:
```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
