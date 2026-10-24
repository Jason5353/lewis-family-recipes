// Small GitHub helpers shared by the Pages Functions (import + delete).
// Uses GITHUB_TOKEN, GITHUB_REPO and GITHUB_BRANCH from the Pages project settings.

export function github(env) {
  const repo = env.GITHUB_REPO, branch = env.GITHUB_BRANCH || 'main';
  const gh = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'lewis-family-recipes-importer',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const e = new Error(`GitHub ${res.status} on ${path.split('?')[0]}`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  };

  // Read a file on the branch. Returns null if it isn't there.
  async function readFile(path) {
    try {
      const f = await gh(`/contents/${path}?ref=${encodeURIComponent(branch)}`);
      return { sha: f.sha, text: f.content ? new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))) : '' };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // One commit containing every change, via the Git Data API.
  // files: { path, content } | { path, base64 } | { path, delete: true }
  async function commit(message, files) {
    const ref = await gh(`/git/ref/heads/${branch}`);
    const parent = await gh(`/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const f of files) {
      if (f.delete) {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
      } else if (f.base64) {
        const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.base64, encoding: 'base64' }) });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      } else {
        tree.push({ path: f.path, mode: '100644', type: 'blob', content: f.content });
      }
    }
    const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }) });
    await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  }

  return { gh, readFile, commit };
}
