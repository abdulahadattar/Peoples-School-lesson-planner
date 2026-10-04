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
                  Google Sheet Student Records Edit Permission
                </h3>
                <p className="text-xs text-brand-text-secondary">
                  Toggle whether faculty members and visitors can add or edit student records in the Google Sheet.
                </p>
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
            Lockout Banner Message (displayed when editing is locked):
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
            placeholder="Message shown to teachers and visitors when sheet editing is disabled..."
            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-brand-text-secondary pt-2">
          <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
            <span className="font-bold text-blue-700 dark:text-blue-300 block mb-0.5">
              When Enabled (Open Editing):
            </span>
            Faculty members can click "Add Student", edit contact numbers, addresses, and status with immediate cloud synchronization.
          </div>
          <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <span className="font-bold text-amber-700 dark:text-amber-300 block mb-0.5">
              When Disabled (View-Only Safeguard):
            </span>
            The spreadsheet is locked into safe read-only mode for non-admin users. Only verified school administrators can submit mutations.
          </div>
        </div>
      </div>
    </div>
  );
};
