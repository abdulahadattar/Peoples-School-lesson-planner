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

  // Unified endpoint for Gemini to keep API keys secure on server with key rotation and model fallback
  app.post('/api/gemini', async (req, res) => {
    try {
      const {
        model = 'gemini-3.5-flash-lite',
        systemInstruction,
        userPrompt,
        schema,
        temperature,
        contextParts,
      } = req.body || {};

      // Collect all configured server-side keys
      const rawKeys: string[] = [];
      if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
      if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
      if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
      if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));

      const serverKeys = Array.from(new Set(rawKeys.map(k => k.trim()).filter(Boolean)));

      if (serverKeys.length === 0) {
        res.status(401).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please provide an API key in your environment.',
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

      const requestBody = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: temperature ?? 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
      });

      // Try all keys for the requested model
      let lastErrText = '';
      let lastStatus = 500;

      for (const key of serverKeys) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key,
            },
            body: requestBody,
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            res.json({ text });
            return;
          }

          lastStatus = response.status;
          lastErrText = await response.text();
          console.warn(`[server.ts] Model ${model} failed with key (status ${lastStatus}): ${lastErrText.slice(0, 100)}`);
        } catch (fetchErr) {
          lastErrText = (fetchErr as Error).message;
          console.warn(`[server.ts] Network error on model ${model}: ${lastErrText}`);
        }
      }

      res.status(lastStatus).json({ error: lastErrText || `Failed with model ${model} across all available API keys.` });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Google Sheets Proxy Endpoints
  app.get('/api/sheets/data', async (req, res) => {
    try {
      const spreadsheetId = (req.query.spreadsheetId as string) || '1DwEZIS__2T8KVCH140229nrGChgu03n8';
      const gid = (req.query.gid as string) || '1397470354';
      const authHeader = req.headers.authorization;

      let csvText = '';
      const sheetTitle = 'Jamshoro South Final SPD (2)';

      // Fetch public CSV export or authenticated
      const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
      const headers: Record<string, string> = {};
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await fetch(exportUrl, { headers });
      if (!response.ok) {
        res.status(response.status).json({ error: `Google Sheets responded with HTTP ${response.status}` });
        return;
      }
      csvText = await response.text();

      // Parse CSV
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentCell = '';
      let inQuotes = false;

      for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
          if (char === '\r' && nextChar === '\n') {
            i++;
          }
          currentRow.push(currentCell.trim());
          if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
      }

      if (rows.length <= 1) {
        res.json({ ok: true, spreadsheetId, gid, sheetTitle, count: 0, records: [] });
        return;
      }

      // Convert rows to StudentRecord objects
      const records = [];
      for (let i = 1; i < rows.length; i++) {
        const cols = [...rows[i]];
        while (cols.length < 41) cols.push('');

        const student = {
          rowNumber: i + 1,
          rawMetadata: cols.slice(0, 17),
          grNo: cols[17] || '',
          studentName: cols[18] || '',
          bFormNo: cols[19] || '',
          fatherName: cols[20] || '',
          gender: cols[21] || '',
          dobDay: cols[22] || '',
          dobMonth: cols[23] || '',
          dobYear: cols[24] || '',
          classAdmitted: cols[25] || '',
          currentClass: cols[26] || '',
          parentCnic: cols[27] || '',
          religion: cols[28] || '',
          address: cols[29] || '',
          parentContact: cols[30] || '',
          emergencyContact: cols[31] || '',
          admissionDay: cols[32] || '',
          admissionMonth: cols[33] || '',
          admissionYear: cols[34] || '',
          section: cols[35] || '',
          partnerContact: cols[36] || '',
          shift: cols[37] || '',
          medium: cols[38] || '',
          picture: cols[39] || '',
          status: cols[40] || '',
        };

        if (student.grNo || student.studentName) {
          records.push(student);
        }
      }

      res.json({
        ok: true,
        spreadsheetId,
        gid,
        sheetTitle,
        count: records.length,
        records,
      });
    } catch (error) {
      console.error('[server.ts] Error fetching sheet data:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/sheets/update', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header is required.' });
        return;
      }

      const {
        spreadsheetId = '1DwEZIS__2T8KVCH140229nrGChgu03n8',
        sheetTitle = 'Jamshoro South Final SPD (2)',
        rowNumber,
        rowValues,
      } = req.body || {};

      if (!rowNumber || !Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowNumber or rowValues' });
        return;
      }

      const range = `'${sheetTitle}'!A${rowNumber}:AO${rowNumber}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?valueInputOption=USER_ENTERED`;

      const gRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: [rowValues],
        }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText });
        return;
      }

      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/sheets/add', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header is required.' });
        return;
      }

      const {
        spreadsheetId = '1DwEZIS__2T8KVCH140229nrGChgu03n8',
        sheetTitle = 'Jamshoro South Final SPD (2)',
        rowValues,
      } = req.body || {};

      if (!Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowValues' });
        return;
      }

      const range = `'${sheetTitle}'!A:AO`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const gRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: [rowValues],
        }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText });
        return;
      }

      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
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
