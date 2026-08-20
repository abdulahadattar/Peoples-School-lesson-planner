import React, { useState } from 'react';
import { LessonPlan, GeneratedPaper } from '../types';
import { ArrowLeftIcon, DownloadIcon } from './icons/MiscIcons';
import { exportAsDocx, exportAsPdf, exportPaperAsDocx, exportPaperAsPdf } from '../services/exportService';

interface ResultsViewProps {
  lessonPlans: LessonPlan[];
  papers: GeneratedPaper[];
  onBack: () => void;
  teacherName: string;
  schoolName: string;
}

const ResultsView: React.FC<ResultsViewProps> = ({ lessonPlans, papers, onBack, teacherName, schoolName }) => {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);

  const handleExportPlan = async (plan: LessonPlan) => {
    try {
      await exportAsDocx(plan, undefined, { name: teacherName, schoolName });
      await exportAsPdf(plan, undefined, { name: teacherName, schoolName });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to export. Please try again.');
    }
  };

  const handleExportPaper = async (paper: GeneratedPaper) => {
    try {
      await exportPaperAsDocx(paper, { name: teacherName, schoolName });
      await exportPaperAsPdf(paper, { name: teacherName, schoolName });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to export. Please try again.');
    }
  };

  if (lessonPlans.length > 0) {
    const selectedPlan = lessonPlans[selectedPlanIndex];
    return (
      <div className="h-full flex flex-col bg-brand-bg">
        <div className="flex-shrink-0 px-4 py-3 bg-brand-surface border-b border-brand-border flex items-center justify-between sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-2 text-brand-text-medium hover:text-brand-primary transition-colors text-sm font-bold">
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>
          <div className="flex gap-2">
            <button onClick={() => handleExportPlan(selectedPlan)} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-surface hover:bg-brand-bg border border-brand-border rounded-lg text-xs font-bold text-brand-text-light transition-all">
              <DownloadIcon className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm">
              <h1 className="text-xl font-bold text-brand-text-light mb-2">{selectedPlan.title}</h1>
              <div className="flex flex-wrap gap-2 text-xs text-brand-text-medium">
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">{selectedPlan.gradeLevel}</span>
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">{selectedPlan.subject}</span>
              </div>
            </div>

            <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Objective</h2>
              <p className="text-brand-text-light leading-relaxed">{selectedPlan.objective}</p>
            </div>

              <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm">
                <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-4">Lesson Procedure</h2>
                <div className="space-y-4">
                  {selectedPlan.activities.map((activity, i) => (
                    <div key={i} className="border-l-2 border-brand-primary pl-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-brand-text-light text-sm">{activity.name}</h3>
                        <span className="text-xs text-brand-text-medium bg-brand-bg px-2 py-0.5 rounded-md">{activity.duration} mins</span>
                      </div>
                      <p className="text-sm text-brand-text-medium leading-relaxed mb-2">{activity.description}</p>
                      {activity.teacherActions && (
                        <div className="mb-1.5">
                          <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">Teacher Actions:</span>
                          <p className="text-sm text-brand-text-light leading-relaxed">{activity.teacherActions}</p>
                        </div>
                      )}
                      {activity.studentResponses && (
                        <div>
                          <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">Student Responses:</span>
                          <p className="text-sm text-brand-text-light leading-relaxed">{activity.studentResponses}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Resources</h2>
              <ul className="space-y-1">
                {selectedPlan.materials.map((item, i) => (
                  <li key={i} className="text-sm text-brand-text-medium flex items-start gap-2">
                    <span className="text-brand-primary mt-1">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Homework</h2>
              <p className="text-sm text-brand-text-medium leading-relaxed">{selectedPlan.homework}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (papers.length > 0) {
    const paper = papers[0];
    return (
      <div className="h-full flex flex-col bg-brand-bg">
        <div className="flex-shrink-0 px-4 py-3 bg-brand-surface border-b border-brand-border flex items-center justify-between sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-2 text-brand-text-medium hover:text-brand-primary transition-colors text-sm font-bold">
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>
          <button onClick={() => handleExportPaper(paper)} className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-surface hover:bg-brand-bg border border-brand-border rounded-lg text-xs font-bold text-brand-text-light transition-all">
            <DownloadIcon className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <div className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm mb-6 text-center">
              <h1 className="text-lg font-bold text-brand-text-light mb-1">{schoolName}</h1>
              <h2 className="text-xl font-bold text-brand-text-light mb-2">{paper.title}</h2>
              <div className="flex flex-wrap justify-center gap-3 text-xs text-brand-text-medium">
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">Subject: {paper.subject}</span>
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">Class: {paper.gradeLevel}</span>
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">Total Marks: {paper.totalMarks}</span>
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border">Duration: {paper.durationMinutes} mins</span>
              </div>
            </div>

            {paper.sections.map((section, sIdx) => (
              <div key={sIdx} className="bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-sm mb-4">
                <h3 className="text-lg font-bold text-brand-text-light mb-1">{section.title}</h3>
                <p className="text-sm text-brand-text-medium mb-4">{section.instruction}</p>
                <div className="space-y-3">
                  {section.questions.map((q) => (
                    <div key={q.id} className="text-sm text-brand-text-light">
                      <span className="font-bold mr-1">{q.id}.</span>
                      {q.question}
                      {q.options && q.options.length > 0 && (
                        <ul className="mt-2 ml-4 space-y-1">
                          {q.options.map((opt, oIdx) => (
                            <li key={oIdx} className="text-brand-text-medium">({String.fromCharCode(65 + oIdx)}) {opt}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <p className="text-brand-text-medium mb-4">No results to display</p>
      <button onClick={onBack} className="px-5 py-2.5 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover transition-all">
        Go Back
      </button>
    </div>
  );
};

export default ResultsView;
