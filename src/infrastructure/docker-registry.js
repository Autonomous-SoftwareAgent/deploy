'use strict';
// Cổng Registry trên Docker Hub: hỏi một bản đã có chưa bằng `docker manifest inspect` (chỉ hỏi, không kéo về), và lấy
// mọi nhãn của một kho bằng API công khai của Docker Hub (một lần gọi thay cho mỗi commit một lần hỏi).
const HUB = 'https://hub.docker.com/v2';
const MAX_PAGES = 5;

/** opts.getJson(url) -> Promise<{status, body}> cho test thay đường mạng. */
function makeDockerRegistry({ run, getJson = defaultGetJson }) {
  return {
    async lookup(remote) {
      const r = run('docker', ['manifest', 'inspect', remote]);
      return { present: r.status === 0, reason: r.status === 0 ? '' : (r.stderr || r.stdout).trim().split('\n').pop() };
    },
    async tags(repository) {
      if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(repository || '')) return null;
      const all = [];
      let url = `${HUB}/repositories/${repository}/tags?page_size=100`;
      try {
        for (let page = 0; url && page < MAX_PAGES; page++) {
          const res = await getJson(url);
          if (res.status === 404) return []; // kho chưa có: chưa đẩy bản nào
          if (res.status !== 200 || !res.body || !Array.isArray(res.body.results)) return null;
          for (const t of res.body.results) if (t && typeof t.name === 'string') all.push(t.name);
          url = typeof res.body.next === 'string' && res.body.next.startsWith(HUB) ? res.body.next : null;
        }
        return all;
      } catch { return null; }
    },
  };
}

async function defaultGetJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  let body = null;
  try { body = await res.json(); } catch { /* không phải JSON */ }
  return { status: res.status, body };
}

module.exports = { makeDockerRegistry };
