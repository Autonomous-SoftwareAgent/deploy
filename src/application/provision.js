'use strict';
// spec: BDK-S-006
// Ca sử dụng THÊM và GỠ MÔI TRƯỜNG từ bảng điều khiển (D-015). Thêm: khai một máy đã có, hoặc tạo máy mới trên cloud rồi
// chuẩn bị nó (Docker, Node, bộ lệnh điều khiển) để nhận lệnh; KHÔNG bật hệ, không deploy gì. Gỡ: bỏ khỏi bảng điều khiển,
// và nếu máy do bảng điều khiển tạo thì có thể xóa luôn máy. Việc dài chạy ở nền; trang hỏi tiến trình từng bước.
const rules = require('../domain/provision');

const SSH_TRIES = 30;
const refuse = (outcome, reason) => ({ ok: false, outcome, reason });

/**
 * @param {{cloud: import('./ports').Cloud, targetStore: import('./ports').TargetStore, connector: {connect: Function, shell: Function},
 *          registry: {ids: () => string[], add: Function, remove: Function}, setupScript: {read: () => string}, audit: {record: Function},
 *          clock: import('./ports').Clock, random: import('./ports').Random, sleep?: (ms: number) => Promise<void>, defaults?: object}} deps
 * connector.connect(target) trả thành viên môi trường (check, getStatus, bộ chạy việc...) cho bảng điều khiển;
 * connector.shell(target) trả một RemoteShell chờ được lâu, cho bước cài đặt.
 */
