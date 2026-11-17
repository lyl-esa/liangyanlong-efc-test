// Express + app.listen 风格
// 演示：异步路由包装（asyncHandler）+ 全局错误处理中间件 + 静态文件托管
// 平台自动拦截 listen 端口；本地用 process.env.PORT || 3000
const express = require('express');
const path = require('path');
const app = express();
const DEFAULT_WAIT_MS = Number(process.env.HEALTH_WAIT_MS) || 0;
const MAX_WAIT_MS = Number(process.env.HEALTH_MAX_WAIT_MS) || 30000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// async 路由包装器：把 Promise rejection 转给错误中间件
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/health', (req, res) => {
  const parsed = Number(req.query.wait);
  const waitMs = Math.min(
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WAIT_MS,
    MAX_WAIT_MS
  );
  const block = req.query.block === '1';
  const t0 = process.hrtime.bigint();

  const reply = () => {
    res.json({
      ok: true, framework: 'express', flavor: 'listen',
      service: '留言板', message: '服务运行中',
      version: express.version || require('express/package.json').version,
      time: new Date().toISOString(),
      waitRequestedMs: waitMs,                                   // 截断后的目标延迟
      waitedMode: block ? 'sync-block' : 'async-setTimeout',
      waitedActualMs: Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)),
      inflight,                                                  // 回包瞬间在处理中的请求数
    });
  };

  inflight++;
  res.on('finish', () => inflight--);

  if (block && waitMs > 0) {                     // 仅对比实验用，会卡死进程
    const until = Date.now() + waitMs;
    while (Date.now() < until) { /* busy wait */ }
    return reply();
  }
  if (waitMs > 0) return setTimeout(reply, waitMs);   // ← 默认：异步等
  return reply();
  //res.json({ ok: true, framework: 'express', flavor: 'listen', service: '留言板', message: '服务运行中' });
});

app.get('/api/users/:id', asyncHandler(async (req, res) => {
  // 模拟异步查库
  const profile = await Promise.resolve({ name: `访客#${req.params.id}`, avatar: `/avatars/${req.params.id}.png` });
  res.json({ user: req.params.id, source: 'express', ...profile });
}));

app.post('/api/echo', asyncHandler(async (req, res) => {
  res.json({ received: req.body, echoed: true, timestamp: new Date().toISOString() });
}));

// 演示全局错误处理：抛出异常会被下方错误中间件捕获
app.get('/api/error-demo', asyncHandler(async () => {
  throw new Error('演示错误：Express 全局错误中间件已捕获');
}));

// 全局错误处理中间件（四参数，Express 识别为错误处理器）
app.use((err, req, res, next) => {
  console.error('[error-handler]', err.message);
  res.status(500).json({ error: 'internal', message: err.message });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
