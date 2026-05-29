/**
 * POST /api/drive-upload
 * Uploads a file to Google Drive.
 * Requires: Authorization: Bearer <supabase-access-token>
 * TEACHERS ONLY — students get 403.
 *
 * Body: multipart/form-data with field "file"
 */

import { getAccessToken, verifySupabaseJWT, CORS_HEADERS } from './_lib/drive-auth.js';

export const config = {
  maxDuration: 30,
  api: { bodyParser: false }   // We handle the raw body ourselves (multipart)
};

// Max file size: 50 MB
const MAX_BYTES = 50 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
]);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).end();
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') {
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
    return res.status(403).json({ error: 'Access denied. Only teachers can upload files.' });
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return res.status(500).json({ error: 'Server misconfiguration: Drive folder not set.' });
  }

  try {
    // Read raw body (Vercel does not parse multipart by default)
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

    if (rawBody.length > MAX_BYTES) {
      return res.status(413).json({ error: 'File too large. Maximum 50 MB allowed.' });
    }

    // Parse multipart manually (using boundary from Content-Type header)
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'Invalid multipart request.' });
    }

    const boundary = '--' + boundaryMatch[1];
    const parsed = parseMultipart(rawBody, boundary);

    if (!parsed.file) {
      return res.status(400).json({ error: 'No file provided in the request.' });
    }

    const { buffer, filename, mimetype } = parsed.file;

    // Validate MIME type
    if (!ALLOWED_TYPES.has(mimetype)) {
      return res.status(415).json({ error: `File type "${mimetype}" not allowed.` });
    }

    const token = await getAccessToken();

    // ── Multipart upload to Google Drive ──
    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId],
      description: `Uploaded by teacher: ${user.email}`
    });

    const boundary2 = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary2}\r\n`;
    const close_delim = `\r\n--${boundary2}--`;

    const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`;
    const mediaPart    = `Content-Type: ${mimetype}\r\n\r\n`;

    const body = Buffer.concat([
      Buffer.from(delimiter + metadataPart + delimiter + mediaPart),
      buffer,
      Buffer.from(close_delim)
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary="${boundary2}"`,
          'Content-Length': body.length.toString()
        },
        body
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[Drive Upload] Error:', errText);
      return res.status(502).json({ error: 'Failed to upload to Google Drive.' });
    }

    const file = await uploadRes.json();
    return res.status(200).json({ success: true, file });
  } catch (err) {
    console.error('[Drive Upload] Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/** Parse multipart/form-data body — no external libraries needed */
function parseMultipart(buffer, boundary) {
  const result = {};
  const boundaryBuf = Buffer.from(boundary);
  let start = buffer.indexOf(boundaryBuf);

  while (start !== -1) {
    start += boundaryBuf.length + 2; // skip \r\n
    const end = buffer.indexOf(boundaryBuf, start);
    if (end === -1) break;

    const part = buffer.slice(start, end - 2); // strip trailing \r\n
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = end; continue; }

    const headerStr = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const fileMatch = headerStr.match(/filename="([^"]+)"/);
    const mimeMatch = headerStr.match(/Content-Type:\s*(\S+)/);

    if (nameMatch && fileMatch) {
      result[nameMatch[1]] = {
        buffer: body,
        filename: fileMatch[1],
        mimetype: mimeMatch ? mimeMatch[1] : 'application/octet-stream'
      };
    } else if (nameMatch) {
      result[nameMatch[1]] = body.toString('utf-8').trim();
    }
    start = end;
  }
  return result;
}
