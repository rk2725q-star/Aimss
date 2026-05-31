-- ═══════════════════════════════════════════════════════════
--  Dr.AIMSS — Fix Storage DELETE Policy for "material" bucket
--  Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Step 1: Drop any existing (possibly broken) delete policy
DROP POLICY IF EXISTS "Teachers can delete material files" ON storage.objects;
DROP POLICY IF EXISTS "Allow teacher delete" ON storage.objects;
DROP POLICY IF EXISTS "teacher_delete" ON storage.objects;

-- Step 2: Create the correct DELETE policy for teachers
--   Allows any authenticated user whose profile.role = 'teacher'
--   to delete objects from the 'material' bucket.
CREATE POLICY "Teachers can delete material files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'material'
  AND (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  ) = 'teacher'
);

-- Step 3: Verify the policy was created
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
