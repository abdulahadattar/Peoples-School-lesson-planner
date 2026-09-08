export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model = 'gemini-2.5-flash', systemInstruction, userPrompt, schema, temperature, contextParts } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY;

    if (!apiKey) {
      return res.status(401).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in your environment.',
      });
    }

    const parts: any[] = [];
    if (contextParts && Array.isArray(contextParts)) {
      for (const part of contextParts) {
        parts.push(part);
      }
    }
    if (userPrompt) {
      parts.push({ text: userPrompt });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: temperature ?? 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return res.status(200).json({ text });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
