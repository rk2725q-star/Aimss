/**
 * DELETE /api/drive-delete?fileId=<id>
 * Deletes a file from Google Drive permanently.
 * Requires: Authorization: Bearer <supabase-access-token>
 * TEACHERS ONLY — students get 403.
 */

import { getAccessToken, verifySupabaseJWT, CORS_HEADERS } from './_lib/drive-auth.js';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Verify Supabase JWT ──
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '').trim();
  const user = await verifySupabaseJWT(jwt);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  // ── Teachers only ──
  if (user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Only teachers can delete files.' });
  }

  const fileId = req.query.fileId;
  if (!fileId || typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return res.status(400).json({ error: 'Invalid or missing fileId.' });
  }

  try {
    const token = await getAccessToken();
    const deleteRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (deleteRes.status === 204) {
      // Success — Drive returns 204 No Content on delete
      return res.status(200).json({ success: true, message: 'File deleted successfully.' });
    }

    if (deleteRes.status === 404) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const errText = await deleteRes.text();
    console.error('[Drive Delete] Error:', errText);
    return res.status(502).json({ error: 'Failed to delete file from Google Drive.' });
  } catch (err) {
    console.error('[Drive Delete] Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
