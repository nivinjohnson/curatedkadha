-- Supabase SQL Schema for Curated Kadha Product Catalog & Orders
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

-- 4. Create orders table for order management
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  items JSONB NOT NULL,
  items_total NUMERIC(10,2) DEFAULT 0.00,
  shipping_method TEXT DEFAULT 'Standard Shipping',
  shipping_cost NUMERIC(10,2) DEFAULT 7.00,
  shipping_id TEXT DEFAULT '',
  total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: Add shipping_id column if adding to an existing database
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_id TEXT DEFAULT '';

-- Index for order queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);

-- Enable RLS on orders table
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow public insert on orders for checkout
CREATE POLICY "Allow public insert on orders"
  ON public.orders
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow public read access on orders for stock page (or service role)
CREATE POLICY "Allow read on orders"
  ON public.orders
  FOR SELECT
  TO public
  USING (true);

-- 5. Migration: Update existing product prices in database table to 29 or 39
-- (Dresses, coordinates, sets, maxis, gowns set to $39; tops, crops, shirts, and singles set to $29)
UPDATE public.product_info
SET price = CASE
  WHEN (
    LOWER(COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(tags, '')) ~* '(dress|coord|co-ord|set|suit|maxi|gown|anarkali|kurta|jacket|skirt)'
    OR COALESCE(item_count, 1) > 2
  ) THEN 39.00
  ELSE 29.00
END;

