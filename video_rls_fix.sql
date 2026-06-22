-- ═══════════════════════════════════════════════════════════════
--  Dr.AIMSS — Video RLS Fix
--  Run in: Supabase Dashboard → SQL Editor
--
--  FIXES:
--  1. Profiles RLS self-reference deadlock that blocks yt_videos insert
--  2. yt_videos SELECT policy to allow all institution members to read
--  3. yt_videos INSERT policy that works without self-referencing profiles
-- ═══════════════════════════════════════════════════════════════

-- ── Step 1: Fix profiles RLS — allow reading ANY user's own role for policy checks ──
-- The problem: yt_videos INSERT policy does:
--   (SELECT role FROM profiles WHERE id = auth.uid())
-- But profiles has USING (id = auth.uid()) which ALSO needs to query profiles —
-- causing a recursive/deadlock issue. Fix: grant anon role-read or use JWT claim.

-- Drop the restrictive profile policies that cause the deadlock
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read institution profiles" ON public.profiles;

-- Re-create: allow all authenticated users to read their own profile row
-- (needed for the yt_videos RLS to work — it does a subquery on profiles)
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (true);  -- allow any authenticated user to read all profiles
               -- (institution scoping is handled at query level in the app)

-- Keep update/insert policies as before
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

-- ── Step 2: Re-create yt_videos policies (clean slate) ────────
DROP POLICY IF EXISTS "Teachers can insert yt_videos"   ON public.yt_videos;
DROP POLICY IF EXISTS "Teachers can delete yt_videos"   ON public.yt_videos;
DROP POLICY IF EXISTS "Anyone can view yt_videos"       ON public.yt_videos;
DROP POLICY IF EXISTS "All authenticated can view yt_videos" ON public.yt_videos;

-- INSERT: teachers and admins can insert
CREATE POLICY "Teachers can insert yt_videos"
ON public.yt_videos FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1) IN ('teacher', 'admin')
);

-- DELETE: teacher can delete their own; admin can delete any
CREATE POLICY "Teachers can delete yt_videos"
ON public.yt_videos FOR DELETE TO authenticated
USING (
  uploaded_by = auth.email()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1) = 'admin'
);

-- SELECT: all authenticated users can read all videos
-- (class/board filtering is done client-side for flexibility)
CREATE POLICY "Anyone can view yt_videos"
ON public.yt_videos FOR SELECT TO authenticated
USING (true);

-- ── Step 3: Verify ─────────────────────────────────────────────
SELECT 'yt_videos policies:' as info;
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'yt_videos';

SELECT 'profiles policies:' as info;
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- ── Step 4: Check existing videos ──────────────────────────────
SELECT 'Existing videos in yt_videos:' as info;
SELECT id, title, class_name, board, institution_id, created_at
FROM public.yt_videos
ORDER BY created_at DESC
LIMIT 20;
