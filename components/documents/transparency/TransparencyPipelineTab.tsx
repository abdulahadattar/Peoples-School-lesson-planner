import React from 'react';
import { UploadCloud, Layers, Cpu, Database, CheckCircle2, ShieldCheck } from 'lucide-react';

export const TransparencyPipelineTab: React.FC = () => {
  const steps = [
    {
      icon: UploadCloud,
      title: '1. Photo & Document Check',
      desc: 'Separates student photos from ID documents and admission records.',
    },
    {
      icon: Layers,
      title: '2. Folder Grouping & PDF Pages',
      desc: 'Groups uploaded folders by student and separates multi-page PDF files.',
    },
    {
      icon: Cpu,
      title: '3. Student Detail Reading',
      desc: 'Reads student names, father names, B-Form numbers, CNICs, and marksheets.',
    },
    {
      icon: Database,
      title: '4. Sibling & Misfiled Matching',
      desc: 'Links shared family B-Forms across siblings and flags files placed in the wrong folder.',
    },
    {
      icon: ShieldCheck,
      title: '5. Record Verification',
      desc: 'Compares document details against school records and highlights any mismatches.',
    },
  ];

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        return (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs flex items-start gap-3"
          >
            <div className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-bold text-brand-text-primary">{step.title}</h4>
              <p className="text-[11px] text-brand-text-secondary leading-relaxed">{step.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
