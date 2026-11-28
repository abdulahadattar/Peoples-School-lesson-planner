import React from 'react';
import { getCombinedMarksheetTitle } from '../../services/marksheet/calculations';
import { CLASSIC_GRADING_SCALE, ZUEB_GRADING_SCALE } from '../../services/marksheet/config';
import { ComputedStudentMarksheet, MarksheetConfig } from '../../services/marksheet/types';

export interface MarksheetA4PreviewProps {
  marksheet: ComputedStudentMarksheet;
  config: MarksheetConfig;
}

export const MarksheetA4Preview: React.FC<MarksheetA4PreviewProps> = ({ marksheet, config }) => {
  const titleLine = getCombinedMarksheetTitle(marksheet.student.gradeLevel, marksheet.examType);
  const scale = marksheet.gradingSystem === 'zueb' ? ZUEB_GRADING_SCALE : CLASSIC_GRADING_SCALE;
  const splitIdx = marksheet.gradingSystem === 'zueb' ? 5 : 4;
  const topScaleRow = scale.slice(0, splitIdx);
  const bottomScaleRow = scale.slice(splitIdx);

  const renderScaleRow = (bands: typeof scale) => (
    <div className="flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-3 gap-y-0.5 leading-snug">
      {bands.map((b, i) => {
        const text = b.displayRange.toLowerCase().includes('below')
          ? `${b.grade}: ${b.displayRange}%`
          : `${b.grade}: ${b.displayRange.replace(/\s*-\s*/, '–')}%`;
        return (
          <React.Fragment key={b.grade}>
            {i > 0 && (
              <span className="hidden sm:inline text-black/45" aria-hidden="true">
                |
              </span>
            )}
            <span className="whitespace-nowrap">{text}</span>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="w-full flex justify-center">
      <article
        aria-label={`A4 Marksheet for GR ${marksheet.student.grNo}`}
        className="w-full max-w-[794px] bg-white text-black border-2 border-black px-3.5 sm:px-9 py-4 sm:py-7 shadow-sm print:shadow-none print:max-w-none print:px-9 print:py-7 flex flex-col"
      >
        <div>
          {/* Official Dual-Crest Header */}
          <header className="flex items-center sm:items-start justify-between gap-2 sm:gap-4">
            <img
              src={config.schoolLogoUrl || '/logos/phssj.png'}
              alt={`${config.schoolName} Crest`}
              width={112}
              height={112}
              referrerPolicy="no-referrer"
              className="w-11 h-11 sm:w-20 sm:h-20 object-contain shrink-0"
            />

            <div className="text-center flex-1 min-w-0 pt-0.5 space-y-1 sm:space-y-2">
              <h2 className="text-[13px] sm:text-[19px] font-bold tracking-tight text-black leading-snug">
                {config.schoolName}
              </h2>
              <p className="text-xs sm:text-[15px] font-bold text-black">{titleLine}</p>
              <p className="text-[11px] sm:text-[13px] font-bold text-black tabular-nums">
                Academic Year {config.academicYear}
              </p>
            </div>

            <img
              src={config.affiliationLogoUrl || '/logos/ziauddin-university.png'}
              alt={config.boardName || 'Examination Board'}
              width={240}
              height={73}
              referrerPolicy="no-referrer"
              className="w-16 h-10 sm:w-32 sm:h-16 object-contain shrink-0"
            />
          </header>

          {/* Student Particulars Underlined Block */}
          <section
            aria-label="Student Information"
            className="mt-5 sm:mt-7 grid grid-cols-1 sm:grid-cols-[1.55fr_0.9fr] gap-x-8 gap-y-2 text-xs sm:text-[13px]"
          >
            <div className="flex items-baseline gap-2 sm:gap-3">
              <span className="font-bold text-black shrink-0 w-24 sm:w-28">Student Name:</span>
              <span className="flex-1 min-w-0 font-serif text-[13px] sm:text-[14px] text-black border-b border-black pb-0.5 min-h-[20px] sm:min-h-[22px] break-words">
                {marksheet.student.studentName}
              </span>
            </div>

            <div className="flex items-baseline gap-2 sm:gap-3">
              <span className="font-bold text-black shrink-0 w-24 sm:w-14">Class:</span>
              <span className="flex-1 min-w-0 font-serif text-[13px] sm:text-[14px] text-black text-left sm:text-center border-b border-black pb-0.5 min-h-[20px] sm:min-h-[22px]">
                {marksheet.student.gradeLevel}
              </span>
            </div>

            <div className="flex items-baseline gap-2 sm:gap-3">
              <span className="font-bold text-black shrink-0 w-24 sm:w-28">Father&apos;s Name:</span>
              <span className="flex-1 min-w-0 font-serif text-[13px] sm:text-[14px] text-black border-b border-black pb-0.5 min-h-[20px] sm:min-h-[22px] break-words">
                {marksheet.student.fatherName || '—'}
              </span>
            </div>

            <div className="flex items-baseline gap-2 sm:gap-3">
              <span className="font-bold text-black shrink-0 w-24 sm:w-14">GR No:</span>
              <span className="flex-1 min-w-0 font-serif text-[13px] sm:text-[14px] text-black text-left sm:text-center tabular-nums border-b border-black pb-0.5 min-h-[20px] sm:min-h-[22px]">
                {marksheet.student.grNo}
              </span>
            </div>
          </section>

          {/* Academic Marks Table */}
          <div className="mt-5 sm:mt-8 overflow-x-auto">
            <table className="w-full border-collapse border-[1.5px] border-black font-serif text-[11px] sm:text-[13px] text-black">
              <thead>
                <tr className="border-b-[1.5px] border-black bg-white">
                  <th
                    scope="col"
                    className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 w-6 sm:w-8 text-center font-bold"
                    aria-label="Serial Number"
                  />
                  <th scope="col" className="border border-black py-1 sm:py-1.5 px-1.5 sm:px-3 text-center font-bold">
                    Subject
                  </th>
                  <th
                    scope="col"
                    className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 w-12 sm:w-24 text-center font-bold leading-tight"
                  >
                    Total
                    <span className="hidden sm:inline">
                      <br />
                      Marks
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 w-14 sm:w-28 text-center font-bold leading-tight"
                  >
                    <span className="sm:hidden">Obt.</span>
                    <span className="hidden sm:inline">Obtained Marks</span>
                  </th>
                  <th
                    scope="col"
                    className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 w-12 sm:w-20 text-center font-bold leading-tight"
                  >
                    <span className="sm:hidden">Grade</span>
                    <span className="hidden sm:inline">
                      Subject
                      <br />
                      Grade
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="border border-black py-1 sm:py-1.5 px-1.5 sm:px-3 w-20 sm:w-32 text-center font-bold"
                  >
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {marksheet.subjects.map((row, idx) => (
                  <tr key={row.key}>
                    <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="border border-black py-1 sm:py-1.5 px-1.5 sm:px-3 text-left">
                      {row.label}
                    </td>
                    <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center tabular-nums">
                      {row.maxMarks}
                    </td>
                    <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center tabular-nums">
                      {row.obtained === null ? '—' : row.obtained}
                    </td>
                    <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center tabular-nums">
                      {row.grade}
                    </td>
                    <td className="border border-black py-1 sm:py-1.5 px-1.5 sm:px-3 text-left">
                      {row.remarks}
                    </td>
                  </tr>
                ))}

                <tr className="border-t-[1.5px] border-black font-bold">
                  <td colSpan={2} className="border border-black py-1 sm:py-1.5 px-1.5 sm:px-3 text-center">
                    Total
                  </td>
                  <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center tabular-nums">
                    {marksheet.totalMaxMarks}
                  </td>
                  <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center tabular-nums">
                    {marksheet.hasAnyScore ? marksheet.totalObtainedMarks : '—'}
                  </td>
                  <td className="border border-black py-1 sm:py-1.5 px-1 sm:px-2 text-center" />
                  <td className="border border-black py-1 sm:py-1.5 px-1.5 sm:px-3 text-left" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Overall Grade & Percentage Ruled Summary */}
          <div className="mt-5 sm:mt-8 border-y-[1.5px] border-black py-2 px-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4 font-serif text-xs sm:text-[14px]">
            <div className="flex items-center gap-3 sm:gap-8">
              <span className="font-bold text-black">Grade:</span>
              <span className="font-bold text-black tabular-nums">{marksheet.overallGrade}</span>
            </div>

            <div className="flex items-center gap-3 sm:gap-6">
              <span className="font-bold text-black">Overall Percentage:</span>
              <span className="font-bold text-black tabular-nums">
                {marksheet.overallPercentage !== null
                  ? `${marksheet.overallPercentage.toFixed(2)}  %`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Grading System Box */}
          <div className="mt-4 sm:mt-5 border border-black font-serif text-[10.5px] sm:text-[12px] text-black">
            <div className="border-b border-black py-1 px-2 sm:px-3 text-center font-bold">
              Grading System
            </div>
            <div className="border-b border-black py-1 px-2 text-center tabular-nums">
              {renderScaleRow(topScaleRow)}
            </div>
            <div className="py-1 px-2 text-center tabular-nums">
              {renderScaleRow(bottomScaleRow)}
            </div>
          </div>
        </div>

        {/* Bottom Signatures */}
        <footer className="mt-6 sm:mt-8 pt-2 grid grid-cols-2 gap-6 sm:gap-24 items-end font-serif text-xs sm:text-[13px] text-black">
          <div className="text-center">
            <div className="h-10 sm:h-12" />
            <div className="border-t border-black pt-1.5 font-bold">Class Teacher</div>
            <div className="mt-0.5">{marksheet.classTeacher}</div>
          </div>

          <div className="text-center">
            <div className="h-10 sm:h-12 flex items-end justify-center pb-1">
              <img
                src={config.principalSignatureUrl || '/logos/principal-signature.png'}
                alt="Principal Signature"
                width={131}
                height={117}
                referrerPolicy="no-referrer"
                className="h-9 sm:h-11 w-auto object-contain"
              />
            </div>
            <div className="border-t border-black pt-1.5 font-bold">Principal</div>
            <div className="mt-0.5">{config.principalName}</div>
          </div>
        </footer>
      </article>
    </div>
  );
};
