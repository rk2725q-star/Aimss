-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — Storage RLS Fix: material bucket
--  Run in: Supabase Dashboard → SQL Editor
--
--  FIX: Teachers cannot delete files because the 'material' storage
--       bucket is either missing DELETE policies or has schema issues.
--
--  This script:
--    1. Drops ALL existing storage policies for the 'material' bucket
--    2. Re-creates correct policies for SELECT / INSERT / UPDATE / DELETE
--       scoped so only teachers can write/delete.
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: Drop ALL existing policies on storage.objects for 'material' bucket ──
DROP POLICY IF EXISTS "Allow authenticated read"           ON storage.objects;
DROP POLICY IF EXISTS "Allow teacher upload"               ON storage.objects;
DROP POLICY IF EXISTS "Allow teacher delete"               ON storage.objects;
DROP POLICY IF EXISTS "Allow teacher update"               ON storage.objects;
DROP POLICY IF EXISTS "Public read material"               ON storage.objects;
DROP POLICY IF EXISTS "Teacher upload material"            ON storage.objects;
DROP POLICY IF EXISTS "Teacher delete material"            ON storage.objects;
DROP POLICY IF EXISTS "Teacher update material"            ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read material"        ON storage.objects;
DROP POLICY IF EXISTS "storage_material_select"            ON storage.objects;
DROP POLICY IF EXISTS "storage_material_insert"            ON storage.objects;
DROP POLICY IF EXISTS "storage_material_delete"            ON storage.objects;
DROP POLICY IF EXISTS "storage_material_update"            ON storage.objects;

-- Also drop any wildcard policies that might exist
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- ── Step 2: Make sure RLS is enabled on storage.objects ──────────
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ── Step 3: SELECT — any authenticated user can read/list files in 'material' ──
CREATE POLICY "storage_material_select"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'material' );

-- ── Step 4: INSERT — only teachers can upload to 'material' ──────
CREATE POLICY "storage_material_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'material'
  AND (
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1
  ) = 'teacher'
);

-- ── Step 5: DELETE — only teachers can delete from 'material' ────
CREATE POLICY "storage_material_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'material'
  AND (
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1
  ) = 'teacher'
);

-- ── Step 6: UPDATE — only teachers can update/move files in 'material' ──
CREATE POLICY "storage_material_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'material'
  AND (
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1
  ) = 'teacher'
)
WITH CHECK (
  bucket_id = 'material'
  AND (
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1
  ) = 'teacher'
);

-- ── Step 7: Verify the policies were created ─────────────────────
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename  = 'objects'
ORDER BY policyname;
