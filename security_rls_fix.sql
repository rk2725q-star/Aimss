-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — Security Fix: RAG Documents RLS
--  Run in: Supabase Dashboard → SQL Editor
--
--  FIX: Previously "USING (true)" allowed ANY authenticated user
--       from ANY institution to read ALL institutions' documents.
--       This fix scopes reads to only the user's own institution.
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: Drop the overly-permissive read policy ────────────
DROP POLICY IF EXISTS "Users can read rag_documents" ON public.rag_documents;

-- ── Step 2: Create institution-scoped read policy ─────────────
-- Students and teachers can ONLY read documents from their own institution.
-- Admins can read all documents in their institution.
CREATE POLICY "Users can read own institution rag_documents"
ON public.rag_documents FOR SELECT TO authenticated
USING (
  institution_id = (
    SELECT institution_id
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1
  )
  OR
  -- Allow teachers to also read documents they personally uploaded (even if
  -- institution_id was somehow different during testing)
  uploaded_by = auth.email()
);

-- ── Step 3: Verify the new policy ────────────────────────────
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'rag_documents'
ORDER BY policyname;

-- ── Step 4 (Optional): Add RLS to profiles table if not already ──
-- Ensure users can only read their own profile data.
-- (Check if RLS is already enabled first)
DO $$
BEGIN
  -- Enable RLS on profiles if not already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND rowsecurity = TRUE
  ) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Allow users to read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- Allow admins to read all profiles in their institution
DROP POLICY IF EXISTS "Admins can read institution profiles" ON public.profiles;
CREATE POLICY "Admins can read institution profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  institution_id = (
    SELECT institution_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
  AND
  (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1) = 'admin'
);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Allow new users to insert their own profile (on signup)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());
