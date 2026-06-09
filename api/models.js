export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let authHeader = req.headers.authorization;
    if (!authHeader || authHeader === 'Bearer undefined' || authHeader === 'Bearer null' || !authHeader.startsWith('Bearer nvapi-')) {
      const defaultKey = process.env.NVIDIA_API_KEY || "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";
      authHeader = `Bearer ${defaultKey}`;
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: authHeader
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `NVIDIA API models request failed: ${errText}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
}
