/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS — Supabase Storage Module  v2.0
 *
 *  Exposes: window.DrDrive
 *    listFiles()              → Promise<{files, role}>
 *    uploadFile(file, prog)   → Promise<{success, file}>  [teachers only]
 *    deleteFile(path)         → Promise<{success}>         [teachers only]
 *    getDownloadUrl(path)     → String (direct public URL)
 *    getPreviewUrl(path)      → String (preview URL)
 *    getIcon(mimeType)        → emoji icon string
 *    formatSize(bytes)        → "2.4 MB" etc.
 *    formatDate(dateStr)      → "29 May 2026"
 *
 *  Storage: Supabase Storage bucket named "materials" (public)
 *  Auth: Supabase session is reused from window.__supabaseClient
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://pgrjzsqylhchmelmwhkv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_iw8Pmvpylj0rGyl5Bs_19w_SEdfUdYh';
  const BUCKET       = 'materials';

  /* ── Get Supabase client (reuse existing or create) ── */
  function getClient() {
    if (window.__supabaseClient) return window.__supabaseClient;
    if (window.supabase?.createClient) {
      window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      return window.__supabaseClient;
    }
    return null;
  }

  /* ── Get current user role ── */
  async function _getRole() {
    const client = getClient();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data } = await client.from('profiles').select('role').eq('id', session.user.id).single();
    return data?.role || null;
  }

  /* ══════════════════════════════════════════════════════════════
     LIST FILES
     Returns: { files: [...], role: "teacher" | "student" }
  ══════════════════════════════════════════════════════════════ */
  async function listFiles() {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');

    const { data, error } = await client.storage
      .from(BUCKET)
      .list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) throw new Error(error.message);

    const files = (data || [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => ({
        id:          f.name,   // use filename as ID (path in bucket)
        name:        f.name,
        mimeType:    _mimeFromName(f.name),
        size:        f.metadata?.size || 0,
        createdTime: f.created_at,
        path:        f.name
      }));

    return { files, role };
  }

  /* ══════════════════════════════════════════════════════════════
     UPLOAD FILE  (teachers only)
     @param {File} file — HTML File object
     @param {function} onProgress — optional callback (0–100)
  ══════════════════════════════════════════════════════════════ */
  async function uploadFile(file, onProgress) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');
    if (role !== 'teacher') throw new Error('Access denied. Only teachers can upload files.');

    if (file.size > 50 * 1024 * 1024) {
      throw new Error('File too large. Maximum 50 MB allowed.');
    }

    // Sanitize filename — avoid collisions with a timestamp prefix
    const safeName  = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const filePath  = `${Date.now()}_${safeName}`;

    // Supabase JS v2 storage does not natively report upload progress,
    // so we fake an indeterminate animation: 0→90% during upload, 100% on done.
    if (onProgress) onProgress(10);
    const fakeInterval = setInterval(() => {
      // move the bar slowly until we resolve
    }, 200);

    try {
      const { error } = await client.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream'
        });

      if (error) throw new Error(error.message);

      if (onProgress) onProgress(100);

      const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(filePath);

      return {
        success: true,
        file: {
          id:          filePath,
          name:        file.name,
          mimeType:    file.type,
          size:        file.size,
          webViewLink: urlData.publicUrl,
          path:        filePath
        }
      };
    } finally {
      clearInterval(fakeInterval);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     DELETE FILE  (teachers only)
     @param {string} path — the file path in the bucket (same as id)
  ══════════════════════════════════════════════════════════════ */
  async function deleteFile(path) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');
    if (role !== 'teacher') throw new Error('Access denied. Only teachers can delete files.');

    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw new Error(error.message);
    return { success: true };
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC DOWNLOAD / PREVIEW URLS
  ══════════════════════════════════════════════════════════════ */
  function getDownloadUrl(path) {
    const client = getClient();
    if (!client) return '#';
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl + '?download=';
  }

  function getPreviewUrl(path) {
    const client = getClient();
    if (!client) return '#';
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */
  function _mimeFromName(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const MAP = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      txt: 'text/plain',
      mp4: 'video/mp4', mp3: 'audio/mpeg',
    };
    return MAP[ext] || 'application/octet-stream';
  }

  const MIME_ICONS = {
    'application/pdf': '📄',
    'application/msword': '📝',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'application/vnd.ms-powerpoint': '📊',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
    'application/vnd.ms-excel': '📈',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📈',
    'image/jpeg': '🖼️', 'image/png': '🖼️', 'image/gif': '🖼️', 'image/webp': '🖼️',
    'text/plain': '📃', 'video/mp4': '🎬', 'audio/mpeg': '🎵',
  };

  function getIcon(mimeType) { return MIME_ICONS[mimeType] || '📁'; }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    const n = Number(bytes);
    if (n < 1024)       return n + ' B';
    if (n < 1048576)    return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  /* ── Public API (keeps the same DrDrive interface) ── */
  window.DrDrive = {
    listFiles,
    uploadFile,
    deleteFile,
    getDownloadUrl,
    getPreviewUrl,
    getIcon,
    formatSize,
    formatDate
  };

})();
