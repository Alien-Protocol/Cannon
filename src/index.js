/**
 * @alien-protocol/cannon — public API
 *
 * import { IssueCannon } from '@alien-protocol/cannon';
 * const cannon = new IssueCannon({ dryRun: false });
 * await cannon.fire({ source: 'csv', file: './issues.csv' });
 */

export { IssueCannon } from './cannon.js';
export { loadIssues } from './loaders/index.js';
export { createIssue, verifyToken } from './github.js';
export { loadConfig } from './config.js';
export { login, logout, status, getSavedToken } from './auth.js';