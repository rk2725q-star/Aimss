/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS — Supabase Storage Module  v3.0  (Class-Folder Edition)
 *
 *  Exposes: window.DrDrive
 *    ── File ops ──
 *    listFiles(prefix)           → Promise<{files, role}>
 *    uploadFile(file,path,prog)  → Promise<{success, file}>   [teacher]
 *    deleteFile(path)            → Promise<{success}>          [teacher]
 *    deleteFolder(prefix)        → Promise<{success}>          [teacher]
 *    ── Folder ops ──
 *    listFolderContents(prefix)  → Promise<{folders, files}>
 *    createFolder(path)          → Promise<{success}>          [teacher]
 *    ── URL helpers ──
 *    getDownloadUrl(path)        → String
 *    getPreviewUrl(path)         → String
 *    ── Utils ──
 *    getIcon(mimeType)           → emoji string
 *    formatSize(bytes)           → "2.4 MB" etc.
 *    formatDate(dateStr)         → "29 May 2026"
 *    CLASSES                     → ['6','7',...,'12']
 *
 *  Storage layout: material/class-{N}/{folder}/{subfolder}/{file}
 *  Auth:  Supabase session reused from window.__supabaseClient
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://pgrjzsqylhchmelmwhkv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_iw8Pmvpylj0rGyl5Bs_19w_SEdfUdYh';
  const BUCKET       = 'material';

  const CLASSES = ['6', '7', '8', '9', '10', '11', '12'];

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
     LIST FOLDER CONTENTS  (one level deep at given prefix)
     Returns: { folders: [{name, path}], files: [{...}] }
     prefix examples:
       ''              → root of bucket
       'class-6/'     → inside class-6
       'class-6/Math/'→ inside class-6/Math
  ══════════════════════════════════════════════════════════════ */
  async function listFolderContents(prefix) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');

    const { data, error } = await client.storage
      .from(BUCKET)
      .list(prefix || '', { limit: 1000, offset: 0 });

    if (error) throw new Error('List error: ' + error.message);

    const folders = [];
    const files   = [];

    (data || []).forEach(item => {
      if (!item.name || item.name === '.emptyFolderPlaceholder') return;
      // Always join with '/' — strip trailing slash from prefix first
      const cleanPrefix = (prefix || '').replace(/\/$/, '');
      const fullPath = cleanPrefix ? `${cleanPrefix}/${item.name}` : item.name;

      if (!item.id) {
        // It's a "virtual folder" (no id = directory entry)
        folders.push({
          name: item.name,
          path: fullPath + '/'
        });
      } else {
        files.push({
          id:          fullPath,
          name:        item.name,
          displayName: _displayName(item.name),
          mimeType:    _mimeFromName(item.name),
          size:        item.metadata?.size || 0,
          createdTime: item.created_at,
          path:        fullPath
        });
      }
    });

    // Sort folders first
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    return { folders, files, role };
  }

  /* ══════════════════════════════════════════════════════════════
     LIST ALL FILES  (recursive, flat list under a prefix)
     Used for stats + old flat file list
  ══════════════════════════════════════════════════════════════ */
  async function listFiles(prefix) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');

    const allFiles = await _listRecursive(client, prefix || '', []);

    const files = allFiles
      .filter(f => f.name && f.name !== '.emptyFolderPlaceholder' && f.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(f => ({
        id:          f._fullPath,
        name:        _displayName(f.name),
        mimeType:    _mimeFromName(f.name),
        size:        f.metadata?.size || 0,
        createdTime: f.created_at,
        path:        f._fullPath
      }));

    return { files, role };
  }

  async function _listRecursive(client, prefix, collected) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000 });

    if (error || !data) return collected;

    for (const item of data) {
      if (!item.name || item.name === '.emptyFolderPlaceholder') continue;
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        // directory
        await _listRecursive(client, fullPath, collected);
      } else {
        item._fullPath = fullPath;
        collected.push(item);
      }
    }
    return collected;
  }

  /* ══════════════════════════════════════════════════════════════
     CREATE FOLDER  (teachers only)
     Creates a placeholder file inside the folder path
     path example: 'class-6/Mathematics/'
  ══════════════════════════════════════════════════════════════ */
  async function createFolder(folderPath) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');
    if (role !== 'teacher') throw new Error('Access denied. Only teachers can create folders.');

    // Normalise: ensure trailing slash
    const normPath = folderPath.replace(/\/+$/, '') + '/';
    const placeholderPath = normPath + '.emptyFolderPlaceholder';

    const blob = new Blob([''], { type: 'text/plain' });
    const { error } = await client.storage
      .from(BUCKET)
      .upload(placeholderPath, blob, { upsert: true });

    if (error) throw new Error(error.message);
    return { success: true, path: normPath };
  }

  /* ══════════════════════════════════════════════════════════════
     UPLOAD FILE  (teachers only)
     @param {File}     file        — HTML File object
     @param {string}   folderPath  — destination folder path e.g. 'class-6/Math/'
     @param {function} onProgress  — optional callback (0–100)
  ══════════════════════════════════════════════════════════════ */
  async function uploadFile(file, folderPath, onProgress) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');
    if (role !== 'teacher') throw new Error('Access denied. Only teachers can upload files.');

    if (file.size > 50 * 1024 * 1024) {
      throw new Error('File too large. Maximum 50 MB allowed.');
    }

    // Sanitize filename
    const safeName  = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const prefix    = (folderPath || '').replace(/\/+$/, '');
    const filePath  = prefix ? `${prefix}/${Date.now()}_${safeName}` : `${Date.now()}_${safeName}`;

    if (onProgress) onProgress(10);

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
  }

  /* ══════════════════════════════════════════════════════════════
     DELETE FILE  (teachers only)
     @param {string} path — the file path in the bucket
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
     DELETE FOLDER  (teachers only — removes all files inside)
  ══════════════════════════════════════════════════════════════ */
  async function deleteFolder(prefix) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');
    if (role !== 'teacher') throw new Error('Access denied. Only teachers can delete folders.');

    const allFiles = await _listRecursive(client, prefix.replace(/\/$/, ''), []);
    const paths = allFiles.map(f => f._fullPath);
    // also include placeholder
    paths.push(prefix.replace(/\/$/, '') + '/.emptyFolderPlaceholder');

    if (paths.length > 0) {
      const { error } = await client.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(error.message);
    }
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
  function _displayName(name) {
    return name.replace(/^\d+_/, '');
  }

  function _mimeFromName(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const MAP = {
      pdf:  'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt:  'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xls:  'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      jpg:  'image/jpeg', jpeg: 'image/jpeg',
      png:  'image/png', gif: 'image/gif', webp: 'image/webp',
      txt:  'text/plain', mp4: 'video/mp4', mp3: 'audio/mpeg',
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

  /* ── Public API ── */
  window.DrDrive = {
    CLASSES,
    listFiles,
    listFolderContents,
    createFolder,
    uploadFile,
    deleteFile,
    deleteFolder,
    getDownloadUrl,
    getPreviewUrl,
    getIcon,
    formatSize,
    formatDate
  };

})();
