#!/usr/bin/env node
/**
 * bin/cli.js — @alien-protocol/cannon CLI
 *
 * Auth commands (new):
 *   cannon auth login    — OAuth login via GitHub, no token needed
 *   cannon auth status   — show who is logged in
 *   cannon auth logout   — remove saved token
 *
 * Fire commands (unchanged from v1.0.8):
 *   cannon --source csv --file ./issues.csv
 *   cannon --source postgres --query "SELECT * FROM backlog" --dry-run
 *   cannon --source json --file ./issues.json --delay-mode fixed --delay-fixed 60000
 */

import { program, Command } from 'commander';
import { IssueCannon } from '../src/cannon.js';
import { login, status, logout } from '../src/auth.js';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

// ── `cannon auth` subcommands ─────────────────
const auth = new Command('auth')
  .description('Manage GitHub authentication');

auth
  .command('login')
  .description('Login via GitHub OAuth — no token or .env needed')
  .action(async () => {
    try { await login(); }
    catch (e) { console.error(`\n  ✖  ${e.message}\n`); process.exit(1); }
  });

auth
  .command('status')
  .description('Show who is currently logged in')
  .action(async () => {
    try { await status(); }
    catch (e) { console.error(`\n  ✖  ${e.message}\n`); process.exit(1); }
  });

auth
  .command('logout')
  .description('Remove saved GitHub token')
  .action(() => logout());

// ── Main program ──────────────────────────────
program
  .name('cannon')
  .description('🛸 Bulk-create GitHub issues from CSV, PDF, DOCX, JSON, or a database')
  .version(pkg.version)
  .addCommand(auth)

  // Source
  .option('-s, --source <type>', 'Source type: csv | json | pdf | docx | postgres | mysql | sqlite')
  .option('-f, --file <path>', 'Path to source file (csv/json/pdf/docx/sqlite)')
  .option('-q, --query <sql>', 'SQL query (postgres/mysql/sqlite sources)')
  .option('--connection-string <url>', 'DB connection string (postgres/mysql)')

  // Behaviour
  .option('--dry-run', 'Preview without creating issues', false)
  .option('--no-resume', 'Ignore saved progress state')

  // Delay
  .option('--delay-mode <mode>', 'Delay mode: random (default) | fixed', 'random')
  .option('--delay-min <ms>', 'Min random delay in ms', '60000')
  .option('--delay-max <ms>', 'Max random delay in ms', '300000')
  .option('--delay-fixed <ms>', 'Fixed delay in ms (when --delay-mode fixed)', '300000')

  .action(async (opts) => {
    if (!opts.source) {
      console.log(`
  \x1b[1m\x1b[35m🛸  @alien-protocol/cannon\x1b[0m  v${pkg.version}

  \x1b[2mFirst time? Login with GitHub (no token needed):\x1b[0m
    cannon auth login

  \x1b[2mOr use a token directly:\x1b[0m
    echo "GITHUB_TOKEN=ghp_xxx" > .env

  \x1b[2mThen fire issues:\x1b[0m
    cannon --source csv  --file ./issues.csv
    cannon --source json --file ./issues.json --dry-run

  \x1b[2mFull help:\x1b[0m
    cannon --help
`);
      return;
    }

    const cannon = new IssueCannon({
      dryRun: opts.dryRun,
      resumable: opts.resume,
      delay: {
        mode: opts.delayMode,
        minMs: parseInt(opts.delayMin, 10),
        maxMs: parseInt(opts.delayMax, 10),
        fixedMs: parseInt(opts.delayFixed, 10),
      },
    });

    const sourceOpts = {
      source: opts.source,
      file: opts.file,
      query: opts.query,
      connectionString: opts.connectionString,
    };

    cannon.fire(sourceOpts).catch(err => {
      console.error(`\n✖  ${err.message}`);
      process.exit(1);
    });
  });

program.parse(process.argv);