-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — RAG System Migration v2 (High Performance)
--  Run in: Supabase Dashboard → SQL Editor
--
--  IMPROVEMENTS OVER v1:
--  ✅ Stored ts_vector column (pre-computed FTS, not on-the-fly)
--  ✅ Composite indexes for class+subject+exam filtering
--  ✅ Trigger to auto-update ts_vector on insert/update
--  ✅ institution_id index for multi-tenant isolation
--  ✅ websearch-mode FTS (supports natural language queries)
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: Create table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rag_documents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  class_level    TEXT        NOT NULL,       -- '6','7','8','9','10','11','12','neet','jee'
  subject        TEXT        NOT NULL,       -- 'Physics','Chemistry','Biology','Maths','Science','English','Social','Computer','General'
  exam_category  TEXT        NOT NULL,       -- 'CBSE','Stateboard','NEET','JEE','TNPSC','UPSC','General'
  chapter        TEXT        DEFAULT '',
  content_text   TEXT        NOT NULL,       -- the actual chunk text
  content_fts    TSVECTOR,                  -- pre-computed FTS vector (auto-updated by trigger)
  chunk_index    INTEGER     DEFAULT 0,
  total_chunks   INTEGER     DEFAULT 1,
  file_type      TEXT        DEFAULT 'text', -- 'pdf' | 'image' | 'text'
  source_name    TEXT        DEFAULT '',     -- original filename
  institution_id TEXT        DEFAULT '',
  uploaded_by    TEXT        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Step 2: Trigger function — auto-compute FTS vector ────────
-- This runs on INSERT/UPDATE and populates content_fts automatically.
-- Using 'english' dictionary so stemming works (run → running → runs all match).
CREATE OR REPLACE FUNCTION rag_documents_fts_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.content_fts := to_tsvector('english', COALESCE(NEW.content_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_rag_fts ON public.rag_documents;
CREATE TRIGGER trig_rag_fts
  BEFORE INSERT OR UPDATE OF content_text
  ON public.rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION rag_documents_fts_trigger();

-- Backfill for existing rows (if any)
UPDATE public.rag_documents
SET content_fts = to_tsvector('english', COALESCE(content_text, ''))
WHERE content_fts IS NULL;

-- ── Step 3: Enable RLS ────────────────────────────────────────
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

-- ── Step 4: Drop old policies (safe re-run) ───────────────────
DROP POLICY IF EXISTS "Teachers can insert rag_documents"   ON public.rag_documents;
DROP POLICY IF EXISTS "Teachers can delete their documents" ON public.rag_documents;
DROP POLICY IF EXISTS "Users can read rag_documents"        ON public.rag_documents;
DROP POLICY IF EXISTS "Admins can manage rag_documents"     ON public.rag_documents;

-- ── Step 5: RLS — Teachers & Admins can INSERT ────────────────
CREATE POLICY "Teachers can insert rag_documents"
ON public.rag_documents FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('teacher', 'admin')
);

-- ── Step 6: RLS — Teachers/Admins can DELETE ─────────────────
CREATE POLICY "Teachers can delete their documents"
ON public.rag_documents FOR DELETE TO authenticated
USING (
  uploaded_by = auth.email()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ── Step 7: RLS — All authenticated users can READ ───────────
CREATE POLICY "Users can read rag_documents"
ON public.rag_documents FOR SELECT TO authenticated
USING (true);

-- ── Step 8: HIGH-PERFORMANCE INDEXES ─────────────────────────

-- 8a. GIN index on pre-computed FTS vector
--     This is what makes full-text search return in <100ms on millions of rows.
DROP INDEX IF EXISTS idx_rag_content_fts;
CREATE INDEX idx_rag_content_fts
  ON public.rag_documents USING gin(content_fts);

-- 8b. Composite B-tree index: class + subject + exam
--     Powers the metadata filtering (the WHERE clauses) in O(log n).
DROP INDEX IF EXISTS idx_rag_class_subject_exam;
CREATE INDEX idx_rag_class_subject_exam
  ON public.rag_documents (class_level, subject, exam_category);

-- 8c. Institution isolation index
DROP INDEX IF EXISTS idx_rag_institution;
CREATE INDEX idx_rag_institution
  ON public.rag_documents (institution_id);

-- 8d. Uploader index (for teacher's "my documents" view)
DROP INDEX IF EXISTS idx_rag_uploaded_by;
CREATE INDEX idx_rag_uploaded_by
  ON public.rag_documents (uploaded_by);

-- 8e. Composite index for document list view (chunk_index=0 queries)
DROP INDEX IF EXISTS idx_rag_doclist;
CREATE INDEX idx_rag_doclist
  ON public.rag_documents (institution_id, class_level, subject, chunk_index, created_at DESC);

-- ── Step 9: Verify everything ─────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'rag_documents'
ORDER BY ordinal_position;

-- Show indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'rag_documents'
ORDER BY indexname;

-- ── QUICK PERF TEST (uncomment after uploading some docs) ─────
-- EXPLAIN ANALYZE
-- SELECT id, title, source_name, content_text, chunk_index
-- FROM public.rag_documents
-- WHERE class_level    = '11'
--   AND subject        = 'Physics'
--   AND exam_category  = 'Stateboard'
--   AND institution_id = 'YOUR_INST_CODE'
--   AND content_fts @@ websearch_to_tsquery('english', 'Newton laws of motion')
-- ORDER BY ts_rank(content_fts, websearch_to_tsquery('english', 'Newton laws of motion')) DESC
-- LIMIT 150;
