'use strict';
// NƠI DUY NHẤT lắp bộ nối vào ca sử dụng. Không tệp nào khác tự tạo bộ nối; lớp interfaces chỉ nhận "app" trả về từ đây.
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
 * Bảng điều khiển cho đích là MÁY NÀY. Mỗi việc chạy trong một tiến trình con với đúng lệnh điều khiển (entry),
 * nên bảng điều khiển tắt hay khởi động lại không đụng lần đưa lên đang chạy.
 */
function buildLocalConsole({ root, entry, port }) {
  const ports = localPorts({ root });
  const board = assembleConsole(assemble(ports), {
    credentials: makeFsCredentials({ dir: ports.layout.run }),
    jobExecutor: makeChildProcessJobExecutor({ entry, cwd: root }),
    clock: ports.clock,
  });
  return { ...board, server: makeHttpServer(board, { port }) };
}

/** Bảng điều khiển chạy hoàn toàn trong bộ nhớ: cùng các ca sử dụng, không đụng hệ nào. Cho test và phát triển giao diện. */
function buildMemoryConsole({ world = sampleWorld({ delayMs: 2500 }), port, imagesTtlMs } = {}) {
  const ports = memoryPorts(world);
  const app = assemble(ports);
  const board = assembleConsole(app, {
    credentials: ports.credentials,
    jobExecutor: makeDirectJobExecutor({ use: { loadManifest: () => ports.declarations.load(), deploy: app.deploy, rollback: app.rollback }, seconds: 2 }),
    clock: ports.clock,
    imagesTtlMs,
  });
  return { ...board, app, world, server: makeHttpServer(board, { port, memory: true }) };
}

/**
 * Bảng điều khiển chạy ở MÁY NÀY, điều khiển hệ trên một MÁY ĐÍCH TỪ XA (targets/<tên>.json) qua cổng RemoteShell.
 * Máy đích tự chạy lệnh điều khiển tại chỗ; sổ deploy, khóa và bí mật nằm ở máy đích. Máy này chỉ giữ thông tin đăng nhập
 * của bảng điều khiển. opts.shell cho test thay đường SSH.
 */
function buildRemoteConsole({ root, port, targetName, target, shell, sshBin, pollMs, sleep }) {
  const layout = makeLayout(root);
  const chosen = target || makeFsTargets({ layout }).load(targetName);
  const remoteShell = assertPort('remoteShell', shell || makeGcloudSshShell({ target: chosen, stateDir: layout.run, sshBin: sshBin || undefined }));
  const remote = makeRemoteTarget({ shell: remoteShell, clock: systemClock, root: chosen.root });
  const board = assembleConsole(remote, {
    credentials: makeFsCredentials({ dir: layout.run }),
    jobExecutor: makeRemoteJobExecutor({ shell: remoteShell, random: systemRandom, root: chosen.root, onSettled: remote.forget, pollMs, sleep }),
    clock: systemClock,
  });
  return { ...board, target: chosen, server: makeHttpServer(board, { port, target: describeTarget(chosen) }) };
}

module.exports = { assemble, localPorts, buildLocalApp, memoryPorts, buildLocalConsole, buildMemoryConsole, buildRemoteConsole };
