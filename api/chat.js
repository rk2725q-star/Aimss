export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.NVIDIA_API_KEY || "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";

    const systemPrompt = `You are FutureGen Institute's AI assistant.
Answer clearly for NEET, Matric, and CBSE students.
Be concise, accurate, and motivating.
If asked about admissions/fees, ask for class and target year before specific recommendations.`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 280
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `NVIDIA API request failed: ${errText}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'I am here to help. Please ask your question again.';
    return res.status(200).json({ reply: text });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
}
