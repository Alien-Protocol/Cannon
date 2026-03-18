/**
 * github-issue-cannon — public API
 * 
 * Usage (programmatic):
 *   import { IssueCannon } from 'github-issue-cannon';
 *   const cannon = new IssueCannon({ token: 'ghp_...', dryRun: false });
 *   await cannon.fire({ source: 'csv', file: './issues.csv' });
 */

export { IssueCannon } from './cannon.js';
export { loadIssues } from './loaders/index.js';
export { createIssue, verifyToken } from './github.js';
export { loadConfig } from './config.js';
