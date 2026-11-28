import React, { useState } from 'react';
import { Lock, Unlock, Download, Upload, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SchoolConfig } from '../../services/schoolConfigService';
import {
  buildSchoolConfigBackupPayload,
  parseSchoolConfigBackup,
} from './adminNavigation';

export interface SafeguardsSettingsTabProps {
  workingConfig: SchoolConfig;
  setWorkingConfig: React.Dispatch<React.SetStateAction<SchoolConfig>>;
  isAdmin: boolean;
  onRequestResetBaseline: () => void;
}

export const SafeguardsSettingsTab: React.FC<SafeguardsSettingsTabProps> = ({
  workingConfig,
  setWorkingConfig,
  isAdmin,
  onRequestResetBaseline,
}) => {
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDownloadBackup = () => {
    try {
      const payload = buildSchoolConfigBackupPayload(workingConfig);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `school-settings-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupNotice({ type: 'success', text: 'School settings backup downloaded.' });
    } catch {
      setBackupNotice({ type: 'error', text: 'Could not create the settings backup file.' });
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = parseSchoolConfigBackup(text);
      if (result.ok === false) {
        setBackupNotice({ type: 'error', text: result.error });
        return;
      }
      setWorkingConfig(result.config);
      setBackupNotice({
        type: 'success',
        text: 'Backup loaded into preview. Click Save Changes to publish to the school.',
      });
    };
    reader.onerror = () => {
      setBackupNotice({ type: 'error', text: 'Could not read the selected backup file.' });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl animate-fadeIn">
      {/* Student Records Edit Access */}
      <section className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                workingConfig.sheetEditingEnabled
                  ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
              }`}
            >
              {workingConfig.sheetEditingEnabled ? (
                <Unlock className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Lock className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-brand-text-primary">
                Student Records Edit Access
              </h2>
              <p className="text-xs text-brand-text-secondary max-w-xl">
                {workingConfig.sheetEditingEnabled
                  ? 'Open Editing — all signed-in staff can add or update student register entries.'
                  : 'View-Only Safeguard — teachers and guests are read-only while administrators retain edit access.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={workingConfig.sheetEditingEnabled}
            aria-label="Toggle student records editing for staff"
            onClick={() =>
              setWorkingConfig((prev) => ({
                ...prev,
                sheetEditingEnabled: !prev.sheetEditingEnabled,
              }))
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none ${
              workingConfig.sheetEditingEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                workingConfig.sheetEditingEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="pt-2 border-t border-brand-border/70 space-y-2">
          <label
            htmlFor="lockout-banner-message"
            className="block text-xs font-semibold text-brand-text-primary"
          >
            Lockout Banner Notice
          </label>
          <textarea
            id="lockout-banner-message"
            rows={2}
            value={workingConfig.sheetEditingLockedMessage || ''}
            onChange={(e) =>
              setWorkingConfig((prev) => ({
                ...prev,
                sheetEditingLockedMessage: e.target.value,
              }))
            }
            placeholder="Message shown to staff when student register editing is locked..."
            className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary resize-none"
          />
        </div>
      </section>

      {/* School Settings Backup & Restore */}
      <section className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-brand-text-primary">
            School Settings Backup & Restore
          </h2>
          <p className="text-xs text-brand-text-secondary">
            Save an offline copy of your school identity, classes, faculty roster, bell timings, and timetable, or restore a previous backup.
          </p>
        </div>

        {backupNotice && (
          <div
            role="status"
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              backupNotice.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {backupNotice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{backupNotice.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 pt-1">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs font-semibold bg-brand-panel hover:bg-brand-border/70 border border-brand-border text-brand-text-primary transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download Backup</span>
          </button>

          <label className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs font-semibold bg-brand-panel hover:bg-brand-border/70 border border-brand-border text-brand-text-primary transition-colors cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restore from File</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleRestoreFile}
              className="sr-only"
              aria-label="Restore school settings from backup file"
            />
          </label>
        </div>
      </section>

      {/* Reset to Official Baseline */}
      <section className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-brand-text-primary">Restore School Baseline</h2>
          <p className="text-xs text-brand-text-secondary max-w-xl">
            Reset classes, teachers, bell timings, and student strength back to the official PHSSJ register baseline.
          </p>
        </div>

        <button
          type="button"
          onClick={onRequestResetBaseline}
          disabled={!isAdmin}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs font-semibold border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset Baseline</span>
        </button>
      </section>
    </div>
  );
};
