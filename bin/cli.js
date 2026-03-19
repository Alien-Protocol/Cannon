#!/usr/bin/env node
/**
 * bin/cli.js — @alien-protocol/cannon  CLI
 *
 * ─── Auth ───────────────────────────────────────────────────────
 *   cannon auth login    OAuth login via GitHub (no token needed)
 *   cannon auth status   Show who is currently logged in
 *   cannon auth logout   Remove saved token
 *
 * ─── Setup ──────────────────────────────────────────────────────
 *   cannon init          Create a cannon.config.json with defaults
 *
 * ─── Run ────────────────────────────────────────────────────────
 *   cannon fire          Fire using cannon.config.json
 *   cannon fire --dry-run              Preview without creating
 *   cannon fire --unsafe               Skip delays (risky!)
 *   cannon fire --source csv --file ./issues.csv  (override config)
 *
 * ─── Validate ───────────────────────────────────────────────────
 *   cannon validate      Validate your config + issues file
 */

import { program, Command } from 'commander';
import { IssueCannon } from '../src/cannon.js';
import { login, status, logout } from '../src/auth.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', blue: '\x1b[34m', magenta: '\x1b[35m',
};

// ─────────────────────────────────────────────────────────────────
// cannon auth
// ─────────────────────────────────────────────────────────────────
const auth = new Command('auth')
  .description('Manage GitHub authentication (login / status / logout)');

auth
  .command('login')
  .description('Login via GitHub OAuth — no token or .env file needed')
  .action(async () => {
    try { await login(); }
    catch (e) { console.error(`\n  ${c.red}✖${c.reset}  ${e.message}\n`); process.exit(1); }
  });

auth
  .command('status')
  .description('Show who is currently logged in')
  .action(async () => {
    try { await status(); }
    catch (e) { console.error(`\n  ${c.red}✖${c.reset}  ${e.message}\n`); process.exit(1); }
  });

auth
  .command('logout')
  .description('Remove saved GitHub token')
  .action(() => logout());

// ─────────────────────────────────────────────────────────────────
// cannon init   — scaffolds a default cannon.config.json
// ─────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Create a cannon.config.json with all default settings')
  .option('--force', 'Overwrite existing cannon.config.json', false)
  .action((opts) => {
    const dest = path.join(process.cwd(), 'cannon.config.json');

    if (existsSync(dest) && !opts.force) {
      console.log(`\n  ${c.yellow}⚠${c.reset}  cannon.config.json already exists.`);
      console.log(`  Use ${c.bold}cannon init --force${c.reset} to overwrite it.\n`);
      process.exit(0);
    }

    // Locate the bundled default config
    const defaultConfig = path.resolve(
      new URL('../cannon.config.default.json', import.meta.url).pathname
    );

    if (!existsSync(defaultConfig)) {
      // Fallback: write an inline default
      const inline = getDefaultConfig();
      writeFileSync(dest, JSON.stringify(inline, null, 2));
    } else {
      writeFileSync(dest, readFileSync(defaultConfig, 'utf-8'));
    }

    console.log(`\n  ${c.green}✔${c.reset}  Created ${c.bold}cannon.config.json${c.reset}`);
    console.log(`\n  ${c.dim}Next steps:${c.reset}`);
    console.log(`    1. Edit cannon.config.json to set your ${c.bold}source${c.reset} (file path or DB query)`);
    console.log(`    2. Run ${c.bold}cannon auth login${c.reset} to authenticate`);
    console.log(`    3. Run ${c.bold}cannon fire --dry-run${c.reset} to preview`);
    console.log(`    4. Run ${c.bold}cannon fire${c.reset} to create issues\n`);
  });

