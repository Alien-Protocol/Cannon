/**
 * config.js — secure configuration loader
 *
 * Token resolution priority (highest → lowest):
 *   1. Explicit option:  new IssueCannon({ token: '...' })
 *   2. Env var:          GITHUB_TOKEN=ghp_xxx
 *   3. .env file:        GITHUB_TOKEN=ghp_xxx
 *   4. OAuth token:      ~/.cannon/credentials.json  ← cannon auth login
 *   5. Config file:      cannon.config.json → github.token
 *
 * ⚠️  NEVER commit your token to git.
 */

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
  delay: {
    minMs: 60_000,   // 1 min
    maxMs: 300_000,  // 5 min
    mode: 'random',
    fixedMs: 300_000,
  },
  dryRun: false,
  resumable: true,
  stateFile: path.join(CWD, '.cannon_state.json'),
};

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

  // Token resolution: explicit → env var → .env → OAuth → config file
  const token =
    overrides.token ||   // 1. passed directly in code
    process.env.GITHUB_TOKEN || // 2. shell env var or .env file (loaded above)
    getSavedToken() ||   // 3. ~/.cannon/credentials.json (cannon auth login)
    merged.github?.token ||   // 4. cannon.config.json
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