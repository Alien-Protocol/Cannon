#!/usr/bin/env node
/**
 * bin/cli.js — github-issue-cannon CLI
 *
 * Usage:
 *   issue-cannon --source csv --file ./issues.csv
 *   issue-cannon --source postgres --query "SELECT * FROM backlog" --dry-run
 *   issue-cannon --source json --file ./issues.json --delay-mode fixed --delay-fixed 60000
 */

import { program } from 'commander';
import { IssueCannon } from '../src/cannon.js';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

program
  .name('issue-cannon')
  .description('Bulk-create GitHub issues from CSV, PDF, DOCX, JSON, or a database')
  .version(pkg.version)

  // Source
  .requiredOption('-s, --source <type>', 'Source type: csv | json | pdf | docx | postgres | mysql | sqlite')
  .option('-f, --file <path>',           'Path to source file (csv/json/pdf/docx/sqlite)')
  .option('-q, --query <sql>',           'SQL query (postgres/mysql/sqlite sources)')
  .option('--connection-string <url>',   'DB connection string (postgres/mysql)')

  // Behaviour
  .option('--dry-run',                   'Preview without creating issues', false)
  .option('--no-resume',                 'Ignore saved progress state')

  // Delay
  .option('--delay-mode <mode>',         'Delay mode: random (default) | fixed', 'random')
  .option('--delay-min <ms>',            'Min random delay in ms', '240000')
  .option('--delay-max <ms>',            'Max random delay in ms', '480000')
  .option('--delay-fixed <ms>',          'Fixed delay in ms (when --delay-mode fixed)', '300000')

  .parse(process.argv);

const opts = program.opts();

const cannon = new IssueCannon({
  dryRun:    opts.dryRun,
  resumable: opts.resume,
  delay: {
    mode:    opts.delayMode,
    minMs:   parseInt(opts.delayMin, 10),
    maxMs:   parseInt(opts.delayMax, 10),
    fixedMs: parseInt(opts.delayFixed, 10),
  },
});

const sourceOpts = {
  source:           opts.source,
  file:             opts.file,
  query:            opts.query,
  connectionString: opts.connectionString,
};

cannon.fire(sourceOpts).catch(err => {
  console.error(`\n✖  ${err.message}`);
  process.exit(1);
});
