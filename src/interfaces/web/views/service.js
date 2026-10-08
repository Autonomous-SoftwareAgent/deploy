// Màn 2: Chi tiết một dịch vụ. Mọi danh sách ở đây chỉ chứa dữ liệu của đúng dịch vụ đó.
import { h, short, ago } from '../dom.js';
import { T } from '../text.js';

const S = T.service;
const KIND_CHIP = { deploy: 'run', rollback: 'rbk', 'auto-revert': 'warn', up: '' };

const noSource = (what) => h('div', { class: 'nosrc' }, h('b', null, S.noSource), what);

function envCard(c, id, actions) {
  const e = c.environment;
  const head = h('div', { class: 'row', css: { 'justify-content': 'space-between' } }, h('b', null, e.name),
    c.deployed ? h('span', { class: 'row', css: { gap: '6px' } }, h('span', { class: `sdot ${c.health || ''}` }), h('span', { class: `stx ${c.health || ''}` }, T.health[c.health] || T.dash)) : null);
  const body = c.unreachable ? [h('div', { class: 'callout bad' }, S.env.unreachable(c.error || ''))]
    : !c.deployed ? [h('div', { class: 'mut' }, c.absent ? S.env.absent : S.env.none)]
      : [h('div', { class: 'l1' }, h('span', { class: 'mono hash' }, short(c.commit.sha)), h('span', { class: 'msg', title: c.commit.message || '' }, c.commit.message || T.overview.cell.unknownCommit)),
        h('div', { class: 'xs mut' }, S.env.meta(c.commit.author || S.env.unknownAuthor, ago(c.deployedAt), c.head ? c.head.shortSha.slice(0, 7) : S.env.notDeclared)),
        c.behindCount > 0 ? h('span', null, h('span', { class: 'chip warn' }, T.overview.cell.behind(c.behindCount))) : c.differsFromDeclared ? h('span', null, h('span', { class: 'chip warn' }, T.overview.cell.differs)) : null,
        h('div', { class: 'xs mut' }, S.env.charts)];
  return h('div', { class: 'ecard', css: { 'border-top': `3px solid ${e.color}` } }, head, body,
    h('div', { class: 'row' }, h('button', { class: 'btn sm pri', disabled: !!c.unreachable || !!c.absent, onclick: () => actions.openDialog('deploy', [id], { environmentId: e.id }) }, S.env.deploy),
      h('button', { class: 'btn sm', disabled: !c.deployed, onclick: () => actions.openDialog('rollback', [id], { environmentId: e.id }) }, S.env.rollback)));
}

function deployments(d) {
  if (!d.deployments.length) return h('div', { class: 'empty' }, S.deployments.empty);
  const color = Object.fromEntries(d.environments.map((c) => [c.environment.id, c.environment.color]));
  return h('div', { class: 'panel', css: { overflow: 'hidden' } }, d.deployments.map((x) => h('div', { class: 'tlrow' },
    h('span', { class: 'dot', css: { background: color[x.environmentId] || '#888' } }), h('b', null, x.environmentName), h('span', { class: `chip ${KIND_CHIP[x.kind] || ''}` }, T.kind[x.kind] || x.kind),
    h('span', { class: 'mono hash' }, short(x.commit.sha)), h('span', { css: { flex: '1 1 200px', 'min-width': '0' } }, x.commit.message || ''),
    h('span', { class: 'xs mut' }, `${x.by || S.deployments.unknownBy} · ${ago(x.at)}`), h('span', { class: `stx ${x.result === 'ok' ? 'healthy' : 'failed'}` }, x.result === 'ok' ? S.deployments.ok : S.deployments.bad),
    x.reason ? h('div', { class: 'xs', css: { 'flex-basis': '100%', color: 'var(--bad)' } }, x.reason) : null)));
}

function commits(d, id, actions) {
  if (!d.commits.length) return noSource(S.commits.noRepo);
  const env = Object.fromEntries(d.environments.map((c) => [c.environment.id, c.environment]));
  return h('div', null, d.service.registryReachable ? null : h('div', { class: 'banner warn' }, S.commits.registry),
    h('div', { class: 'panel', css: { overflow: 'hidden' } }, d.commits.map((c) => h('div', { class: 'crow' },
      h('span', { class: 'mono hash', css: { 'font-size': '13px' } }, short(c.sha)),
      h('div', { css: { flex: '1 1 220px', 'min-width': '0' } }, h('div', { css: { 'font-weight': '500' } }, c.message), h('div', { class: 'xs mut' }, `${c.author} · ${ago(c.committedAt)}`)),
      h('span', { class: `stx ${c.build}` }, T.build[c.build] || c.build),
      c.declared ? h('span', { class: 'chip ov' }, S.commits.declared) : null,
      c.runningIn.map((eid) => h('span', { class: 'chip', css: { background: env[eid] ? env[eid].color : '#888', color: '#fff' } }, S.commits.runningIn(env[eid] ? env[eid].name : eid))),
      h('div', { class: 'row', css: { gap: '6px' } },
        h('button', { class: 'btn sm pri', disabled: c.build === 'none', title: c.build === 'none' ? S.commits.noImage : '', onclick: () => actions.openDialog('deploy', [id], { targetSha: c.sha }) }, S.commits.deploy),
        h('button', { class: 'btn sm', onclick: () => actions.openDialog('rollback', [id], { targetSha: c.sha }) }, S.commits.rollback))))));
}

