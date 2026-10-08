'use strict';
// NƠI DUY NHẤT lắp bộ nối vào ca sử dụng. Không tệp nào khác tự tạo bộ nối; lớp interfaces chỉ nhận "app" trả về từ đây.
const path = require('node:path');
const { assertPort } = require('./application/ports');
const { makePrepareTier } = require('./application/prepare-tier');
const { makeImages } = require('./application/images');
const { makeServiceLock } = require('./application/service-lock');
const { makeSwitchVersion } = require('./application/switch-version');
const { makeCheck } = require('./application/check');
const { makeGetStatus } = require('./application/get-status');
const { makeGetLogs } = require('./application/get-logs');
const { makeGetImages } = require('./application/get-images');
const { makePin } = require('./application/pin');
const { makeStack } = require('./application/stack');
const { makeDeploy } = require('./application/deploy');
const { makeRollback } = require('./application/rollback');
const { makeAuth } = require('./application/auth');
const { makeJobs } = require('./application/jobs');
const { makeConsole } = require('./application/console');
const { makeRemoteTarget } = require('./application/remote-target');
const { makeRemoteJobExecutor } = require('./application/remote-jobs');
const { makeEnvironment, PALETTE } = require('./application/environment');
const { makeCatalog } = require('./application/catalog');
const { makeFleet, UNGROUPED } = require('./application/fleet');
const { makeRuns } = require('./application/runs');
const { makeSettings } = require('./application/settings');
const { makeAudit } = require('./application/audit');
const { makeApprovals } = require('./application/approvals');
const { describeTarget } = require('./domain/target');

const { makeLayout } = require('./infrastructure/layout');
const runner = require('./infrastructure/process-runner');
const { makeFsDeclarations } = require('./infrastructure/fs-declarations');
const { makeGitSource } = require('./infrastructure/git-source');
const { makeFsConfigFiles } = require('./infrastructure/fs-config-files');
const { makeDockerRuntime } = require('./infrastructure/docker-runtime');
const { makeDockerRegistry } = require('./infrastructure/docker-registry');
const { makeComposeSharedTier } = require('./infrastructure/compose-shared-tier');
const { makeFsSecrets } = require('./infrastructure/fs-secrets');
const { makeFileLocks } = require('./infrastructure/file-locks');
const { makeFsLedger } = require('./infrastructure/fs-ledger');
const { makeHttpHealth } = require('./infrastructure/http-health');
const { systemClock, systemRandom } = require('./infrastructure/system');
const { nodeHasher } = require('./infrastructure/node-hasher');
const { makeFsCredentials } = require('./infrastructure/fs-credentials');
const { makeFsConfigStore, makeFsAuditLog } = require('./infrastructure/fs-console-records');
const { openConsoleDb } = require('./infrastructure/sqlite/console-db');
const sqlite = require('./infrastructure/sqlite/console-stores');
const { makeImportRecords } = require('./application/import-records');
const { makeChildProcessJobExecutor, makeDirectJobExecutor } = require('./infrastructure/job-executors');
const { makeMemoryStorage } = require('./infrastructure/memory/storage');
const { makeMemoryPlatform } = require('./infrastructure/memory/platform');
const { sampleWorld } = require('./infrastructure/memory/world');
const { makeFsTargets } = require('./infrastructure/fs-targets');
const { makeGcloudSshShell } = require('./infrastructure/gcloud-ssh-shell');
const { makeHttpServer } = require('./interfaces/http/server');

/** Bộ nối thật cho đích là MÁY NÀY. opts.run và opts.health cho test thay lệnh ngoài và việc chờ khỏe. */
function localPorts({ root, run = runner.run, health, clock = systemClock }) {
  const layout = makeLayout(root);
  const locks = makeFileLocks({ layout });
  return {
    layout,
    declarations: makeFsDeclarations({ layout }),
    source: makeGitSource({ layout, run }),
    configFiles: makeFsConfigFiles({ layout }),
    runtime: makeDockerRuntime({ layout, run }),
    registry: makeDockerRegistry({ run }),
    sharedTier: makeComposeSharedTier({ layout, run }),
    secrets: makeFsSecrets({ layout }),
    locks,
    ledger: makeFsLedger({ layout, locks }),
    health: health || makeHttpHealth(),
    clock,
  };
}

