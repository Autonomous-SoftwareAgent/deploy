'use strict';
// Ca sử dụng XEM TRẠNG THÁI: với mỗi dịch vụ, điều nó MUỐN (tờ khai báo), điều ĐANG CHẠY (Runtime) và điều ĐÃ XẢY RA (sổ deploy).
const { localImage, containerName } = require('../domain/naming');
const ledgerOf = require('../domain/ledger');

const HISTORY_SHOWN = 15;

/**
 * @param {{source: import('./ports').Source, runtime: import('./ports').Runtime, ledger: import('./ports').Ledger, serviceLock: object}} ports
 */
function makeGetStatus({ source, runtime, ledger, serviceLock }) {
  return async function getStatus({ manifest }) {
    const running = await runtime.list();
    const book = await ledger.read();
    const services = [];
    for (const [name, svc] of Object.entries(manifest.services)) {
      const head = await source.head(svc.repo);
      const live = running ? running.get(containerName(name)) || null : null;
      const entry = ledgerOf.of(book, name);
      services.push({
        service: name, pinned: svc.commit || null, head, pinnedIsHead: !!svc.commit && svc.commit === head,
        uncommittedFiles: await source.dirtyCount(svc.repo),
        imageBuilt: svc.commit && running ? await runtime.hasImage(localImage(name, svc.commit)) : null,
        running: !!live, runningCommit: live ? live.commit || null : null,
        runningMatchesPin: live ? !!svc.commit && live.commit === svc.commit : null,
        containerStatus: live ? live.status : null, portLocal: svc.port.local,
        deployed: entry && entry.current ? entry.current : null, previous: ledgerOf.previousCommit(book, name),
        lastAttempt: ledgerOf.lastRequested(book, name), history: ledgerOf.recent(book, name, HISTORY_SHOWN),
        busy: await serviceLock.holder(name),
      });
    }
    return { ok: true, dockerReachable: !!running, services };
  };
}

module.exports = { makeGetStatus };
