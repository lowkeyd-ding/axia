-- 历史行情快照，用于月度和年度收益基准
CREATE TABLE IF NOT EXISTS public.price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'fund')),
  date DATE NOT NULL,
  price NUMERIC(20, 8) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL,
  source TEXT NOT NULL,
  data_tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS price_snapshots_symbol_date_idx
  ON public.price_snapshots(symbol, date DESC);

ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read price snapshots"
  ON public.price_snapshots FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert price snapshots"
  ON public.price_snapshots FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update price snapshots"
  ON public.price_snapshots FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
