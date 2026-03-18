import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';
import { loadIssues } from './loaders/index.js';
import { createIssue, verifyToken } from './github.js';

// ── ANSI colours (kept minimal — works everywhere) ──
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', blue: '\x1b[34m',
};
const log = {
  info:    (m) => console.log(`${c.cyan}ℹ${c.reset}  ${m}`),
  success: (m) => console.log(`${c.green}✔${c.reset}  ${m}`),
  warn:    (m) => console.log(`${c.yellow}⚠${c.reset}  ${m}`),
  error:   (m) => console.log(`${c.red}✖${c.reset}  ${m}`),
  step:    (m) => console.log(`\n${c.bold}${c.blue}${m}${c.reset}`),
  dim:     (m) => console.log(`  ${c.dim}${m}${c.reset}`),
};

export class IssueCannon {
  /**
   * @param {object} options
   * @param {string}  [options.token]    — GitHub PAT (prefer env var GITHUB_TOKEN)
   * @param {boolean} [options.dryRun]  — preview without creating
   * @param {object}  [options.delay]   — { mode, minMs, maxMs, fixedMs }
   * @param {boolean} [options.resumable]
   * @param {boolean} [options.silent]  — suppress all output
   */
  constructor(options = {}) {
    this.config = loadConfig(options);
    this.silent = options.silent ?? false;
  }

  /**
   * Load issues from a source and fire them at GitHub.
   *
   * @param {object} sourceOpts  — { source: 'csv'|'json'|'pdf'|'docx'|'postgres'|'mysql'|'sqlite'|'array', ...loaderOpts }
   * @returns {Promise<{ created: object[], failed: object[] }>}
   */
  async fire(sourceOpts = {}) {
    const { config } = this;

    if (!config.github.token) {
      log.error('No GitHub token found. Set GITHUB_TOKEN in your environment or .env file.');
      log.info('  See: https://github.com/settings/tokens/new (scope: repo)');
      throw new Error('Missing GITHUB_TOKEN');
    }

    this._log('step', '📦 Loading issues...');
    const issues = await loadIssues(sourceOpts);
    if (!issues.length) throw new Error('No issues loaded from source');
    this._log('info', `Loaded ${c.bold}${issues.length}${c.reset} issues`);

    // Summarise by repo
    const repoMap = issues.reduce((a, r) => { a[r.repo] = (a[r.repo] || 0) + 1; return a; }, {});
    for (const [repo, n] of Object.entries(repoMap)) {
      this._log('dim', `${c.blue}${repo}${c.reset}  →  ${n} issue(s)`);
    }

    // Verify token on every target repo
    this._log('step', '🔑 Verifying token access...');
    for (const repo of Object.keys(repoMap)) {
      const status = await verifyToken(repo, config.github.token);
      if (status) {
        const hint = status === 401 ? 'Token invalid/expired.' : status === 404 ? 'Repo not found or missing permissions.' : '';
        throw new Error(`Cannot access ${repo} (HTTP ${status}). ${hint}`);
      }
      this._log('success', repo);
    }

    // Resume state
    const state = config.resumable ? this._loadState() : { completed: [], failed: [] };
    const done = new Set(state.completed);
    if (done.size) this._log('warn', `Resuming — ${done.size} already created`);

    const pending = issues.filter(r => !done.has(r.title));
    if (!pending.length) {
      this._log('success', 'All issues already created!');
      return { created: [], failed: [] };
    }

    // Estimate time
    const mid = (config.delay.minMs + config.delay.maxMs) / 2;
    const estMin = Math.ceil((pending.length * (config.delay.mode === 'fixed' ? config.delay.fixedMs : mid)) / 60_000);
    this._log('info', `To create: ${c.bold}${pending.length}${c.reset}  |  Est. ~${estMin} min\n`);
    this._log('step', '🚀 Creating issues...\n');

    const results = { created: [], failed: [] };

    for (let i = 0; i < pending.length; i++) {
      const issue = pending[i];
      const priColor = issue.priority === 'HIGH' ? c.red : issue.priority === 'MED' ? c.yellow : c.green;

      if (!this.silent) {
        console.log(`${c.bold}${i + 1}/${pending.length}${c.reset} ${progressBar(i, pending.length)}`);
        console.log(`  ${c.blue}${issue.repo}${c.reset}`);
        console.log(`  ${priColor}[${issue.priority || '---'}]${c.reset} ${issue.title.slice(0, 70)}`);
      }

      try {
        const created = await createIssue(issue, config.github.token, config.dryRun);
        results.created.push({ repo: issue.repo, title: issue.title, url: created.html_url, number: created.number });
        state.completed.push(issue.title);
        if (config.resumable) this._saveState(state);
        this._log('success', `${created._dryRun ? '[DRY RUN] ' : ''}${created.html_url}`);
      } catch (err) {
        this._log('error', `${issue.title}: ${err.message}`);
        results.failed.push({ repo: issue.repo, title: issue.title, error: err.message });
        state.failed.push({ repo: issue.repo, title: issue.title, error: err.message });
        if (config.resumable) this._saveState(state);
      }

      if (i < pending.length - 1) {
        const delay = this._pickDelay();
        this._log('dim', `Waiting ${fmtDelay(delay)} before next…`);
        await countdown(Math.round(delay / 1000));
      }
    }

    // Summary
    this._printSummary(results);

    // Clean up state on full success
    if (!results.failed.length && config.resumable) {
      try { fs.unlinkSync(config.stateFile); } catch { }
    }

    return results;
  }

  // ── Private helpers ─────────────────────────
  _pickDelay() {
    const { delay } = this.config;
    if (delay.mode === 'fixed') return delay.fixedMs;
    return Math.floor(Math.random() * (delay.maxMs - delay.minMs + 1)) + delay.minMs;
  }

  _loadState() {
    try {
      if (fs.existsSync(this.config.stateFile))
        return JSON.parse(fs.readFileSync(this.config.stateFile, 'utf-8'));
    } catch { }
    return { completed: [], failed: [] };
  }

  _saveState(state) {
    fs.writeFileSync(this.config.stateFile, JSON.stringify(state, null, 2));
  }

  _log(level, msg) {
    if (!this.silent) log[level]?.(msg) ?? console.log(msg);
  }

  _printSummary(results) {
    this._log('step', '📊 Summary');
    this._log('success', `Created: ${c.bold}${results.created.length}${c.reset}`);
    if (results.failed.length) this._log('error', `Failed:  ${c.bold}${results.failed.length}${c.reset}`);
    if (results.failed.length) {
      results.failed.forEach(r => this._log('dim', `✖ [${r.repo}] ${r.title} — ${r.error}`));
    }
  }
}

// ── Utility ───────────────────────────────────
function progressBar(done, total, w = 24) {
  const f = Math.round((done / total) * w);
  return `[${c.green}${'█'.repeat(f)}${c.reset}${'░'.repeat(w - f)}] ${done}/${total}`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function countdown(seconds) {
  for (let s = seconds; s > 0; s--) {
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sc = String(s % 60).padStart(2, '0');
    process.stdout.write(`\r  ${c.dim}⏳ Next issue in ${m}:${sc}…${c.reset}`);
    await sleep(1000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

function fmtDelay(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
