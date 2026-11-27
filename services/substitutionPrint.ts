import { DayKey, DAY_LABELS } from './timetable';
import { SubstitutionAssignment } from './substitutionService';
import { AffectedSlot } from '../components/substitution/SubstitutionTodayBoard';
import { printHtml } from '../utils/printHelper';

export function printSubstitutionSlip(
  todayKey: string,
  day: DayKey,
  affectedSlots: AffectedSlot[],
  assignments: SubstitutionAssignment[],
  absentTeacherNames: string[]
): void {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Faculty Substitution Slip - ${todayKey}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
        h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
        h2 { margin: 4px 0 0 0; font-size: 13px; font-weight: normal; color: #444; }
        .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 16px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #999; padding: 7px 10px; text-align: left; }
        th { background: #f3f4f6; font-weight: 600; }
        .unassigned { color: #dc2626; font-weight: bold; }
        .sign { margin-top: 48px; display: flex; justify-content: space-between; font-size: 12px; }
        .absent-box { margin-bottom: 14px; padding: 8px 12px; background: #fafafa; border: 1px dashed #ccc; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Peoples Higher Secondary School Jamshoro</h1>
        <h2>Daily Faculty Substitution & Proxy Roster</h2>
      </div>
      <div class="meta">
        <div><strong>Date:</strong> ${todayKey} (${DAY_LABELS[day]})</div>
        <div><strong>Total Vacant Slots:</strong> ${affectedSlots.length}</div>
        <div><strong>Assigned Proxies:</strong> ${assignments.length}</div>
      </div>

      ${
        absentTeacherNames.length > 0
          ? `<div class="absent-box"><strong>Absent Faculty Members:</strong> ${absentTeacherNames.join(', ')}</div>`
          : ''
      }

      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Class</th>
            <th>Subject</th>
            <th>Absent Teacher</th>
            <th>Assigned Proxy Teacher</th>
            <th>Teacher Signature</th>
          </tr>
        </thead>
        <tbody>
          ${affectedSlots
            .map((slot) => {
              const assigned = assignments.find(
                (a) =>
                  a.periodNo === slot.periodNo &&
                  a.classLabel === slot.classLabel &&
                  a.absentTeacherName === slot.absentTeacher.name
              );
              return `
              <tr>
                <td><strong>Period ${slot.periodNo}</strong></td>
                <td>${slot.classLabel}</td>
                <td>${slot.subjectName}</td>
                <td>${slot.absentTeacher.name}</td>
                <td>${
                  assigned
                    ? `<strong>${assigned.proxyTeacherName}</strong>`
                    : '<span class="unassigned">UNASSIGNED</span>'
                }</td>
                <td style="width: 140px;"></td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>

      <div class="sign">
        <div>Prepared By: ____________________</div>
        <div>Vice Principal / Principal: ____________________</div>
      </div>
    </body>
    </html>
  `;

  printHtml(html);
}