/** Lắp các ca sử dụng trên một bộ cổng bất kỳ (thật hoặc trong bộ nhớ). */
function assemble(ports) {
  for (const name of ['declarations', 'source', 'configFiles', 'runtime', 'registry', 'sharedTier', 'secrets', 'locks', 'ledger', 'health', 'clock']) assertPort(name, ports[name]);
  const { declarations, source, configFiles, runtime, registry, sharedTier, secrets, locks, ledger, health, clock } = ports;
  const tierSteps = makePrepareTier({ secrets, sharedTier });
  const images = makeImages({ source, configFiles, runtime });
  const serviceLock = makeServiceLock({ locks, clock });
  const switchVersion = makeSwitchVersion({ runtime, configFiles, health, ledger, clock, images });
  return {
    ports,
    check: makeCheck({ declarations, source }),
    getStatus: makeGetStatus({ source, runtime, ledger, serviceLock }),
    getLogs: makeGetLogs({ runtime }),
    getImages: makeGetImages({ registry }),
    pin: makePin({ declarations, source }),
    images,
    stack: makeStack({ runtime, configFiles, health, ledger, secrets, sharedTier, clock, images, tierSteps }),
    deploy: makeDeploy({ runtime, registry, locks, serviceLock, tierSteps, switchVersion }),
    rollback: makeRollback({ runtime, registry, ledger, declarations, locks, serviceLock, tierSteps, switchVersion }),
  };
}

const buildLocalApp = (opts) => assemble(localPorts(opts));

/** Bộ nối trong bộ nhớ cho MỌI cổng, cùng nhìn một 'thế giới' (mặc định là dữ liệu mẫu). */
function memoryPorts(world = sampleWorld()) {
  return { world, ...makeMemoryStorage(world), ...makeMemoryPlatform(world) };
}

/** Phần của bảng điều khiển đặt trên một app đã lắp: đăng nhập, sổ việc, trang trạng thái. */
function assembleConsole(app, { credentials, members, jobExecutor, clock, random = systemRandom, hasher = nodeHasher, imagesTtlMs }) {
  for (const [name, adapter] of Object.entries({ credentials, members, jobExecutor, clock, random, hasher })) assertPort(name, adapter);
  const jobs = makeJobs({ jobExecutor, clock, random });
  return {
    auth: makeAuth({ credentials, members, hasher, random, clock }),
    jobs,
    console: makeConsole({ check: app.check, getStatus: app.getStatus, getImages: app.getImages, jobs, clock, imagesTtlMs }),
  };
}

/**
 * Phần NHIỀU MÔI TRƯỜNG của bảng điều khiển (design/deploy-console.api.md): mỗi môi trường là một đích kèm bộ chạy việc của nó.
 * members: [{ id, name, kind, description?, check, getStatus, jobExecutor, forget? }]; here: các cổng của MÁY NÀY cho danh mục dịch vụ.
 */
function assembleFleet(members, { check, source, registry, clock, random = systemRandom, stores }) {
  const { configStore, auditLog, approvalStore, runStore } = stores;
  for (const name of ['configStore', 'auditLog', 'approvalStore', 'runStore']) assertPort(name, stores[name]);
  const environments = members.map((m, i) => makeEnvironment({ id: m.id, name: m.name, color: PALETTE[i % PALETTE.length], description: m.description, kind: m.kind, check: m.check, getStatus: m.getStatus, getLogs: m.getLogs }));
  const catalog = makeCatalog({ check, source, registry, clock });
  const audit = makeAudit({ auditLog, clock });
  const services = async () => { const m = await catalog.manifest(); return m.ok ? Promise.all(Object.keys(m.manifest.services).map(async (id) => ({ id, project: (await catalog.service(id)).project || UNGROUPED }))) : []; };
  const settings = makeSettings({ configStore, clock, environmentIds: () => members.map((m) => m.id), services, audit });
  const fleet = makeFleet({ environments, catalog, settings, clock });
  const executors = new Map(members.map((m) => [m.id, assertPort('jobExecutor', m.jobExecutor)]));
  const runs = makeRuns({ fleet, executors, runStore, clock, random, onSettled: () => { catalog.forget(); for (const m of members) if (m.forget) m.forget(); } });
  const approvals = makeApprovals({ runs, settings, audit, approvalStore, clock, random });
  // primaryEnvironmentId: môi trường mà các đường /api cũ (một đích) đang điều khiển.
  return { fleet, runs, catalog, settings, audit, approvals, primaryEnvironmentId: members[0].id };
}

