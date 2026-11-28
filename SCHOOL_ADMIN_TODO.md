# School Administration Overhaul — Master TODO (`PHSSJPortal` / `alpha`)

## Core Engineering & Quality Rules
- Execute one complete Milestone per turn thoroughly without stubbing features or leaving half-wired UI.
- Update affected tests, add unit tests for new logic/state/permissions, update project `.md` docs, and pass `npm run guard`, `npm run lint`, `npm run test:unit`, `npm run test:unit:sheets`, and `npm run build` before checking off `[x]` items.
- Follow PHSSJ UI copy rules: zero developer/AI jargon, concise 1–4 word titles, plain school vocabulary, and clean error messages via `toUserErrorMessage`.

---

### Milestone 1: Single Source of Truth (Eliminate All Config Redundancies)
- [x] **1.1 Unify School Identity & Metadata:** Consolidate `services/schoolConfig/defaults.ts`, `useSchoolSettingsState.ts`, and `useSchoolConfig.ts` into one canonical `SchoolConfig` state (`useSchoolConfig`). Use `defaults.ts` strictly as an initial seed when no saved config exists so live Admin edits (school name, board affiliation e.g. Ziauddin University, academic session year, principal/head signature details, branding logos) propagate everywhere without dual sources of truth.
- [x] **1.2 Unify Master Timetable & Bell Schedules:** Consolidate `/data/timetable.json` (`services/timetable.ts`) and `customTimetable` inside `SchoolConfig`. Use `/data/timetable.json` strictly as an initial baseline seed; ensure all schedule views, exports, and auditors read exclusively from the unified `SchoolConfig` timetable state.
- [x] **1.3 Unify Faculty Roster:** Consolidate `/data/teachers.json` and `schoolConfig.teachers` into one canonical faculty list in `SchoolConfig` (using `/data/teachers.json` only for initial seeding).
- [x] **1.4 Unify Classroom & Section Structure:** Deduplicate grade levels, section identifiers, room allocations, student capacities, and class advisor designations across all portal views into one unified schema inside `SchoolConfig`.
- [x] **1.5 Milestone 1 Verification, Tests & Docs:** Update outdated config/timetable unit tests, add tests verifying single-source-of-truth propagation (no stale JSON override after Admin edits), update architecture/state docs, and pass `npm run lint && npm run test:unit && npm run build`.

---

### Milestone 2: Unified, Hierarchical School Admin UI Redesign (`SchoolSettingsView`)
- [x] **2.1 Redesign Admin Shell & Navigation Hierarchy:** Rebuild `SchoolSettingsView` with 3-pillar grouped navigation (**Institution & Academics**, **Schedule & Operations**, **Integrations & Governance**), clean left-rail desktop navigation, responsive mobile drawer/segmented tabs, generous spacing, and a sticky/contextual Save & Reset bar for unsaved changes.
- [x] **2.2 Institution Identity, Logos & Signature Studio:** Redesign `IdentitySettingsTab` with official school details, principal/vice-principal/coordinator fields, branding logos & principal signature configuration, and a compact live letterhead/marksheet header preview.
- [x] **2.3 Classrooms, Sections & Faculty Roster Workspace:** Upgrade `ClassesSettingsTab` and `TeachersSettingsTab` with clean capacity/room/advisor overview, section editor, and an uncluttered **Extended Faculty Profiles — Coming Soon** placeholder card in the Faculty Roster.
- [x] **2.4 Master Timetable, Bell Schedules & Clash Auditor:** Unify period bell timings (`PeriodsSettingsTab`), timetable grid editor (`TimetableEditorTab`), and elevate `TimetableAuditorView` cleanly inside **Schedule & Operations**.
- [x] **2.5 System Safeguards, Data Lifecycle & Milestone 2 Verification:** Polish `SafeguardsSettingsTab` (clean school vocabulary, zero technical jargon), verify layout in real browser (`playwright-cli` desktop + mobile), add/update unit tests and `.md` docs, and pass `npm run lint && npm run test:unit && npm run build`.

---

### Milestone 3: Operational Integration & Role Governance (Substitutions & Ground Duties)
- [ ] **3.1 Link Substitutions & Break/Leave Duties into School Admin & Live Monitor:** Connect `SubstitutionManager.tsx` and `BreakDutiesPanel.tsx` cleanly with `SchoolConfig` (so break/leave duty rosters and substitution views reflect canonical teachers, periods, and duty rules) and expose operational governance summaries in **Schedule & Operations**.
- [ ] **3.2 Strict Admin vs. Teacher Role Governance & WhatsApp Notice Lock:** Enforce Admin-only guards on leave marking, proxy assignment/removal, ground duty roster edits, and WhatsApp notice copy/dispatch locks when restricted, with clear read-only teacher views and logic-level enforcement (not just disabled buttons).
- [ ] **3.3 Milestone 3 Verification, Tests & Docs:** Add deterministic unit tests for role-based substitution/duty permissions and WhatsApp notice locks, verify in browser, update docs, and pass `npm run lint && npm run test:unit && npm run build`.

---

### Milestone 4: New Admin Settings Modules (Calendar, Substitution Policy, Sheets Sync Center & RBAC)
- [ ] **4.1 Academic Term & School Calendar Module:** Add academic term dates, working days, holidays, and exam cycle settings into `SchoolConfig` and **Institution & Academics**, propagating cleanly to Attendance/Marksheets where applicable.
- [ ] **4.2 Smart Substitution & Leave Policy Rules Module:** Add configurable proxy equity limits, same-subject preference weights, and daily/weekly leave governance rules in **Schedule & Operations**.
- [ ] **4.3 Google Workspace & Sheets Sync Center (With Admin "Sync Now"):** Centralize Google Sheet links, edit-lock messaging, attendance/marksheet/timetable sync status, and an Admin **"Sync Now"** action that bypasses standard 12h teacher pull throttling inside **Integrations & Governance**.
- [ ] **4.4 Role-Based Access, PIN & Security Policies + Milestone 4 Verification:** Add configurable role permissions/PIN/audit policy controls in **Integrations & Governance**, add unit tests covering all 4 new modules, verify in browser, update docs, and pass `npm run lint && npm run test:unit && npm run build`.

---

### Milestone 5: Final End-to-End Audit, Documentation Sync & Clean Handoff
- [ ] **5.1 End-to-End Cross-Module Smoke & Visual Audit:** Verify live propagation from School Admin across Home, Header/Sidebar, Lesson Plans, Exam Papers & OMR, Marksheets, Daily Attendance, Live Monitor, Substitutions, Break Duties, and Exports on desktop and mobile viewports.
- [ ] **5.2 Dead Code, Unused Exports & Jargon Sweep:** Run `npm run audit:wiring`, `npm run test:coverage`, and full UI copy audit to remove orphan helpers and ensure zero technical jargon across user-facing labels.
- [ ] **5.3 Final Verification & Documentation Lock:** Synchronize all `.md` documentation (`README.md`, `AGENT_MEMORY.md`, `PROJECT_STRUCTURE.md`, `TECH_STACK.md`, `docs/*`), run `npm run guard && npm run lint && npm run test:unit && npm run test:unit:sheets && node --import tsx scripts/test-cross-module-sync.mjs && npm run build`, and tick final completion in `SCHOOL_ADMIN_TODO.md`.
