-- =============================================================
-- 港股通结算汇率表
-- 用于存储 SZSE 深交所每日披露的港股通结算汇兑比率
-- 此表为全局数据，无需 RLS（所有用户共享同一汇率）
-- =============================================================

CREATE TABLE IF NOT EXISTS public.hkex_rates (
  date  DATE        PRIMARY KEY,
  bid   NUMERIC(10, 6) NOT NULL,  -- 买入结算汇兑比率（HKD → CNY）
  ask   NUMERIC(10, 6) NOT NULL,  -- 卖出结算汇兑比率（HKD → CNY）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 可选：保留历史记录（不启用，保留最新一条即可）
-- ALTER TABLE public.hkex_rates SET (autovacuum_enabled = on);

-- =============================================================
-- 跑完后验证：
--   SELECT * FROM hkex_rates ORDER BY date DESC LIMIT 5;
-- =============================================================
