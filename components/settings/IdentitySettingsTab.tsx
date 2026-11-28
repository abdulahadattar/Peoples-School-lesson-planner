import React, { useEffect, useState } from 'react';
import {
  Building2,
  UserCheck,
  Image as ImageIcon,
  PenTool,
  Upload,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { DEFAULT_SCHOOL_CONFIG, SchoolConfig } from '../../services/schoolConfigService';

export interface IdentitySettingsTabProps {
  workingConfig: SchoolConfig;
  setWorkingConfig: React.Dispatch<React.SetStateAction<SchoolConfig>>;
}

interface MediaAssetFieldProps {
  id: string;
  label: string;
  helperText: string;
  value: string;
  defaultValue: string;
  onChange: (nextUrl: string) => void;
  fallbackIcon: React.ReactNode;
  isSignature?: boolean;
}

const MAX_UPLOAD_BYTES = 512 * 1024;

const MediaAssetField: React.FC<MediaAssetFieldProps> = ({
  id,
  label,
  helperText,
  value,
  defaultValue,
  onChange,
  fallbackIcon,
  isSignature = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setImgFailed(false);
  }, [value]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose a PNG, JPG, SVG, or WebP image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image must be 512 KB or smaller so settings sync reliably.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadError(null);
        setImgFailed(false);
        onChange(reader.result);
      }
    };
    reader.onerror = () => {
      setUploadError('Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="py-4 first:pt-0 last:pb-0 space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
        <div>
          <label htmlFor={id} className="block text-xs font-semibold text-brand-text-primary">
            {label}
          </label>
          <p className="text-[11px] text-brand-text-secondary mt-0.5">{helperText}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] sm:min-h-[34px] rounded-lg text-xs font-semibold bg-brand-panel hover:bg-brand-border/60 text-brand-text-primary border border-brand-border transition-colors cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileSelect}
              className="sr-only"
              aria-label={`Upload ${label}`}
            />
          </label>

          {value !== defaultValue && (
            <button
              type="button"
              onClick={() => {
                setUploadError(null);
                onChange(defaultValue);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[40px] sm:min-h-[34px] rounded-lg text-xs font-medium text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-panel border border-brand-border transition-colors cursor-pointer whitespace-nowrap"
              aria-label={`Restore default ${label}`}
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Default</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`shrink-0 rounded-xl border border-brand-border bg-white flex items-center justify-center overflow-hidden p-1.5 ${
            isSignature ? 'w-24 h-12' : 'w-12 h-12'
          }`}
        >
          {value && !imgFailed ? (
            <img
              src={value}
              alt={label}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-slate-400 flex items-center justify-center">{fallbackIcon}</div>
          )}
        </div>

        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            setUploadError(null);
            onChange(e.target.value);
          }}
          placeholder={defaultValue}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs font-medium bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
        />
      </div>

      {uploadError && (
        <p role="alert" className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
          {uploadError}
        </p>
      )}
    </div>
  );
};

