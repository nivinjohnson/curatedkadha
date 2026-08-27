-- Supabase SQL Schema for Curated Kadha Product Catalog
-- Run this script in the Supabase SQL Editor (https://app.supabase.com -> Project -> SQL Editor)

-- 1. Create product_info table
CREATE TABLE IF NOT EXISTS public.product_info (
  group_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled product',
  description TEXT DEFAULT '',
  dress_description TEXT DEFAULT '',
  size_mentions TEXT DEFAULT '',
  sold_sizes TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  primary_image_file TEXT DEFAULT '',
  image_files TEXT DEFAULT '',
  permalink TEXT DEFAULT '',
  product_type TEXT DEFAULT 'IMAGE',
  product_date TIMESTAMPTZ,
  price NUMERIC(10,2) DEFAULT 0.00,
  caption_has_sold BOOLEAN DEFAULT FALSE,
  item_count INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for public queries
CREATE INDEX IF NOT EXISTS idx_product_info_active ON public.product_info (active);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.product_info ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Public can read active and all products for shop rendering
CREATE POLICY "Allow public read access"
  ON public.product_info
  FOR SELECT
  TO public
  USING (true);

-- 4. Policy: Allow insert/update/delete for service role / API functions
-- Note: Service Role keys bypass RLS automatically in Netlify functions.
