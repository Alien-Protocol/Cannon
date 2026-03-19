import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getSavedToken } from './auth.js';

const CWD = process.cwd();

dotenv.config({ path: path.join(CWD, '.env') });

const DEFAULTS = {
  github: {
    token: '',
    apiVersion: '2022-11-28',
  },
  source: {
    type: 'csv',
    file: '',
    query: '',
    connectionString: '',
  },
  mode: {
    dryRun: false,
    safeMode: true,
    resumable: true,
  },
  delay: {
    mode: 'random',
    minMs: 240_000,   // 4 min
    maxMs: 480_000,   // 8 min
    fixedMs: 300_000, // 5 min
  },
  labels: {
    autoCreate: false,
    colorMap: {},
  },
  output: {
    logFile: '',
    showTable: true,
  },
  stateFile: path.join(CWD, '.cannon_state.json'),
};

export function loadConfig(overrides = {}) {
  let fileConfig = {};
  const configPath = path.join(CWD, 'cannon.config.json');

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch (e) {
      throw new Error(`cannon.config.json has invalid JSON: ${e.message}`);
    }
  }

  // Strip comment keys (_xxx) before merging
  const cleaned = stripComments(fileConfig);
  const merged = deepMerge(DEFAULTS, cleaned);

  // Token priority chain
  const token =
    overrides.token ||
    process.env.GITHUB_TOKEN ||
    getSavedToken() ||
    merged.github?.token ||
    '';

  // Programmatic overrides win over file config for simple fields
  const mode = {
    ...merged.mode,
    ...(overrides.dryRun !== undefined ? { dryRun: overrides.dryRun } : {}),
    ...(overrides.safeMode !== undefined ? { safeMode: overrides.safeMode } : {}),
    ...(overrides.resumable !== undefined ? { resumable: overrides.resumable } : {}),
  };

  // Allow old-style `delay` override object to still work
  const delay = overrides.delay
    ? { ...merged.delay, ...overrides.delay }
    : merged.delay;

  return {
    ...merged,
    github: { ...merged.github, token },
    mode,
    delay,
    stateFile: overrides.stateFile ?? merged.stateFile ?? DEFAULTS.stateFile,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Remove all keys starting with "_" (comment keys) */
function stripComments(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    out[k] = stripComments(v);
  }
  return out;
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key] ?? {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}