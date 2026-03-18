/**

 * Stores token in ~/.cannon/credentials.json (mode 0o600 — owner only)
 *
 * Commands exposed via CLI:
 *   cannon auth login   → opens GitHub, shows code, waits, saves token
 *   cannon auth status  → show logged-in user
 *   cannon auth logout  → delete saved token
 *
 * Token priority in config.js:
 *   1. new IssueCannon({ token: '...' })   explicit code
 *   2. GITHUB_TOKEN env var
 *   3. .env file  →  GITHUB_TOKEN=...
 *   4. ~/.cannon/credentials.json          ← OAuth saved here
 *   5. cannon.config.json  →  github.token
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─────────────────────────────────────────────
// GitHub OAuth App client_id
// This is a PUBLIC value — safe to ship in source.
// Create your own app at: github.com/settings/developers → OAuth Apps → New
//   Homepage URL:   https://github.com/Alien-Protocol/Cannon
//   Callback URL:   http://localhost  (not used — Device Flow doesn't redirect)
//   Device Flow:    ✅ Enable Device Flow
// Then set CANNON_CLIENT_ID env var or replace the fallback string below.
// ─────────────────────────────────────────────
const CLIENT_ID = 'Ov23li9tDhpIemxGcKs6';
const SCOPES = 'repo';

// ── Token storage ─────────────────────────────
const CONFIG_DIR = path.join(os.homedir(), '.cannon');
const CREDS_FILE = path.join(CONFIG_DIR, 'credentials.json');

// ── ANSI ──────────────────────────────────────
const c = {
     reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
     green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
     cyan: '\x1b[36m', blue: '\x1b[34m', magenta: '\x1b[35m',
};

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export async function login() {
     console.log(`\n${c.bold}${c.magenta}🛸  Cannon — GitHub Login${c.reset}\n`);

     if (CLIENT_ID === 'YOUR_GITHUB_OAUTH_CLIENT_ID') {
          console.log(`  ${c.red}✖${c.reset}  OAuth App not configured.\n`);
          console.log(`  ${c.bold}Option A — Set env var:${c.reset}`);
          console.log(`    export CANNON_CLIENT_ID=your_client_id\n`);
          console.log(`  ${c.bold}Option B — Create a GitHub OAuth App:${c.reset}`);
          console.log(`    https://github.com/settings/developers → OAuth Apps → New\n`);
          console.log(`  ${c.bold}Option C — Use a token directly (no OAuth needed):${c.reset}`);
          console.log(`    echo "GITHUB_TOKEN=ghp_xxx" > .env\n`);
          process.exit(1);
     }

     // 1. Request device + user codes
     const deviceRes = await fetch('https://github.com/login/device/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPES }),
     });

     if (!deviceRes.ok) {
          throw new Error(`GitHub device flow failed: ${deviceRes.status}`);
     }

     const { device_code, user_code, verification_uri, expires_in, interval } =
          await deviceRes.json();

     // 2. Show code to user
     console.log(`  ${c.bold}Step 1${c.reset} — Open this URL:\n`);
     console.log(`    ${c.blue}${c.bold}${verification_uri}${c.reset}\n`);
     console.log(`  ${c.bold}Step 2${c.reset} — Enter this code:\n`);
     console.log(`    ${c.cyan}${c.bold}  ${user_code}  ${c.reset}\n`);
     console.log(`  ${c.dim}Expires in ${Math.floor(expires_in / 60)} minutes${c.reset}\n`);

     // Try auto-open browser
     _openBrowser(verification_uri);

     // 3. Poll for token
     process.stdout.write(`  ${c.dim}⏳ Waiting for authorization…${c.reset}`);
     const token = await _poll(device_code, interval || 5);
     process.stdout.write('\r' + ' '.repeat(55) + '\r');

     // 4. Get GitHub username
     const user = await _getUser(token);

     // 5. Save securely
     _saveToken(token, user.login);

     console.log(`  ${c.green}✔${c.reset}  Logged in as ${c.bold}${user.login}${c.reset}`);
     console.log(`  ${c.green}✔${c.reset}  Token saved → ${c.dim}${CREDS_FILE}${c.reset}\n`);
     console.log(`  ${c.dim}No need to set GITHUB_TOKEN — cannon will use this automatically.${c.reset}\n`);

     return { token, username: user.login };
}

export async function status() {
     const creds = _loadToken();

     if (!creds) {
          console.log(`\n  ${c.yellow}⚠${c.reset}  Not logged in.\n`);
          console.log(`  Run: ${c.bold}cannon auth login${c.reset}   — OAuth (recommended)\n`);
          console.log(`  Or:  echo "GITHUB_TOKEN=ghp_xxx" > .env\n`);
          return null;
     }

     try {
          const user = await _getUser(creds.token);
          console.log(`\n  ${c.green}✔${c.reset}  Logged in as ${c.bold}${user.login}${c.reset}`);
          console.log(`  ${c.dim}Credentials: ${CREDS_FILE}${c.reset}`);
          console.log(`  ${c.dim}Saved at:    ${creds.savedAt}${c.reset}\n`);
          return user;
     } catch {
          console.log(`\n  ${c.red}✖${c.reset}  Token is invalid or expired.`);
          console.log(`  Run: ${c.bold}cannon auth login${c.reset}\n`);
          return null;
     }
}

export function logout() {
     if (fs.existsSync(CREDS_FILE)) {
          fs.unlinkSync(CREDS_FILE);
          console.log(`\n  ${c.green}✔${c.reset}  Logged out.\n`);
     } else {
          console.log(`\n  ${c.dim}Not logged in.${c.reset}\n`);
     }
}

/** Used by config.js — returns OAuth token or null */
export function getSavedToken() {
     return _loadToken()?.token ?? null;
}

// ─────────────────────────────────────────────
// PRIVATE
// ─────────────────────────────────────────────

async function _poll(deviceCode, intervalSec) {
     const wait = (s) => new Promise(r => setTimeout(r, s * 1000));
     while (true) {
          await wait(intervalSec);
          const res = await fetch('https://github.com/login/oauth/access_token', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
               body: JSON.stringify({
                    client_id: CLIENT_ID,
                    device_code: deviceCode,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
               }),
          });
          const data = await res.json();
          if (data.access_token) return data.access_token;
          if (data.error === 'authorization_pending') continue;
          if (data.error === 'slow_down') { await wait(5); continue; }
          if (data.error === 'expired_token') throw new Error('Code expired. Run: cannon auth login');
          if (data.error === 'access_denied') throw new Error('Authorization denied.');
          throw new Error(`OAuth error: ${data.error}`);
     }
}

async function _getUser(token) {
     const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
     });
     if (!res.ok) throw new Error(`GitHub API ${res.status}`);
     return res.json();
}

function _saveToken(token, username) {
     if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
     fs.writeFileSync(
          CREDS_FILE,
          JSON.stringify({ token, username, savedAt: new Date().toISOString() }, null, 2),
          { mode: 0o600 }  // only owner can read — no other users on the machine
     );
}

function _loadToken() {
     try {
          if (fs.existsSync(CREDS_FILE)) return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
     } catch { }
     return null;
}

function _openBrowser(url) {
     try {
          const { execSync } = require('child_process');
          const cmd =
               process.platform === 'darwin' ? `open "${url}"` :
                    process.platform === 'win32' ? `start "" "${url}"` :
                         `xdg-open "${url}"`;
          execSync(cmd);
     } catch { /* user opens manually */ }
}