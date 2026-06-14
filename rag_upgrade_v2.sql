-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — RAG System UPGRADE (v1 → v2)
--
--  SCENARIO: rag_migration.sql (v1) already ran before.
--  This script safely UPGRADES the existing table without
--  deleting any uploaded documents.
--
--  SAFE TO RUN MULTIPLE TIMES (idempotent).
--
--  Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: Add content_fts column (only if it doesn't exist) ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'rag_documents'
      AND column_name  = 'content_fts'
  ) THEN
    ALTER TABLE public.rag_documents
      ADD COLUMN content_fts TSVECTOR;
    RAISE NOTICE '✅ content_fts column added.';
  ELSE
    RAISE NOTICE 'ℹ️  content_fts column already exists — skipping.';
  END IF;
END;
$$;

-- ── Step 2: Create or Replace the FTS trigger function ────────
CREATE OR REPLACE FUNCTION rag_documents_fts_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.content_fts := to_tsvector('english', COALESCE(NEW.content_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Step 3: Create trigger (drop first to avoid duplicate) ────
DROP TRIGGER IF EXISTS trig_rag_fts ON public.rag_documents;
CREATE TRIGGER trig_rag_fts
  BEFORE INSERT OR UPDATE OF content_text
  ON public.rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION rag_documents_fts_trigger();

-- ── Step 4: Backfill content_fts for all existing rows ────────
-- This updates ALL documents already uploaded (v1 data).
UPDATE public.rag_documents
SET content_fts = to_tsvector('english', COALESCE(content_text, ''))
WHERE content_fts IS NULL;

-- Show how many rows were backfilled
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.rag_documents;
  RAISE NOTICE '✅ Backfilled % existing document chunks.', row_count;
END;
$$;

-- ── Step 5: Drop and recreate all indexes (v2 set) ────────────

-- GIN index on FTS vector (critical for fast search)
DROP INDEX IF EXISTS idx_rag_content_fts;
CREATE INDEX idx_rag_content_fts
  ON public.rag_documents USING gin(content_fts);

-- Composite index: class + subject + exam (metadata filtering)
DROP INDEX IF EXISTS idx_rag_class_subject_exam;
CREATE INDEX idx_rag_class_subject_exam
  ON public.rag_documents (class_level, subject, exam_category);

-- Institution index
DROP INDEX IF EXISTS idx_rag_institution;
CREATE INDEX idx_rag_institution
  ON public.rag_documents (institution_id);

-- Uploader index
DROP INDEX IF EXISTS idx_rag_uploaded_by;
CREATE INDEX idx_rag_uploaded_by
  ON public.rag_documents (uploaded_by);

-- Document list view index
DROP INDEX IF EXISTS idx_rag_doclist;
CREATE INDEX idx_rag_doclist
  ON public.rag_documents (institution_id, class_level, subject, chunk_index, created_at DESC);

-- ── Step 6: RLS policies — drop old, create new ───────────────
DROP POLICY IF EXISTS "Teachers can insert rag_documents"   ON public.rag_documents;
DROP POLICY IF EXISTS "Teachers can delete their documents" ON public.rag_documents;
DROP POLICY IF EXISTS "Users can read rag_documents"        ON public.rag_documents;
DROP POLICY IF EXISTS "Admins can manage rag_documents"     ON public.rag_documents;

-- Teachers + Admins can INSERT
CREATE POLICY "Teachers can insert rag_documents"
ON public.rag_documents FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('teacher', 'admin')
);

-- Teachers/Admins can DELETE their own
CREATE POLICY "Teachers can delete their documents"
ON public.rag_documents FOR DELETE TO authenticated
USING (
  uploaded_by = auth.email()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- All authenticated users can READ
CREATE POLICY "Users can read rag_documents"
ON public.rag_documents FOR SELECT TO authenticated
USING (true);

-- ── Step 7: Verify everything ─────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'rag_documents'
ORDER BY ordinal_position;

-- Show indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'rag_documents'
ORDER BY indexname;

-- Row count check
SELECT
  class_level,
  subject,
  exam_category,
  COUNT(*) AS chunks
FROM public.rag_documents
GROUP BY class_level, subject, exam_category
ORDER BY class_level, subject;
