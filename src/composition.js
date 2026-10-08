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
function assembleConsole(app, { credentials, jobExecutor, clock, random = systemRandom, hasher = nodeHasher, imagesTtlMs }) {
  for (const [name, adapter] of Object.entries({ credentials, jobExecutor, clock, random, hasher })) assertPort(name, adapter);
  const jobs = makeJobs({ jobExecutor, clock, random });
  return {
    auth: makeAuth({ credentials, hasher, random, clock }),
    jobs,
    console: makeConsole({ check: app.check, getStatus: app.getStatus, getImages: app.getImages, jobs, clock, imagesTtlMs }),
  };
}

/**
 * Phần NHIỀU MÔI TRƯỜNG của bảng điều khiển (design/deploy-console.api.md): mỗi môi trường là một đích kèm bộ chạy việc của nó.
 * members: [{ id, name, kind, description?, check, getStatus, jobExecutor, forget? }]; here: các cổng của MÁY NÀY cho danh mục dịch vụ.
 */
function assembleFleet(members, { check, source, registry, clock, random = systemRandom, configStore, auditLog }) {
  assertPort('configStore', configStore); assertPort('auditLog', auditLog);
  const environments = members.map((m, i) => makeEnvironment({ id: m.id, name: m.name, color: PALETTE[i % PALETTE.length], description: m.description, kind: m.kind, check: m.check, getStatus: m.getStatus }));
  const catalog = makeCatalog({ check, source, registry, clock });
  const audit = makeAudit({ auditLog, clock });
  const services = async () => { const m = await catalog.manifest(); return m.ok ? Promise.all(Object.keys(m.manifest.services).map(async (id) => ({ id, project: (await catalog.service(id)).project || UNGROUPED }))) : []; };
  const settings = makeSettings({ configStore, clock, environmentIds: () => members.map((m) => m.id), services, audit });
  const fleet = makeFleet({ environments, catalog, settings, clock });
  const executors = new Map(members.map((m) => [m.id, assertPort('jobExecutor', m.jobExecutor)]));
  const runs = makeRuns({ fleet, executors, clock, random, onSettled: () => { catalog.forget(); for (const m of members) if (m.forget) m.forget(); } });
  const approvals = makeApprovals({ runs, settings, audit, clock, random });
  // primaryEnvironmentId: môi trường mà các đường /api cũ (một đích) đang điều khiển.
  return { fleet, runs, catalog, settings, audit, approvals, primaryEnvironmentId: members[0].id };
}

/** Một đích từ xa thành một thành viên của assembleFleet. */
function remoteMember({ layout, target, shell, sshBin, pollMs, sleep }) {
  const remoteShell = assertPort('remoteShell', shell || makeGcloudSshShell({ target, stateDir: layout.run, sshBin: sshBin || undefined }));
  const remote = makeRemoteTarget({ shell: remoteShell, clock: systemClock, root: target.root });
  const jobExecutor = makeRemoteJobExecutor({ shell: remoteShell, random: systemRandom, root: target.root, onSettled: remote.forget, pollMs, sleep });
  return { remote, remoteShell, member: { id: target.name, name: target.name, kind: 'remote', description: describeTarget(target), check: remote.check, getStatus: remote.getStatus, jobExecutor, forget: remote.forget } };
}

/**
 * Bảng điều khiển cho đích là MÁY NÀY. Mỗi việc chạy trong một tiến trình con với đúng lệnh điều khiển (entry),
 * nên bảng điều khiển tắt hay khởi động lại không đụng lần đưa lên đang chạy.
 */
function buildLocalConsole({ root, entry, port, sshBin }) {
  const ports = localPorts({ root });
  const app = assemble(ports);
  const jobExecutor = makeChildProcessJobExecutor({ entry, cwd: root });
  const board = assembleConsole(app, { credentials: makeFsCredentials({ dir: ports.layout.run }), jobExecutor, clock: ports.clock });
  // Môi trường: máy này, cộng mọi đích từ xa đã khai ở targets/. Tờ khai đích sai thì bỏ qua đích đó, không làm hỏng cả bảng.
  const members = [{ id: 'local', name: 'local', kind: 'local', description: 'The stack running on this machine', check: app.check, getStatus: app.getStatus, jobExecutor }];
  const targets = makeFsTargets({ layout: ports.layout });
  const skipped = [];
  for (const name of targets.names()) {
    try { members.push(remoteMember({ layout: ports.layout, target: targets.load(name), sshBin }).member); } catch (e) { skipped.push(`${name}: ${e.message}`); }
  }
  const many = assembleFleet(members, { check: app.check, source: ports.source, registry: ports.registry, clock: ports.clock, configStore: makeFsConfigStore({ dir: ports.layout.run }), auditLog: makeFsAuditLog({ dir: ports.layout.run }) });
  const full = { ...board, ...many, skippedTargets: skipped };
  return { ...full, server: makeHttpServer(full, { port }) };
}

/** Bảng điều khiển chạy hoàn toàn trong bộ nhớ: cùng các ca sử dụng, không đụng hệ nào. Cho test và phát triển giao diện. */
function buildMemoryConsole({ world = sampleWorld({ delayMs: 2500 }), port, imagesTtlMs, hasher } = {}) {
  const ports = memoryPorts(world);
  const app = assemble(ports);
  const board = assembleConsole(app, {
    credentials: ports.credentials,
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
    { id: 'mau-thu', name: 'mau-thu', kind: 'memory', description: 'Sample environment held in memory', check: app.check, getStatus: app.getStatus, jobExecutor: direct(ports, app) },
    { id: 'mau-that', name: 'mau-that', kind: 'memory', description: 'Second sample environment held in memory', check: app2.check, getStatus: app2.getStatus, jobExecutor: direct(second, app2) },
  ], { check: app.check, source: ports.source, registry: ports.registry, clock: ports.clock, random: ports.random || systemRandom, configStore: ports.configStore, auditLog: ports.auditLog });
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
  const board = assembleConsole(remote, { credentials: makeFsCredentials({ dir: layout.run }), jobExecutor: member.jobExecutor, clock: systemClock });
  // Danh mục dịch vụ (tờ khai báo, lịch sử commit, nhãn trên kho) vẫn là của máy này; môi trường duy nhất là đích từ xa.
  // Cấu hình và sổ thao tác của bảng điều khiển cho một đích từ xa nằm trong thư mục riêng của đích đó ở máy này.
  const records = path.join(layout.run, 'targets', chosen.name);
  const many = assembleFleet([member], { check: assemble(here).check, source: here.source, registry: here.registry, clock: systemClock, configStore: makeFsConfigStore({ dir: records }), auditLog: makeFsAuditLog({ dir: records }) });
  const full = { ...board, ...many };
  return { ...full, target: chosen, server: makeHttpServer(full, { port, target: describeTarget(chosen) }) };
}

module.exports = { assemble, assembleFleet, localPorts, buildLocalApp, memoryPorts, buildLocalConsole, buildMemoryConsole, buildRemoteConsole };
