
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SLO, GroupedSlos, UnitsByGrade } from '../types';
import { ChevronRightIcon, SearchIcon, WarningIcon } from './icons/MiscIcons';
import { FileIcon } from './icons/FileIcon';

interface SloPanelProps {
  unitsByGrade: UnitsByGrade;
  selectedSloUniqueIds: string[];
  setSelectedSloUniqueIds: React.Dispatch<React.SetStateAction<string[]>>;
  isParsing: boolean;
  onClearSelection: () => void;
  missingPdfSloIds: string[];
}

const getGradeSloColorClasses = (grade?: string): string => {
  if (!grade) return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  const gradeNum = parseInt(grade.replace('Grade ', ''), 10);
  switch (gradeNum) {
    case 9:
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200';
    case 10:
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200';
    case 11:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200';
    case 12:
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200';
  }
};

// Modernized Unit Accordion with card style
const UnitAccordion: React.FC<{ 
    unitName: string; 
    slos: SLO[]; 
    selectedSloUniqueIds: string[];
    onUnitToggle: (slos: SLO[]) => void;
    onSloToggle: (id: string) => void;
    missingPdfSloIds: string[];
}> = ({ unitName, slos, selectedSloUniqueIds, onUnitToggle, onSloToggle, missingPdfSloIds }) => {
    const [isOpen, setIsOpen] = useState(true);
    
    // Derived state
    const selectedCount = slos.filter(slo => selectedSloUniqueIds.includes(slo.uniqueId!)).length;
    const isAllSelected = selectedCount === slos.length && slos.length > 0;
    const isIndeterminate = selectedCount > 0 && selectedCount < slos.length;
    
    const checkboxRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = isIndeterminate;
        }
    }, [isIndeterminate]);

    return (
        <div className="mb-4 bg-brand-surface rounded-xl border border-brand-border overflow-hidden transition-all duration-200">
            <div 
                className={`p-4 flex items-center gap-4 cursor-pointer transition-colors ${isOpen ? 'bg-brand-bg/50' : 'hover:bg-brand-bg/50'}`}
                onClick={(e) => {
                    if ((e.target as HTMLElement).tagName !== 'INPUT') {
                         setIsOpen(!isOpen);
                    }
                }}
            >
                 <input 
                    type="checkbox"
                    ref={checkboxRef}
                    checked={isAllSelected}
                    onChange={() => onUnitToggle(slos)}
                    className="form-checkbox h-5 w-5 text-brand-primary rounded focus:ring-brand-primary/50 bg-brand-bg border-brand-border"
                    aria-label={`Select all SLOs in ${unitName}`}
                />
                <div className="flex-grow flex items-center justify-between gap-4 min-w-0">
                    <h4 className="font-semibold text-brand-text-primary text-sm md:text-base truncate" title={unitName}>{unitName}</h4>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs font-medium px-2 py-1 bg-brand-bg rounded-full text-brand-text-secondary">
                            {selectedCount}/{slos.length}
                        </span>
                        <ChevronRightIcon className={`w-5 h-5 text-brand-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                    </div>
                </div>
            </div>

            {isOpen && (
                <div className="border-t border-brand-border bg-brand-surface p-2">
                    {slos.map(slo => (
                        <div key={slo.uniqueId} className="flex items-start gap-3 p-3 hover:bg-brand-bg/30 rounded-xl transition-colors group">
                            <input
                                type="checkbox"
                                checked={selectedSloUniqueIds.includes(slo.uniqueId!)}
                                onChange={() => onSloToggle(slo.uniqueId!)}
                                className="mt-1 form-checkbox h-4 w-4 text-brand-primary rounded focus:ring-brand-primary/50 bg-brand-bg border-brand-border"
                            />
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${getGradeSloColorClasses(slo.grade)}`}>
                                        {slo.SLO_ID}
                                    </span>
                                     {missingPdfSloIds.includes(slo.uniqueId!) && (
                                        <div title="Context PDF file is missing for this SLO's unit." className="text-amber-500">
                                            <WarningIcon className="w-4 h-4" />
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-brand-text-secondary group-hover:text-brand-text-primary transition-colors leading-relaxed">
                                    {slo.SLO_Text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const SloPanel: React.FC<SloPanelProps> = ({ unitsByGrade, selectedSloUniqueIds, setSelectedSloUniqueIds, isParsing, onClearSelection, missingPdfSloIds }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUnitsByGrade = useMemo(() => {
    if (!searchQuery.trim()) {
      return unitsByGrade;
    }
    const lowerCaseQuery = searchQuery.toLowerCase().trim();
    const filterSlos = (slos: SLO[]) => slos.filter(slo =>
      slo.SLO_ID.toLowerCase().includes(lowerCaseQuery) ||
      slo.SLO_Text.toLowerCase().includes(lowerCaseQuery)
    );

    const filterGrade = (gradeUnits: GroupedSlos): GroupedSlos => {
      return Object.entries(gradeUnits).reduce<GroupedSlos>((acc, [unitName, slos]) => {
        const filtered = filterSlos(slos);
        if (filtered.length > 0) {
          acc[unitName] = filtered;
        }
        return acc;
      }, {} as GroupedSlos);
    };

    return Object.entries(unitsByGrade).reduce<UnitsByGrade>((acc, [grade, units]) => {
      const filteredUnits = filterGrade(units as GroupedSlos);
      if (Object.keys(filteredUnits).length > 0) {
        acc[grade] = filteredUnits;
      }
      return acc;
    }, {} as UnitsByGrade);
  }, [unitsByGrade, searchQuery]);


  const handleSelectionToggle = (slosToToggle: SLO[], currentlySelectedIds: string[]) => {
    const idsToToggle = slosToToggle.map(slo => slo.uniqueId!);
    const allCurrentlySelected = idsToToggle.every(id => currentlySelectedIds.includes(id));
    
    if (allCurrentlySelected) {
      return currentlySelectedIds.filter(id => !idsToToggle.includes(id));
    } else {
      return [...new Set([...currentlySelectedIds, ...idsToToggle])];
    }
  };

  const handleSloSelection = (uniqueId: string) => {
    setSelectedSloUniqueIds(prev =>
      prev.includes(uniqueId)
        ? prev.filter(id => id !== uniqueId)
        : [...prev, uniqueId]
    );
  };
  
  const handleUnitSelection = (slosInUnit: SLO[]) => {
    setSelectedSloUniqueIds(prev => handleSelectionToggle(slosInUnit, prev));
  };

  if (isParsing) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-brand-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-brand-text-secondary font-medium">Loading curriculum...</p>
        </div>
      </div>
    );
  }

  const hasSlos = Object.keys(unitsByGrade).length > 0;
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 md:px-6 pt-6 pb-4 bg-brand-surface border-b border-brand-border z-10">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-bold text-brand-text-primary tracking-tight">Curriculum</h2>
            <p className="text-sm text-brand-text-secondary mt-1">Select outcomes to plan lessons for</p>
          </div>
          {selectedSloUniqueIds.length > 0 && (
            <button
              onClick={onClearSelection}
              className="text-sm font-semibold text-brand-primary hover:text-brand-primary-hover transition-colors"
            >
              Clear ({selectedSloUniqueIds.length})
            </button>
          )}
        </div>
        {hasSlos && (
             <div className="relative">
                <input
                    type="text"
                    placeholder="Search topics or IDs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full pl-10 pr-4 py-2.5 bg-brand-bg border border-brand-border rounded-xl focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none text-sm text-brand-text-primary transition-all"
                />
                <SearchIcon className="absolute left-3 top-3 w-4 h-4 text-brand-text-secondary" />
             </div>
        )}
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar px-4 md:px-6 py-6 pb-32 space-y-8">
        {hasSlos ? (
            Object.entries(filteredUnitsByGrade)
            .sort(([gradeA], [gradeB]) => parseInt(gradeA.replace('Grade ', '')) - parseInt(gradeB.replace('Grade ', '')))
            .map(([grade, units]) => (
                 <div key={grade} className="">
                      <div className="flex items-center gap-3 mb-4 ml-1">
                        <div className="h-px flex-1 bg-brand-border"></div>
                        <h3 className="font-semibold text-lg text-brand-text-secondary uppercase tracking-wider">{grade}</h3>
                        <div className="h-px flex-1 bg-brand-border"></div>
                     </div>
                     
                     <div className="space-y-4">
                      {Object.entries(units)
                          .sort(([unitNameA], [unitNameB]) => {
                              const numA = parseInt(unitNameA.match(/\d+/)?.[0] || '0');
                              const numB = parseInt(unitNameB.match(/\d+/)?.[0] || '0');
                              return numA - numB;
                          })
                          .map(([unitName, slos]) => (
                             <UnitAccordion
                                key={unitName}
                                unitName={unitName}
                                slos={slos}
                                selectedSloUniqueIds={selectedSloUniqueIds}
                                onUnitToggle={handleUnitSelection}
                                onSloToggle={handleSloSelection}
                                missingPdfSloIds={missingPdfSloIds}
                             />
                          ))
                      }
                     </div>
                </div>
            ))
        ) : (
          <div className="text-center py-20">
            <div className="bg-brand-bg w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                 <FileIcon className="w-8 h-8 text-brand-text-tertiary" />
            </div>
            <h3 className="font-semibold text-brand-text-primary text-lg">No SLOs Loaded</h3>
            <p className="text-brand-text-secondary mt-2">Could not load curriculum files.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SloPanel;
