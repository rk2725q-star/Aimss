/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS — Google Drive Frontend Module  v1.0
 *
 *  Exposes: window.DrDrive
 *    listFiles()              → Promise<{files, role}>
 *    uploadFile(file)         → Promise<{success, file}> [teachers only]
 *    deleteFile(fileId)       → Promise<{success}>       [teachers only]
 *    getDownloadUrl(fileId)   → String (direct download link)
 *    getIcon(mimeType)        → emoji icon string
 *    formatSize(bytes)        → "2.4 MB" etc.
 *    formatDate(dateStr)      → "29 May 2026"
 *
 *  Authentication: passes Supabase session JWT automatically.
 *  All calls go to /api/drive-* Vercel routes.
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ── API base (auto-detects local vs production) ──
  const API_BASE = '';   // empty = same origin (works for both Vercel + local)

  /* ── Get current Supabase session JWT ── */
  async function _getJWT() {
    try {
      const client = window.__supabaseClient;
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }

  /* ── Generic auth'd fetch ── */
  async function _authFetch(path, options = {}) {
    const jwt = await _getJWT();
    if (!jwt) throw new Error('Not logged in. Please sign in first.');

    const headers = {
      ...(options.headers || {}),
      'Authorization': `Bearer ${jwt}`
    };

    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  /* ══════════════════════════════════════════════════════════════
     LIST FILES
     Returns: { files: [...], role: "teacher" | "student" }
  ══════════════════════════════════════════════════════════════ */
  async function listFiles() {
    return _authFetch('/api/drive-list');
  }

  /* ══════════════════════════════════════════════════════════════
     UPLOAD FILE  (teachers only)
     @param {File} file — HTML File object from <input type="file">
     @param {function} onProgress — optional callback (0–100)
     Returns: { success: true, file: { id, name, webViewLink } }
  ══════════════════════════════════════════════════════════════ */
  async function uploadFile(file, onProgress) {
    const jwt = await _getJWT();
    if (!jwt) throw new Error('Not logged in. Please sign in first.');

    // 1. Get direct-upload token & folderId from backend
    const tokenRes = await fetch(API_BASE + '/api/drive-token', {
      headers: { 'Authorization': `Bearer ${jwt}` }
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get upload permissions from server.');
    }
    const { token, folderId, email } = await tokenRes.json();

    // 2. Build multipart/related body manually (to attach metadata)
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const metadata = JSON.stringify({
      name: file.name,
      parents: [folderId],
      description: `Uploaded by teacher: ${email || 'unknown'}`
    });

    const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`;
    const mediaPart    = `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;

    // We construct a Blob to send as the body
    const body = new Blob([
      delimiter,
      metadataPart,
      delimiter,
      mediaPart,
      file,
      close_delim
    ]);

    // 3. Upload directly to Google Drive
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ success: true, file: data });
          } else {
            reject(new Error(data.error?.message || `Google Drive Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error(`Invalid response (${xhr.status}): ` + xhr.responseText.substring(0, 80)));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during Google Drive upload.'));

      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);
      xhr.send(body);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     DELETE FILE  (teachers only)
     @param {string} fileId — Google Drive file ID
  ══════════════════════════════════════════════════════════════ */
  async function deleteFile(fileId) {
    return _authFetch(`/api/drive-delete?fileId=${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    });
  }

  /* ══════════════════════════════════════════════════════════════
     DIRECT DOWNLOAD LINK
     Returns a URL that forces file download in browser.
  ══════════════════════════════════════════════════════════════ */
  function getDownloadUrl(fileId) {
    // Google Drive direct download URL — works for files < 100MB without virus scan bypass
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  /* ──  PREVIEW LINK (opens in Google Viewer) ── */
  function getPreviewUrl(fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */
  const MIME_ICONS = {
    'application/pdf': '📄',
    'application/msword': '📝',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'application/vnd.ms-powerpoint': '📊',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
    'application/vnd.ms-excel': '📈',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📈',
    'image/jpeg': '🖼️',
    'image/png': '🖼️',
    'image/gif': '🖼️',
    'image/webp': '🖼️',
    'text/plain': '📃',
    'video/mp4': '🎬',
    'audio/mpeg': '🎵',
  };

  function getIcon(mimeType) {
    return MIME_ICONS[mimeType] || '📁';
  }

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
