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

    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error('Invalid server response.'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload.'));

      xhr.open('POST', API_BASE + '/api/drive-upload');
      xhr.setRequestHeader('Authorization', `Bearer ${jwt}`);
      xhr.send(formData);
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
