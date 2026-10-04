import { ClassAttendanceRow, SchoolAttendanceSummary, cleanAttendanceInCharge } from './attendanceService';
import { printHtml } from '../utils/printHelper';

/**
 * Generates and prints the official Daily Student Attendance Slip HTML.
 */
export function printAttendanceSlip(
  selectedDate: string,
  rows: ClassAttendanceRow[],
  summary: SchoolAttendanceSummary,
  recordedBy: string
): void {
  const formattedDate = new Date(selectedDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const inChargeName = cleanAttendanceInCharge(recordedBy);

  const rowsHtml = rows
    .map(
      r => `
    <tr>
      <td>
        <strong>${r.displayName}</strong>
        ${r.classTeacher ? `<div style="font-size:9.5px; color:#475569; font-weight:normal; margin-top:1px;">Teacher: ${r.classTeacher}</div>` : ''}
      </td>
      <td style="text-align:center;">${r.enrolledBoys}</td>
      <td style="text-align:center;">${r.enrolledGirls}</td>
      <td style="text-align:center; font-weight:600;">${r.totalEnrolled}</td>
      <td style="text-align:center; color:#0284c7; font-weight:600;">${typeof r.presentBoys === 'number' ? r.presentBoys : 0}</td>
      <td style="text-align:center; color:#0284c7; font-weight:600;">${typeof r.presentGirls === 'number' ? r.presentGirls : 0}</td>
      <td style="text-align:center; font-weight:bold; background:#f0fdf4;">${r.totalPresent}</td>
      <td style="text-align:center; color:#dc2626;">${r.absentTotal}</td>
      <td style="text-align:center; font-weight:bold; ${r.percentage >= 90 ? 'color:#16a34a;' : r.percentage >= 80 ? 'color:#0284c7;' : 'color:#d97706;'}">${r.percentage}%</td>
    </tr>
  `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Attendance Slip - ${selectedDate}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111; font-size: 11px; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
        h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px; }
        h2 { margin: 4px 0 0 0; font-size: 13px; font-weight: 600; color: #334155; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; }
        .total-row td { background: #f8fafc; font-weight: bold; border-top: 2px solid #0f172a; }
        .kpi-cards { display: flex; gap: 10px; margin-bottom: 14px; }
        .kpi { flex: 1; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px; text-align: center; background: #fafafa; }
        .kpi .num { font-size: 16px; font-weight: bold; margin-top: 2px; }
        .signatures { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 12px; }
        .sign-col { text-align: center; width: 180px; border-top: 1px solid #475569; padding-top: 4px; font-size: 11px; font-weight: 600; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Peoples Higher Secondary School Jamshoro</h1>
        <h2>Daily Student Attendance Register (ECCE to Grade 12)</h2>
      </div>

      <div class="meta">
        <div><strong>Date:</strong> ${formattedDate} (${selectedDate})</div>
        <div><strong>Active Enrollment:</strong> ${summary.totalEnrolled} Students</div>
        <div><strong>Attendance In-Charge:</strong> ${inChargeName}</div>
      </div>

      <div class="kpi-cards">
        <div class="kpi">
          <div>Overall Attendance</div>
          <div class="num" style="color: #16a34a;">${summary.overallPercentage}%</div>
        </div>
        <div class="kpi">
          <div>Total Present</div>
          <div class="num" style="color: #0f172a;">${summary.totalPresent} / ${summary.totalEnrolled}</div>
        </div>
        <div class="kpi">
          <div>Boys Present</div>
          <div class="num" style="color: #0284c7;">${summary.presentBoys} / ${summary.enrolledBoys} (${summary.boysPercentage}%)</div>
        </div>
        <div class="kpi">
          <div>Girls Present</div>
          <div class="num" style="color: #ec4899;">${summary.presentGirls} / ${summary.enrolledGirls} (${summary.girlsPercentage}%)</div>
        </div>
        <div class="kpi">
          <div>Total Absent</div>
          <div class="num" style="color: #dc2626;">${summary.totalAbsent}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Grade / Class</th>
            <th style="text-align:center;">Enr. Boys</th>
            <th style="text-align:center;">Enr. Girls</th>
            <th style="text-align:center;">Total Enr.</th>
            <th style="text-align:center;">Pres. Boys</th>
            <th style="text-align:center;">Pres. Girls</th>
            <th style="text-align:center;">Total Pres.</th>
            <th style="text-align:center;">Total Abs.</th>
            <th style="text-align:center;">Att. %</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td><strong>TOTAL ATTENDANCE</strong></td>
            <td style="text-align:center;">${summary.enrolledBoys}</td>
            <td style="text-align:center;">${summary.enrolledGirls}</td>
            <td style="text-align:center;">${summary.totalEnrolled}</td>
            <td style="text-align:center; color:#0284c7;">${summary.presentBoys}</td>
            <td style="text-align:center; color:#0284c7;">${summary.presentGirls}</td>
            <td style="text-align:center; color:#16a34a; font-size:12px;">${summary.totalPresent}</td>
            <td style="text-align:center; color:#dc2626;">${summary.totalAbsent}</td>
            <td style="text-align:center; color:#16a34a; font-size:12px;">${summary.overallPercentage}%</td>
          </tr>
        </tbody>
      </table>

      <div class="signatures">
        <div class="sign-col">
          Attendance In-Charge
          <div style="font-size:10px; font-weight:normal; color:#475569; margin-top:2px;">(${inChargeName})</div>
        </div>
        <div class="sign-col">Vice Principal</div>
        <div class="sign-col">Principal / Headmaster</div>
      </div>
    </body>
    </html>
  `;

  printHtml(html);
}
