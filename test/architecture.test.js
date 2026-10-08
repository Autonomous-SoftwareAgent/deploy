'use strict';
// Ranh giới giữa các lớp (docs/agent/ARCHITECTURE.md mục 2) do test này giữ, không do lời dặn.
// Quét mọi lệnh require và import trong src/ và ci/; một dòng nhập sai chiều là đỏ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MAX_LINES = 250;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Mọi thứ một tệp nhập: {spec, node: bool, target: đường dẫn tuyệt đối hoặc null}. */
function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [...text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g), ...text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  return specs.map((spec) => ({ spec, node: spec.startsWith('node:') || !spec.startsWith('.'), target: spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null }));
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
/** Lớp của một đường dẫn trong src: domain, application, infrastructure, interfaces/cli, interfaces/http, interfaces/web, composition. */
function layerOf(p) {
  const r = rel(p);
  if (!r.startsWith('src/')) return r.startsWith('ci/') ? 'ci' : 'outside';
  const parts = r.split('/');
  if (parts[1] === 'interfaces') return `interfaces/${parts[2]}`;
  return parts[1].replace(/\.js$/, '');
}

// Lớp nào được nhập lớp nào. node: tên module node được phép ('*' là mọi module; [] là không module nào).
const SIDE_EFFECT_FREE = ['node:path'];
const RULES = {
  domain: { layers: ['domain'], node: [] },
  application: { layers: ['domain', 'application'], node: [] },
  infrastructure: { layers: ['domain', 'infrastructure'], node: '*', files: ['src/application/ports'] },
  'interfaces/cli': { layers: ['domain', 'application', 'interfaces/cli'], node: SIDE_EFFECT_FREE },
  'interfaces/http': { layers: ['domain', 'application', 'interfaces/http'], node: ['node:http', 'node:fs', 'node:path'] },
  'interfaces/web': { layers: ['interfaces/web'], node: [] },
  // Lớp lắp ráp gồm composition.js (cửa vào) và các tệp trong composition/; chúng nhập lẫn nhau được.
  composition: { layers: ['domain', 'application', 'infrastructure', 'interfaces/cli', 'interfaces/http', 'composition'], node: '*' },
};

test('mỗi lớp chỉ nhập lớp được phép; application và domain không đụng tệp, tiến trình hay mạng', () => {
  const bad = [];
  for (const file of walk(SRC)) {
    const layer = layerOf(file);
    const rule = RULES[layer];
    assert.ok(rule, `tệp ${rel(file)} nằm ngoài mọi lớp đã khai`);
    for (const imp of importsOf(file)) {
      if (imp.node) {
        if (rule.node !== '*' && !rule.node.includes(imp.spec)) bad.push(`${rel(file)} (${layer}) nhập ${imp.spec}`);
        continue;
      }
      const to = layerOf(imp.target);
      const allowedFile = (rule.files || []).some((f) => rel(imp.target).replace(/\.js$/, '') === f);
      if (!rule.layers.includes(to) && !allowedFile) bad.push(`${rel(file)} (${layer}) nhập ${rel(imp.target)} (${to})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('ci/decide.js và ci/scan-image.js đứng một mình (workflow dùng chung chỉ lấy ci/ và services/ về máy của GitHub)', () => {
  for (const name of ['decide.js', 'scan-image.js']) {
    const outside = importsOf(path.join(ROOT, 'ci', name)).filter((i) => !i.node && layerOf(i.target) !== 'ci');
    assert.deepEqual(outside.map((i) => i.spec), [], `ci/${name} không được nhập gì ngoài ci/`);
  }
});

test('không tệp nào ngoài lớp infrastructure và composition chạy tiến trình ngoài', () => {
  const bad = walk(SRC).filter((f) => !['infrastructure', 'composition'].includes(layerOf(f)) && importsOf(f).some((i) => i.spec === 'node:child_process')).map(rel);
  assert.deepEqual(bad, []);
});

test(`không tệp nào trong src/ dài quá ${MAX_LINES} dòng (dấu hiệu một tệp đang làm hai việc)`, () => {
  const long = walk(SRC).map((f) => [rel(f), fs.readFileSync(f, 'utf8').split('\n').length]).filter(([, n]) => n > MAX_LINES);
  assert.deepEqual(long, []);
});

test('mọi lệnh của dòng lệnh có cùng một hình dạng và tên không trùng', () => {
  const { COMMANDS } = require('../src/interfaces/cli');
  const names = COMMANDS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const c of COMMANDS) assert.deepEqual([typeof c.name, typeof c.usage, typeof c.run], ['string', 'string', 'function'], `lệnh ${c.name}`);
});