function makeProvision({ cloud, targetStore, connector, registry, setupScript, audit, clock, random, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), defaults = {} }) {
  const operations = new Map(); // mã -> { id, kind, name, status, steps, log, done }
  const view = (o) => ({ id: o.id, kind: o.kind, name: o.name, status: o.status, steps: o.steps.map((s) => ({ ...s })), log: o.log.slice(-200), startedAt: o.startedAt, finishedAt: o.finishedAt || null });
  const say = (o, text) => o.log.push({ at: clock.now(), text: String(text).slice(0, 500) });
  const targetOf = (t) => ({ name: t.name, ...t.spec });
  const lastLines = (res) => `${res.stderr || ''}\n${res.stdout || ''}`.trim().split('\n').slice(-3).join(' ').slice(0, 400) || 'no output';

  function begin(kind, name, steps) {
    const o = { id: random.bytes(6).toString('hex'), kind, name, status: 'running', steps: steps.map((s) => ({ name: s, status: 'pending' })), log: [], startedAt: clock.now() };
    operations.set(o.id, o);
    return o;
  }
  /** Chạy một bước; fn ném lỗi thì bước hỏng và cả việc dừng. */
  async function step(o, name, fn) {
    const s = o.steps.find((x) => x.name === name);
    s.status = 'running';
    try { await fn(); s.status = 'succeeded'; } catch (e) { s.status = 'failed'; throw e; }
  }

  /** Lúc bảng điều khiển khởi động: nối lại các môi trường đã thêm; việc đang dở lúc tắt thì ghi là hỏng để người vận hành xử lý. */
  async function restore() {
    for (const t of await targetStore.list()) {
      if (t.state === rules.STATE.READY) { try { registry.add(connector.connect(targetOf(t))); } catch (e) { await targetStore.put({ ...t, state: rules.STATE.FAILED, detail: `could not reconnect: ${e.message}` }); } }
      else if (t.state !== rules.STATE.FAILED) await targetStore.put({ ...t, state: rules.STATE.FAILED, detail: `the console restarted while this environment was ${t.state}; the machine may exist: remove it here to delete it` });
    }
  }

  async function runCreate(o, record) {
    const target = targetOf(record);
    try {
      await step(o, 'machine', async () => {
        say(o, `Creating machine ${target.instance} (${record.spec.machineType}) in ${target.zone}…`);
        const res = await cloud.createInstance({ configuration: target.configuration, name: target.instance, zone: target.zone, machineType: record.spec.machineType, labels: { 'created-by': 'bsn-console', environment: record.name } });
        if (!res.ok) throw new Error(`the cloud refused to create the machine: ${res.error}`);
      });
      const shell = connector.shell(target);
      await step(o, 'ssh', async () => {
        say(o, 'Waiting for the machine to accept SSH…');
        for (let i = 0; i < SSH_TRIES; i++) { const r = await shell.exec('echo ready'); if (r.code === 0 && /ready/.test(r.stdout)) return; await sleep(10000); }
        throw new Error('the machine did not accept SSH in time');
      });
      await step(o, 'setup', async () => {
        say(o, 'Installing Docker, Node and the control commands (a few minutes)…');
        // Chỉ chuẩn bị máy để nhận lệnh: không lấy repo của dịch vụ, không bật hệ.
        const res = await shell.exec(`export BSN_SKIP_SERVICE_REPOS=1 GIT_TERMINAL_PROMPT=0\n${setupScript.read()}`);
        for (const line of String(res.stdout).split('\n').filter((l) => l.startsWith('== '))) say(o, line.slice(3));
        if (res.code !== 0) throw new Error(`setup failed (exit ${res.code}): ${lastLines(res)}`);
      });
      await step(o, 'verify', async () => {
        const res = await shell.exec(`cd ${target.root} && node infra/bsn.js check --json`);
        if (res.code !== 0) throw new Error(`the control commands do not run on the machine (exit ${res.code}): ${lastLines(res)}`);
      });
      registry.add(connector.connect(target));
      await targetStore.put({ ...record, state: rules.STATE.READY, detail: '' });
      o.status = 'succeeded'; say(o, `Environment ${record.name} is ready. Nothing is deployed on it yet.`);
      await audit.record({ actor: record.createdBy, action: 'environment.create', target: record.name, detail: `machine ${target.instance}, ${record.spec.machineType}, ${target.zone}` });
    } catch (e) {
      o.status = 'failed'; say(o, `Failed: ${e.message}`);
      await targetStore.put({ ...record, state: rules.STATE.FAILED, detail: e.message.slice(0, 400) });
      await audit.record({ actor: record.createdBy, action: 'environment.create', target: record.name, detail: e.message, outcome: 'failed' });
    }
    o.finishedAt = clock.now();
  }

  /** input: { mode, name, machineType?, zone, instance?, configuration?, confirmation, actor }. Tạo máy đòi gõ lại tên để xác nhận. */
  async function add(input) {
    const req = { ...input, zone: input.zone || defaults.zone, configuration: input.configuration || defaults.configuration || undefined, machineType: input.machineType || rules.DEFAULT_MACHINE };
    const stored = await targetStore.list();
    const errs = rules.requestErrors(req, [...registry.ids(), ...stored.map((t) => t.name)]);
    if (errs.length) return refuse('BAD_INPUT', errs.join('; '));
    const base = { name: req.name, createdBy: input.actor.name, createdAt: clock.now(), detail: '' };
    if (req.mode === 'register') {
      const record = { ...base, spec: rules.specOf({ ...req }), managed: false, state: rules.STATE.READY };
      const member = connector.connect(targetOf(record));
      const checked = await member.check({ requireRepos: false });
      if (!checked.ok) return refuse('UNREACHABLE', `the machine did not answer the control commands: ${checked.errors.join('; ')}`);
      await targetStore.put(record);
      registry.add(member);
      await audit.record({ actor: input.actor.name, action: 'environment.register', target: req.name, detail: `machine ${record.spec.instance}, ${record.spec.zone}` });
      return { ok: true, environment: req.name };
    }
    if (input.confirmation !== req.name) return refuse('CONFIRMATION_REQUIRED', `type ${req.name} to confirm creating a machine that costs money`);
    const record = { ...base, spec: rules.specOf({ ...req, instance: req.name }), managed: true, state: rules.STATE.CREATING };
    await targetStore.put(record);
    const o = begin('create', req.name, rules.STEPS);
    o.done = runCreate(o, record);
    return { ok: true, operation: view(o) };
  }

  /** input: { name, deleteMachine, confirmation, actor }. Chỉ gỡ được môi trường do trang thêm; xóa máy chỉ với máy do bảng điều khiển tạo. */
  async function remove({ name, deleteMachine = false, confirmation, actor }) {
    const record = (await targetStore.list()).find((t) => t.name === name);
    if (!record) return refuse('NOT_FOUND', `${name} was not added from the console (environments declared by a file are removed by deleting the file)`);
    if (confirmation !== name) return refuse('CONFIRMATION_REQUIRED', `type ${name} to confirm`);
    if (deleteMachine && !record.managed) return refuse('BAD_INPUT', 'the console only deletes machines it created');
    if ([...operations.values()].some((o) => o.name === name && o.status === 'running')) return refuse('CONFLICT', `${name} has an operation in progress`);
    registry.remove(name);
    if (!deleteMachine) {
      await targetStore.remove(name);
      await audit.record({ actor: actor.name, action: 'environment.remove', target: name, detail: record.managed ? 'the machine was kept' : 'registration removed' });
      return { ok: true, removed: name };
    }
    await targetStore.put({ ...record, state: rules.STATE.DELETING, detail: '' });
    const o = begin('delete', name, ['delete']);
    o.done = (async () => {
      try {
        await step(o, 'delete', async () => {
          say(o, `Deleting machine ${record.spec.instance} and its disk…`);
          const res = await cloud.deleteInstance({ configuration: record.spec.configuration, name: record.spec.instance, zone: record.spec.zone });
          if (!res.ok) throw new Error(`the cloud refused to delete the machine: ${res.error}`);
        });
        await targetStore.remove(name);
        o.status = 'succeeded'; say(o, 'Machine deleted.');
        await audit.record({ actor: actor.name, action: 'environment.delete', target: name, detail: `machine ${record.spec.instance} deleted` });
      } catch (e) {
        o.status = 'failed'; say(o, `Failed: ${e.message}`);
        await targetStore.put({ ...record, state: rules.STATE.FAILED, detail: e.message.slice(0, 400) });
        await audit.record({ actor: actor.name, action: 'environment.delete', target: name, detail: e.message, outcome: 'failed' });
      }
      o.finishedAt = clock.now();
    })();
    return { ok: true, operation: view(o) };
  }

  return {
    restore, add, remove,
    /** Môi trường do trang thêm, các việc gần đây, và các lựa chọn cho biểu mẫu. */
    async list() {
      return { items: (await targetStore.list()).map((t) => ({ name: t.name, managed: t.managed, state: t.state, detail: t.detail, createdBy: t.createdBy, createdAt: t.createdAt, instance: t.spec.instance, zone: t.spec.zone, machineType: t.spec.machineType || null })),
        operations: [...operations.values()].slice(-10).reverse().map(view), options: { machineTypes: rules.MACHINE_TYPES, defaultMachineType: rules.DEFAULT_MACHINE, zone: defaults.zone || '', configuration: defaults.configuration || '' } };
    },
    operation: (id) => (operations.has(id) ? view(operations.get(id)) : null),
    settle: () => Promise.all([...operations.values()].map((o) => o.done)),
  };
}

module.exports = { makeProvision };
