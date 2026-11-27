import React from 'react';
import { Building2 } from 'lucide-react';
import { SchoolConfig } from '../../services/schoolConfigService';

export interface IdentitySettingsTabProps {
  workingConfig: SchoolConfig;
  setWorkingConfig: React.Dispatch<React.SetStateAction<SchoolConfig>>;
}

export const IdentitySettingsTab: React.FC<IdentitySettingsTabProps> = ({
  workingConfig,
  setWorkingConfig,
}) => {
  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft space-y-4 max-w-3xl animate-fadeIn">
      <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
        <Building2 className="w-4 h-4 text-brand-primary" />
        <span>School Institutional Details</span>
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
            Official School Name
          </label>
          <input
            type="text"
            value={workingConfig.schoolName}
            onChange={(e) => setWorkingConfig((prev) => ({ ...prev, schoolName: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
            Academic Session
          </label>
          <input
            type="text"
            value={workingConfig.academicSession}
            onChange={(e) => setWorkingConfig((prev) => ({ ...prev, academicSession: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
            Examination Board Affiliation
          </label>
          <input
            type="text"
            value={workingConfig.affiliation}
            onChange={(e) => setWorkingConfig((prev) => ({ ...prev, affiliation: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
            Principal / Head Name
          </label>
          <input
            type="text"
            value={workingConfig.principalName}
            onChange={(e) => setWorkingConfig((prev) => ({ ...prev, principalName: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
          />
        </div>
      </div>
    </div>
  );
};