/**
 * Các cổng lưu của bảng điều khiển trên DB SQLite ở `dir`/console.db. Lần mở đầu tiên chép dữ liệu từ các tệp cũ trong `dir` sang DB
 * (tệp cũ giữ nguyên). credentials vẫn là tệp riêng: DB hỏng thì admin vẫn đăng nhập được.
 */
function consoleStores(dir) {
  const db = openConsoleDb(path.join(dir, 'console.db'));
  const credentials = makeFsCredentials({ dir });
  const stores = { configStore: sqlite.makeSqliteConfigStore(db), auditLog: sqlite.makeSqliteAuditLog(db), members: sqlite.makeSqliteMembers(db), approvalStore: sqlite.makeSqliteApprovalStore(db), runStore: sqlite.makeSqliteRunStore(db), targetStore: sqlite.makeSqliteTargetStore(db), meta: sqlite.makeSqliteMeta(db), credentials };
  const importRecords = makeImportRecords({ from: { configStore: makeFsConfigStore({ dir }), auditLog: makeFsAuditLog({ dir }), credentials }, to: stores, clock: systemClock });
  return { ...stores, importRecords, close: () => db.close() };
}

/** Một đích từ xa thành một thành viên của assembleFleet. */
function remoteMember({ layout, target, shell, sshBin, pollMs, sleep }) {
  const remoteShell = assertPort('remoteShell', shell || makeGcloudSshShell({ target, stateDir: layout.run, sshBin: sshBin || undefined }));
  const remote = makeRemoteTarget({ shell: remoteShell, clock: systemClock, root: target.root });
  const jobExecutor = makeRemoteJobExecutor({ shell: remoteShell, random: systemRandom, root: target.root, onSettled: remote.forget, pollMs, sleep });
  return { remote, remoteShell, member: { id: target.name, name: target.name, kind: 'remote', description: describeTarget(target), check: remote.check, getStatus: remote.getStatus, getLogs: remote.getLogs, jobExecutor, forget: remote.forget } };
}

/**
 * Bảng điều khiển cho đích là MÁY NÀY. Mỗi việc chạy trong một tiến trình con với đúng lệnh điều khiển (entry),
 * nên bảng điều khiển tắt hay khởi động lại không đụng lần đưa lên đang chạy.
 */
function buildLocalConsole({ root, entry, port, sshBin }) {
  const ports = localPorts({ root });
  const app = assemble(ports);
  const jobExecutor = makeChildProcessJobExecutor({ entry, cwd: root });
  const stores = consoleStores(ports.layout.run);
  const board = assembleConsole(app, { credentials: stores.credentials, members: stores.members, jobExecutor, clock: ports.clock });
  // Môi trường: máy này, cộng mọi đích từ xa đã khai ở targets/. Tờ khai đích sai thì bỏ qua đích đó, không làm hỏng cả bảng.
  const members = [{ id: 'local', name: 'local', kind: 'local', description: 'The stack running on this machine', check: app.check, getStatus: app.getStatus, getLogs: app.getLogs, jobExecutor }];
  const targets = makeFsTargets({ layout: ports.layout });
  const skipped = [];
  for (const name of targets.names()) {
    try { members.push(remoteMember({ layout: ports.layout, target: targets.load(name), sshBin }).member); } catch (e) { skipped.push(`${name}: ${e.message}`); }
  }
  const many = assembleFleet(members, { check: app.check, source: ports.source, registry: ports.registry, clock: ports.clock, stores });
  const full = { ...board, ...many, skippedTargets: skipped, importRecords: stores.importRecords, closeStores: stores.close };
  return { ...full, server: makeHttpServer(full, { port }) };
}

