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

-- RLS
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own token_usage" ON public.token_usage;
CREATE POLICY "Users can manage own token_usage"
ON public.token_usage FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

SELECT '✅ token_usage table ready!' AS status;
