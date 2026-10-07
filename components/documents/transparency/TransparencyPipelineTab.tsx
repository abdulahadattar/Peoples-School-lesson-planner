import React from 'react';
import { UploadCloud, Layers, Cpu, Database, CheckCircle2, ShieldCheck } from 'lucide-react';

export const TransparencyPipelineTab: React.FC = () => {
  const steps = [
    {
      icon: UploadCloud,
      title: '1. Ingestion & Pre-Processing',
      desc: 'Streams multi-page PDF or ZIP scans into memory. Automatically unpacks, normalizes pixel density, detects rotation, and crops noise.',
    },
    {
      icon: Layers,
      title: '2. PDF & Image Extraction',
      desc: 'Splits multi-page files into high-resolution single document streams. Checks SHA-256 hashes to prevent redundant AI operations.',
    },
    {
      icon: Cpu,
      title: '3. Multi-Model AI Vision Engine',
      desc: 'Executes document classification and field extraction with multi-model fallback chain and dynamic key rotation for 100% uptime.',
    },
    {
      icon: Database,
      title: '4. Pakistani Name & NADRA Validation',
      desc: 'Transliterates Sindhi/Urdu script, standardizes 13-digit NADRA B-Form and CNIC IDs, and prevents false positives with OCR error tolerance.',
    },
    {
      icon: ShieldCheck,
      title: '5. Google Sheet Reconciliation',
      desc: 'Reconciles extracted student records against the master Google Sheet database and surfaces verified 1-click discrepancy syncs.',
    },
  ];

  return (
    <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
      <div className="p-3 bg-brand-bg rounded-xl border border-brand-border text-xs text-brand-text-secondary">
        The Document AI Processing Pipeline operates in real-time with resilient fallback mechanics across models and API key pools.
      </div>

      <div className="space-y-3">
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
    </div>
  );
};
