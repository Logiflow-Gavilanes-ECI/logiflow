const http = require('http');
const promClient = require('prom-client');
const { logger } = require('./logger');

const registry = new promClient.Registry();
registry.setDefaultLabels({ service: 'optimizer' });
promClient.collectDefaultMetrics({ register: registry });

const optimizeRequestsTotal = new promClient.Counter({
  name: 'optimizer_requests_total',
  help: 'Total OptimizeRoutes calls by terminal status.',
  labelNames: ['status'],
  registers: [registry],
});

const optimizeDurationMs = new promClient.Histogram({
  name: 'optimizer_duration_ms',
  help: 'Wall-clock duration of OptimizeRoutes in milliseconds.',
  labelNames: ['status', 'matrix_source'],
  buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [registry],
});

const vroomFailuresTotal = new promClient.Counter({
  name: 'optimizer_vroom_failures_total',
  help: 'VROOM HTTP calls that ended in error.',
  registers: [registry],
});

const aiPredictorFailuresTotal = new promClient.Counter({
  name: 'optimizer_ai_predictor_failures_total',
  help: 'AI predictor calls that failed (timeout, 5xx, breaker reject).',
  labelNames: ['reason'],
  registers: [registry],
});

const aiBreakerStateChanges = new promClient.Counter({
  name: 'optimizer_ai_breaker_state_changes_total',
  help: 'AI predictor circuit breaker state transitions.',
  labelNames: ['state'],
  registers: [registry],
});

const redisFailuresTotal = new promClient.Counter({
  name: 'optimizer_redis_persistence_failures_total',
  help: 'Route-persistence writes to Redis that failed.',
  registers: [registry],
});

const matrixSourceTotal = new promClient.Counter({
  name: 'optimizer_matrix_source_total',
  help: 'Number of optimizations grouped by the matrix source actually used.',
  labelNames: ['source'],
  registers: [registry],
});

function startMetricsServer(port = Number(process.env.METRICS_PORT || 9090)) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      try {
        const body = await registry.metrics();
        res.writeHead(200, { 'Content-Type': registry.contentType });
        res.end(body);
      } catch (error) {
        res.writeHead(500);
        res.end(`# metrics_error: ${error.message}`);
      }
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port, event: 'metrics_listening' }, 'metrics_listening');
  });

  return server;
}

module.exports = {
  registry,
  startMetricsServer,
  optimizeRequestsTotal,
  optimizeDurationMs,
  vroomFailuresTotal,
  aiPredictorFailuresTotal,
  aiBreakerStateChanges,
  redisFailuresTotal,
  matrixSourceTotal,
};
