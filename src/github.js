const GITHUB_API = 'https://api.github.com';

export async function verifyToken(repo, token) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers: authHeaders(token),
  });
  return res.ok ? null : res.status;
}

const _milestoneCache = {};

export async function getOrCreateMilestone(repo, milestoneName, token) {
  if (!milestoneName) return null;
  const key = `${repo}::${milestoneName}`;
  if (_milestoneCache[key] !== undefined) return _milestoneCache[key];

  const listRes = await fetch(`${GITHUB_API}/repos/${repo}/milestones?state=all&per_page=50`, {
    headers: authHeaders(token),
  });
  if (!listRes.ok) return (_milestoneCache[key] = null);

  const milestones = await listRes.json();
  const existing = milestones.find((m) => m.title === milestoneName);
  if (existing) return (_milestoneCache[key] = existing.number);

  const createRes = await fetch(`${GITHUB_API}/repos/${repo}/milestones`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: milestoneName }),
  });
  if (!createRes.ok) return (_milestoneCache[key] = null);
  const created = await createRes.json();
  return (_milestoneCache[key] = created.number);
}

// ── Label auto-creation ───────────────────────────────────────────

const _labelCache = {};

export async function ensureLabel(repo, name, color, token) {
  const key = `${repo}::${name}`;
  if (_labelCache[key]) return;

  const listRes = await fetch(`${GITHUB_API}/repos/${repo}/labels?per_page=100`, {
    headers: authHeaders(token),
  });
  if (listRes.ok) {
    const labels = await listRes.json();
    if (labels.find((l) => l.name === name)) {
      _labelCache[key] = true;
      return;
    }
  }

  const createRes = await fetch(`${GITHUB_API}/repos/${repo}/labels`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color: color.replace('#', '') }),
  });
  _labelCache[key] = createRes.ok;
}

const _existingTitles = {};
const _issueNumberCache = {};

async function fetchExistingIssues(repo, token) {
  if (_existingTitles[repo]) return _existingTitles[repo];
  const titles = new Set();
  let page = 1;
  while (true) {
    const res = await fetch(
      `${GITHUB_API}/repos/${repo}/issues?state=all&per_page=100&page=${page}`,
      { headers: authHeaders(token) }
    );
    if (!res.ok) break;
    const items = await res.json();
    if (!items.length) break;
    items.forEach((i) => {
      const key = i.title.trim().toLowerCase();
      titles.add(key);
      // Cache issue number by title for update lookup
      if (!_issueNumberCache[repo]) _issueNumberCache[repo] = {};
      _issueNumberCache[repo][key] = i.number;
    });
    if (items.length < 100) break;
    page++;
  }
  _existingTitles[repo] = titles;
  return titles;
}

/**
 * Find an existing issue number by title.
 * Returns null if not found.
 */
export async function findIssueByTitle(repo, title, token) {
  await fetchExistingIssues(repo, token);
  const key = title.trim().toLowerCase();
  const number = _issueNumberCache[repo]?.[key];
  return number ?? null;
}

/**
 * Create a single GitHub issue.
 * Skips duplicates (same title already exists in repo).
 */
export async function createIssue(issue, token, dryRun = false) {
  const repo = issue.repo?.trim();
  if (!repo) throw new Error(`Issue missing 'repo': "${issue.title}"`);

  if (!dryRun) {
    const existing = await fetchExistingIssues(repo, token);
    if (existing.has(issue.title.trim().toLowerCase())) {
      throw new Error(`DUPLICATE: issue already exists in ${repo}`);
    }
  }

  const labels = normLabels(issue.labels);
  const milestoneNumber = await getOrCreateMilestone(repo, issue.milestone, token);

  const payload = {
    title: issue.title?.trim(),
    body: issue.body?.trim() ?? '',
    labels,
    ...(milestoneNumber ? { milestone: milestoneNumber } : {}),
  };

  if (dryRun) {
    return { html_url: `https://github.com/${repo}/issues/0`, number: 0, _dryRun: true };
  }

  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    const hint =
      res.status === 403
        ? ' — check token has "repo" or "public_repo" scope'
        : res.status === 401
          ? ' — token invalid or expired; run: cannon auth login'
          : '';
    throw new Error(`GitHub ${res.status} on ${repo}${hint}: ${text}`);
  }

  const created = await res.json();
  if (_existingTitles[repo]) {
    _existingTitles[repo].add(created.title.trim().toLowerCase());
  }
  return created;
}

/**
 * Update an existing GitHub issue by title match.
 * Finds the issue number from the repo, then PATCHes it.
 *
 * @param {object}  issue   — { repo, title, body, labels, milestone }
 * @param {string}  token   — GitHub PAT
 * @param {boolean} dryRun  — if true, returns a fake response without hitting the API
 */
export async function updateIssue(issue, token, dryRun = false) {
  const repo = issue.repo?.trim();
  if (!repo) throw new Error(`Issue missing 'repo': "${issue.title}"`);

  if (dryRun) {
    return {
      html_url: `https://github.com/${repo}/issues/0`,
      number: 0,
      _dryRun: true,
      _updated: true,
    };
  }

  // Find existing issue number by title
  const issueNumber = await findIssueByTitle(repo, issue.title, token);
  if (!issueNumber) {
    throw new Error(`UPDATE_NOT_FOUND: no issue with title "${issue.title}" found in ${repo}`);
  }

  const labels = normLabels(issue.labels);
  const milestoneNumber = await getOrCreateMilestone(repo, issue.milestone, token);

  const payload = {
    title: issue.title?.trim(),
    body: issue.body?.trim() ?? '',
    labels,
    ...(milestoneNumber ? { milestone: milestoneNumber } : {}),
  };

  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    const hint =
      res.status === 403
        ? ' — check token has "repo" or "public_repo" scope'
        : res.status === 401
          ? ' — token invalid or expired; run: cannon auth login'
          : '';
    throw new Error(`GitHub ${res.status} on ${repo}#${issueNumber}${hint}: ${text}`);
  }

  const updated = await res.json();
  return { ...updated, _updated: true };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function normLabels(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((l) => l.trim()).filter(Boolean);
  return raw
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
}