// ─────────────────────────────────────────────────────────────────
// cannon validate  — check config + source file before firing
// ─────────────────────────────────────────────────────────────────
program
  .command('validate')
  .description('Check your config and issues file for problems')
  .action(async () => {
    console.log(`\n${c.bold}${c.blue}🔍 Validating…${c.reset}\n`);
    let ok = true;

    // 1. Config file
    const configPath = path.join(process.cwd(), 'cannon.config.json');
    if (!existsSync(configPath)) {
      console.log(`  ${c.red}✖${c.reset}  cannon.config.json not found`);
      console.log(`     Run: ${c.bold}cannon init${c.reset} to create it\n`);
      ok = false;
    } else {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        JSON.parse(raw);
        console.log(`  ${c.green}✔${c.reset}  cannon.config.json  ${c.dim}(valid JSON)${c.reset}`);
      } catch (e) {
        console.log(`  ${c.red}✖${c.reset}  cannon.config.json has invalid JSON: ${e.message}`);
        ok = false;
      }
    }

    // 2. Token
    try {
      const { loadConfig } = await import('../src/config.js');
      const cfg = loadConfig();
      if (!cfg.github.token) {
        console.log(`  ${c.yellow}⚠${c.reset}  No GitHub token found`);
        console.log(`     Run: ${c.bold}cannon auth login${c.reset}  or set GITHUB_TOKEN in .env`);
        ok = false;
      } else {
        console.log(`  ${c.green}✔${c.reset}  GitHub token  ${c.dim}(found)${c.reset}`);
      }

      // 3. Source file exists
      if (['csv', 'json', 'pdf', 'docx', 'sqlite'].includes(cfg.source?.type)) {
        const fp = cfg.source?.file;
        if (!fp) {
          console.log(`  ${c.red}✖${c.reset}  source.file is empty in cannon.config.json`);
          ok = false;
        } else if (!existsSync(path.resolve(fp))) {
          console.log(`  ${c.red}✖${c.reset}  source.file not found: ${fp}`);
          ok = false;
        } else {
          console.log(`  ${c.green}✔${c.reset}  source.file  ${c.dim}${fp}${c.reset}`);
        }
      }

      // 4. Safe mode warning
      if (!cfg.mode?.safeMode) {
        console.log(`  ${c.yellow}⚠${c.reset}  safeMode is OFF — issues will fire with no delays`);
        console.log(`     ${c.dim}Set mode.safeMode = true in cannon.config.json for safety${c.reset}`);
      } else {
        console.log(`  ${c.green}✔${c.reset}  safeMode  ${c.dim}(on — random delays enabled)${c.reset}`);
      }

      // 5. Load + count issues
      if (ok) {
        try {
          const { loadIssues } = await import('../src/loaders/index.js');
          const issues = await loadIssues({
            source: cfg.source.type,
            file: cfg.source.file,
            query: cfg.source.query,
            connectionString: cfg.source.connectionString,
          });
          console.log(`  ${c.green}✔${c.reset}  Issues loaded  ${c.dim}(${issues.length} issue(s) found)${c.reset}`);
        } catch (e) {
          console.log(`  ${c.red}✖${c.reset}  Could not load issues: ${e.message}`);
          ok = false;
        }
      }

    } catch (e) {
      console.log(`  ${c.red}✖${c.reset}  Config error: ${e.message}`);
      ok = false;
    }

    console.log('');
    if (ok) {
      console.log(`  ${c.green}${c.bold}All checks passed!${c.reset}  Run ${c.bold}cannon fire --dry-run${c.reset} to preview.\n`);
    } else {
      console.log(`  ${c.red}${c.bold}Issues found.${c.reset}  Fix the errors above and run ${c.bold}cannon validate${c.reset} again.\n`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────
// cannon fire   — main command
// ─────────────────────────────────────────────────────────────────
program
  .command('fire')
  .description('Create GitHub issues from your cannon.config.json')
  .option('--dry-run', 'Preview what would be created — no issues actually made', false)
  .option('--unsafe', 'Skip all delays and fire immediately (risky — may trigger GitHub spam detection)', false)
  .option('--no-resume', 'Ignore saved progress and start fresh from the beginning')
  .option('-s, --source <type>', 'Override source type from config: csv | json | pdf | docx | postgres | mysql | sqlite')
  .option('-f, --file <path>', 'Override source file path from config')
  .option('-q, --query <sql>', 'Override SQL query from config (for database sources)')
  .option('--delay-mode <mode>', 'Override delay mode: random | fixed')
  .option('--delay-min <ms>', 'Override minimum random delay in ms')
  .option('--delay-max <ms>', 'Override maximum random delay in ms')
  .option('--delay-fixed <ms>', 'Override fixed delay in ms')
  .action(async (opts) => {
    // Build override object from flags
    const overrides = {};
    if (opts.dryRun) overrides.dryRun = true;
    if (opts.unsafe) overrides.safeMode = false;
    if (opts.resume === false) overrides.resumable = false;

    const delayOverride = {};
    if (opts.delayMode) delayOverride.mode = opts.delayMode;
    if (opts.delayMin) delayOverride.minMs = parseInt(opts.delayMin, 10);
    if (opts.delayMax) delayOverride.maxMs = parseInt(opts.delayMax, 10);
    if (opts.delayFixed) delayOverride.fixedMs = parseInt(opts.delayFixed, 10);
    if (Object.keys(delayOverride).length) overrides.delay = delayOverride;

    const cannon = new IssueCannon(overrides);

    // Source overrides from CLI flags (take priority over config file)
    const sourceOpts = {};
    if (opts.source) sourceOpts.source = opts.source;
    if (opts.file) sourceOpts.file = opts.file;
    if (opts.query) sourceOpts.query = opts.query;

    try {
      await cannon.fire(sourceOpts);
    } catch (err) {
      console.error(`\n  ${c.red}✖${c.reset}  ${err.message}\n`);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────────
// Main program (root)
// ─────────────────────────────────────────────────────────────────
program
  .name('cannon')
  .description(`${c.bold}${c.magenta}🛸 @alien-protocol/cannon${c.reset}  — Bulk-create GitHub issues`)
  .version(pkg.version)
  .addCommand(auth);

// Show a friendly welcome when run with no arguments
program.action(() => {
  console.log(`
  ${c.bold}${c.magenta}🛸  @alien-protocol/cannon${c.reset}  v${pkg.version}

  ${c.bold}First time? Get started in 4 steps:${c.reset}

    ${c.cyan}1.${c.reset}  ${c.bold}cannon init${c.reset}               ${c.dim}Create your config file${c.reset}
    ${c.cyan}2.${c.reset}  ${c.bold}cannon auth login${c.reset}          ${c.dim}Authenticate with GitHub (no token needed)${c.reset}
    ${c.cyan}3.${c.reset}  ${c.bold}cannon fire --dry-run${c.reset}      ${c.dim}Preview what will be created${c.reset}
    ${c.cyan}4.${c.reset}  ${c.bold}cannon fire${c.reset}                ${c.dim}Create your issues!${c.reset}

  ${c.bold}Other commands:${c.reset}

    ${c.bold}cannon validate${c.reset}            ${c.dim}Check your config + issues file for problems${c.reset}
    ${c.bold}cannon auth status${c.reset}         ${c.dim}Show who you're logged in as${c.reset}
    ${c.bold}cannon auth logout${c.reset}         ${c.dim}Remove saved credentials${c.reset}
    ${c.bold}cannon fire --unsafe${c.reset}       ${c.dim}Fire with no delays (risky — may trigger spam detection)${c.reset}
    ${c.bold}cannon fire --no-resume${c.reset}    ${c.dim}Start fresh, ignoring saved progress${c.reset}

  ${c.bold}Override source from CLI (bypasses config file):${c.reset}

    ${c.bold}cannon fire --source csv --file ./issues.csv${c.reset}
    ${c.bold}cannon fire --source json --file ./issues.json --dry-run${c.reset}

  ${c.dim}Full help:${c.reset}  cannon --help  |  cannon fire --help
  ${c.dim}Docs:${c.reset}       https://github.com/Alien-Protocol/Cannon
`);
});

program.parse(process.argv);

// ─────────────────────────────────────────────────────────────────
// Default config (inline fallback for cannon init)
// ─────────────────────────────────────────────────────────────────
function getDefaultConfig() {
  return {
    _readme: "Cannon config. Edit this file then run 'cannon fire'. Docs: https://github.com/Alien-Protocol/Cannon",

    github: {
      token: "",
      _tokenNote: "LEAVE BLANK — use 'cannon auth login' (OAuth) or GITHUB_TOKEN env var. Never put your real token here.",
    },

    source: {
      type: "csv",
      _typeNote: "Options: csv | json | pdf | docx | postgres | mysql | sqlite",
      file: "./issues.csv",
      _fileNote: "Path to your issues file (csv, json, pdf, docx, sqlite).",
      query: "",
      _queryNote: "SQL query string (postgres, mysql, sqlite).",
      connectionString: "",
      _connectionStringNote: "DB URL. Use env vars like ${POSTGRES_URL} — never hardcode secrets.",
    },

    mode: {
      dryRun: false,
      _dryRunNote: "true = preview only, nothing is created. Useful for testing.",
      safeMode: true,
      _safeModeNote: "true = random delays between issues (RECOMMENDED). false = fire immediately (risky).",
      resumable: true,
      _resumableNote: "true = saves progress so you can stop and restart without duplicates.",
    },

    delay: {
      _note: "Only applies when mode.safeMode = true",
      mode: "random",
      _modeNote: "random = between minMs and maxMs | fixed = always fixedMs",
      minMs: 240000,
      _minMsNote: "Minimum delay ms. Default 240000 (4 min). Do not go below 60000.",
      maxMs: 480000,
      _maxMsNote: "Maximum delay ms. Default 480000 (8 min).",
      fixedMs: 300000,
      _fixedMsNote: "Fixed delay ms when mode = 'fixed'. Default 300000 (5 min).",
    },

    labels: {
      autoCreate: false,
      _autoCreateNote: "true = auto-create any missing labels in GitHub.",
      colorMap: {},
      _colorMapNote: "Map label names to hex colors. e.g. { 'bug': 'ee0701', 'feature': '0075ca' }",
    },

    output: {
      logFile: "",
      _logFileNote: "Optional path for a JSON log of results. e.g. './cannon-log.json'",
      showTable: true,
      _showTableNote: "true = show a summary table after completion.",
    },

    _examples: {
      _note: "Copy one block into 'source' above to change your data source.",
      csv: { type: "csv", file: "./issues.csv" },
      json: { type: "json", file: "./issues.json" },
      pdf: { type: "pdf", file: "./issues.pdf" },
      docx: { type: "docx", file: "./issues.docx" },
      postgres: { type: "postgres", connectionString: "${POSTGRES_URL}", query: "SELECT repo, title, body, labels, milestone FROM backlog WHERE exported = false" },
      mysql: { type: "mysql", connectionString: "${MYSQL_URL}", query: "SELECT repo, title, body, labels, milestone FROM issues WHERE status = 'pending'" },
      sqlite: { type: "sqlite", file: "./backlog.db", query: "SELECT repo, title, body, labels, milestone FROM issues" },
    },
  };
}