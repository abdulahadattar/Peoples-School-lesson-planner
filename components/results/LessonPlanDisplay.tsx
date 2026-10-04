import React from 'react';
import { LessonPlan, ExportFormat } from '../../types';
import { ArrowLeftIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons/MiscIcons';
import KaTeXText from '../KaTeXText';
import { PhssjLogo } from '../Logo';

const chipClass = 'px-2 py-1 bg-brand-bg rounded-md border border-brand-border text-[11px]';

export interface LessonPlanDisplayProps {
  lessonPlans: LessonPlan[];
  selectedPlanIndex: number;
  setSelectedPlanIndex: React.Dispatch<React.SetStateAction<number>>;
  onBack: () => void;
  exportFormat?: ExportFormat;
  onExportPlan?: (plan: LessonPlan) => void;
}

export const LessonPlanDisplay: React.FC<LessonPlanDisplayProps> = ({
  lessonPlans,
  selectedPlanIndex,
  setSelectedPlanIndex,
  onBack,
  exportFormat = 'both',
  onExportPlan,
}) => {
  const selectedPlan = lessonPlans[selectedPlanIndex];
  const hasMultiple = lessonPlans.length > 1;

  if (!selectedPlan) return null;

  return (
    <div className="h-full flex flex-col bg-brand-bg">
      <div className="flex-shrink-0 px-4 py-3 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-primary transition-all duration-200 text-sm font-semibold active:scale-95 cursor-pointer"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          {hasMultiple && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => setSelectedPlanIndex(prev => Math.max(0, prev - 1))}
                disabled={selectedPlanIndex === 0}
                aria-label="Previous plan"
                className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center border border-brand-border hover:bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-90 active:bg-brand-bg cursor-pointer"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-brand-text-secondary px-2">
                {selectedPlanIndex + 1} / {lessonPlans.length}
              </span>
              <button
                onClick={() => setSelectedPlanIndex(prev => Math.min(lessonPlans.length - 1, prev + 1))}
                disabled={selectedPlanIndex === lessonPlans.length - 1}
                aria-label="Next plan"
                className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center border border-brand-border hover:bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-90 active:bg-brand-bg cursor-pointer"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {onExportPlan && (
            <button
              onClick={() => onExportPlan(selectedPlan)}
              className="flex items-center gap-1.5 px-3 py-1.5 brand-gradient text-white rounded-lg text-xs font-semibold hover:shadow-glass transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Export {exportFormat === 'both' ? 'DOCX + PDF' : exportFormat.toUpperCase()}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-6 animate-fadeInUp">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 border border-brand-border shadow-soft flex items-center justify-center flex-shrink-0 p-1 ring-1 ring-black/5 dark:ring-white/10">
                <PhssjLogo className="w-full h-full rounded-full" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-brand-text-primary mb-1 leading-tight">{selectedPlan.title}</h1>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClass}>{selectedPlan.gradeLevel}</span>
                  <span className={chipClass}>{selectedPlan.subject}</span>
                  {selectedPlan.chapterName && <span className={chipClass}>{selectedPlan.chapterName}</span>}
                  {hasMultiple && (
                    <span className="px-2 py-1 bg-brand-primary/10 text-brand-primary rounded-md border border-brand-primary/15 font-semibold text-[11px]">
                      Plan {selectedPlanIndex + 1} of {lessonPlans.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-4 hover:shadow-card-hover transition-shadow">
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Objective</h2>
            <KaTeXText text={selectedPlan.objective} className="text-brand-text-primary leading-relaxed" as="p" />
          </div>

          <div className="glass-card rounded-xl p-4">
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-4">Lesson Procedure</h2>
            <div className="space-y-4">
              {selectedPlan.activities.map((activity, i) => (
                <div key={i} className="border-l-2 border-brand-primary pl-4 group">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-brand-text-primary text-sm">{activity.name}</h3>
                    <span className="text-xs text-brand-text-secondary bg-brand-bg px-2 py-0.5 rounded-md">{activity.duration} mins</span>
                  </div>
                  <KaTeXText text={activity.description} className="text-sm text-brand-text-secondary leading-relaxed group-hover:text-brand-text-primary transition-colors" as="p" />
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-xl p-4">
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Resources</h2>
            <ul className="space-y-1">
              {selectedPlan.materials.map((item, i) => (
                <li key={i} className="text-sm text-brand-text-secondary flex items-start gap-2">
                  <span className="text-brand-primary mt-1">•</span>
                  <KaTeXText text={item} />
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card rounded-xl p-4">
            <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Homework</h2>
            <KaTeXText text={selectedPlan.homework} className="text-sm text-brand-text-secondary leading-relaxed" as="p" />
          </div>
        </div>
      </div>
    </div>
  );
};
