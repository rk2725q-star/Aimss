import { getAccessToken, verifySupabaseJWT, CORS_HEADERS } from './_lib/drive-auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'GET') {
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
    return res.status(403).json({ error: 'Access denied. Only teachers can request upload tokens.' });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return res.status(500).json({ error: 'Server misconfiguration: Drive folder not set.' });
  }

  try {
    const token = await getAccessToken();
    return res.status(200).json({ token, folderId, email: user.email });
  } catch (err) {
    console.error('[Drive Token] Error:', err);
    return res.status(500).json({ error: 'Failed to generate access token.' });
  }
}
