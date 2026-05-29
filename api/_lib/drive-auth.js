/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS — Google Drive Auth Helper
 *  Generates short-lived OAuth 2.0 tokens from Service Account JSON.
 *  ZERO API keys — uses Service Account JWT flow (RS256 signed).
 *  Credentials stored ONLY in Vercel env variables — never in browser.
 * ═══════════════════════════════════════════════════════════════════
 */

/* ── CORS headers for all Drive API routes ── */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

/* ══════════════════════════════════════════════════════════════════
   SERVICE ACCOUNT → GOOGLE OAUTH 2.0 TOKEN
   Flow:
     1. Build a JWT signed with the service account's private key (RS256)
     2. Exchange the JWT for a short-lived access token (1 hour)
     3. Cache the token in memory to avoid re-generating on every request
   ══════════════════════════════════════════════════════════════════ */

let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Returns a valid Google API access token.
 * Reads GOOGLE_SERVICE_ACCOUNT_JSON from Vercel env.
 */
export async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token;
  }

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set.');
  }

  let sa;
  try {
    sa = JSON.parse(saJson);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  const token = await _fetchAccessToken(sa);
  _tokenCache = { token, expiresAt: Date.now() + 3600_000 }; // 1 hour
  return token;
}

async function _fetchAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  // Sign the JWT with RS256 using the service account private key
  const signedJwt = await _signJwt(claim, sa.private_key);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  signedJwt
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error('No access_token in response.');
  return data.access_token;
}

/** Creates a signed RS256 JWT from a claim set and PEM private key */
async function _signJwt(claims, privateKeyPem) {
  const header  = _base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = _base64url(JSON.stringify(claims));
  const sigInput = `${header}.${payload}`;

  // Import PEM private key
  const keyData = _pemToDer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput)
  );

  return `${sigInput}.${_arrayBufferToBase64url(signature)}`;
}

function _base64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _arrayBufferToBase64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}


/* ══════════════════════════════════════════════════════════════════
   SUPABASE JWT VERIFIER
   Validates the user's Supabase session token and extracts their role.
   This uses the Supabase REST API — no secret key needed (publishable only).
   ══════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://pgrjzsqylhchmelmwhkv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iw8Pmvpylj0rGyl5Bs_19w_SEdfUdYh';

/**
 * Verifies a Supabase JWT and returns { userId, email, role } or null.
 * Role is fetched from the profiles table (RLS-protected).
 */
export async function verifySupabaseJWT(jwt) {
  if (!jwt || jwt.length < 20) return null;

  try {
    // Step 1: Get user info from Supabase
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_KEY
      }
    });
    if (!userRes.ok) return null;
    const userData = await userRes.json();
    if (!userData?.id) return null;

    // Step 2: Fetch role from profiles table
    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userData.id}&select=role`,
      {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'apikey': SUPABASE_KEY,
          'Accept': 'application/json'
        }
      }
    );
    if (!roleRes.ok) return null;
    const roleData = await roleRes.json();
    const role = roleData?.[0]?.role || null;

    return { userId: userData.id, email: userData.email, role };
  } catch {
    return null;
  }
}
