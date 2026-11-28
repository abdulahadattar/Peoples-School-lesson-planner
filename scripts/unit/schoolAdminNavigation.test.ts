import { DEFAULT_SCHOOL_CONFIG } from '../../services/schoolConfig/defaults';
import {
  ADMIN_PILLARS,
  getAllAdminNavItems,
  getPillarForTab,
  getTabMeta,
  hasUnsavedConfigChanges,
  buildSchoolConfigBackupPayload,
  parseSchoolConfigBackup,
} from '../../components/settings/adminNavigation';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runSchoolAdminNavigationTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('schoolAdmin.adminNavigation (Milestone 2)');

  it('organizes all admin workspaces across 3 pillars cleanly without duplicate tab ids', () => {
    eq(ADMIN_PILLARS.map((p) => p.id), ['institution', 'schedule', 'governance']);
    const items = getAllAdminNavItems();
    const ids = items.map((i) => i.id);
    eq(new Set(ids).size, ids.length, 'nav ids must be unique');
    eq(ids, ['identity', 'classes', 'teachers', 'periods', 'timetable', 'auditor', 'safeguards']);
    eq(getPillarForTab('auditor').id, 'schedule');
    eq(getPillarForTab('identity').id, 'institution');
    eq(getPillarForTab('safeguards').id, 'governance');
    eq(getTabMeta('auditor').label, 'Conflict Auditor');
  });

  it('detects unsaved edits while ignoring metadata-only updatedAt/updatedBy changes', () => {
    const base = { ...DEFAULT_SCHOOL_CONFIG, updatedAt: 1000, updatedBy: 'Admin A' };
    const metadataOnly = { ...DEFAULT_SCHOOL_CONFIG, updatedAt: 2000, updatedBy: 'Admin B' };
    eq(hasUnsavedConfigChanges(metadataOnly, base), false);

    const edited = { ...base, principalName: 'Dr. Hina Siddiqui' };
    eq(hasUnsavedConfigChanges(edited, base), true);
  });

  it('round-trips and validates school settings backup JSON payloads cleanly', () => {
    const customized = {
      ...DEFAULT_SCHOOL_CONFIG,
      schoolName: 'PHSSJ Model Campus',
      academicSession: '2026-2027',
      sheetEditingEnabled: false,
    };
    const json = buildSchoolConfigBackupPayload(customized);
    const parsed = parseSchoolConfigBackup(json);
    eq(parsed.ok, true);
    if (parsed.ok) {
      eq(parsed.config.schoolName, 'PHSSJ Model Campus');
      eq(parsed.config.academicSession, '2026-2027');
      eq(parsed.config.sheetEditingEnabled, false);
      eq(parsed.config.classes.length, DEFAULT_SCHOOL_CONFIG.classes.length);
    }

    const emptyRes = parseSchoolConfigBackup('   ');
    eq(emptyRes.ok, false);
    const invalidJson = parseSchoolConfigBackup('{bad json');
    eq(invalidJson.ok, false);
    const unrelatedJson = parseSchoolConfigBackup('{"hello": "world"}');
    eq(unrelatedJson.ok, false);
  });
}
