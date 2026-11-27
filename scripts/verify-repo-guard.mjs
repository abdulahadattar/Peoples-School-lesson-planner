#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict') || process.env.VERCEL === '1' || process.env.GITHUB_ACTIONS === 'true';

const CANONICAL_FIREBASE = {
  projectId: 'phssjportal',
  authDomain: 'phssjportal.firebaseapp.com',
  storageBucket: 'phssjportal.firebasestorage.app',
  oAuthClientId: '752785162701-igum5tv22cv45k4afbh2an3unkul5b0s.apps.googleusercontent.com',
};

const FORBIDDEN_PATHS = [
  /^\.env($|\.(?!example$).+)/i,
  /^metadata-\d+\.json$/i,
  /^data\/autonoma\//i,
  /^data\/student_documents\//i,
  /^public\/assets\/aistudio\//i,
  /^test-artifacts\//i,
];

const SECRET_PATTERNS = [
  { label: 'GitHub classic PAT', re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { label: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{80,}-----END [A-Z ]*PRIVATE KEY-----/ },
];

const errors = [];
const warnings = [];

function readJson(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing required file: ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    errors.push(`Invalid JSON in ${relPath}: ${err.message}`);
    return null;
  }
}

const fb = readJson('firebase-applet-config.json');
if (fb) {
  const raw = JSON.stringify(fb);
  if (/gen-lang-client-|remixed-project-id|ai-studio-remix/i.test(raw)) {
    const msg =
      'firebase-applet-config.json contains an AI Studio remix/placeholder config instead of canonical "phssjportal". Keep GitHub\'s original firebase-applet-config.json!';
    if (STRICT) errors.push(msg);
    else warnings.push(msg);
  }
  for (const [key, expected] of Object.entries(CANONICAL_FIREBASE)) {
    if (fb[key] !== expected) {
      const msg = `firebase-applet-config.json mismatch on "${key}": got "${fb[key]}", expected "${expected}".`;
      if (STRICT) errors.push(msg);
      else warnings.push(msg);
    }
  }
}

const meta = readJson('metadata.json');
if (meta) {
  if (typeof meta.name === 'string' && /^remix\b/i.test(meta.name.trim())) {
    const msg = `metadata.json has AI Studio remix name "${meta.name}". Restore the canonical project metadata.json before pushing.`;
    if (STRICT) errors.push(msg);
    else warnings.push(msg);
  }
}

function getTrackedFiles() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) return null;
  try {
    return execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return null;
  }
}

const trackedFiles = getTrackedFiles();
if (trackedFiles) {
  for (const file of trackedFiles) {
    if (FORBIDDEN_PATHS.some((re) => re.test(file))) {
      errors.push(`Forbidden runtime/remix file tracked in git: ${file}`);
    }
  }
  for (const file of trackedFiles) {
    if (file === 'scripts/verify-repo-guard.mjs') continue;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|env|txt|rules)$/i.test(file)) continue;
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.size > 1024 * 1024) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const { label, re } of SECRET_PATTERNS) {
      if (re.test(content)) {
        errors.push(`Potential ${label} detected in tracked file: ${file}`);
      }
    }
  }
}

for (const w of warnings) {
  console.warn(`[repo-guard:warn] ${w}`);
}

if (errors.length > 0) {
  console.error('\n[repo-guard] BLOCKED — fix the issues below before deploying or pushing:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`[repo-guard] OK (${STRICT ? 'strict' : 'local'} mode).`);
