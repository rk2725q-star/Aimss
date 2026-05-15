export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { topic, grade } = req.body || {};
    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const apiKey = process.env.NVIDIA_API_KEY || "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";

    const prompt = `Create clean study notes for students.
Topic: ${String(topic)}
Class/Grade: ${String(grade || "General")}
Format:
1) Overview
2) Core concepts
3) Important formulas/facts
4) 5 quick revision points
5) 3 short practice questions
Keep it concise and exam oriented.`;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          { role: "user", content: prompt }
        ],
        max_tokens: 900
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `NVIDIA API generation failed: ${err}` });
    }

    const data = await response.json();
    return res.status(200).json({ content: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error" });
  }
}
