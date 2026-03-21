import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';
import { loadIssues } from './loaders/index.js';
import { createIssue, updateIssue, verifyToken, ensureLabel } from './github.js';

// ── ANSI colours ──────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

const log = {
  info: (m) => console.log(`${c.cyan}ℹ${c.reset}  ${m}`),
  success: (m) => console.log(`${c.green}✔${c.reset}  ${m}`),
  warn: (m) => console.log(`${c.yellow}⚠${c.reset}  ${m}`),
  error: (m) => console.log(`${c.red}✖${c.reset}  ${m}`),
  step: (m) => console.log(`\n${c.bold}${c.blue}${m}${c.reset}`),
  dim: (m) => console.log(`  ${c.dim}${m}${c.reset}`),
};

export class IssueCannon {
  /**
   * @param {object} options  — programmatic overrides (all optional)
   * @param {string}  [options.token]
   * @param {boolean} [options.dryRun]
   * @param {boolean} [options.safeMode]   — true = random delays (default)
   * @param {boolean} [options.resumable]
   * @param {object}  [options.delay]      — { mode, minMs, maxMs, fixedMs }
   * @param {boolean} [options.silent]     — suppress all console output
   */
  constructor(options = {}) {
    this.config = loadConfig(options);
    this.silent = options.silent ?? false;
  }

