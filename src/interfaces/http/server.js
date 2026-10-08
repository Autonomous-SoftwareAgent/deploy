'use strict';
// Máy chủ web của bảng điều khiển: bảng định tuyến + chuỗi lớp chặn. Chỉ nghe trên 127.0.0.1.
// Không có quy tắc deploy nào ở đây: mọi việc đi qua ca sử dụng trong "app" (auth, console) do composition đưa vào.
const http = require('node:http');
const path = require('node:path');
const { json, fail } = require('./respond');
const { makeRouter } = require('./router');
const { compose } = require('./pipeline');
const { hostGuard } = require('./middleware/host-guard');
const { securityHeaders } = require('./middleware/security-headers');
const { jsonBody } = require('./middleware/json-body');
const { authenticate } = require('./middleware/authenticate');
const { csrf } = require('./middleware/csrf');
const { sessionController } = require('./controllers/session');
const { deploymentsController } = require('./controllers/deployments');
const { staticController } = require('./controllers/static');
const { fleetController } = require('./controllers/fleet');

const WEB_DIR = path.join(__dirname, '..', 'web');

/** app: { auth, console }. opts: { port, memory?, target? }. target: dòng mô tả đích từ xa (bỏ trống: đích là máy này). */
function makeHttpServer(app, { port = 8900, memory = false, target = null } = {}) {
  const session = sessionController(app);
  const deployments = deploymentsController({ console: app.console, memory, target });
  const assets = staticController({ dir: WEB_DIR });
  const many = app.fleet && app.runs ? fleetController({ fleet: app.fleet, runs: app.runs, memory, skippedTargets: app.skippedTargets || [] }) : null;

  const match = makeRouter([
    { method: 'GET', path: '/healthz', open: true, handler: () => json(200, { ok: true }) },
    { method: 'GET', path: '/', open: true, handler: assets.index },
    { method: 'GET', path: '/favicon.ico', open: true, handler: () => ({ status: 204, headers: {}, body: '' }) },
    { method: 'GET', path: '/web/*', open: true, handler: assets.asset },
    { method: 'POST', path: '/api/login', open: true, handler: session.login },
    { method: 'POST', path: '/api/logout', handler: session.logout },
    { method: 'GET', path: '/api/state', handler: deployments.state },
    { method: 'GET', path: '/api/jobs/:id', handler: deployments.job },
    { method: 'POST', path: '/api/services/:service/deploy', handler: deployments.deploy },
    { method: 'POST', path: '/api/services/:service/rollback', handler: deployments.rollback },
    ...(many ? many.routes : []),
  ]);

  let server = null;
  const livePort = () => (server && server.address() ? server.address().port : port);

  // Thứ tự có nghĩa: tên máy trước tiên; tìm đường; biết ai gọi; chặn giả mạo; rồi mới đọc thân.
  const route = (ctx, next) => {
    const found = match(ctx.method, ctx.pathname);
    if (!found) return fail(404, 'không có đường dẫn này');
    Object.assign(ctx, found);
    return next();
  };
  const run = compose([securityHeaders(), hostGuard({ port: livePort }), route, authenticate(app), csrf(), jsonBody()], (ctx) => ctx.route.handler(ctx));

  async function handle(req, res) {
    let out;
    try {
      const host = String(req.headers.host || '');
      const url = new URL(req.url, 'http://x');
      out = await run({ req, method: req.method, host, pathname: url.pathname, query: url.searchParams, params: {}, body: {}, who: null });
    } catch (e) { out = fail(500, `lỗi không lường trước: ${e.message}`); }
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  }

  server = http.createServer(handle);
  return {
    server,
    // Chỉ nghe trên 127.0.0.1: không máy nào khác trong mạng gọi vào được.
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server.address())); }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { makeHttpServer };