export const IdentitySettingsTab: React.FC<IdentitySettingsTabProps> = ({
  workingConfig,
  setWorkingConfig,
}) => {
  const [previewLogoErr, setPreviewLogoErr] = useState(false);
  const [previewAffilErr, setPreviewAffilErr] = useState(false);
  const [previewSigErr, setPreviewSigErr] = useState(false);

  const schoolLogo = workingConfig.schoolLogoUrl || DEFAULT_SCHOOL_CONFIG.schoolLogoUrl || '/logos/phssj.png';
  const affiliationLogo =
    workingConfig.affiliationLogoUrl || DEFAULT_SCHOOL_CONFIG.affiliationLogoUrl || '/logos/ziauddin-university.png';
  const principalSig =
    workingConfig.principalSignatureUrl ||
    DEFAULT_SCHOOL_CONFIG.principalSignatureUrl ||
    '/logos/principal-signature.png';

  useEffect(() => setPreviewLogoErr(false), [schoolLogo]);
  useEffect(() => setPreviewAffilErr(false), [affiliationLogo]);
  useEffect(() => setPreviewSigErr(false), [principalSig]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start animate-fadeIn">
      {/* Left Column: Structured Identity & Branding Controls */}
      <div className="xl:col-span-7 space-y-4 sm:space-y-6">
        {/* Official School Details */}
        <section className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand-primary" aria-hidden="true" />
              <span>Official School Details</span>
            </h2>
            <p className="text-xs text-brand-text-secondary">
              Used across portal headers, lesson plans, exam papers, marksheets, and PDF reports.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="sm:col-span-2">
              <label
                htmlFor="school-name-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5"
              >
                Official School Name
              </label>
              <input
                id="school-name-input"
                type="text"
                value={workingConfig.schoolName}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, schoolName: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor="academic-session-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5"
              >
                Academic Session
              </label>
              <input
                id="academic-session-input"
                type="text"
                value={workingConfig.academicSession}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, academicSession: e.target.value }))}
                placeholder="e.g. 2025-2026"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-mono tabular-nums bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor="board-affiliation-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5"
              >
                Board Affiliation
              </label>
              <input
                id="board-affiliation-input"
                type="text"
                value={workingConfig.affiliation}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, affiliation: e.target.value }))}
                placeholder="Affiliated with..."
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor="campus-address-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5"
              >
                Campus Address
              </label>
              <input
                id="campus-address-input"
                type="text"
                value={workingConfig.schoolAddress || ''}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, schoolAddress: e.target.value }))}
                placeholder="University Road, Jamshoro"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor="contact-email-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5"
              >
                Administration Email
              </label>
              <input
                id="contact-email-input"
                type="email"
                value={workingConfig.contactEmail || ''}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, contactEmail: e.target.value }))}
                placeholder="admin@school.edu.pk"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </section>

        {/* Academic Leadership */}
        <section className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-brand-primary" aria-hidden="true" />
              <span>Academic Leadership</span>
            </h2>
            <p className="text-xs text-brand-text-secondary">
              Signatories and coordinators printed on result cards and official circulars.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 items-end">
            <div>
              <label
                htmlFor="principal-name-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5 whitespace-nowrap truncate"
              >
                Principal / Head
              </label>
              <input
                id="principal-name-input"
                type="text"
                value={workingConfig.principalName}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, principalName: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor="vice-principal-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5 whitespace-nowrap truncate"
              >
                Vice Principal
              </label>
              <input
                id="vice-principal-input"
                type="text"
                value={workingConfig.vicePrincipalName || ''}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, vicePrincipalName: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2.5 rounded-xl text-xs font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor="coordinator-input"
                className="block text-xs font-semibold text-brand-text-secondary mb-1.5 whitespace-nowrap truncate"
              >
                Coordinator
              </label>
              <input
                id="coordinator-input"
                type="text"
                value={workingConfig.coordinatorName || ''}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, coordinatorName: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2.5 rounded-xl text-xs font-medium bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </section>

        {/* Crests, Logos & Signature Studio */}
        <section className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-brand-primary" aria-hidden="true" />
              <span>Crests & Signature Studio</span>
            </h2>
            <p className="text-xs text-brand-text-secondary">
              Upload transparent PNG crests or enter an asset path under 512 KB.
            </p>
          </div>

          <div className="divide-y divide-brand-border">
            <MediaAssetField
              id="school-logo-input"
              label="School Crest / Logo"
              helperText="Displayed in portal header, home screen, exam headers, and result cards."
              value={workingConfig.schoolLogoUrl || ''}
              defaultValue={DEFAULT_SCHOOL_CONFIG.schoolLogoUrl || '/logos/phssj.png'}
              onChange={(nextUrl) => setWorkingConfig((prev) => ({ ...prev, schoolLogoUrl: nextUrl }))}
              fallbackIcon={<Building2 className="w-5 h-5" aria-hidden="true" />}
            />

            <MediaAssetField
              id="affiliation-logo-input"
              label="Board Affiliation Emblem"
              helperText="Displayed beside examination board affiliation text and on marksheets."
              value={workingConfig.affiliationLogoUrl || ''}
              defaultValue={DEFAULT_SCHOOL_CONFIG.affiliationLogoUrl || '/logos/ziauddin-university.png'}
              onChange={(nextUrl) => setWorkingConfig((prev) => ({ ...prev, affiliationLogoUrl: nextUrl }))}
              fallbackIcon={<FileText className="w-5 h-5" aria-hidden="true" />}
            />

            <MediaAssetField
              id="principal-signature-input"
              label="Principal Signature"
              helperText="Printed in the authorization block of official marksheets."
              value={workingConfig.principalSignatureUrl || ''}
              defaultValue={DEFAULT_SCHOOL_CONFIG.principalSignatureUrl || '/logos/principal-signature.png'}
              onChange={(nextUrl) => setWorkingConfig((prev) => ({ ...prev, principalSignatureUrl: nextUrl }))}
              fallbackIcon={<PenTool className="w-4 h-4" aria-hidden="true" />}
              isSignature
            />
          </div>
        </section>
      </div>

      {/* Right Column: Live Document & Marksheet Header Preview */}
      <aside className="xl:col-span-5 xl:sticky xl:top-6 space-y-3">
        <div className="p-4 sm:p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-brand-text-primary whitespace-nowrap">Live Letterhead Preview</h2>
            <span className="text-[11px] font-mono tabular-nums text-brand-text-tertiary whitespace-nowrap shrink-0">
              Session {workingConfig.academicSession || '2025-2026'}
            </span>
          </div>

          {/* Paper surface preview */}
          <div className="rounded-xl bg-white text-slate-900 border border-slate-200 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="w-12 h-12 shrink-0 flex items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-1">
                {!previewLogoErr ? (
                  <img
                    src={schoolLogo}
                    alt={workingConfig.schoolName || 'School crest'}
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewLogoErr(true)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Building2 className="w-5 h-5 text-slate-400" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0 flex-1 text-center">
                <p className="text-sm font-bold tracking-tight text-slate-900 leading-snug">
                  {workingConfig.schoolName || 'School Name'}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                  {workingConfig.affiliation || 'Examination Board Affiliation'}
                </p>
                {workingConfig.schoolAddress && (
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {workingConfig.schoolAddress}
                  </p>
                )}
              </div>

              <div className="w-12 h-12 shrink-0 flex items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-1">
                {!previewAffilErr ? (
                  <img
                    src={affiliationLogo}
                    alt="Board crest"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewAffilErr(true)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <FileText className="w-5 h-5 text-slate-400" aria-hidden="true" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-600 pt-1">
              <div>
                <span className="text-slate-400 block text-[10px]">Academic Session</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800">
                  {workingConfig.academicSession || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Coordinator</span>
                <span className="font-medium text-slate-800 truncate block">
                  {workingConfig.coordinatorName || '—'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-end justify-between gap-4 text-[11px]">
              <div className="text-slate-500 min-w-0 truncate">
                {workingConfig.contactEmail || 'admin@school.edu.pk'}
              </div>

              <div className="text-right shrink-0 space-y-1">
                <div className="h-9 flex items-center justify-end">
                  {!previewSigErr ? (
                    <img
                      src={principalSig}
                      alt="Principal signature"
                      referrerPolicy="no-referrer"
                      onError={() => setPreviewSigErr(true)}
                      className="max-h-9 w-auto object-contain"
                    />
                  ) : (
                    <span className="text-[10px] italic text-slate-400">Signature</span>
                  )}
                </div>
                <div className="border-t border-slate-300 pt-1">
                  <p className="font-semibold text-slate-900">
                    {workingConfig.principalName || 'Principal'}
                  </p>
                  <p className="text-[10px] text-slate-500">Principal / Head of Institution</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
