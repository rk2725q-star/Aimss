-- ═══════════════════════════════════════════════════════
--  Dr.AIMSS — YouTube Videos Table Migration v2
--  Run in: Supabase Dashboard → SQL Editor
--
--  Table: yt_videos
--  Purpose: Teachers upload YouTube video links per class;
--           students see videos for their class (or all if no class filter).
--  Changes in v2:
--    + class_name column (e.g. '6', '7', ... '12', or 'all' for everyone)
--    + board column (e.g. 'stateboard', 'cbse', or 'all')
-- ═══════════════════════════════════════════════════════

-- ── Step 1: Create table (or update if it already exists) ─────────────────────
CREATE TABLE IF NOT EXISTS public.yt_videos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  video_id       TEXT        NOT NULL,          -- YouTube video ID (11 chars)
  category       TEXT        NOT NULL DEFAULT 'General',
  description    TEXT,
  uploaded_by    TEXT        NOT NULL DEFAULT '',  -- teacher email
  institution_id TEXT        NOT NULL DEFAULT '',
  class_name     TEXT        NOT NULL DEFAULT 'all',  -- '6','7'...'12' or 'all'
  board          TEXT        NOT NULL DEFAULT 'all',  -- 'stateboard','cbse' or 'all'
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Step 2: Add columns if table already existed without them ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yt_videos'
      AND column_name = 'class_name'
  ) THEN
    ALTER TABLE public.yt_videos ADD COLUMN class_name TEXT NOT NULL DEFAULT 'all';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yt_videos'
      AND column_name = 'board'
  ) THEN
    ALTER TABLE public.yt_videos ADD COLUMN board TEXT NOT NULL DEFAULT 'all';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'yt_videos'
      AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.yt_videos ADD COLUMN uploaded_by TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- ── Step 3: Enable RLS ────────────────────────────────
ALTER TABLE public.yt_videos ENABLE ROW LEVEL SECURITY;

-- ── Step 4: Drop old policies (safe re-run) ───────────
DROP POLICY IF EXISTS "Teachers can insert yt_videos"   ON public.yt_videos;
DROP POLICY IF EXISTS "Teachers can delete yt_videos"   ON public.yt_videos;
DROP POLICY IF EXISTS "Anyone can view yt_videos"       ON public.yt_videos;

-- ── Step 5: RLS — Teachers can INSERT ────────────────
CREATE POLICY "Teachers can insert yt_videos"
ON public.yt_videos FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('teacher', 'admin')
);

-- ── Step 6: RLS — Teachers/Admins can DELETE their own ─
CREATE POLICY "Teachers can delete yt_videos"
ON public.yt_videos FOR DELETE TO authenticated
USING (
  uploaded_by = auth.email()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ── Step 7: RLS — All authenticated users can READ ────
CREATE POLICY "Anyone can view yt_videos"
ON public.yt_videos FOR SELECT TO authenticated
USING (true);

-- ── Step 8: Indexes ───────────────────────────────────
DROP INDEX IF EXISTS idx_yt_videos_institution;
CREATE INDEX idx_yt_videos_institution
  ON public.yt_videos (institution_id, created_at DESC);

DROP INDEX IF EXISTS idx_yt_videos_category;
CREATE INDEX idx_yt_videos_category
  ON public.yt_videos (category);

DROP INDEX IF EXISTS idx_yt_videos_class;
CREATE INDEX idx_yt_videos_class
  ON public.yt_videos (institution_id, class_name, board);

-- ── Step 9: Verify ────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'yt_videos'
ORDER BY ordinal_position;
