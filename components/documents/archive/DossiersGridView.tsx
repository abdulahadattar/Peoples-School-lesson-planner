import React from 'react';
import { StudentDossier, StudentDocumentRecord } from '../../../types/documentArchive';
import { DossierCard } from '../DossierCard';

export interface DossiersGridViewProps {
  dossiers: StudentDossier[];
  onPreviewDoc: (doc: StudentDocumentRecord) => void;
  onOpenStudentModal: (grNo: string) => void;
}

export const DossiersGridView: React.FC<DossiersGridViewProps> = ({
  dossiers,
  onPreviewDoc,
  onOpenStudentModal,
}) => {
  if (dossiers.length === 0) {
    return (
      <div className="p-12 text-center text-xs text-brand-text-secondary bg-white dark:bg-brand-surface rounded-2xl border border-brand-border">
        No student dossiers match your search or filter.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {dossiers.map((dossier) => (
        <DossierCard
          key={dossier.grNo}
          dossier={dossier}
          onPreviewDoc={onPreviewDoc}
          onOpenStudentModal={onOpenStudentModal}
        />
      ))}
    </div>
  );
};
