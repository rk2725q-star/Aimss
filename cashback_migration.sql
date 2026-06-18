-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — Student Cashback Table (Supabase)
--  Run in: Supabase Dashboard → SQL Editor
--
--  Records MCQ-score-based cashback rewards earned by students.
--  Tiers: 95%+ → ₹10,000 (Gold) | 90%+ → ₹5,000 (Silver)
--         85%+ → ₹3,000 (Bronze) | 80%+ → ₹500 (Merit)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.student_cashback (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id  TEXT         NOT NULL,
  class_name      TEXT,                                  -- e.g. '6', 'neet', 'jee'
  bank_title      TEXT,                                  -- MCQ test name
  amount          NUMERIC(10,2) NOT NULL,                -- ₹10,000 / 5,000 / 3,000 / 500
  pct_at_test     INTEGER      NOT NULL,                 -- e.g. 95
  tier            INTEGER      NOT NULL,                 -- 1=Gold, 2=Silver, 3=Bronze, 4=Merit
  source          TEXT         DEFAULT 'mcq',            -- 'mcq' | 'manual' | 'event'
  status          TEXT         DEFAULT 'pending',        -- 'pending' | 'claimed' | 'cancelled'
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT now()
);

-- Indexes for fast per-user and per-class queries
CREATE INDEX IF NOT EXISTS idx_cashback_user    ON public.student_cashback (user_id);
CREATE INDEX IF NOT EXISTS idx_cashback_class   ON public.student_cashback (institution_id, class_name);
CREATE INDEX IF NOT EXISTS idx_cashback_created ON public.student_cashback (created_at DESC);

-- RLS: students can read their own cashback rows
ALTER TABLE public.student_cashback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read own cashback" ON public.student_cashback;
CREATE POLICY "Students can read own cashback"
ON public.student_cashback FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Inserts happen server-side via SECURITY DEFINER RPC (below).
-- Updates (claim status) also via the same RPC.

-- ═══════════════════════════════════════════════════════════════
--  RPC: get_student_cashback_summary()
--  Returns aggregate cashback earned per student (lifetime + by tier).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_student_cashback_summary(p_user_id UUID)
RETURNS TABLE (
  total_amount   NUMERIC,
  gold_count     BIGINT,
  silver_count   BIGINT,
  bronze_count   BIGINT,
  merit_count    BIGINT,
  pending_amount NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(amount), 0)::NUMERIC                          AS total_amount,
    COUNT(*) FILTER (WHERE tier = 1)::BIGINT                   AS gold_count,
    COUNT(*) FILTER (WHERE tier = 2)::BIGINT                   AS silver_count,
    COUNT(*) FILTER (WHERE tier = 3)::BIGINT                   AS bronze_count,
    COUNT(*) FILTER (WHERE tier = 4)::BIGINT                   AS merit_count,
    COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::NUMERIC AS pending_amount
  FROM public.student_cashback
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_cashback_summary(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
--  RPC: get_all_class_cashback(p_class_name)
--  Returns top cashback winners per class (for admin/teacher views).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_class_cashback_leaderboard(
  p_institution_id TEXT,
  p_class_name     TEXT
)
RETURNS TABLE (
  user_id      UUID,
  total_amount NUMERIC,
  best_pct     INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    user_id,
    SUM(amount)::NUMERIC AS total_amount,
    MAX(pct_at_test)     AS best_pct
  FROM public.student_cashback
  WHERE institution_id = p_institution_id
    AND class_name     = p_class_name
  GROUP BY user_id
  ORDER BY total_amount DESC, best_pct DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_class_cashback_leaderboard(TEXT, TEXT) TO authenticated;

SELECT '✅ student_cashback table + RPC ready!' AS status;
