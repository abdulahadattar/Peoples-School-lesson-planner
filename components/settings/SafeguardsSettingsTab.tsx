import React from 'react';
import { Lock, Unlock } from 'lucide-react';
import { SchoolConfig } from '../../services/schoolConfigService';

export interface SafeguardsSettingsTabProps {
  workingConfig: SchoolConfig;
  setWorkingConfig: React.Dispatch<React.SetStateAction<SchoolConfig>>;
}

export const SafeguardsSettingsTab: React.FC<SafeguardsSettingsTabProps> = ({
  workingConfig,
  setWorkingConfig,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Master Google Sheet Editing Permission Toggle */}
      <div className="p-6 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              {workingConfig.sheetEditingEnabled ? (
                <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                  <Unlock className="w-5 h-5" />
                </span>
              ) : (
                <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                  <Lock className="w-5 h-5" />
                </span>
              )}
              <div>
                <h3 className="text-sm font-bold text-brand-text-primary">
                  Student Records Edit Access
                </h3>
              </div>
            </div>
          </div>

          {/* Master Switch */}
          <button
            type="button"
            onClick={() =>
              setWorkingConfig((prev) => ({
                ...prev,
                sheetEditingEnabled: !prev.sheetEditingEnabled,
              }))
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              workingConfig.sheetEditingEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                workingConfig.sheetEditingEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/80 space-y-2">
          <label className="block text-xs font-semibold text-brand-text-primary">
            Lockout Banner Message
          </label>
          <textarea
            rows={2}
            value={workingConfig.sheetEditingLockedMessage || ''}
            onChange={(e) =>
              setWorkingConfig((prev) => ({
                ...prev,
                sheetEditingLockedMessage: e.target.value,
              }))
            }
            placeholder="Shown to teachers and guests when sheet editing is disabled..."
            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary resize-none"
          />
        </div>

        <div className="text-xs text-brand-text-secondary flex items-center gap-2 pt-1">
          <span
            className={`px-2 py-0.5 rounded-md font-semibold ${
              workingConfig.sheetEditingEnabled
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            }`}
          >
            {workingConfig.sheetEditingEnabled ? 'Open Editing' : 'View-Only Safeguard'}
          </span>
          <span>
            {workingConfig.sheetEditingEnabled
              ? 'All signed-in users can add or edit student records.'
              : 'Non-admin users are read-only; administrators retain edit access.'}
          </span>
        </div>
      </div>
    </div>
  );
};