  async fire(sourceOpts = {}) {
    const { config } = this;

    // ── Auth check ────────────────────────────────────────────────
    if (!config.github.token) {
      log.error('No GitHub token found. To authenticate:\n');
      log.info(`  ${c.bold}Option A — OAuth login (recommended, no token needed):${c.reset}`);
      log.info(`    cannon auth login\n`);
      log.info(`  ${c.bold}Option B — Personal Access Token:${c.reset}`);
      log.info(`    echo "GITHUB_TOKEN=ghp_xxx" > .env`);
      log.info(`    Create token: https://github.com/settings/tokens/new`);
      log.info(`    Required scopes: repo  (or public_repo for public repos only)\n`);
      throw new Error('Missing GitHub token');
    }

    // ── Resolve source from config if not passed programmatically ─
    const effectiveSource = {
      source: config.source?.type,
      file: config.source?.file,
      query: config.source?.query,
      connectionString: config.source?.connectionString,
      ...sourceOpts,
    };

    // ── Mode banner ───────────────────────────────────────────────
    if (config.mode.dryRun) {
      this._log('warn', `${c.yellow}${c.bold}DRY RUN MODE${c.reset} — no issues will be created or updated`);
    }
    if (!config.mode.safeMode && !config.mode.dryRun) {
      this._log(
        'warn',
        `${c.red}${c.bold}UNSAFE MODE${c.reset} — issues will fire with NO delays (risk of GitHub spam flag)`
      );
    }

    // ── Load issues ───────────────────────────────────────────────
    this._log('step', '📦 Loading issues…');
    const issues = await loadIssues(effectiveSource);
    if (!issues.length) throw new Error('No issues loaded from source');

    // Count creates vs updates
    const createCount = issues.filter((r) => (r.action || 'create') === 'create').length;
    const updateCount = issues.filter((r) => r.action === 'update').length;

    this._log(
      'info',
      `Loaded ${c.bold}${issues.length}${c.reset} row(s) from ${c.cyan}${effectiveSource.source}${c.reset}` +
      `  (${c.green}${createCount} create${c.reset}, ${c.yellow}${updateCount} update${c.reset})`
    );

    const repoMap = issues.reduce((a, r) => {
      a[r.repo] = (a[r.repo] || 0) + 1;
      return a;
    }, {});
    for (const [repo, n] of Object.entries(repoMap)) {
      this._log('dim', `${c.blue}${repo}${c.reset}  →  ${n} issue(s)`);
    }

    // ── Verify token access per repo ──────────────────────────────
    this._log('step', '🔑 Verifying GitHub access…');
    const badRepos = new Set();
    const goodRepos = new Set();

    for (const repo of Object.keys(repoMap)) {
      const status = await verifyToken(repo, config.github.token);
      if (status) {
        const reason =
          status === 401
            ? 'token invalid or expired'
            : status === 403
              ? 'token lacks required scope (need: repo)'
              : status === 404
                ? 'repo not found or no permission'
                : `HTTP ${status}`;
        log.warn(`Skipping ${c.blue}${repo}${c.reset}  ${c.dim}(${reason})${c.reset}`);
        badRepos.add(repo);
      } else {
        this._log('success', repo);
        goodRepos.add(repo);
      }
    }

    if (goodRepos.size === 0) {
      log.error('No accessible repos. Check repo names and token permissions.');
      log.info(`Run: ${c.bold}cannon auth login${c.reset}  or set GITHUB_TOKEN in .env`);
      throw new Error('No accessible repos');
    }

    // ── Auto-create labels if configured ──────────────────────────
    if (config.labels?.autoCreate && Object.keys(config.labels?.colorMap || {}).length) {
      this._log('step', '🏷  Auto-creating labels…');
      for (const repo of goodRepos) {
        for (const [label, color] of Object.entries(config.labels.colorMap)) {
          await ensureLabel(repo, label, color, config.github.token);
        }
      }
    }

    // ── Resume state ──────────────────────────────────────────────
    // Key includes action so create:Title and update:Title are tracked separately
    const state = config.mode.resumable ? this._loadState() : { completed: [], failed: [] };
    const done = new Set(state.completed);
    if (done.size) this._log('warn', `Resuming — ${done.size} row(s) already processed, skipping`);

    const stateKey = (issue) => `${issue.action || 'create'}:${issue.title}`;

    const pending = issues.filter(
      (r) => !done.has(stateKey(r)) && !badRepos.has(r.repo)
    );

    // Pre-fail bad-repo issues
    const results_prefail = [];
    issues
      .filter((r) => badRepos.has(r.repo))
      .forEach((r) => {
        const err = 'repo not found or no permission';
        results_prefail.push({ repo: r.repo, title: r.title, action: r.action || 'create', error: err });
        state.failed.push({ repo: r.repo, title: r.title, action: r.action || 'create', error: err });
      });

    if (!pending.length) {
      this._log('success', 'All issues already processed!');
      return { created: [], updated: [], failed: results_prefail };
    }

    // ── Delay / timing info ───────────────────────────────────────
    const safeMode = config.mode.safeMode;
    let estLabel;

    if (!safeMode) {
      estLabel = `${c.red}${c.bold}IMMEDIATE${c.reset} (no delays — unsafe mode)`;
    } else {
      const mid = (config.delay.minMs + config.delay.maxMs) / 2;
      const delayMs = config.delay.mode === 'fixed' ? config.delay.fixedMs : mid;
      const totalMs = pending.length * delayMs;
      const estMin = Math.ceil(totalMs / 60_000);
      const delayStr =
        config.delay.mode === 'fixed'
          ? `${fmtDelay(config.delay.fixedMs)} fixed`
          : `${fmtDelay(config.delay.minMs)}–${fmtDelay(config.delay.maxMs)} random`;
      estLabel = `${c.yellow}${delayStr}${c.reset}  ·  Est. total: ${c.yellow}~${estMin > 0 ? estMin + ' min' : Math.round(totalMs / 1000) + 's'}${c.reset}`;
    }

    this._log('info', `To process: ${c.bold}${pending.length}${c.reset}  ·  Delay: ${estLabel}\n`);
    this._log('step', '🚀 Processing issues…\n');

    const startTime = Date.now();
    const results = { created: [], updated: [], failed: [] };

    // ── Progress bar ──────────────────────────────────────────────
    const W = 36;

    const drawBar = (done, total, status = '') => {
      if (this.silent) return;
      const f = Math.round((done / total) * W);
      const bar = `${c.green}${'█'.repeat(f)}${c.dim}${'░'.repeat(W - f)}${c.reset}`;
      const pct = String(Math.round((done / total) * 100)).padStart(3) + '%';
      const cnt = `${c.bold}${done}/${total}${c.reset}`;
      const stat = status ? `  ${status}` : '';
      const padding = ' '.repeat(
        Math.max(0, 30 - (status || '').replace(/\x1b\[[\d;]*m/g, '').length)
      );
      process.stdout.write(`\x1b[u\x1b[2K  ${bar}  ${pct}  ${cnt}${stat}${padding}\x1b[1B\r`);
    };

    if (!this.silent) process.stdout.write(`\x1b[s\n`);

    for (let i = 0; i < pending.length; i++) {
      const issue = pending[i];
      const action = (issue.action || 'create').toLowerCase();
      const actionLabel = action === 'update' ? `${c.yellow}updating…${c.reset}` : `${c.cyan}creating…${c.reset}`;

      drawBar(i, pending.length, `${actionLabel}  ${c.dim}${issue.title.slice(0, 35)}${c.reset}`);

      try {
        let result;

        if (action === 'update') {
          result = await updateIssue(issue, config.github.token, config.mode.dryRun);
          results.updated.push({
            repo: issue.repo,
            title: issue.title,
            url: result.html_url,
            number: result.number,
          });
        } else {
          result = await createIssue(issue, config.github.token, config.mode.dryRun);
          results.created.push({
            repo: issue.repo,
            title: issue.title,
            url: result.html_url,
            number: result.number,
          });
        }

        state.completed.push(stateKey(issue));
        if (config.mode.resumable) this._saveState(state);

        const actionIcon = action === 'update' ? `${c.yellow}✎${c.reset}` : `${c.green}✔${c.reset}`;
        drawBar(i + 1, pending.length);
        if (!this.silent)
          process.stdout.write(
            `\x1b[2K  ${actionIcon}  ${c.dim}#${result.number ?? i + 1}${c.reset}  ` +
            `${issue.title.slice(0, 48).padEnd(48)}  ${c.dim}${result.html_url}${c.reset}\n`
          );
      } catch (err) {
        // NOT_FOUND on an update row → skip gracefully, do not abort
        const isNotFound = err.message.startsWith('NOT_FOUND:');
        const isDuplicate = err.message.startsWith('DUPLICATE:');

        drawBar(i + 1, pending.length, `${c.red}${isNotFound ? 'not found (skipped)' : 'failed'}${c.reset}`);
        if (!this.silent)
          process.stdout.write(
            `\x1b[2K  ${c.red}✖${c.reset}  ${issue.title.slice(0, 48).padEnd(48)}  ` +
            `${c.dim}${isNotFound
              ? 'not found in repo (skipped)'
              : isDuplicate
                ? 'already exists (skipped)'
                : err.message.slice(0, 40)
            }${c.reset}\n`
          );

        results.failed.push({ repo: issue.repo, title: issue.title, action, error: err.message });
        state.failed.push({ repo: issue.repo, title: issue.title, action, error: err.message });
        if (config.mode.resumable) this._saveState(state);
        // Always continue — never abort the loop
      }

      // ── Delay between issues ──────────────────────────────────
      if (i < pending.length - 1) {
        if (safeMode && !config.mode.dryRun) {
          const delay = this._pickDelay();
          await liveCountdown(Math.round(delay / 1000), pending.length, i + 1, delay, drawBar);
        }
      }
    }

    // Final bar
    drawBar(pending.length, pending.length, `${c.green}done${c.reset}`);
    if (!this.silent) process.stdout.write(`\n`);

    results.failed.push(...results_prefail);
    this._printSummary(results, startTime);

    // ── Write log file ────────────────────────────────────────────
    if (config.output?.logFile) {
      const logPath = path.resolve(config.output.logFile);
      const logData = {
        timestamp: new Date().toISOString(),
        dryRun: config.mode.dryRun,
        safeMode: config.mode.safeMode,
        created: results.created,
        updated: results.updated,
        failed: results.failed,
      };
      fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
      this._log('info', `Log written → ${c.dim}${logPath}${c.reset}`);
    }

    // Clean up state if everything succeeded
    if (!results.failed.length && config.mode.resumable) {
      try { fs.unlinkSync(config.stateFile); } catch { }
    }

    return results;
  }

  // ── Private helpers ─────────────────────────────────────────────

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
    if (this.silent) return;
    if (log[level]) {
      log[level](msg);
    } else {
      console.log(msg);
    }
  }

