-- =============================================================
-- Axia 云同步：每用户隔离的 RLS 设置
-- =============================================================
-- 背景：原 axia_data 表用字面量字符串 'axia_data' 作为 id，
-- 所有用户共享同一行，RLS 策略是 USING (true) = 无隔离。
-- 此外 anon（未登录访客）也能读写，相当于公开数据库。
--
-- 本脚本：彻底重建 axia_data，按 user_id 隔离，仅允许
-- 已登录用户访问自己的数据。
-- =============================================================

-- 1. 删除旧表（含旧策略）
DROP TABLE IF EXISTS public.axia_data CASCADE;

-- 2. 新表：主键就是 auth.users(id)
CREATE TABLE public.axia_data (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 启用行级安全
ALTER TABLE public.axia_data ENABLE ROW LEVEL SECURITY;

-- 4. 唯一的策略：用户只能读写自己那一行
CREATE POLICY "users_own_data" ON public.axia_data
  FOR ALL TO authenticated
  USING        (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- 5. 验证：不要给 anon role 任何 policy，匿名访客默认就会被拒。
--    如果你之前在 Storage / 其他地方有 anon policies，本脚本不影响。

-- =============================================================
-- 跑完后检查：
--   SELECT * FROM axia_data;             -- 应该是空表
--   SELECT policyname FROM pg_policies WHERE tablename = 'axia_data';
--                                      -- 应该只有 users_own_data 一条
-- =============================================================
