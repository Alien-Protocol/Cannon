/**
 * cannon.js — IssueCannon orchestrator
 * v1.0.8 code — only change: better auth error message
 */

import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';
import { loadIssues } from './loaders/index.js';
import { createIssue, verifyToken } from './github.js';

// ── ANSI colours ──────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', blue: '\x1b[34m',
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
   * @param {object} options
   * @param {string}  [options.token]     — GitHub PAT (prefer env var or OAuth)
   * @param {boolean} [options.dryRun]   — preview without creating
   * @param {object}  [options.delay]    — { mode, minMs, maxMs, fixedMs }
   * @param {boolean} [options.resumable]
   * @param {boolean} [options.silent]   — suppress all output
   */
  constructor(options = {}) {
    this.config = loadConfig(options);
    this.silent = options.silent ?? false;
  }

  async fire(sourceOpts = {}) {
    const { config } = this;

    // ── Auth check — clear message for both methods ──
    if (!config.github.token) {
      log.error('Not authenticated. Choose one of these options:\n');
      log.info(`  ${c.bold}Option A — OAuth login (recommended, no token needed):${c.reset}`);
      log.info(`    cannon auth login\n`);
      log.info(`  ${c.bold}Option B — Personal Access Token:${c.reset}`);
      log.info(`    echo "GITHUB_TOKEN=ghp_xxx" > .env`);
      log.info(`    Get token: https://github.com/settings/tokens/new\n`);
      throw new Error('Missing GitHub token');
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

    // ── Verify token on each repo — skip bad ones, don't stop ──
    this._log('step', '🔑 Verifying token access...');
    const badRepos = new Set();
    const goodRepos = new Set();
    for (const repo of Object.keys(repoMap)) {
      const status = await verifyToken(repo, config.github.token);
      if (status) {
        const reason =
          status === 401 ? 'token invalid/expired' :
            status === 404 ? 'repo not found or no permission' :
              `HTTP ${status}`;
        log.warn(`Skipping ${c.blue}${repo}${c.reset}  ${c.dim}(${reason})${c.reset}`);
        badRepos.add(repo);
      } else {
        this._log('success', repo);
        goodRepos.add(repo);
      }
    }

    if (goodRepos.size === 0) {
      log.error('No accessible repos found. Check repo names and token permissions.');
      log.info('Run: cannon auth login   or   set GITHUB_TOKEN in .env');
      throw new Error('No accessible repos');
    }

    // Resume state
    const state = config.resumable ? this._loadState() : { completed: [], failed: [] };
    const done = new Set(state.completed);
    if (done.size) this._log('warn', `Resuming — ${done.size} already created`);

    // Filter out issues for bad repos + already done
    const pending = issues.filter(r => !done.has(r.title) && !badRepos.has(r.repo));

    // Pre-mark bad repo issues as failed immediately
    issues
      .filter(r => badRepos.has(r.repo))
      .forEach(r => {
        const reason = 'repo not found or no permission';
        results_prefail.push({ repo: r.repo, title: r.title, error: reason });
        state.failed.push({ repo: r.repo, title: r.title, error: reason });
      });
    if (!pending.length) {
      this._log('success', 'All issues already created!');
      return { created: [], failed: [] };
    }

    const mid = (config.delay.minMs + config.delay.maxMs) / 2;
    const estMin = Math.ceil((pending.length * (config.delay.mode === 'fixed' ? config.delay.fixedMs : mid)) / 60_000);
    const delayLabel = config.delay.mode === 'fixed'
      ? `${fmtDelay(config.delay.fixedMs)} fixed`
      : `${fmtDelay(config.delay.minMs)}–${fmtDelay(config.delay.maxMs)} random`;
    this._log('info', `To create: ${c.bold}${pending.length}${c.reset}  ·  Delay: ${c.yellow}${delayLabel}${c.reset}  ·  Est. total: ${c.yellow}~${estMin > 0 ? estMin + ' min' : Math.round((pending.length * (config.delay.mode === 'fixed' ? config.delay.fixedMs : mid)) / 1000) + 's'}${c.reset}\n`);
    this._log('step', '🚀 Creating issues...\n');

    const results_prefail = [];
    const results = { created: [], failed: [] };
    const startTime = Date.now();

    // ── Live bar setup ─────────────────────────
    // Bar stays on one line permanently.
    // ANSI escape codes:
    //   \x1b[s       = save cursor position
    //   \x1b[u       = restore cursor to saved position
    //   \x1b[2K      = erase entire current line
    //   \x1b[1A      = move cursor up 1 line
    //   \n           = move to next line (for issue logs below bar)

    const W = 36; // bar width in chars

    const drawBar = (done, total, status = '') => {
      if (this.silent) return;
      const f = Math.round((done / total) * W);
      const bar = `${c.green}${'█'.repeat(f)}${c.dim}${'░'.repeat(W - f)}${c.reset}`;
      const pct = String(Math.round((done / total) * 100)).padStart(3) + '%';
      const cnt = `${c.bold}${done}/${total}${c.reset}`;
      const stat = status ? `  ${status}` : '';
      // \x1b[u restores to saved position, \x1b[2K clears line, then redraws
      process.stdout.write(`\x1b[u\x1b[2K  ${bar}  ${pct}  ${cnt}${stat}\n`);
    };

    // Save cursor position ONCE before loop starts — bar lives here
    if (!this.silent) {
      process.stdout.write(`\x1b[s`);  // save cursor
      process.stdout.write(`\n`);      // reserve the bar line
    }

    for (let i = 0; i < pending.length; i++) {
      const issue = pending[i];

      // Draw bar at saved position — partial fill while working
      drawBar(i, pending.length, `${c.yellow}creating…${c.reset}  ${c.dim}${issue.title.slice(0, 35)}${c.reset}`);

      try {
        const created = await createIssue(issue, config.github.token, config.dryRun);
        results.created.push({ repo: issue.repo, title: issue.title, url: created.html_url, number: created.number });
        state.completed.push(issue.title);
        if (config.resumable) this._saveState(state);

        // Update bar fill + log issue BELOW bar
        drawBar(i + 1, pending.length);
        if (!this.silent)
          process.stdout.write(`  ${c.green}✔${c.reset}  ${c.dim}#${created.number ?? i + 1}${c.reset}  ${issue.title.slice(0, 45)}  ${c.dim}${created.html_url}${c.reset}\n`);

      } catch (err) {
        drawBar(i + 1, pending.length, `${c.red}failed${c.reset}`);
        if (!this.silent)
          process.stdout.write(`  ${c.red}✖${c.reset}  ${issue.title.slice(0, 45)}  ${c.dim}${err.message}${c.reset}\n`);
        results.failed.push({ repo: issue.repo, title: issue.title, error: err.message });
        state.failed.push({ repo: issue.repo, title: issue.title, error: err.message });
        if (config.resumable) this._saveState(state);
      }

      if (i < pending.length - 1) {
        const delay = this._pickDelay();
        await liveCountdown(
          Math.round(delay / 1000),
          pending.length,
          i + 1,
          delay,
          drawBar
        );
      }
    }

    // Final bar — 100% full
    drawBar(pending.length, pending.length, `${c.green}done${c.reset}`);
    if (!this.silent) process.stdout.write(`\n`);

    results.failed.push(...results_prefail);
    this._printSummary(results, startTime);

    if (!results.failed.length && config.resumable) {
      try { fs.unlinkSync(config.stateFile); } catch { }
    }

    return results;
  }

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
    if (log[level]) { log[level](msg); } else { console.log(msg); }
  }

  _printSummary(results, startTime) {
    const elapsed = fmtDelay(Date.now() - (startTime || Date.now()));
    console.log(`\n${c.bold}${c.blue}📊 Summary${c.reset}\n`);

    // ── Box table helper ───────────────────────
    const boxTable = (rows, headers, colors) => {
      const colW = headers.map((h, i) =>
        Math.min(45, Math.max(h.length, ...rows.map(r => String(r[i] || '').length)))
      );
      const top = `  ┌${colW.map(w => '─'.repeat(w + 2)).join('┬')}┐`;
      const mid = `  ├${colW.map(w => '─'.repeat(w + 2)).join('┼')}┤`;
      const bot = `  └${colW.map(w => '─'.repeat(w + 2)).join('┴')}┘`;
      const fmtRow = (vals, rowColors) =>
        `  │${vals.map((v, i) => ` ${rowColors?.[i] || ''}${String(v || '').slice(0, colW[i]).padEnd(colW[i])}${c.reset} `).join('│')}│`;

      console.log(`${c.dim}${top}${c.reset}`);
      console.log(`${c.dim}${fmtRow(headers, headers.map(() => c.dim + c.bold))}${c.reset}`);
      console.log(`${c.dim}${mid}${c.reset}`);
      rows.forEach(r => console.log(`${c.dim}${fmtRow(r, colors)}${c.reset}`));
      console.log(`${c.dim}${bot}${c.reset}`);
    };

    // ── Created table ──────────────────────────
    if (results.created.length) {
      console.log(`${c.green}${c.bold}  ✔  Created: ${results.created.length}${c.reset}\n`);
      boxTable(
        results.created.map((r, i) => [
          `#${r.number ?? i + 1}`,
          r.repo,
          r.title,
          r.url || '',
        ]),
        ['#', 'Repo', 'Title', 'URL'],
        [c.green, c.blue, c.reset, c.dim]
      );
      console.log('');
    }

    // ── Failed table ───────────────────────────
    if (results.failed.length) {
      console.log(`${c.red}${c.bold}  ✖  Failed / Skipped: ${results.failed.length}${c.reset}\n`);

      // Shorten error to a clean reason with icon
      const shortReason = (err = '') => {
        if (err.startsWith('DUPLICATE:')) return '⟳  already exists';
        if (err.includes('not found')) return '✕  repo not found';
        if (err.includes('no permission')) return '✕  no permission';
        if (err.includes('token invalid')) return '✕  token invalid';
        if (err.includes('404')) return '✕  not found';
        if (err.includes('403')) return '✕  forbidden';
        if (err.includes('401')) return '✕  unauthorized';
        return err.slice(0, 35);
      };

      boxTable(
        results.failed.map(r => [r.repo, r.title, shortReason(r.error)]),
        ['Repo', 'Title', 'Reason'],
        [c.blue, c.red, c.yellow]
      );
      console.log('');
    }

    // ── Footer ─────────────────────────────────
    const total = results.created.length + results.failed.length;
    console.log(`  ${c.dim}Total: ${total}  ·  Created: ${c.green}${results.created.length}${c.reset}${c.dim}  ·  Failed: ${c.red}${results.failed.length}${c.reset}${c.dim}  ·  Time: ${c.yellow}${elapsed}${c.reset}\n`);
  }
}

// ── Utility ───────────────────────────────────
function progressBar(done, total, w = 30) {
  const f = Math.round((done / total) * w);
  return `${c.green}${'█'.repeat(f)}${c.dim}${'░'.repeat(w - f)}${c.reset}`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function liveCountdown(seconds, total, done, delayMs, drawBar) {
  for (let s = seconds; s > 0; s--) {
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const est = fmtDelay((total - done) * delayMs + s * 1000);
    // update bar line with sleep info — issues stay below untouched
    drawBar(done, total, `${c.yellow}next in ${mm}:${ss}${c.reset}  ${c.dim}·  ~${est} left${c.reset}`);
    await sleep(1000);
  }
  // clear status text from bar after countdown ends
  drawBar(done, total);
}

function fmtDelay(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}