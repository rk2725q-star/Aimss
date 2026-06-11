/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS — Supabase Storage Module  v5.0  (Chunked Upload)
 *
 *  Exposes: window.DrDrive
 *    ── File ops ──
 *    listFolderContents(prefix)     → Promise<{folders, files, role}>
 *    listFiles(prefix)              → Promise<{files, role}>  (recursive flat)
 *    uploadFile(file,path,prog)     → Promise<{success, file}>     [teacher]
 *    deleteFile(path)               → Promise<{success}>            [teacher]
 *    deleteFolder(prefix)           → Promise<{success}>            [teacher]
 *    moveFile(fromPath, toPath)     → Promise<{success}>            [teacher]
 *    ── Folder ops ──
 *    createFolder(path)             → Promise<{success}>            [teacher]
 *    ── URL helpers ──
 *    getDownloadUrl(path)           → String  (or chunked blob trigger)
 *    getPreviewUrl(path)            → String
 *    downloadChunkedFile(fileObj)   → void   (assembles chunks → download)
 *    ── Utils ──
 *    getIcon(mimeType)              → emoji string
 *    formatSize(bytes)              → "2.4 MB" etc.
 *    formatDate(dateStr)            → "29 May 2026"
 *    CLASSES                        → ['6','7',...,'12']
 *    EXAMS                          → [{id,label,icon}, ...]
 *
 *  Storage layout (regular files ≤ 45 MB):
 *    material/{folderPath}/{timestamp}_{safeName}
 *
 *  Storage layout (chunked files > 45 MB):
 *    material/{folderPath}/__chunks__/{timestamp}_{safeName}/meta.json
 *    material/{folderPath}/__chunks__/{timestamp}_{safeName}/part_000
 *    material/{folderPath}/__chunks__/{timestamp}_{safeName}/part_001
 *    …
 *
 *  meta.json schema:
 *    { name, mimeType, size, totalChunks, chunkSize, createdAt, chunkId }
 *
 *  Auth: Supabase session reused from window.__supabaseClient
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const SUPABASE_URL  = 'https://pgrjzsqylhchmelmwhkv.supabase.co';
  const SUPABASE_KEY  = 'sb_publishable_iw8Pmvpylj0rGyl5Bs_19w_SEdfUdYh';
  const BUCKET        = 'material';
  const CHUNK_SIZE    = 45 * 1024 * 1024;   // 45 MB per chunk
  const CHUNKS_FOLDER = '__chunks__';        // virtual folder name

  const CLASSES = ['6', '7', '8', '9', '10', '11', '12'];

  const EXAMS = [
    { id: 'neet',   label: 'NEET',   icon: '🔬' },
    { id: 'jee',    label: 'JEE',    icon: '⚙️' },
    { id: 'ncert',  label: 'NCERT',  icon: '📖' },
    { id: 'nda',    label: 'NDA',    icon: '🎖️' },
    { id: 'upsc',   label: 'UPSC',   icon: '🏛️' },
    { id: 'tnpsc',  label: 'TNPSC',  icon: '📋' },
    { id: 'cute',   label: 'CUTE',   icon: '🎓' },
    { id: 'programming', label: 'Programming', icon: '💻' },
  ];

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
     CHUNK ID helper
     A chunk group lives at: {folderPath}/__chunks__/{chunkId}/
     chunkId = {timestamp}_{safeName}  (no extension — the actual
     name + mime come from meta.json)
  ══════════════════════════════════════════════════════════════ */
  function _makeChunkId(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    return `${Date.now()}_${safeName}`;
  }

  /* ══════════════════════════════════════════════════════════════
     LIST FOLDER CONTENTS  (one level deep at given prefix)
     Returns: { folders: [{name, path}], files: [{...}], role }
     Chunks inside __chunks__ are resolved into logical file entries.
  ══════════════════════════════════════════════════════════════ */
  async function listFolderContents(prefix) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');

    const cleanPrefix = (prefix || '').replace(/\/$/, '');

    const { data, error } = await client.storage
      .from(BUCKET)
      .list(cleanPrefix, { limit: 1000, offset: 0 });

    if (error) throw new Error('List error: ' + error.message);

    const folders = [];
    const files   = [];

    for (const item of (data || [])) {
      if (!item.name || item.name === '.emptyFolderPlaceholder') continue;

      if (item.name === CHUNKS_FOLDER) {
        // Resolve chunked files from this folder's __chunks__ directory
        const chunkFiles = await _resolveChunkedFiles(client, cleanPrefix);
        files.push(...chunkFiles);
        continue;
      }

      const fullPath = cleanPrefix ? `${cleanPrefix}/${item.name}` : item.name;

      if (!item.id) {
        // Virtual folder (no id = directory entry)
        folders.push({ name: item.name, path: fullPath });
      } else {
        files.push({
          id:          fullPath,
          name:        item.name,
          displayName: _displayName(item.name),
          mimeType:    _mimeFromName(item.name),
          size:        item.metadata?.size || 0,
          createdTime: item.created_at,
          path:        fullPath,
          isChunked:   false
        });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    return { folders, files, role };
  }

  /* ──────────────────────────────────────────────────────────────
     Resolve chunked file entries from {prefix}/__chunks__/
     Each sub-folder is a chunk group. We read its meta.json.
  ────────────────────────────────────────────────────────────── */
  async function _resolveChunkedFiles(client, prefix) {
    const chunksPath = prefix ? `${prefix}/${CHUNKS_FOLDER}` : CHUNKS_FOLDER;

    const { data: groups, error } = await client.storage
      .from(BUCKET)
      .list(chunksPath, { limit: 1000 });

    if (error || !groups) return [];

    const results = [];
    for (const group of groups) {
      if (!group.name || group.id) continue; // skip non-folders
      const groupPath = `${chunksPath}/${group.name}`;
      try {
        const meta = await _fetchChunkMeta(client, groupPath);
        if (!meta) continue;
        results.push({
          id:          groupPath,           // used as file identifier
          name:        meta.name,           // actual file name from metadata
          displayName: meta.name,
          mimeType:    meta.mimeType,
          size:        meta.size,
          createdTime: meta.createdAt,
          path:        groupPath,
          isChunked:   true,
          chunkMeta:   meta
        });
      } catch (_) {
        // Skip broken chunks silently
      }
    }
    return results;
  }

  /* Fetch and parse meta.json for a chunk group */
  async function _fetchChunkMeta(client, groupPath) {
    const metaPath = `${groupPath}/meta.json`;
    const { data: signedData, error: signErr } = await client.storage
      .from(BUCKET)
      .createSignedUrl(metaPath, 60);

    if (signErr || !signedData?.signedUrl) return null;

    const resp = await fetch(signedData.signedUrl);
    if (!resp.ok) return null;
    return await resp.json();
  }

  /* ══════════════════════════════════════════════════════════════
     LIST ALL FILES  (recursive flat list under a prefix)
  ══════════════════════════════════════════════════════════════ */
  async function listFiles(prefix) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in. Please sign in first.');

    const raw = await _listRecursive(client, (prefix || '').replace(/\/$/, ''), []);

    // Separate chunk parts from regular files
    const chunkMetas   = raw.filter(f => f._fullPath.includes(`/${CHUNKS_FOLDER}/`) && f.name === 'meta.json');
    const regularFiles = raw.filter(f => !f._fullPath.includes(`/${CHUNKS_FOLDER}/`) && f.id && f.name !== '.emptyFolderPlaceholder');

    const files = [];

    // Regular files
    for (const f of regularFiles) {
      files.push({
        id:          f._fullPath,
        name:        _displayName(f.name),
        displayName: _displayName(f.name),
        mimeType:    _mimeFromName(f.name),
        size:        f.metadata?.size || 0,
        createdTime: f.created_at,
        path:        f._fullPath,
        isChunked:   false
      });
    }

    // Chunked files — resolve each meta.json
    for (const m of chunkMetas) {
      try {
        const groupPath = m._fullPath.replace('/meta.json', '');
        const meta = await _fetchChunkMeta(client, groupPath);
        if (!meta) continue;
        files.push({
          id:          groupPath,
          name:        meta.name,
          displayName: meta.name,
          mimeType:    meta.mimeType,
          size:        meta.size,
          createdTime: meta.createdAt,
          path:        groupPath,
          isChunked:   true,
          chunkMeta:   meta
        });
      } catch (_) {}
    }

    files.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
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
  ══════════════════════════════════════════════════════════════ */
  async function createFolder(folderPath) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in.');
    if (role !== 'teacher') throw new Error('Only teachers can create folders.');

    const normPath = folderPath.replace(/\/+$/, '');
    const placeholderPath = normPath + '/.emptyFolderPlaceholder';

    const blob = new Blob([''], { type: 'text/plain' });
    const { error } = await client.storage
      .from(BUCKET)
      .upload(placeholderPath, blob, { upsert: true });

    if (error) throw new Error(error.message);
    return { success: true, path: normPath };
  }

  /* ══════════════════════════════════════════════════════════════
     UPLOAD FILE  (teachers only)
     Automatically uses chunked upload if file > CHUNK_SIZE (45 MB)

     @param {File}     file        — HTML File object
     @param {string}   folderPath  — destination e.g. 'class-6/Math'
     @param {function} onProgress  — optional callback (0–100)
  ══════════════════════════════════════════════════════════════ */
  async function uploadFile(file, folderPath, onProgress) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const role = await _getRole();
    if (!role) throw new Error('Not logged in.');
    if (role !== 'teacher') throw new Error('Only teachers can upload files.');

    // No hard cap anymore — we chunk large files
    const prefix = (folderPath || '').replace(/\/+$/, '');

    if (file.size > CHUNK_SIZE) {
      return await _uploadChunked(client, file, prefix, onProgress);
    } else {
      return await _uploadSingle(client, file, prefix, onProgress);
    }
  }

  /* ─── Single file upload (≤ 45 MB) ─── */
  async function _uploadSingle(client, file, prefix, onProgress) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    const filePath = prefix ? `${prefix}/${Date.now()}_${safeName}` : `${Date.now()}_${safeName}`;

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
      file: { id: filePath, name: file.name, mimeType: file.type, size: file.size, webViewLink: urlData.publicUrl, path: filePath }
    };
  }

  /* ─── Chunked upload (> 45 MB) ─── */
  async function _uploadChunked(client, file, prefix, onProgress) {
    const chunkId   = _makeChunkId(file);
    const groupPath = prefix
      ? `${prefix}/${CHUNKS_FOLDER}/${chunkId}`
      : `${CHUNKS_FOLDER}/${chunkId}`;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    if (onProgress) onProgress(2);

    // Upload each chunk
    for (let i = 0; i < totalChunks; i++) {
      const start  = i * CHUNK_SIZE;
      const end    = Math.min(start + CHUNK_SIZE, file.size);
      const blob   = file.slice(start, end);
      const partName = `part_${String(i).padStart(3, '0')}`;
      const partPath = `${groupPath}/${partName}`;

      const { error } = await client.storage
        .from(BUCKET)
        .upload(partPath, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'application/octet-stream'
        });

      if (error) {
        // Clean up any already-uploaded chunks
        await _cleanupChunkGroup(client, groupPath, i).catch(() => {});
        throw new Error(`Chunk ${i + 1}/${totalChunks} failed: ${error.message}`);
      }

      if (onProgress) {
        // Reserve first 2% for init, last 3% for meta upload
        const pct = 2 + Math.round(((i + 1) / totalChunks) * 90);
        onProgress(pct);
      }
    }

    // Upload meta.json
    const meta = {
      name:        file.name,
      mimeType:    file.type || 'application/octet-stream',
      size:        file.size,
      totalChunks,
      chunkSize:   CHUNK_SIZE,
      createdAt:   new Date().toISOString(),
      chunkId
    };

    const metaBlob = new Blob([JSON.stringify(meta)], { type: 'application/json' });
    const { error: metaErr } = await client.storage
      .from(BUCKET)
      .upload(`${groupPath}/meta.json`, metaBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/json'
      });

    if (metaErr) throw new Error('Meta upload failed: ' + metaErr.message);

    if (onProgress) onProgress(100);

    return {
      success: true,
      file: {
        id:         groupPath,
        name:       file.name,
        mimeType:   file.type,
        size:       file.size,
        path:       groupPath,
        isChunked:  true
      }
    };
  }

  /* Clean up partially uploaded chunk group on error */
  async function _cleanupChunkGroup(client, groupPath, uploadedCount) {
    const paths = [];
    for (let i = 0; i < uploadedCount; i++) {
      paths.push(`${groupPath}/part_${String(i).padStart(3, '0')}`);
    }
    if (paths.length > 0) {
      await client.storage.from(BUCKET).remove(paths).catch(() => {});
    }
  }

  /* ══════════════════════════════════════════════════════════════
     _fetchChunkStreamed  — internal helper
     Fetches one chunk part via its signed URL using a ReadableStream
     reader loop so we get real byte-level progress instead of a
     single blocking arrayBuffer() call.

     @param {string}   signedUrl   — pre-signed URL for the part
     @param {number}   chunkIndex  — 0-based index of this chunk
     @param {number}   totalChunks — total number of chunks
     @param {number}   totalBytes  — total file size in bytes (for %-calc)
     @param {number}   bytesAlreadyLoaded — bytes from previous chunks
     @param {function} onProgress  — callback(0-100)
     @returns {Uint8Array}
  ══════════════════════════════════════════════════════════════ */
  async function _fetchChunkStreamed(signedUrl, chunkIndex, totalChunks, totalBytes, bytesAlreadyLoaded, onProgress) {
    const resp = await fetch(signedUrl);
    if (!resp.ok) throw new Error(`Chunk ${chunkIndex} download failed (HTTP ${resp.status})`);

    // Use streaming reader for real progress
    const reader = resp.body.getReader();
    const pieces = [];
    let bytesThisChunk = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pieces.push(value);
      bytesThisChunk += value.length;

      if (onProgress && totalBytes > 0) {
        const loaded = bytesAlreadyLoaded + bytesThisChunk;
        // Report 0–100 based on actual bytes received vs total file size
        onProgress(Math.min(99, Math.round((loaded / totalBytes) * 100)));
      }
    }

    // Combine Uint8Array pieces into one
    const total  = pieces.reduce((s, p) => s + p.length, 0);
    const merged = new Uint8Array(total);
    let offset   = 0;
    for (const p of pieces) { merged.set(p, offset); offset += p.length; }
    return merged;
  }

  /* ══════════════════════════════════════════════════════════════
     DOWNLOAD CHUNKED FILE
     Fetches all parts with real streaming progress, concatenates
     into one Blob and triggers a browser download — the user sees
     the file as a single unified file, no missing pieces.
  ══════════════════════════════════════════════════════════════ */
  async function downloadChunkedFile(fileObj, onProgress) {
    const client    = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const meta      = fileObj.chunkMeta;
    const groupPath = fileObj.path;
    const totalBytes = meta.size || 0;

    if (onProgress) onProgress(0);

    const parts = [];          // Uint8Array[]
    let bytesLoaded = 0;

    for (let i = 0; i < meta.totalChunks; i++) {
      const partPath = `${groupPath}/part_${String(i).padStart(3, '0')}`;

      // Get a fresh signed URL (300 s = 5 min per chunk)
      const { data: sd, error: se } = await client.storage
        .from(BUCKET)
        .createSignedUrl(partPath, 300);

      if (se || !sd?.signedUrl) throw new Error(`Cannot get signed URL for chunk ${i + 1}`);

      const part = await _fetchChunkStreamed(
        sd.signedUrl, i, meta.totalChunks, totalBytes, bytesLoaded, onProgress
      );
      parts.push(part);
      bytesLoaded += part.length;
    }

    if (onProgress) onProgress(99); // almost done — building blob

    // Assemble all parts into one single unified Blob
    const mimeType = meta.mimeType || 'application/octet-stream';
    const fullBlob = new Blob(parts, { type: mimeType });
    const url      = URL.createObjectURL(fullBlob);

    // Trigger browser download
    const link      = document.createElement('a');
    link.style.display = 'none';
    link.href          = url;
    link.download      = meta.name;   // sets the saved filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onProgress) onProgress(100);

    // Keep blob URL alive for 5 minutes so "Open" in the browser's
    // download bar still works after the download completes
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);

    return { success: true, blobUrl: url };
  }

  /* ══════════════════════════════════════════════════════════════
     GET CHUNKED BLOB URL (for inline preview)
     Same streaming approach — returns the blob URL when ready.
     onProgress optional callback for progress overlay.
  ══════════════════════════════════════════════════════════════ */
  async function getChunkedBlobUrl(fileObj, onProgress) {
    const client    = getClient();
    if (!client) throw new Error('Supabase not loaded.');

    const meta      = fileObj.chunkMeta;
    const groupPath = fileObj.path;
    const totalBytes = meta.size || 0;

    if (onProgress) onProgress(0);

    const parts      = [];
    let bytesLoaded  = 0;

    for (let i = 0; i < meta.totalChunks; i++) {
      const partPath = `${groupPath}/part_${String(i).padStart(3, '0')}`;

      const { data: sd, error: se } = await client.storage
        .from(BUCKET)
        .createSignedUrl(partPath, 300);

      if (se || !sd?.signedUrl) throw new Error(`Cannot get signed URL for chunk ${i + 1}`);

      const part = await _fetchChunkStreamed(
        sd.signedUrl, i, meta.totalChunks, totalBytes, bytesLoaded, onProgress
      );
      parts.push(part);
      bytesLoaded += part.length;
    }

    if (onProgress) onProgress(99);

    const mimeType = meta.mimeType || 'application/octet-stream';
    const fullBlob = new Blob(parts, { type: mimeType });
    if (onProgress) onProgress(100);
    return URL.createObjectURL(fullBlob);
  }

  /* ══════════════════════════════════════════════════════════════
     DELETE FILE  (teachers only)
     For chunked files: deletes all parts + meta.json
  ══════════════════════════════════════════════════════════════ */
  async function deleteFile(path, fileObj) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');
    const role = await _getRole();
    if (!role) throw new Error('Not logged in.');
    if (role !== 'teacher') throw new Error('Only teachers can delete files.');

    // Check if this is a chunked file path (contains __chunks__)
    if (path.includes(`/${CHUNKS_FOLDER}/`) || (fileObj && fileObj.isChunked)) {
      return await _deleteChunkedFile(client, path, fileObj);
    }

    const { data: removed, error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw new Error(error.message);
    if (!removed || removed.length === 0) {
      throw new Error('Delete was blocked — please check storage permissions or try again.');
    }
    return { success: true };
  }

  async function _deleteChunkedFile(client, groupPath, fileObj) {
    // groupPath is the chunk group directory (e.g. class-6/Math/__chunks__/1234_file.pdf)
    const meta = fileObj?.chunkMeta;

    const pathSet = new Set();
    if (meta && meta.totalChunks > 0) {
      // Known chunk count — build paths directly from metadata
      for (let i = 0; i < meta.totalChunks; i++) {
        pathSet.add(`${groupPath}/part_${String(i).padStart(3, '0')}`);
      }
      pathSet.add(`${groupPath}/meta.json`);
    } else {
      // Fallback: list ALL files in the group folder (includes parts + meta.json)
      const { data } = await client.storage.from(BUCKET).list(groupPath, { limit: 1000 });
      (data || []).forEach(f => {
        if (f.id && f.name) pathSet.add(`${groupPath}/${f.name}`);
      });
      // Always include meta.json even if listing somehow missed it
      pathSet.add(`${groupPath}/meta.json`);
    }

    const paths = [...pathSet];
    if (paths.length > 0) {
      const { data: removed, error } = await client.storage.from(BUCKET).remove(paths);
      if (error) throw new Error('Delete failed: ' + error.message);
      if (!removed || removed.length === 0) {
        throw new Error('Delete was blocked — please check storage permissions or try again.');
      }
    }
    return { success: true };
  }

  /* ══════════════════════════════════════════════════════════════
     DELETE FOLDER  (teachers only — removes all files inside)
  ══════════════════════════════════════════════════════════════ */
  async function deleteFolder(prefix) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');
    const role = await _getRole();
    if (!role) throw new Error('Not logged in.');
    if (role !== 'teacher') throw new Error('Only teachers can delete folders.');

    const cleanPrefix = (prefix || '').replace(/\/$/, '');
    const allFiles = await _listRecursive(client, cleanPrefix, []);
    const paths = allFiles.map(f => f._fullPath);
    paths.push(cleanPrefix + '/.emptyFolderPlaceholder');

    if (paths.length > 0) {
      const { error } = await client.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(error.message);
    }
    return { success: true };
  }

  /* ══════════════════════════════════════════════════════════════
     MOVE FILE  (teachers only)
     Note: chunked files cannot be moved via the storage .move() API
     since they span multiple objects. We report a helpful error.
  ══════════════════════════════════════════════════════════════ */
  async function moveFile(fromPath, toFolder, fileObj) {
    const client = getClient();
    if (!client) throw new Error('Supabase not loaded.');
    const role = await _getRole();
    if (!role) throw new Error('Not logged in.');
    if (role !== 'teacher') throw new Error('Only teachers can move files.');

    if (fromPath.includes(`/${CHUNKS_FOLDER}/`) || (fileObj && fileObj.isChunked)) {
      throw new Error('Large chunked files cannot be moved. Please delete and re-upload in the new location.');
    }

    const fileName  = fromPath.split('/').pop();
    const destFolder = (toFolder || '').replace(/\/+$/, '');
    const toPath    = destFolder ? `${destFolder}/${fileName}` : fileName;

    if (fromPath === toPath) throw new Error('Source and destination are the same.');

    const { error } = await client.storage.from(BUCKET).move(fromPath, toPath);
    if (error) throw new Error(error.message);
    return { success: true, newPath: toPath };
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC DOWNLOAD / PREVIEW URLS
     For chunked files, these return a sentinel — the UI must call
     downloadChunkedFile() or getChunkedBlobUrl() instead.
  ══════════════════════════════════════════════════════════════ */
  function getDownloadUrl(path) {
    // If this is a chunked group path, return a sentinel
    if (path.includes(`/${CHUNKS_FOLDER}/`)) {
      return '__chunked__:' + path;
    }
    const client = getClient();
    if (!client) return '#';
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl + '?download=';
  }

  function getPreviewUrl(path) {
    if (path.includes(`/${CHUNKS_FOLDER}/`)) {
      return '__chunked__:' + path;
    }
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
      jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      txt: 'text/plain', mp4: 'video/mp4', mp3: 'audio/mpeg',
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
    CLASSES, EXAMS,
    CHUNKS_FOLDER,
    listFolderContents,
    listFiles,
    createFolder,
    uploadFile,
    deleteFile,
    deleteFolder,
    moveFile,
    downloadChunkedFile,
    getChunkedBlobUrl,
    getDownloadUrl,
    getPreviewUrl,
    getIcon,
    formatSize,
    formatDate
  };

})();
