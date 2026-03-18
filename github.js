/**
 * github.js — thin wrapper around the GitHub REST API
 */

const GITHUB_API = 'https://api.github.com';

/** Returns null if OK, or HTTP status code if not. */
export async function verifyToken(repo, token) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers: authHeaders(token),
  });
  return res.ok ? null : res.status;
}

/** Milestone cache keyed by "owner/repo::milestone title" */
const _milestoneCache = {};

export async function getOrCreateMilestone(repo, milestoneName, token) {
  if (!milestoneName) return null;
  const key = `${repo}::${milestoneName}`;
  if (_milestoneCache[key] !== undefined) return _milestoneCache[key];

  const listRes = await fetch(
    `${GITHUB_API}/repos/${repo}/milestones?state=all&per_page=50`,
    { headers: authHeaders(token) }
  );

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

/**
 * Create a single GitHub issue.
 * @param {object} issue   — { repo, title, body, labels, milestone }
 * @param {string} token   — GitHub PAT
 * @param {boolean} dryRun — if true, returns a fake response
 */
export async function createIssue(issue, token, dryRun = false) {
  const repo = issue.repo?.trim();
  if (!repo) throw new Error(`Issue missing 'repo': "${issue.title}"`);

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
    throw new Error(`GitHub ${res.status} on ${repo}: ${text}`);
  }
  return res.json();
}

// ── Internal helpers ──────────────────────────
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
  return raw.split(',').map((l) => l.trim()).filter(Boolean);
}
