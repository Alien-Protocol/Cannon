# 🛸 @alien-protocol/cannon

> Bulk-create GitHub issues from **CSV, PDF, DOCX, JSON, or any SQL database** — with a single config file, safe-mode delays, duplicate detection, resume support, and secure token handling.

```bash
npm install @alien-protocol/cannon
```

---

## Table of Contents

- [🛸 @alien-protocol/cannon](#-alien-protocolcannon)
  - [Table of Contents](#table-of-contents)
  - [Quick Start (4 steps)](#quick-start-4-steps)
  - [The Config File](#the-config-file)
    - [All Config Options](#all-config-options)
  - [Commands](#commands)
    - [cannon init](#cannon-init)
    - [cannon auth](#cannon-auth)
    - [cannon validate](#cannon-validate)
    - [cannon fire](#cannon-fire)
  - [Safe Mode vs Unsafe Mode](#safe-mode-vs-unsafe-mode)
  - [Token Security](#token-security)
    - [Required Scopes](#required-scopes)
    - [How the Token is Stored](#how-the-token-is-stored)
    - [Token Resolution Order](#token-resolution-order)
  - [Issue Data Sources](#issue-data-sources)
    - [CSV](#csv)
    - [JSON](#json)
    - [PDF](#pdf)
    - [DOCX (Word)](#docx-word)
    - [PostgreSQL](#postgresql)
    - [MySQL](#mysql)
    - [SQLite](#sqlite)
  - [Programmatic Usage](#programmatic-usage)
  - [Security Best Practices](#security-best-practices)
  - [Suggested Features (Roadmap)](#suggested-features-roadmap)
    - [🏷️ Label Auto-Creation with Color Presets](#️-label-auto-creation-with-color-presets)
    - [📋 Issue Templates](#-issue-templates)
    - [🔔 Webhook / Notification on Completion](#-webhook--notification-on-completion)
    - [📊 Progress Dashboard (Web UI)](#-progress-dashboard-web-ui)
    - [🔁 Retry Failed Issues](#-retry-failed-issues)
    - [🏷️ Milestone Auto-Archive](#️-milestone-auto-archive)
    - [🔍 Duplicate Detection Modes](#-duplicate-detection-modes)
    - [📤 Export Created Issues](#-export-created-issues)
    - [🤖 AI-Powered Issue Enhancement](#-ai-powered-issue-enhancement)
    - [🔐 GitHub App Authentication](#-github-app-authentication)
  - [License](#license)

---

## Quick Start (4 steps)

```bash
# 1. Create your config file with all default settings
npx @alien-protocol/cannon init

# 2. Login with GitHub — no token or .env file needed
npx @alien-protocol/cannon auth login

# 3. Edit cannon.config.json to point at your issues file, then preview:
npx @alien-protocol/cannon fire --dry-run

# 4. Create issues for real:
npx @alien-protocol/cannon fire
```

That's it. Everything is configured from **one file**: `cannon.config.json`.

---

## The Config File

After running `cannon init`, open `cannon.config.json`. Every setting has an inline `_note` to explain it — no docs needed.

```json
{
  "source": {
    "type": "csv",
    "file": "./issues.csv"
  },

  "mode": {
    "dryRun": false,
    "safeMode": true,
    "resumable": true
  },

  "delay": {
    "mode": "random",
    "minMs": 240000,
    "maxMs": 480000
  },

  "labels": {
    "autoCreate": false,
    "colorMap": {
      "bug": "ee0701",
      "enhancement": "0075ca"
    }
  },

  "output": {
    "logFile": "./cannon-log.json",
    "showTable": true
  }
}
```

### All Config Options

| Key                       | Type    | Default    | Description                                                                                     |
| ------------------------- | ------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `source.type`             | string  | `"csv"`    | Where to load issues from. Options: `csv`, `json`, `pdf`, `docx`, `postgres`, `mysql`, `sqlite` |
| `source.file`             | string  | `""`       | Path to your issues file (csv / json / pdf / docx / sqlite)                                     |
| `source.query`            | string  | `""`       | SQL query for database sources                                                                  |
| `source.connectionString` | string  | `""`       | DB connection URL. Use `${ENV_VAR}` — never hardcode secrets                                    |
| `mode.dryRun`             | boolean | `false`    | Preview only — nothing is created                                                               |
| `mode.safeMode`           | boolean | `true`     | Add random delays between issues (recommended)                                                  |
| `mode.resumable`          | boolean | `true`     | Save progress so you can stop and restart                                                       |
| `delay.mode`              | string  | `"random"` | `random` = between min/max \| `fixed` = always fixedMs                                          |
| `delay.minMs`             | number  | `240000`   | Minimum random delay (4 min). Do not go below 60000                                             |
| `delay.maxMs`             | number  | `480000`   | Maximum random delay (8 min)                                                                    |
| `delay.fixedMs`           | number  | `300000`   | Delay when mode is `fixed` (5 min)                                                              |
| `labels.autoCreate`       | boolean | `false`    | Auto-create missing labels in GitHub                                                            |
| `labels.colorMap`         | object  | `{}`       | Map label names → hex colors for auto-creation                                                  |
| `output.logFile`          | string  | `""`       | Write a JSON results log to this path                                                           |
| `output.showTable`        | boolean | `true`     | Show a summary table after completion                                                           |
| `github.token`            | string  | `""`       | **Leave blank** — use OAuth or `GITHUB_TOKEN` env var instead                                   |

> **Tip:** All `_note` keys in the file are comments and are ignored by cannon.

---

## Commands

### cannon init

Creates `cannon.config.json` in your project with all default settings and inline documentation.

```bash
cannon init           # Create config (fails if already exists)
cannon init --force   # Overwrite existing config
```

---

### cannon auth

Secure GitHub authentication. **No token copying needed** — uses GitHub's OAuth Device Flow.

```bash
cannon auth login     # Open browser → enter code → done. Token saved securely.
cannon auth status    # Show who you're logged in as
cannon auth logout    # Remove saved credentials
```

How it works:

1. Cannon asks GitHub for a device code
2. You open `github.com/login/device` and enter the displayed code
3. GitHub sends a token back to cannon
4. Token is saved to `~/.cannon/credentials.json` with `chmod 600` permissions

No token is ever shown, copied, or stored in your project files.

---

### cannon validate

Check everything before firing — catches config errors, missing files, and auth issues before you waste time.

```bash
cannon validate
```

Checks:

- `cannon.config.json` exists and is valid JSON
- GitHub token is present
- Source file exists (for file-based sources)
- Safe mode is configured
- Issues can be loaded (dry loads your file)

---

### cannon fire

Create your issues.

```bash
# Standard run — uses everything from cannon.config.json
cannon fire

# Preview without creating anything
cannon fire --dry-run

# Skip all delays (RISKY — may trigger GitHub spam detection)
cannon fire --unsafe

# Start fresh, ignoring saved progress
cannon fire --no-resume

# Override source from the command line (ignores config source section)
cannon fire --source csv --file ./issues.csv
cannon fire --source json --file ./issues.json --dry-run

# Override delay settings from the CLI
cannon fire --delay-mode fixed --delay-fixed 120000
cannon fire --delay-min 30000 --delay-max 60000
```

All flags are **optional** — if omitted, the value comes from `cannon.config.json`.

---

## Safe Mode vs Unsafe Mode

|                      | Safe Mode (`safeMode: true`) | Unsafe Mode (`safeMode: false`)   |
| -------------------- | ---------------------------- | --------------------------------- |
| **Delays**           | Random delays between issues | No delays                         |
| **GitHub spam risk** | Low                          | High — may get your token flagged |
| **Estimated time**   | Longer                       | Near-instant                      |
| **Recommended for**  | All production use           | Local testing only                |

**Safe mode is on by default.** Always use it when creating more than ~5 issues.

Configure delay timing in `cannon.config.json`:

```json
"delay": {
  "mode": "random",
  "minMs": 240000,
  "maxMs": 480000
}
```

For a fixed delay instead:

```json
"delay": {
  "mode": "fixed",
  "fixedMs": 120000
}
```

Or override from the CLI for a one-off run:

```bash
cannon fire --delay-mode fixed --delay-fixed 90000
```

---

## Token Security

### Required Scopes

Cannon only needs **one scope**. Choose the minimum that covers your repos:

| Scope         | Use when                                                    |
| ------------- | ----------------------------------------------------------- |
| `public_repo` | All your target repos are **public** — use this, it's safer |
| `repo`        | Any of your target repos are **private**                    |

> **Fine-grained PATs (recommended):** Grant only `Issues: Read & Write` and `Metadata: Read` on specific repos. This limits blast radius if the token is ever leaked.

### How the Token is Stored

When you run `cannon auth login`:

- Token is saved to `~/.cannon/credentials.json` (your home directory, **not** your project)
- The file is created with `mode 0o600` — readable only by your user
- It is never written to `cannon.config.json`, `.env`, or your project directory

When you set `GITHUB_TOKEN` in `.env`:

- The `.env` file lives in your project root
- Add `.env` to your `.gitignore` (cannon's default `.gitignore` already does this)
- The token is loaded into memory at runtime and never logged

### Token Resolution Order

Cannon looks for a token in this order — the first one found is used:

```
1. Code option:  new IssueCannon({ token: '...' })      ← highest priority
2. Shell env:    GITHUB_TOKEN=ghp_xxx cannon fire
3. .env file:    GITHUB_TOKEN=ghp_xxx  (in project root)
4. OAuth login:  ~/.cannon/credentials.json
5. Config file:  cannon.config.json  github.token       ← not recommended
```

---

## Issue Data Sources

Every source must provide these fields per issue:

| Field       | Required | Description                               |
| ----------- | -------- | ----------------------------------------- |
| `repo`      | ✅       | Full repo: `owner/repo`                   |
| `title`     | ✅       | Issue title                               |
| `body`      | —        | Issue description                         |
| `labels`    | —        | Comma-separated label names               |
| `milestone` | —        | Milestone title (auto-created if missing) |
| `priority`  | —        | Informational: `HIGH`, `MED`, `LOW`       |
| `track`     | —        | Informational: e.g. `auth`, `ui`, `docs`  |

### CSV

```csv
repo,title,body,labels,milestone,priority,track
owner/repo,Fix login bug,"Steps to reproduce...",bug,v1.0,HIGH,auth
owner/repo,Add dark mode,"User request",enhancement,v1.1,MED,ui
```

Config:

```json
"source": { "type": "csv", "file": "./issues.csv" }
```

### JSON

```json
[
  {
    "repo": "owner/repo",
    "title": "Fix login bug",
    "body": "Steps to reproduce...",
    "labels": "bug,auth",
    "milestone": "v1.0"
  }
]
```

Config:

```json
"source": { "type": "json", "file": "./issues.json" }
```

### PDF

Two layouts are auto-detected:

**Block layout** (one issue per paragraph):

```
REPO: owner/repo
TITLE: Fix login bug
BODY: Steps to reproduce the issue here.
LABELS: bug, auth
MILESTONE: v1.0
```

**Table layout** (pipe or tab separated):

```
repo        | title         | body   | labels
owner/repo  | Fix login bug | Steps  | bug,auth
```

Config:

```json
"source": { "type": "pdf", "file": "./issues.pdf" }
```

### DOCX (Word)

Create a table in your `.docx`. First row = headers.

| repo       | title         | body     | labels   | milestone |
| ---------- | ------------- | -------- | -------- | --------- |
| owner/repo | Fix login bug | Steps... | bug,auth | v1.0      |

Config:

```json
"source": { "type": "docx", "file": "./issues.docx" }
```

### PostgreSQL

```bash
# .env
POSTGRES_URL=postgres://user:password@localhost:5432/mydb
```

Config:

```json
"source": {
  "type": "postgres",
  "connectionString": "${POSTGRES_URL}",
  "query": "SELECT repo, title, body, labels, milestone FROM backlog WHERE exported = false"
}
```

### MySQL

Config:

```json
"source": {
  "type": "mysql",
  "connectionString": "${MYSQL_URL}",
  "query": "SELECT repo, title, body, labels FROM issues WHERE status = 'pending'"
}
```

### SQLite

Config:

```json
"source": {
  "type": "sqlite",
  "file": "./backlog.db",
  "query": "SELECT repo, title, body, labels FROM issues"
}
```

---

## Programmatic Usage

```js
import { IssueCannon } from '@alien-protocol/cannon';

const cannon = new IssueCannon({
  // All settings from cannon.config.json are loaded automatically.
  // Pass overrides here only when needed:
  safeMode: true,
  dryRun: false,
});

// Source is read from cannon.config.json by default.
// Pass sourceOpts to override:
const { created, failed } = await cannon.fire({
  source: 'csv',
  file: './issues.csv',
});

console.log(`Created: ${created.length}, Failed: ${failed.length}`);
```

---

## Security Best Practices

1. **Use OAuth login** — `cannon auth login` is the safest option. No token ever touches your files.
2. **Use fine-grained PATs** — Grant only `Issues: Read & Write` + `Metadata: Read` on specific repos.
3. **Use `public_repo` scope** if all your repos are public — limits exposure.
4. **Never put tokens in `cannon.config.json`** — the `github.token` field exists only as a last resort.
5. **Add these to `.gitignore`:**
   ```
   .env
   .cannon_state.json
   cannon-log.json
   ```
   > `cannon.config.json` is safe to commit **only if** you keep `github.token` blank and use OAuth or env vars.
6. **Rotate tokens** if one is ever exposed: [github.com/settings/tokens](https://github.com/settings/tokens)
7. **Set token expiry** — 90 days maximum recommended.
8. **Use `cannon validate`** before every large batch to catch problems early.

---

## Suggested Features (Roadmap)

Here are improvements that would significantly enhance the user experience:

### 🏷️ Label Auto-Creation with Color Presets

Already partially implemented via `labels.autoCreate` + `labels.colorMap`. Could be extended with a built-in library of common label color presets (GitHub's default label palette) so users don't need to look up hex codes.

### 📋 Issue Templates

Allow `cannon.config.json` to define a `bodyTemplate` string with `{{variables}}` that gets merged per-issue. Useful when all issues share a common structure (e.g., bug report format, feature request format).

### 🔔 Webhook / Notification on Completion

Add an `output.webhookUrl` option to POST a JSON summary to a Slack/Discord/Teams webhook when the batch finishes. Critical for long-running batches where you walk away.

### 📊 Progress Dashboard (Web UI)

A `cannon serve` command that opens a local browser dashboard showing real-time progress, a live feed of created issues, and a retry button for failed ones.

### 🔁 Retry Failed Issues

After a run, `cannon retry` could re-read `.cannon_state.json` and retry only the failed issues — no need to re-run the whole batch.

### 🏷️ Milestone Auto-Archive

Option to automatically close milestones after all their issues are created: `milestones.autoClose: true`.

### 🔍 Duplicate Detection Modes

Currently duplicates are detected by exact title match. Options could include: `fuzzy` (Levenshtein distance), `exact` (current), `none` (always create).

### 📤 Export Created Issues

After a run, export a CSV/JSON of all created issues with their GitHub URLs — useful for tracking and sharing with your team.

### 🤖 AI-Powered Issue Enhancement

Integrate the Anthropic API to automatically improve issue titles and bodies for clarity before creating them. Opt-in via `ai.enhance: true`.

### 🔐 GitHub App Authentication

Support GitHub Apps (not just PATs/OAuth) for organization-wide deployments where individual user tokens aren't appropriate.

---

## License

MIT
