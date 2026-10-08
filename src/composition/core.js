'use strict';
// LẮP RÁP, phần lõi: bộ nối thật và bộ nối trong bộ nhớ cho các cổng, và các ca sử dụng của dòng lệnh đặt trên một bộ cổng bất kỳ.
// Xem ../composition.js (cửa vào của lớp lắp ráp).
const { assertPort } = require('../application/ports');
const { makePrepareTier } = require('../application/prepare-tier');
const { makeImages } = require('../application/images');
const { makeServiceLock } = require('../application/service-lock');
const { makeSwitchVersion } = require('../application/switch-version');
const { makeCheck } = require('../application/check');
const { makeGetStatus } = require('../application/get-status');
const { makeGetLogs } = require('../application/get-logs');
const { makeGetImages } = require('../application/get-images');
const { makePin } = require('../application/pin');
const { makeStack } = require('../application/stack');
const { makeDeploy } = require('../application/deploy');
const { makeRollback } = require('../application/rollback');
const { makeLayout } = require('../infrastructure/layout');
const runner = require('../infrastructure/process-runner');
const { makeFsDeclarations } = require('../infrastructure/fs-declarations');
const { makeGitSource } = require('../infrastructure/git-source');
const { makeFsConfigFiles } = require('../infrastructure/fs-config-files');
const { makeDockerRuntime } = require('../infrastructure/docker-runtime');
const { makeDockerRegistry } = require('../infrastructure/docker-registry');
const { makeComposeSharedTier } = require('../infrastructure/compose-shared-tier');
const { makeFsSecrets } = require('../infrastructure/fs-secrets');
const { makeFileLocks } = require('../infrastructure/file-locks');
const { makeFsLedger } = require('../infrastructure/fs-ledger');
const { makeHttpHealth } = require('../infrastructure/http-health');
const { systemClock } = require('../infrastructure/system');
const { makeMemoryStorage } = require('../infrastructure/memory/storage');
const { makeMemoryPlatform } = require('../infrastructure/memory/platform');
const { sampleWorld } = require('../infrastructure/memory/world');

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

module.exports = { buildLocalApp, localPorts, assemble, memoryPorts };
