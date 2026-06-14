-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — RAG System CLEAN RESET + Fresh v2 Install
--
--  USE THIS IF: You want to drop the old table and start fresh.
--  WARNING: This will DELETE all previously uploaded documents!
--  (Only use if you haven't uploaded important files yet)
--
--  Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: Drop everything from v1 ──────────────────────────

-- Drop trigger first
DROP TRIGGER IF EXISTS trig_rag_fts ON public.rag_documents;

-- Drop trigger function
DROP FUNCTION IF EXISTS rag_documents_fts_trigger();

-- Drop all indexes (will be auto-dropped with table, but just in case)
DROP INDEX IF EXISTS idx_rag_content_fts;
DROP INDEX IF EXISTS idx_rag_class_subject_exam;
DROP INDEX IF EXISTS idx_rag_class_subject;
DROP INDEX IF EXISTS idx_rag_institution;
DROP INDEX IF EXISTS idx_rag_uploaded_by;
DROP INDEX IF EXISTS idx_rag_doclist;

-- Drop all RLS policies
DROP POLICY IF EXISTS "Teachers can insert rag_documents"   ON public.rag_documents;
DROP POLICY IF EXISTS "Teachers can delete their documents" ON public.rag_documents;
DROP POLICY IF EXISTS "Users can read rag_documents"        ON public.rag_documents;
DROP POLICY IF EXISTS "Admins can manage rag_documents"     ON public.rag_documents;

-- Drop the table (CASCADE removes all dependent objects)
DROP TABLE IF EXISTS public.rag_documents CASCADE;

-- ── Step 2: Create fresh table (v2 with content_fts) ─────────
CREATE TABLE public.rag_documents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  class_level    TEXT        NOT NULL,
  subject        TEXT        NOT NULL,
  exam_category  TEXT        NOT NULL,
  chapter        TEXT        DEFAULT '',
  content_text   TEXT        NOT NULL,
  content_fts    TSVECTOR,                  -- pre-computed FTS vector
  chunk_index    INTEGER     DEFAULT 0,
  total_chunks   INTEGER     DEFAULT 1,
  file_type      TEXT        DEFAULT 'text',
  source_name    TEXT        DEFAULT '',
  institution_id TEXT        DEFAULT '',
  uploaded_by    TEXT        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Step 3: Auto-update FTS trigger ──────────────────────────
CREATE OR REPLACE FUNCTION rag_documents_fts_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.content_fts := to_tsvector('english', COALESCE(NEW.content_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_rag_fts
  BEFORE INSERT OR UPDATE OF content_text
  ON public.rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION rag_documents_fts_trigger();

-- ── Step 4: Enable RLS ────────────────────────────────────────
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

-- ── Step 5: RLS Policies ──────────────────────────────────────

CREATE POLICY "Teachers can insert rag_documents"
ON public.rag_documents FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('teacher', 'admin')
);

CREATE POLICY "Teachers can delete their documents"
ON public.rag_documents FOR DELETE TO authenticated
USING (
  uploaded_by = auth.email()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Users can read rag_documents"
ON public.rag_documents FOR SELECT TO authenticated
USING (true);

-- ── Step 6: All 5 Performance Indexes ────────────────────────

-- GIN index for full-text search (most important!)
CREATE INDEX idx_rag_content_fts
  ON public.rag_documents USING gin(content_fts);

-- Composite: class + subject + exam (for filtering)
CREATE INDEX idx_rag_class_subject_exam
  ON public.rag_documents (class_level, subject, exam_category);

-- Institution isolation
CREATE INDEX idx_rag_institution
  ON public.rag_documents (institution_id);

-- Teacher's "my documents" view
CREATE INDEX idx_rag_uploaded_by
  ON public.rag_documents (uploaded_by);

-- Document list view (chunk_index = 0 query)
CREATE INDEX idx_rag_doclist
  ON public.rag_documents (institution_id, class_level, subject, chunk_index, created_at DESC);

-- ── Step 7: Verify ────────────────────────────────────────────
SELECT '✅ RAG table created fresh (v2)' AS status;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'rag_documents'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'rag_documents'
ORDER BY indexname;
