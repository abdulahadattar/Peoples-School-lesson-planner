import { Router } from 'express';
import path from 'path';
import fs from 'fs';

export function createAttendanceRouter(): Router {
  const router = Router();
  const ATTENDANCE_FILE = path.join(process.cwd(), 'data', 'daily_attendance.json');
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  const getAttendanceStore = (): Record<string, any> => {
    try {
      if (fs.existsSync(ATTENDANCE_FILE)) {
        const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[attendanceRouter] Error reading attendance file:', e);
    }
    return {};
  };

  const saveAttendanceStore = (store: Record<string, any>) => {
    try {
      const dir = path.dirname(ATTENDANCE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
      console.error('[attendanceRouter] Error writing attendance file:', e);
    }
  };

  router.get('/attendance', (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      if (!DATE_REGEX.test(date)) {
        res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
        return;
      }
      const store = getAttendanceStore();
      const record = store[date] || null;
      res.json({ ok: true, date, record });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/attendance', (req, res) => {
    try {
      const { date, classes, notes, recordedBy } = req.body || {};
      if (!date || !classes) {
        res.status(400).json({ error: 'Missing date or classes data in body' });
        return;
      }
      if (!DATE_REGEX.test(date)) {
        res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
        return;
      }

      const store = getAttendanceStore();
      store[date] = {
        date,
        classes,
        notes: notes || '',
        recordedBy: recordedBy || 'Unassigned',
        updatedAt: Date.now(),
      };
      saveAttendanceStore(store);

      res.json({ ok: true, message: 'Attendance saved successfully', record: store[date] });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/attendance/sync-sheet', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const {
        spreadsheetId = '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA',
        sheetTitle = 'Sheet1',
        rowValues,
      } = req.body || {};

      if (!Array.isArray(rowValues)) {
        res.status(400).json({ error: 'Missing rowValues array' });
        return;
      }

      const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authHeader) reqHeaders['Authorization'] = authHeader;

      const range = `'${sheetTitle}'!A:A`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

      const is2D = Array.isArray(rowValues[0]);
      const valuesToAppend = is2D ? rowValues : [rowValues];

      const gRes = await fetch(url, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ range, majorDimension: 'ROWS', values: valuesToAppend }),
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        res.status(gRes.status).json({ error: errText || 'Failed to sync attendance to Google Sheet' });
        return;
      }

      const data = await gRes.json();
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/attendance/history', (_req, res) => {
    try {
      const store = getAttendanceStore();
      const history = Object.keys(store)
        .sort((a, b) => b.localeCompare(a))
        .map(date => {
          const rec = store[date];
          let totalPresent = 0;
          let totalEnrolled = 0;
          Object.values(rec.classes || {}).forEach((c: any) => {
            totalPresent += (c.presentBoys || 0) + (c.presentGirls || 0);
            const classTot =
              typeof c.totalEnrollment === 'number' && c.totalEnrollment > 0
                ? c.totalEnrollment
                : (c.enrolledBoys || 0) + (c.enrolledGirls || 0);
            totalEnrolled += classTot;
          });
          const enrolled = totalEnrolled > 0 ? totalEnrolled : 868;
          return {
            date,
            totalPresent,
            totalEnrolled: enrolled,
            percentage: Math.round((totalPresent / enrolled) * 100),
            updatedAt: rec.updatedAt,
          };
        });
      res.json({ ok: true, history });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