  _printSummary(results, startTime) {
    if (!this.config.output?.showTable && !this.silent) return;
    const elapsed = fmtDelay(Date.now() - (startTime || Date.now()));
    console.log(`\n${c.bold}${c.blue}📊 Summary${c.reset}\n`);

    const boxTable = (rows, headers, colors) => {
      const colW = headers.map((h, i) =>
        Math.min(50, Math.max(h.length, ...rows.map((r) => String(r[i] || '').length)))
      );
      const line = (l, m, r) => `  ${l}${colW.map((w) => '─'.repeat(w + 2)).join(m)}${r}`;
      const fmtRow = (vals, rowColors) =>
        `  │${vals
          .map(
            (v, i) =>
              ` ${rowColors?.[i] || ''}${String(v || '')
                .slice(0, colW[i])
                .padEnd(colW[i])}${c.reset} `
          )
          .join('│')}│`;

      console.log(`${c.dim}${line('┌', '┬', '┐')}${c.reset}`);
      console.log(
        `${c.dim}${fmtRow(
          headers,
          headers.map(() => c.dim + c.bold)
        )}${c.reset}`
      );
      console.log(`${c.dim}${line('├', '┼', '┤')}${c.reset}`);
      rows.forEach((r) => console.log(`${c.dim}${fmtRow(r, colors)}${c.reset}`));
      console.log(`${c.dim}${line('└', '┴', '┘')}${c.reset}`);
    };

    if (results.created.length) {
      console.log(`${c.green}${c.bold}  ✔  Created: ${results.created.length}${c.reset}\n`);
      boxTable(
        results.created.map((r, i) => [`#${r.number ?? i + 1}`, r.repo, r.title, r.url || '']),
        ['#', 'Repo', 'Title', 'URL'],
        [c.green, c.blue, c.reset, c.dim]
      );
      console.log('');
    }

    if (results.updated.length) {
      console.log(`${c.yellow}${c.bold}  ✎  Updated: ${results.updated.length}${c.reset}\n`);
      boxTable(
        results.updated.map((r, i) => [`#${r.number ?? i + 1}`, r.repo, r.title, r.url || '']),
        ['#', 'Repo', 'Title', 'URL'],
        [c.yellow, c.blue, c.reset, c.dim]
      );
      console.log('');
    }

    if (results.failed.length) {
      console.log(`${c.red}${c.bold}  ✖  Failed / Skipped: ${results.failed.length}${c.reset}\n`);
      const shortReason = (err = '') => {
        if (err.startsWith('NOT_FOUND:')) return '⟳  title not found in repo (skipped)';
        if (err.startsWith('DUPLICATE:')) return '⟳  already exists (skipped)';
        if (err.includes('not found')) return '✕  repo not found';
        if (err.includes('no permission')) return '✕  no permission';
        if (err.includes('required scope')) return '✕  token missing scope';
        if (err.includes('token invalid')) return '✕  token invalid';
        if (err.includes('404')) return '✕  not found';
        if (err.includes('403')) return '✕  forbidden';
        if (err.includes('401')) return '✕  unauthorized';
        return err.slice(0, 40);
      };
      boxTable(
        results.failed.map((r) => [r.action || 'create', r.repo, r.title, shortReason(r.error)]),
        ['Action', 'Repo', 'Title', 'Reason'],
        [c.yellow, c.blue, c.red, c.yellow]
      );
      console.log('');
    }

    const total = results.created.length + results.updated.length + results.failed.length;
    console.log(
      `  ${c.dim}Total: ${total}  ·  ` +
      `Created: ${c.green}${results.created.length}${c.reset}${c.dim}  ·  ` +
      `Updated: ${c.yellow}${results.updated.length}${c.reset}${c.dim}  ·  ` +
      `Failed: ${c.red}${results.failed.length}${c.reset}${c.dim}  ·  ` +
      `Time: ${c.yellow}${elapsed}${c.reset}\n`
    );
  }
}

// ── Utilities ──────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function liveCountdown(seconds, total, done, delayMs, drawBar) {
  for (let s = seconds; s > 0; s--) {
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const est = fmtDelay((total - done) * delayMs + s * 1_000);
    drawBar(done, total, `\x1b[33mnext in ${mm}:${ss}\x1b[0m  \x1b[2m·  ~${est} left\x1b[0m`);
    await sleep(1_000);
  }
  drawBar(done, total);
}

function fmtDelay(ms) {
  const s = Math.round(ms / 1_000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}