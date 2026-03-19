# 🛸 @alien-protocol/cannon

> Bulk-create GitHub issues from **CSV, PDF, DOCX, JSON, or any SQL database** — one config file, safe delays, duplicate detection, and resume support.

```bash
npm install @alien-protocol/cannon
```

---

## Quick Start

```bash
# 1. Create your config file
cannon init

# 2. Login with GitHub (no token needed)
cannon auth login

# 3. Preview — nothing gets created
cannon fire --preview

# 4. Create your issues
cannon fire
```

---

## The Config File

`cannon init` creates this in your project. Edit it, then run `cannon fire`.

```json
{
  "source": {
    "//": "type options: csv | json | pdf | docx | sqlite | postgres | mysql",
    "type": "csv",
    "file": "./issues.csv"
  },

  "mode": {
    "//": "safeMode adds random delays — always keep true for large batches",
    "safeMode": true,
    "dryRun": false,
    "resumable": true
  },

  "delay": {
    "//": "minutes between each issue — only used when safeMode is true",
    "min": 4,
    "max": 8
  },

  "labels": {
    "//": "autoCreate will create missing labels in GitHub automatically",
    "autoCreate": false,
    "colors": {
      "bug":           "ee0701",
      "enhancement":   "0075ca",
      "documentation": "0052cc",
      "security":      "e11d48",
      "performance":   "f97316",
      "accessibility": "8b5cf6"
    }
  },

  "output": {
    "//": "logFile path to save a JSON log after each run — leave blank to skip",
    "logFile": "",
    "showTable": true
  },

  "notify": {
    "//": "webhookUrl accepts any Slack / Discord / Teams incoming webhook URL",
    "webhookUrl": "",
    "onSuccess": true,
    "onFailure": true
  }
}
```

### Config Options

| Key | Default | Description |
|-----|---------|-------------|
| `source.type` | `csv` | `csv` · `json` · `pdf` · `docx` · `sqlite` · `postgres` · `mysql` |
| `source.file` | `./issues.csv` | Path to your issues file |
| `source.query` | — | SQL query (database sources only) |
| `source.connectionString` | — | DB connection URL — use `${ENV_VAR}`, never hardcode |
| `mode.safeMode` | `true` | Random delays between issues — keeps you off GitHub's radar |
| `mode.dryRun` | `false` | Preview only, nothing created |
| `mode.resumable` | `true` | Saves progress so you can stop and restart safely |
| `delay.min` | `4` | Minimum minutes between issues |
| `delay.max` | `8` | Maximum minutes between issues |
| `labels.autoCreate` | `false` | Auto-create missing labels in GitHub |
| `labels.colors` | see above | Label name → hex color for auto-creation |
| `output.logFile` | — | Save a JSON results log to this path |
| `output.showTable` | `true` | Show a summary table after completion |
| `notify.webhookUrl` | — | Slack / Discord / Teams webhook URL |
| `notify.onSuccess` | `true` | Notify when batch completes successfully |
| `notify.onFailure` | `true` | Notify when any issues fail |

---

## Commands

### `cannon init`
Creates `cannon.config.json` with defaults. Edit it, then fire.

```bash
cannon init            # create config
cannon init --force    # overwrite existing config
```

---

### `cannon auth`
Secure GitHub login — no token copying needed.

```bash
cannon auth login      # login via GitHub OAuth
cannon auth status     # show who you're logged in as
cannon auth logout     # remove saved credentials
```

How it works: cannon shows you a short code → you enter it at `github.com/login/device` → done. Token is saved to `~/.cannon/credentials.json`, never in your project.

---

### `cannon validate`
Checks everything before you fire — catches problems early.

```bash
cannon validate
```

Checks your config is valid JSON · token is present · source file exists · issues can be loaded.

---

### `cannon fire`
Create your issues.

```bash
cannon fire                          # run using cannon.config.json
cannon fire --preview                # dry run — nothing created, no delays
cannon fire --unsafe                 # no delays (fast but risky)
cannon fire --delay 2                # fixed 2-minute delay between issues
cannon fire --fresh                  # ignore saved progress, start over

# override source without editing config
cannon fire -s csv  -f ./issues.csv
cannon fire -s json -f ./issues.json --preview
cannon fire -s docx -f ./issues.docx --delay 1
cannon fire -s pdf  -f ./issues.pdf  --unsafe
```

| Flag | What it does |
|------|-------------|
| `--preview` | Dry run — shows what would be created, skips all delays |
| `--unsafe` | No delays at all — fast but GitHub may flag as spam |
| `--delay <mins>` | Fixed delay in minutes, e.g. `--delay 2` |
| `--fresh` | Ignore saved progress and start from the beginning |
| `-s <type>` | Source type override |
| `-f <path>` | Source file override |
| `-q <sql>` | SQL query override (database sources) |

