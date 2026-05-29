/**
 * GET /api/drive-list
 * Lists all files in the shared AIMSS Google Drive folder.
 * Requires: Authorization: Bearer <supabase-access-token>
 * Both teachers and students can access this.
 */

import { getAccessToken, verifySupabaseJWT, CORS_HEADERS } from './_lib/drive-auth.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Verify Supabase JWT (must be logged in) ──
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '').trim();
  const user = await verifySupabaseJWT(jwt);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return res.status(500).json({ error: 'Server misconfiguration: Drive folder not set.' });
  }

  try {
    const token = await getAccessToken();
    const fields = 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)';
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${encodeURIComponent(fields)}&orderBy=name&pageSize=200`;

    const driveRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!driveRes.ok) {
      const err = await driveRes.text();
      console.error('[Drive List] Drive API error:', err);
      return res.status(502).json({ error: 'Failed to list files from Google Drive.' });
    }

    const data = await driveRes.json();
    return res.status(200).json({
      files: data.files || [],
      role: user.role
    });
  } catch (err) {
    console.error('[Drive List] Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
