import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const versionFilePath = path.join(process.cwd(), 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));

// Update buildDate to current ISO timestamp
versionData.buildDate = new Date().toISOString();

// ---------------------------------------------------------------------------
// Branch-accurate stamping (FIX-5a): the checkout branch determines which
// environment fields the app sidebar badge renders (components/navigation/
// AppSidebar.tsx reads top-level `environment`). Derive the branch, in
// priority order:
//   1. VERCEL_GIT_COMMIT_REF  — set by Vercel builds, where `git rev-parse`
//     is unavailable (no .git in the built filesystem).
//   2. `git rev-parse --abbrev-ref HEAD` — local dev / CI with a checkout.
//   3. Fallback to the pre-existing version.json value if both fail.
// Mapping uses version.json's own `branches` table (single source of truth):
//   alpha:   → testing       / phssjamshoroportalalpha.vercel.app
//   testing: → partial-public / phssjamshoroportalb.vercel.app
//   main:    → production    / phssjamshoroportal.vercel.app
// Only the top-level branch/environment/deployUrl/description are stamped;
// `version` and the `branches` table are never modified.
// ---------------------------------------------------------------------------
let branch = versionData.branch;
let branchSource = 'fallback';
const branchTable = versionData.branches || {};

const fromEnv = process.env.VERCEL_GIT_COMMIT_REF;
if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) {
  branch = fromEnv.trim();
  branchSource = 'VERCEL_GIT_COMMIT_REF';
} else {
  try {
    const fromGit = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (fromGit) {
      branch = fromGit;
      branchSource = 'git';
    }
  } catch {
    // git unavailable (e.g. Vercel build) — keep the existing value
  }
}

const mapped = branchTable[branch];
if (mapped) {
  versionData.branch = branch;
  versionData.environment = mapped.environment;
  versionData.deployUrl = mapped.url;
  versionData.description = mapped.description;
} else {
  // Unknown branch: keep prior fields, but still record the branch name
  versionData.branch = branch;
}

fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2));
console.log(`version.json updated (branch source: ${branchSource}): branch=${versionData.branch} environment=${versionData.environment} deployUrl=${versionData.deployUrl}`);