---

## Safe Mode vs Unsafe Mode

| | Safe (`safeMode: true`) | Unsafe (`safeMode: false`) |
|--|--|--|
| Delays | Random, 4–8 min by default | None |
| GitHub spam risk | Low | High |
| Recommended for | All real runs | Testing only |

Safe mode is on by default. For large batches never turn it off.

---

## Issue Sources

Every source needs at minimum: `repo` and `title`.

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | ✅ | `owner/repo` |
| `title` | ✅ | Issue title |
| `body` | — | Description |
| `labels` | — | Comma-separated: `bug,auth` |
| `milestone` | — | Auto-created if it doesn't exist |
| `priority` | — | `HIGH` · `MED` · `LOW` (informational) |
| `track` | — | e.g. `auth`, `ui`, `docs` (informational) |

### CSV
```csv
repo,title,body,labels,milestone
owner/repo,Fix login bug,"Steps to reproduce...",bug,v1.0
owner/repo,Add dark mode,"User request",enhancement,v1.1
```
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
```json
"source": { "type": "json", "file": "./issues.json" }
```

### PDF
Two layouts are auto-detected.

**Block layout:**
```
REPO: owner/repo
TITLE: Fix login bug
BODY: Steps to reproduce.
LABELS: bug, auth
MILESTONE: v1.0
```

**Table layout** (pipe-separated):
```
repo       | title         | body  | labels
owner/repo | Fix login bug | Steps | bug,auth
```
```json
"source": { "type": "pdf", "file": "./issues.pdf" }
```

### DOCX
A table in your Word file. First row = headers.

| repo | title | body | labels |
|------|-------|------|--------|
| owner/repo | Fix login bug | Steps... | bug,auth |

```json
"source": { "type": "docx", "file": "./issues.docx" }
```

### PostgreSQL
```bash
# .env
POSTGRES_URL=postgres://user:password@localhost:5432/mydb
```
```json
"source": {
  "type": "postgres",
  "connectionString": "${POSTGRES_URL}",
  "query": "SELECT repo, title, body, labels, milestone FROM backlog WHERE exported = false"
}
```

### MySQL
```json
"source": {
  "type": "mysql",
  "connectionString": "${MYSQL_URL}",
  "query": "SELECT repo, title, body, labels FROM issues WHERE status = 'pending'"
}
```

### SQLite
```json
"source": {
  "type": "sqlite",
  "file": "./backlog.db",
  "query": "SELECT repo, title, body, labels FROM issues"
}
```

---

## Token Security

### Minimum required scope
- `public_repo` — if all your repos are public
- `repo` — if any repo is private
- Fine-grained PAT — grant only `Issues: Read & Write` + `Metadata: Read` on specific repos

### How the token is stored
`cannon auth login` saves your token to `~/.cannon/credentials.json` with `chmod 600` — only your user can read it. It is never written to your project directory.

### Token resolution order
```
1. new IssueCannon({ token: '...' })   ← programmatic
2. GITHUB_TOKEN env var
3. .env file  →  GITHUB_TOKEN=ghp_xxx
4. cannon auth login  →  ~/.cannon/credentials.json
5. cannon.config.json  github.token   ← last resort, not recommended
```

### `.gitignore` — add these
```
.env
.cannon_state.json
cannon-log.json
```
`cannon.config.json` is safe to commit as long as `github.token` is blank.

---

## Programmatic Usage

```js
import { IssueCannon } from '@alien-protocol/cannon';

const cannon = new IssueCannon({
  safeMode: true,
  dryRun: false,
});

const { created, failed } = await cannon.fire({
  source: 'csv',
  file: './issues.csv',
});

console.log(`Created: ${created.length}  Failed: ${failed.length}`);
```

---

## Roadmap

| Feature | Description |
|---------|-------------|
| `cannon retry` | Re-run only the failed issues from the last batch |
| Issue templates | Define a `bodyTemplate` in config with `{{variables}}` per issue |
| Webhook notify | POST a summary to Slack/Discord/Teams on completion *(config ready, coming soon)* |
| `cannon serve` | Local web dashboard with live progress and retry button |
| Fuzzy duplicate detection | Catch near-duplicate titles, not just exact matches |
| Milestone auto-close | Auto-close milestones once all their issues are created |
| AI issue enhancement | Improve titles and bodies via Anthropic API before creating |
| GitHub App auth | Org-wide auth without individual user tokens |

---

## License

MIT
