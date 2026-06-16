-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — Token Usage Table (Supabase)
--  Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.token_usage (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month        TEXT        NOT NULL,           -- e.g. '2026-06'
  prompt_tokens     INTEGER     DEFAULT 0,
  completion_tokens INTEGER     DEFAULT 0,
  total_tokens      INTEGER     DEFAULT 0,
  requests          INTEGER     DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, year_month)
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_token_usage_user ON public.token_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_ym   ON public.token_usage (user_id, year_month);

-- RLS: users can only manage their OWN rows
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own token_usage" ON public.token_usage;
CREATE POLICY "Users can manage own token_usage"
ON public.token_usage FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
--  RPC: get_all_users_token_usage()
--  SECURITY DEFINER = runs as table owner, bypasses RLS safely.
--  Returns aggregated totals per year_month across ALL users.
--  No individual user data is exposed — only sums + unique user count.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_all_users_token_usage()
RETURNS TABLE (
  year_month        TEXT,
  prompt_tokens     BIGINT,
  completion_tokens BIGINT,
  total_tokens      BIGINT,
  requests          BIGINT,
  unique_users      BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    year_month,
    SUM(prompt_tokens)::BIGINT     AS prompt_tokens,
    SUM(completion_tokens)::BIGINT AS completion_tokens,
    SUM(total_tokens)::BIGINT      AS total_tokens,
    SUM(requests)::BIGINT          AS requests,
    COUNT(DISTINCT user_id)::BIGINT AS unique_users
  FROM public.token_usage
  GROUP BY year_month
  ORDER BY year_month;
$$;

-- Allow any authenticated user to call this RPC
GRANT EXECUTE ON FUNCTION public.get_all_users_token_usage() TO authenticated;

SELECT '✅ token_usage table + RPC ready!' AS status;
