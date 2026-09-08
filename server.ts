import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '20mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Proxy endpoint for Gemini to keep GEMINI_API_KEY secure on server
  app.post('/api/gemini', async (req, res) => {
    try {
      const { model = 'gemini-2.5-flash', systemInstruction, userPrompt, schema, temperature, contextParts } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY;

      if (!apiKey) {
        res.status(401).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please provide an API key.',
        });
        return;
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
        res.status(response.status).json({ error: errText });
        return;
      }

      const data = (await response.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Dedicated single-question regeneration endpoint
  app.post('/api/regenerate-question', async (req, res) => {
    try {
      const {
        gradeLevel,
        subject,
        chapterName,
        questionType, // 'mcq' | 'short' | 'long'
        marks,
        currentQuestion,
        customInstruction,
      } = req.body;

      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY;
      if (!apiKey) {
        res.status(401).json({ error: 'GEMINI_API_KEY is not configured on server.' });
        return;
      }

      const isMcq = questionType === 'mcq';
      const prompt = `You are a Ziauddin University Examination Board (ZUEB) senior paper setter for Peoples Higher Secondary School Jamshoro.
Generate ONE replacement question for:
- Grade: ${gradeLevel}
- Subject: ${subject}
- Chapter/Topic: ${chapterName || 'Standard syllabus'}
- Question Type: ${questionType.toUpperCase()}
- Marks: ${marks}
- Current Question being replaced: "${currentQuestion || 'N/A'}"
${customInstruction ? `- Teacher's specific instruction: "${customInstruction}"` : ''}

CRITICAL RULES:
1. Provide a completely fresh, high-quality curriculum-aligned question.
2. Use LaTeX for math/chemical equations (e.g. $F = ma$, $\\text{H}_2\\text{SO}_4$).
3. If MCQ: provide exactly 4 options labeled A, B, C, D and indicate correctOptionIndex (0-3).
4. If Short/Long question: do NOT provide options; provide concise scoring guidelines/marking criteria.

Return strictly valid JSON with this schema:
{
  "question": "question text",
  "marks": ${marks},
  ${isMcq ? '"options": ["option A", "option B", "option C", "option D"],\n  "correctOptionIndex": 0,' : ''}
  "markingGuide": "concise answer key or criteria"
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({ error: errText });
        return;
      }

      const data = (await response.json()) as any;
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const questionObj = JSON.parse(rawText);
      res.json({ question: questionObj });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
