import React from 'react';
import {
  ADMIN_PILLARS,
  AdminPillar,
  SettingsTab,
  getPillarForTab,
} from './adminNavigation';

export interface SettingsTabsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  classesBadge: number;
  teachersBadge: number;
  timetableBadge: number;
  periodsBadge: number;
  clashesCount: number;
}

export const SettingsTabsNav: React.FC<SettingsTabsNavProps> = ({
  activeTab,
  onTabChange,
  classesBadge,
  teachersBadge,
  timetableBadge,
  periodsBadge,
  clashesCount,
}) => {
  const activePillar: AdminPillar = getPillarForTab(activeTab);

  const getCountLabel = (id: SettingsTab): { text: string; alert?: boolean } | null => {
    switch (id) {
      case 'classes':
        return { text: String(classesBadge) };
      case 'teachers':
        return { text: String(teachersBadge) };
      case 'periods':
        return { text: String(periodsBadge) };
      case 'timetable':
        return { text: String(timetableBadge) };
      case 'auditor':
        return clashesCount > 0 ? { text: String(clashesCount), alert: true } : { text: 'Clear' };
      default:
        return null;
    }
  };

  return (
    <>
      {/* Desktop Left-Rail 3-Pillar Navigation */}
      <aside
        aria-label="School Admin sections"
        className="hidden lg:flex flex-col w-60 xl:w-64 shrink-0 space-y-6 lg:sticky lg:top-6 self-start"
      >
        {ADMIN_PILLARS.map((pillar) => (
          <div key={pillar.id} className="space-y-1.5">
            <h2 className="px-3 text-xs font-semibold text-brand-text-tertiary tracking-tight">
              {pillar.label}
            </h2>

            <nav aria-label={pillar.label} className="space-y-1">
              {pillar.items.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                const countInfo = getCountLabel(item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 min-h-[40px] rounded-xl text-xs font-medium text-left transition-[color,background-color,border-color] cursor-pointer ${
                      isActive
                        ? 'bg-brand-surface text-brand-primary font-semibold border border-brand-border shadow-soft'
                        : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-panel/70 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-brand-primary' : 'text-brand-text-tertiary'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    </span>

                    {countInfo && (
                      <span
                        className={`text-[11px] font-mono tabular-nums shrink-0 ${
                          countInfo.alert
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : isActive
                            ? 'text-brand-primary font-semibold'
                            : 'text-brand-text-tertiary'
                        }`}
                      >
                        {countInfo.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>

      {/* Mobile / Tablet Responsive Pillar + Section Switcher */}
      <div className="lg:hidden w-full space-y-2.5">
        <div
          role="tablist"
          aria-label="Admin sections group"
          className="grid grid-cols-3 gap-1 p-1 w-full rounded-xl bg-brand-panel border border-brand-border"
        >
          {ADMIN_PILLARS.map((pillar) => {
            const isActivePillar = activePillar.id === pillar.id;
            return (
              <button
                key={pillar.id}
                type="button"
                role="tab"
                aria-selected={isActivePillar}
                onClick={() => {
                  if (!isActivePillar) {
                    onTabChange(pillar.items[0].id);
                  }
                }}
                className={`min-w-0 px-1.5 sm:px-2 py-2 min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer truncate whitespace-nowrap text-center ${
                  isActivePillar
                    ? 'bg-brand-surface text-brand-text-primary shadow-soft'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                {pillar.shortLabel}
              </button>
            );
          })}
        </div>

        <nav
          aria-label={activePillar.label}
          className="flex flex-wrap items-center gap-2"
        >
          {activePillar.items.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            const countInfo = getCountLabel(item.id);

            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onTabChange(item.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-brand-primary text-white border-brand-primary shadow-soft'
                    : 'bg-brand-surface text-brand-text-secondary border-brand-border hover:text-brand-text-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
                {countInfo && (
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      isActive
                        ? 'text-white/90'
                        : countInfo.alert
                        ? 'text-rose-600 dark:text-rose-400 font-bold'
                        : 'text-brand-text-tertiary'
                    }`}
                  >
                    {countInfo.text}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
};
