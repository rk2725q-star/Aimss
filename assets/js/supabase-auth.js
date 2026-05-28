/**
 * ═══════════════════════════════════════════════════════════════
 *  Dr.AIMSS  —  Supabase Auth Module  v2.0
 *
 *  EXPORTS (window.DrAuth):
 *    signIn(email, password, expectedRole)       → Promise
 *    signUp(email, password, role, teacherCode?) → Promise
 *    guardPage(expectedRole)                     → async, redirects if unauthed
 *    signOut()                                   → Promise
 *    getUser()                                   → cached user or null
 *    getRole()                                   → cached role or null
 *
 *  SECURITY:
 *    • Students  → self-register freely
 *    • Teachers  → must enter TEACHER_CODE to register
 *    • Roles stored in `profiles` table with RLS (server-side enforced)
 *    • Publishable (anon) key is safe to expose — RLS protects the data
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────── */
  const SUPABASE_URL  = 'https://pgrjzsqylhchmelmwhkv.supabase.co';
  const SUPABASE_KEY  = 'sb_publishable_iw8Pmvpylj0rGyl5Bs_19w_SEdfUdYh';

  // Secret code teachers enter when registering.
  // Change this to anything you like — share only with your teachers.
  const TEACHER_CODE  = 'DRAIMSS2024';

  /* ── Init Supabase client (singleton) ──────────────────────── */
  function getClient() {
    if (window.__supabaseClient) return window.__supabaseClient;
    if (!window.supabase?.createClient) {
      console.error('[DrAuth] Supabase CDN not loaded.');
      return null;
    }
    window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return window.__supabaseClient;
  }

  /* ── Internal cache ─────────────────────────────────────────── */
  let _cachedUser = null;
  let _cachedRole = null;

  /* ── Fetch role from DB (RLS-protected, cannot be spoofed) ──── */
  async function fetchRole(supabase, userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data.role;
  }

  /* ══════════════════════════════════════════════════════════════
     SIGN UP — users register themselves
     Students: just email + password
     Teachers: must provide the secret TEACHER_CODE
  ══════════════════════════════════════════════════════════════ */
  async function signUp(email, password, role, teacherCode = '') {
    const supabase = getClient();
    if (!supabase) return { success: false, error: 'Auth service unavailable.' };

    // Validate teacher code BEFORE calling Supabase
    if (role === 'teacher') {
      if (!teacherCode || teacherCode.trim().toUpperCase() !== TEACHER_CODE) {
        return { success: false, error: 'Invalid teacher registration code. Contact the academy admin.' };
      }
    }

    if (!['student', 'teacher'].includes(role)) {
      return { success: false, error: 'Invalid role selected.' };
    }

    // Sign up — pass role in metadata so trigger auto-creates profile
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role }   // trigger reads this → inserts into profiles table
      }
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        return { success: false, error: 'This email is already registered. Please sign in instead.' };
      }
      if (error.message.includes('Password should be')) {
        return { success: false, error: 'Password must be at least 8 characters.' };
      }
      return { success: false, error: error.message };
    }

    const user = data?.user;
    if (!user) return { success: false, error: 'Signup failed. Please try again.' };

    // If email confirmation is disabled in Supabase, user is instantly active
    // If enabled, they get an email — inform them
    const needsConfirmation = !data.session;
    if (needsConfirmation) {
      return {
        success: true,
        needsConfirmation: true,
        message: 'Account created! Please check your email to verify your account, then sign in.'
      };
    }

    // Auto-signed in after signup (email confirmation off)
    _cachedUser = user;
    _cachedRole = role;
    return { success: true, user, role, needsConfirmation: false };
  }

  /* ══════════════════════════════════════════════════════════════
     SIGN IN — existing users login
  ══════════════════════════════════════════════════════════════ */
  async function signIn(email, password, expectedRole) {
    const supabase = getClient();
    if (!supabase) return { success: false, error: 'Auth service unavailable.' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { success: false, error: 'Incorrect email or password.' };
      }
      if (error.message.includes('Email not confirmed')) {
        return { success: false, error: 'Please verify your email first, then sign in.' };
      }
      return { success: false, error: error.message };
    }

    const user = data?.user;
    if (!user) return { success: false, error: 'Login failed. Please try again.' };

    // Fetch and verify role from DB
    const role = await fetchRole(supabase, user.id);
    if (!role) {
      await supabase.auth.signOut();
      return { success: false, error: 'Account setup incomplete. Please register again or contact admin.' };
    }

    if (role !== expectedRole) {
      await supabase.auth.signOut();
      const portalName = role === 'teacher' ? 'Teacher Login' : 'Student Login';
      return {
        success: false,
        error: `This is a ${role} account. Please use the ${portalName} page.`
      };
    }

    _cachedUser = user;
    _cachedRole = role;
    return { success: true, user, role };
  }

  /* ══════════════════════════════════════════════════════════════
     GUARD PAGE — protect dashboard pages
  ══════════════════════════════════════════════════════════════ */
  async function guardPage(expectedRole) {
    const supabase = getClient();
    if (!supabase) { window.location.href = 'login.html'; return; }

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; return; }

    const user  = session.user;
    const role  = await fetchRole(supabase, user.id);

    if (!role || role !== expectedRole) {
      await supabase.auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    _cachedUser = user;
    _cachedRole = role;

    // Auto-fill any [data-auth-email] or [data-auth-role] elements
    document.querySelectorAll('[data-auth-email]').forEach(el => { el.textContent = user.email || ''; });
    document.querySelectorAll('[data-auth-role]').forEach(el => {
      el.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SIGN OUT
  ══════════════════════════════════════════════════════════════ */
  async function signOut() {
    const supabase = getClient();
    if (supabase) await supabase.auth.signOut();
    _cachedUser = null;
    _cachedRole = null;
    window.location.href = 'login.html';
  }

  /* ── Public API ─────────────────────────────────────────────── */
  window.DrAuth = {
    signIn,
    signUp,
    guardPage,
    signOut,
    getUser: () => _cachedUser,
    getRole: () => _cachedRole
  };

  /* ── Auto-wire logout buttons ───────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); signOut(); });
    });
  });

})();
