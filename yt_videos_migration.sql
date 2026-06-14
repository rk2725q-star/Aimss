-- ═══════════════════════════════════════════════════════
--  Dr.AIMSS — YouTube Videos Table Migration
--  Run in: Supabase Dashboard → SQL Editor
--
--  Table: yt_videos
--  Purpose: Teachers upload YouTube video links;
--           students view them (read-only via RLS).
-- ═══════════════════════════════════════════════════════

-- ── Step 1: Create table ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.yt_videos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  video_id       TEXT        NOT NULL,          -- YouTube video ID (11 chars)
  category       TEXT        NOT NULL DEFAULT 'General',
  description    TEXT,
  uploaded_by    TEXT        NOT NULL,           -- teacher email
  institution_id TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Step 2: Enable RLS ────────────────────────────────
ALTER TABLE public.yt_videos ENABLE ROW LEVEL SECURITY;

-- ── Step 3: Drop old policies (safe re-run) ───────────
DROP POLICY IF EXISTS "Teachers can insert yt_videos"   ON public.yt_videos;
DROP POLICY IF EXISTS "Teachers can delete yt_videos"   ON public.yt_videos;
DROP POLICY IF EXISTS "Anyone can view yt_videos"       ON public.yt_videos;

-- ── Step 4: RLS — Teachers can INSERT ────────────────
CREATE POLICY "Teachers can insert yt_videos"
ON public.yt_videos FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('teacher', 'admin')
);

-- ── Step 5: RLS — Teachers/Admins can DELETE their own ─
CREATE POLICY "Teachers can delete yt_videos"
ON public.yt_videos FOR DELETE TO authenticated
USING (
  uploaded_by = auth.email()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ── Step 6: RLS — All authenticated users can READ ────
CREATE POLICY "Anyone can view yt_videos"
ON public.yt_videos FOR SELECT TO authenticated
USING (true);

-- ── Step 7: Indexes ───────────────────────────────────
DROP INDEX IF EXISTS idx_yt_videos_institution;
CREATE INDEX idx_yt_videos_institution
  ON public.yt_videos (institution_id, created_at DESC);

DROP INDEX IF EXISTS idx_yt_videos_category;
CREATE INDEX idx_yt_videos_category
  ON public.yt_videos (category);

-- ── Step 8: Verify ────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'yt_videos'
ORDER BY ordinal_position;
