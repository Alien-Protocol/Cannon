/**
 * config.js — secure configuration loader
 *
 * Token resolution priority (highest → lowest):
 *   1. Explicit option passed in code: new IssueCannon({ token: '...' })
 *   2. Environment variable:  GITHUB_TOKEN=ghp_xxx
 *   3. .env file in CWD:      GITHUB_TOKEN=ghp_xxx
 *   4. cannon.config.json     { "github": { "token": "ghp_xxx" } }
 *
 * ⚠️  NEVER commit your token to git. Add .env and cannon.config.json to .gitignore.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const CWD = process.cwd();

// Load .env from the project calling us (not this package)
dotenv.config({ path: path.join(CWD, '.env') });

/** Default config — can be overridden by cannon.config.json */
const DEFAULTS = {
  github: {
    token: '',           // always prefer env var
    apiVersion: '2022-11-28',
  },
  delay: {
    minMs: 240_000,      // 4 min
    maxMs: 480_000,      // 8 min
    mode: 'random',      // 'random' | 'fixed'
    fixedMs: 300_000,    // used when mode === 'fixed'
  },
  dryRun: false,
  resumable: true,       // save progress to .cannon_state.json
  stateFile: path.join(CWD, '.cannon_state.json'),
};

/**
 * Merge cannon.config.json (if present) over defaults,
 * then apply any run-time overrides passed directly.
 *
 * @param {object} overrides  — keys from IssueCannon constructor
 * @returns {object}          — final merged config
 */
export function loadConfig(overrides = {}) {
  let fileConfig = {};
  const configPath = path.join(CWD, 'cannon.config.json');

  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      throw new Error(`cannon.config.json is invalid JSON: ${e.message}`);
    }
  }

  const merged = deepMerge(DEFAULTS, fileConfig);

  // Token: explicit override → env var → config file
  const token =
    overrides.token ||
    process.env.GITHUB_TOKEN ||
    merged.github?.token ||
    '';

  return {
    ...merged,
    github: { ...merged.github, token },
    delay: overrides.delay ? { ...merged.delay, ...overrides.delay } : merged.delay,
    dryRun: overrides.dryRun ?? merged.dryRun,
    resumable: overrides.resumable ?? merged.resumable,
    stateFile: overrides.stateFile ?? merged.stateFile,
  };
}

// ── Helpers ───────────────────────────────────
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