/** Bảng điều khiển chạy hoàn toàn trong bộ nhớ: cùng các ca sử dụng, không đụng hệ nào. Cho test và phát triển giao diện. */
function buildMemoryConsole({ world = sampleWorld({ delayMs: 2500 }), port, imagesTtlMs, hasher } = {}) {
  const ports = memoryPorts(world);
  const app = assemble(ports);
  const board = assembleConsole(app, {
    credentials: ports.credentials,
    members: ports.members,
    jobExecutor: makeDirectJobExecutor({ use: { loadManifest: () => ports.declarations.load(), deploy: app.deploy, rollback: app.rollback }, seconds: 2 }),
    clock: ports.clock,
    imagesTtlMs,
    ...(hasher ? { hasher } : {}),
  });
  // Hai môi trường mẫu, mỗi cái một "thế giới" riêng, để giao diện có nhiều cột mà không đụng hệ nào.
  const second = memoryPorts(sampleWorld({ delayMs: world.delayMs }));
  const app2 = assemble(second);
  const direct = (p, a) => makeDirectJobExecutor({ use: { loadManifest: () => p.declarations.load(), deploy: a.deploy, rollback: a.rollback }, seconds: 2 });
  const many = assembleFleet([
    { id: 'mau-thu', name: 'mau-thu', kind: 'memory', description: 'Sample environment held in memory', check: app.check, getStatus: app.getStatus, getLogs: app.getLogs, jobExecutor: direct(ports, app) },
    { id: 'mau-that', name: 'mau-that', kind: 'memory', description: 'Second sample environment held in memory', check: app2.check, getStatus: app2.getStatus, getLogs: app2.getLogs, jobExecutor: direct(second, app2) },
  ], { check: app.check, source: ports.source, registry: ports.registry, clock: ports.clock, random: ports.random || systemRandom, stores: ports });
  const full = { ...board, ...many };
  return { ...full, app, world, worlds: [world, second.world], server: makeHttpServer(full, { port, memory: true }) };
}

/**
 * Bảng điều khiển chạy ở MÁY NÀY, điều khiển hệ trên một MÁY ĐÍCH TỪ XA (targets/<tên>.json) qua cổng RemoteShell.
 * Máy đích tự chạy lệnh điều khiển tại chỗ; sổ deploy, khóa và bí mật nằm ở máy đích. Máy này chỉ giữ thông tin đăng nhập
 * của bảng điều khiển. opts.shell cho test thay đường SSH.
 */
function buildRemoteConsole({ root, port, targetName, target, shell, sshBin, pollMs, sleep }) {
  const here = localPorts({ root });
  const layout = here.layout;
  const chosen = target || makeFsTargets({ layout }).load(targetName);
  const { remote, member } = remoteMember({ layout, target: chosen, shell, sshBin, pollMs, sleep });
  // Mật khẩu và token dùng chung với bảng điều khiển của máy này; DB (cấu hình, sổ thao tác, thành viên) của một đích từ xa nằm riêng.
  const stores = consoleStores(path.join(layout.run, 'targets', chosen.name));
  const board = assembleConsole(remote, { credentials: makeFsCredentials({ dir: layout.run }), members: stores.members, jobExecutor: member.jobExecutor, clock: systemClock });
  // Danh mục dịch vụ (tờ khai báo, lịch sử commit, nhãn trên kho) vẫn là của máy này; môi trường duy nhất là đích từ xa.
  const many = assembleFleet([member], { check: assemble(here).check, source: here.source, registry: here.registry, clock: systemClock, stores });
  const full = { ...board, ...many, importRecords: stores.importRecords, closeStores: stores.close };
  return { ...full, target: chosen, server: makeHttpServer(full, { port, target: describeTarget(chosen) }) };
}

module.exports = { assemble, assembleFleet, localPorts, buildLocalApp, memoryPorts, buildLocalConsole, buildMemoryConsole, buildRemoteConsole };
