# 🛸 @alien-protocol/cannon

> Bulk-create GitHub issues from **CSV, PDF, DOCX, JSON, or any SQL database** — with randomized rate-limit delays, resume support, and secure token handling.

```
npm install @alien-protocol/cannon
```

---

## Table of Contents

- [🔫 @alien-protocol/cannon](#-alien-protocolcannon)
  - [Table of Contents](#table-of-contents)
  - [Quick Start](#quick-start)
  - [Secure Token Setup](#secure-token-setup)
    - [Option A — `.env` file (recommended for local dev)](#option-a--env-file-recommended-for-local-dev)
    - [Option B — Shell environment variable (recommended for CI/CD)](#option-b--shell-environment-variable-recommended-for-cicd)
    - [Option C — CI/CD Secrets (GitHub Actions example)](#option-c--cicd-secrets-github-actions-example)
    - [Creating a GitHub Personal Access Token (PAT)](#creating-a-github-personal-access-token-pat)
  - [CLI Usage](#cli-usage)
    - [CLI Examples](#cli-examples)
  - [Programmatic Usage](#programmatic-usage)
    - [Programmatic — from a database](#programmatic--from-a-database)
    - [Programmatic — from a raw array](#programmatic--from-a-raw-array)
  - [Issue Data Sources](#issue-data-sources)
    - [CSV](#csv)
    - [JSON](#json)
    - [PDF](#pdf)
    - [DOCX (Word)](#docx-word)
    - [PostgreSQL](#postgresql)
    - [MySQL](#mysql)
    - [SQLite](#sqlite)
  - [Configuration Reference](#configuration-reference)
  - [Delay / Rate Limiting](#delay--rate-limiting)
  - [Resume Support](#resume-support)
  - [Dry Run Mode](#dry-run-mode)
  - [Required Issue Fields](#required-issue-fields)
  - [Security Best Practices](#security-best-practices)
  - [License](#license)

---

## Quick Start

**1. Install**

```bash
npm install @alien-protocol/cannon
```

**2. Set your GitHub token securely**

```bash
cp node_modules/@alien-protocol/cannon/.env.example .env
# Edit .env and set GITHUB_TOKEN=ghp_yourtoken
```

**3. Prepare your issues file** (e.g. `issues.csv`)

```csv
repo,title,body,labels,milestone,priority,track
owner/repo,Fix login bug,"Steps to reproduce...",bug,v1.0,HIGH,auth
owner/repo,Add dark mode,"Users have requested...",enhancement,v1.1,MED,ui
```

**4. Fire**

```bash
npx @alien-protocol/cannon --source csv --file ./issues.csv
```

---

## Secure Token Setup

Your GitHub token is a secret. **Never hardcode it** in source files or `cannon.config.json`.

### Option A — `.env` file (recommended for local dev)

```bash
# .env  (add this to .gitignore!)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

The package automatically loads `.env` from your project root.

### Option B — Shell environment variable (recommended for CI/CD)

```bash
# Bash / Zsh
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
npx @alien-protocol/cannon --source csv --file ./issues.csv

# One-liner
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx npx @alien-protocol/cannon --source csv --file ./issues.csv
```

### Option C — CI/CD Secrets (GitHub Actions example)

```yaml
# .github/workflows/create-issues.yml
jobs:
  create:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx @alien-protocol/cannon --source csv --file ./issues.csv
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # or a PAT stored in repo secrets
```

### Creating a GitHub Personal Access Token (PAT)

1. Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
2. Give it a name, e.g. `@alien-protocol/cannon`
3. Set expiration (recommended: 90 days)
4. Select scopes:
   - **`repo`** — for private repos
   - **`public_repo`** — for public repos only
5. Click **Generate token** and copy it immediately (shown only once)

> **Fine-grained tokens**: If using a fine-grained PAT, grant **Issues: Read & Write** and **Metadata: Read** on the target repositories.

---

## CLI Usage

```
Usage: cannon [options]

Options:
  -s, --source <type>          Source type: csv | json | pdf | docx | postgres | mysql | sqlite
  -f, --file <path>            Path to source file
  -q, --query <sql>            SQL query (for database sources)
  --connection-string <url>    DB connection string
  --dry-run                    Preview without creating issues
  --no-resume                  Ignore saved progress and start fresh
  --delay-mode <mode>          random (default) | fixed
  --delay-min <ms>             Min random delay in ms (default: 240000 = 4 min)
  --delay-max <ms>             Max random delay in ms (default: 480000 = 8 min)
  --delay-fixed <ms>           Fixed delay in ms when --delay-mode fixed (default: 300000)
  -V, --version                Output the version number
  -h, --help                   Display help
```

### CLI Examples

```bash
# From a CSV file
npx @alien-protocol/cannon --source csv --file ./issues.csv

# From a JSON file, dry run first
npx @alien-protocol/cannon --source json --file ./issues.json --dry-run

# From PostgreSQL (connection string in .env as POSTGRES_URL)
npx @alien-protocol/cannon --source postgres \
  --connection-string "${POSTGRES_URL}" \
  --query "SELECT repo, title, body, labels, milestone FROM backlog WHERE done = false"

# Fixed 2-minute delay instead of random
npx @alien-protocol/cannon --source csv --file ./issues.csv \
  --delay-mode fixed --delay-fixed 120000

# Fast mode (shorter delays — use with caution)
npx @alien-protocol/cannon --source csv --file ./issues.csv \
  --delay-min 30000 --delay-max 60000
```

---

## Programmatic Usage

```js
import { IssueCannon } from '@alien-protocol/cannon';

const cannon = new IssueCannon({
  // token: 'ghp_...'  ← omit; use GITHUB_TOKEN env var instead
  dryRun: false,
  delay: {
    mode: 'random',
    minMs: 60_000,   // 1 min
    maxMs: 120_000,  // 2 min
  },
});

const { created, failed } = await cannon.fire({
  source: 'csv',
  file: './issues.csv',
});

console.log(`Created: ${created.length}, Failed: ${failed.length}`);
```

### Programmatic — from a database

```js
import { IssueCannon } from '@alien-protocol/cannon';

const cannon = new IssueCannon({ dryRun: false });

await cannon.fire({
  source: 'postgres',
  connectionString: process.env.POSTGRES_URL,
  query: `
    SELECT repo, title, body, labels, milestone
    FROM github_backlog
    WHERE exported = false
    ORDER BY priority DESC
  `,
});
```

### Programmatic — from a raw array

```js
await cannon.fire({
  source: 'array',
  data: [
    {
      repo: 'owner/repo',
      title: 'Fix the navbar',
      body: 'The navbar breaks on mobile.',
      labels: 'bug,mobile',
      milestone: 'v2.0',
    },
  ],
});
```

---

## Issue Data Sources

### CSV

**Required columns:** `repo`, `title`  
**Optional columns:** `body`, `labels` (comma-separated), `milestone`, `priority`, `track`

```csv
repo,title,body,labels,milestone,priority,track
owner/repo,Fix login bug,"Steps to reproduce...",bug,v1.0,HIGH,auth
owner/repo-web,Update API docs,"New endpoints need docs","documentation,api",v1.0,MED,docs
```

```bash
npx @alien-protocol/cannon --source csv --file ./issues.csv
```

---

### JSON

An array of issue objects with the same fields as CSV.

```json
[
  {
    "repo": "owner/repo",
    "title": "Fix login bug",
    "body": "Steps to reproduce...",
    "labels": "bug,auth",
    "milestone": "v1.0",
    "priority": "HIGH"
  }
]
```

```bash
npx @alien-protocol/cannon --source json --file ./issues.json
```

---

### PDF

Two layouts are auto-detected:

**Table layout** (rows separated by `|`):

```
repo              | title          | body                | labels
owner/repo        | Fix login bug  | Steps to reproduce  | bug,auth
```

**Block layout** (one issue per paragraph):

```
REPO: owner/repo
TITLE: Fix login bug
BODY: Steps to reproduce the issue here.
LABELS: bug, auth
MILESTONE: v1.0
PRIORITY: HIGH
```

```bash
npx @alien-protocol/cannon --source pdf --file ./issues.pdf
```

---

### DOCX (Word)

Create a table in your `.docx` file. First row = headers.

| repo | title | body | labels | milestone |
|------|-------|------|--------|-----------|
| owner/repo | Fix login bug | Steps to reproduce... | bug,auth | v1.0 |

```bash
npx @alien-protocol/cannon --source docx --file ./issues.docx
```

---

### PostgreSQL

```bash
# Set in .env
POSTGRES_URL=postgres://user:password@localhost:5432/mydb
```

```bash
npx @alien-protocol/cannon --source postgres \
  --connection-string "${POSTGRES_URL}" \
  --query "SELECT repo, title, body, labels, milestone FROM backlog WHERE exported = false"
```

Or programmatically:

```js
await cannon.fire({
  source: 'postgres',
  connectionString: process.env.POSTGRES_URL,
  query: 'SELECT repo, title, body, labels, milestone FROM backlog',
});
```

Your table needs columns that map to: `repo`, `title`, `body`, `labels`, `milestone`. Column names must match exactly.

---

### MySQL

```bash
MYSQL_URL=mysql://user:password@localhost:3306/mydb
```

```js
await cannon.fire({
  source: 'mysql',
  connectionString: process.env.MYSQL_URL,
  query: 'SELECT repo, title, body, labels FROM issues WHERE status = "pending"',
});
```

---

### SQLite

```js
await cannon.fire({
  source: 'sqlite',
  file: './backlog.db',
  query: 'SELECT repo, title, body, labels FROM issues',
});
```

---

## Configuration Reference

Copy `cannon.config.example.json` to `cannon.config.json` in your project root. Settings in this file are merged with the defaults.

```json
{
  "github": {
    "token": ""
  },
  "delay": {
    "mode": "random",
    "minMs": 240000,
    "maxMs": 480000,
    "fixedMs": 300000
  },
  "dryRun": false,
  "resumable": true
}
```

**Priority order for token resolution:**

```
code option { token: '...' }
    ↓ (fallback)
GITHUB_TOKEN environment variable
    ↓ (fallback)
.env file  →  GITHUB_TOKEN=...
    ↓ (fallback)
cannon.config.json  →  github.token
```

> Always prefer env vars. Never commit tokens to git.

---

## Delay / Rate Limiting

GitHub's API will rate-limit or flag you if you create issues too fast. The cannon adds delays between each issue.

| Mode | Description | Config |
|------|-------------|--------|
| `random` (default) | Random delay between `minMs` and `maxMs` | `delay.mode: "random"` |
| `fixed` | Always waits exactly `fixedMs` | `delay.mode: "fixed"` |

**Recommended minimums:**
- `minMs: 60000` (1 min) for small batches (< 20 issues)
- `minMs: 240000` (4 min) for large batches to avoid detection

```bash
# Fixed 90-second delay
npx @alien-protocol/cannon --source csv --file ./issues.csv \
  --delay-mode fixed --delay-fixed 90000
```

---

## Resume Support

If the process is interrupted (Ctrl+C, network error, etc.), progress is saved to `.cannon_state.json`. Re-running the same command will skip already-created issues.

```bash
# Restart from scratch (ignore saved state)
npx @alien-protocol/cannon --source csv --file ./issues.csv --no-resume
```

Add `.cannon_state.json` to your `.gitignore`.

---

## Dry Run Mode

Test your setup without creating any real issues:

```bash
npx @alien-protocol/cannon --source csv --file ./issues.csv --dry-run
```

This will:
- Verify your token has access to all target repos
- Print what would be created
- Show the delay schedule

---

## Required Issue Fields

Every issue (regardless of source) must have:

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | ✅ | Full repo name: `owner/repo` |
| `title` | ✅ | Issue title |
| `body` | — | Issue body / description |
| `labels` | — | Comma-separated label names |
| `milestone` | — | Milestone title (auto-created if missing) |
| `priority` | — | Informational: `HIGH`, `MED`, `LOW` |
| `track` | — | Informational: e.g. `auth`, `ui`, `docs` |

---

## Security Best Practices

1. **Never hardcode your token** — use `GITHUB_TOKEN` env var or `.env` file
2. **Add to `.gitignore`:**
   ```
   .env
   cannon.config.json
   .cannon_state.json
   ```
3. **Use short-lived tokens** — set an expiry (90 days max recommended)
4. **Minimum scopes** — use `public_repo` if only targeting public repos
5. **Fine-grained PATs** — grant only Issues + Metadata on specific repos
6. **Rotate tokens** — if a token is ever exposed, revoke it immediately at [github.com/settings/tokens](https://github.com/settings/tokens)
7. **CI/CD** — use repository or organization secrets, never hardcode in YAML

---

## License

MIT