function logs(d, state, actions) {
  const live = d.environments.filter((c) => c.deployed);
  if (!live.length) return h('div', { class: 'empty' }, S.logs.none);
  const cur = state.serviceLogs || { environmentId: live[0].environment.id, lines: [], error: '', loading: true };
  const time = (iso) => (iso ? String(iso).slice(11, 19) : '--:--:--');
  return h('div', { class: 'stack' }, h('div', { class: 'mut' }, S.logs.lead),
    h('div', { class: 'row', css: { 'justify-content': 'space-between' } },
      h('div', { class: 'seg', role: 'group', 'aria-label': S.logs.environment }, live.map((c) => h('button', { class: `segb ${c.environment.id === cur.environmentId ? 'on' : ''}`, onclick: () => actions.loadLogs(c.environment.id) }, h('span', { class: 'dot', css: { background: c.environment.color } }), c.environment.name))),
      h('button', { class: 'btn sm', disabled: cur.loading, onclick: () => actions.loadLogs(cur.environmentId) }, cur.loading ? S.logs.loading : S.logs.refresh)),
    cur.error ? h('div', { class: 'callout bad' }, cur.error) : null,
    cur.lines.length ? h('div', { class: 'term', css: { 'max-height': '520px' } }, cur.lines.map((l) => h('div', null, h('span', { class: 'dim' }, time(l.at)), ' ', l.text))) : cur.loading || cur.error ? null : h('div', { class: 'empty' }, S.logs.empty));
}

function variables(d) {
  if (!d.variables.length) return h('div', { class: 'empty' }, S.vars.empty);
  const grid = { 'grid-template-columns': 'minmax(220px, 1fr) minmax(260px, 2fr) 180px' };
  return h('div', { class: 'stack' }, h('div', { class: 'mut' }, S.vars.lead),
    h('div', { class: 'panel', css: { 'overflow-x': 'auto' } },
      h('div', { class: 'trow thead', css: grid }, h('div', { class: 'c' }, S.vars.name), h('div', { class: 'c' }, S.vars.value), h('div', { class: 'c' }, S.vars.source)),
      d.variables.map((v) => h('div', { class: 'trow', css: grid }, h('div', { class: 'c mono' }, v.name), h('div', { class: 'c mono' }, v.secret ? h('span', { class: 'chip' }, S.vars.secret) : v.value), h('div', { class: 'c xs mut' }, S.vars.sources[v.source] || v.source)))));
}

function settings(d) {
  const G = S.settings;
  const row = (k, v) => h('div', { class: 'kv', css: { 'grid-template-columns': '260px 1fr' } }, h('span', null, k), h('span', { class: 'mono' }, v));
  return h('div', { class: 'stack' },
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, G.declared)), row(G.declaredKey, d.service.declared ? `${short(d.service.declared.sha)} · ${d.service.declared.message || ''}` : G.none), row(G.meaningKey, G.meaning)),
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, G.health)), row(G.path, `GET ${d.service.healthCheck.path}`), row(G.unhealthyKey, G.unhealthy)),
    h('div', { class: 'panel' }, h('div', { class: 'dh' }, h('b', null, G.repo)), row(G.repoKey, d.service.repo || T.dash)),
    noSource(G.branch));
}

export function serviceView(state, actions) {
  const d = state.service;
  const id = state.serviceId;
  const crumb = h('div', { class: 'crumb' }, h('button', { class: 'lnk', onclick: actions.goOverview }, S.crumb), h('span', null, '/'), h('span', null, d ? d.service.project : ''));
  if (!d) return h('div', null, crumb, h('div', { class: 'empty' }, state.error || S.reading));
  const tab = state.serviceTab;
  const body = tab === 'deployments' ? deployments(d) : tab === 'commits' ? commits(d, id, actions) : tab === 'settings' ? settings(d) : tab === 'logs' ? logs(d, state, actions) : variables(d);
  return h('div', null, crumb,
    h('div', { class: 'ph' }, h('div', null, h('h1', { class: 'h1 mono', css: { 'font-size': '22px' } }, d.service.name),
      h('div', { class: 'row', css: { gap: '6px' } }, d.service.kind ? h('span', { class: 'chip' }, d.service.kind) : null, h('span', { class: 'mut xs mono' }, d.service.repo || ''))),
      h('div', { class: 'row' }, h('button', { class: 'btn rb', onclick: () => actions.openDialog('rollback', [id]) }, T.overview.rollback), h('button', { class: 'btn pri', onclick: () => actions.openDialog('deploy', [id]) }, T.overview.deploy))),
    state.error ? h('div', { class: 'banner bad' }, state.error) : null,
    h('div', { class: 'envcards' }, d.environments.map((c) => envCard(c, id, actions))),
    h('div', { class: 'tabs', role: 'tablist' }, S.tabs.map(([key, label]) => h('button', { class: `tabb ${key === tab ? 'on' : ''}`, role: 'tab', 'aria-selected': String(key === tab), onclick: () => actions.setServiceTab(key) }, label))),
    body);
}
