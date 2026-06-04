/**
 * ═══════════════════════════════════════════════════════════════
 *  Dr.AIMSS  —  Supabase Auth Module  v4.0  (Multi-Tenant)
 *
 *  EXPORTS (window.DrAuth)
 *    signIn(email, password, expectedRole, meta?)  → Promise
 *    signUp(email, password, role, opts?)          → Promise
 *      opts = { teacherCode, institutionCode }
 *    guardPage(expectedRole)                       → async, redirects
 *    signOut()                                     → Promise
 *    getUser()                                     → cached user or null
 *    getRole()                                     → cached role or null
 *    getInstitutionId()                            → institution_id or null
 *    getLoginMeta()                                → { loginType, teamName } or null
 *    getClient()                                   → supabase client
 *
 *  MULTI-TENANT:
 *    Each user (teacher/student/admin) belongs to an institution.
 *    institution_id is stored in the `profiles` table.
 *    Admin can ONLY see users from their own institution.
 *    Teachers/Students must enter their institution's code to register.
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────── */
  const SUPABASE_URL  = 'https://pgrjzsqylhchmelmwhkv.supabase.co';
  const SUPABASE_KEY  = 'sb_publishable_iw8Pmvpylj0rGyl5Bs_19w_SEdfUdYh';

  // Teacher registration gate code
  const TEACHER_CODE  = 'DRAIMSS2024';

  // Admin (Headmaster) self-registration gate code
  // Share this code ONLY with school headmasters who want to use the platform
  const ADMIN_CODE    = 'AIMSS-HEADMASTER-2024';

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
  let _cachedUser        = null;
  let _cachedRole        = null;
  let _cachedInstitution = null;
  let _loginMeta         = null;

  /* ── Fetch profile from DB ──────────────────────────────────── */
  async function fetchProfile(supabase, userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data; // { role, institution_id }
  }

  /* ══════════════════════════════════════════════════════════════
     SIGN UP — with institution support
  ══════════════════════════════════════════════════════════════ */
  async function signUp(email, password, role, opts = {}) {
    const supabase = getClient();
    if (!supabase) return { success: false, error: 'Auth service unavailable.' };

    const { teacherCode = '', institutionCode = '', adminCode = '', institutionName = '' } = opts;

    // ── Admin self-registration ──
    if (role === 'admin') {
      if (!adminCode || adminCode.trim() !== ADMIN_CODE) {
        return { success: false, error: 'Invalid Headmaster Registration Code. Contact Dr.AIMSS platform support.' };
      }
      if (!institutionCode || institutionCode.trim().length < 3) {
        return { success: false, error: 'Please enter a School Code (min 3 characters).' };
      }
    }

    // ── Teacher registration ──
    if (role === 'teacher') {
      if (!teacherCode || teacherCode.trim().toUpperCase() !== TEACHER_CODE) {
        return { success: false, error: 'Invalid teacher registration code. Contact the academy admin.' };
      }
    }

    // Institution code required for teacher + student
    if (role !== 'admin' && (!institutionCode || institutionCode.trim().length < 3)) {
      return { success: false, error: 'Please enter a valid School / Institution Code.' };
    }

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return { success: false, error: 'Invalid role selected.' };
    }

    const instId = institutionCode.trim().toUpperCase();

    // Sign up
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, institution_id: instId, institution_name: institutionName.trim() }
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

    // Upsert profile with role + institution_id
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        role,
        institution_id: instId,
        institution_name: institutionName.trim() || null,
        email
      }, { onConflict: 'id' });
    } catch (_) { /* non-blocking */ }

    const needsConfirmation = !data.session;
    if (needsConfirmation) {
      return {
        success: true,
        needsConfirmation: true,
        message: 'Account created! Please check your email to verify, then sign in.'
      };
    }

    _cachedUser        = user;
    _cachedRole        = role;
    _cachedInstitution = instId;
    return { success: true, user, role, institutionId: instId, needsConfirmation: false };
  }

  /* ══════════════════════════════════════════════════════════════
     SIGN IN — existing users
  ══════════════════════════════════════════════════════════════ */
  async function signIn(email, password, expectedRole, meta = null) {
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

    // Fetch role + institution from DB
    const profile = await fetchProfile(supabase, user.id);
    if (!profile || !profile.role) {
      await supabase.auth.signOut();
      return { success: false, error: 'Account setup incomplete. Please register again or contact admin.' };
    }

    if (profile.role !== expectedRole) {
      await supabase.auth.signOut();
      const portalMap = { teacher: 'Teacher Login', student: 'Student Login', admin: 'Admin Login' };
      return {
        success: false,
        error: `This is a ${profile.role} account. Please use the ${portalMap[profile.role] || profile.role} page.`
      };
    }

    _cachedUser        = user;
    _cachedRole        = profile.role;
    _cachedInstitution = profile.institution_id || null;

    // Store login metadata (team name etc.)
    if (meta) {
      _loginMeta = meta;
      try { sessionStorage.setItem('draimss_login_meta', JSON.stringify(meta)); } catch(_) {}
    }

    // Store institution in sessionStorage for use on dashboard pages
    if (_cachedInstitution) {
      try { sessionStorage.setItem('draimss_institution_id', _cachedInstitution); } catch(_) {}
    }

    // Log login event (best-effort)
    try {
      await supabase.from('activity_log').insert({
        user_id:    user.id,
        user_email: user.email,
        role:       profile.role,
        institution_id: _cachedInstitution,
        event:      'login',
        meta:       meta ? JSON.stringify(meta) : null,
        created_at: new Date().toISOString()
      });
    } catch(_) { /* non-blocking */ }

    return { success: true, user, role: profile.role, institutionId: _cachedInstitution };
  }

  /* ══════════════════════════════════════════════════════════════
     GUARD PAGE — protect dashboard pages
  ══════════════════════════════════════════════════════════════ */
  async function guardPage(expectedRole) {
    const supabase = getClient();
    if (!supabase) { window.location.href = 'login.html'; return; }

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; return; }

    const user    = session.user;
    const profile = await fetchProfile(supabase, user.id);

    if (!profile || profile.role !== expectedRole) {
      await supabase.auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    _cachedUser        = user;
    _cachedRole        = profile.role;
    _cachedInstitution = profile.institution_id || null;

    // Restore login meta from session storage
    try {
      const raw = sessionStorage.getItem('draimss_login_meta');
      if (raw) _loginMeta = JSON.parse(raw);
    } catch(_) {}

    // Restore institution from session storage as fallback
    if (!_cachedInstitution) {
      try { _cachedInstitution = sessionStorage.getItem('draimss_institution_id'); } catch(_) {}
    }

    // Auto-fill UI elements
    document.querySelectorAll('[data-auth-email]').forEach(el => { el.textContent = user.email || ''; });
    document.querySelectorAll('[data-auth-role]').forEach(el => {
      el.textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
    });
    document.querySelectorAll('[data-auth-institution]').forEach(el => {
      el.textContent = _cachedInstitution || '—';
    });

    return { user, role: profile.role, institutionId: _cachedInstitution };
  }

  /* ══════════════════════════════════════════════════════════════
     SIGN OUT
  ══════════════════════════════════════════════════════════════ */
  async function signOut() {
    const supabase = getClient();
    if (supabase) await supabase.auth.signOut();
    _cachedUser        = null;
    _cachedRole        = null;
    _cachedInstitution = null;
    _loginMeta         = null;
    try {
      sessionStorage.removeItem('draimss_login_meta');
      sessionStorage.removeItem('draimss_institution_id');
    } catch(_) {}
    window.location.href = 'login.html';
  }

  /* ── Public API ─────────────────────────────────────────────── */
  window.DrAuth = {
    signIn,
    signUp,
    guardPage,
    signOut,
    getUser:          () => _cachedUser,
    getRole:          () => _cachedRole,
    getInstitutionId: () => _cachedInstitution,
    getLoginMeta:     () => _loginMeta,
    getClient
  };

  /* ── Auto-wire logout buttons ───────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); signOut(); });
    });
  });

})();
