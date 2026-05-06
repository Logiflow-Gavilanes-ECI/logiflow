const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { HealthImplementation } = require('grpc-health-check');
const CircuitBreaker = require('opossum');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleRoutesClient, profileToGoogleTravelMode } = require('./google-routes-client');
const { logger, loggerFor } = require('./logger');

const protoPathCandidates = [
  process.env.OPTIMIZER_PROTO_PATH,
  path.resolve(__dirname, '..', 'shared', 'proto', 'optimizer.proto'),
  path.resolve(__dirname, '..', '..', '..', 'shared', 'proto', 'optimizer.proto'),
].filter(Boolean);

const PROTO_PATH = protoPathCandidates.find((candidate) => fs.existsSync(candidate));

if (!PROTO_PATH) {
  throw new Error(`optimizer.proto not found. Checked: ${protoPathCandidates.join(', ')}`);
}

const VROOM_URL = process.env.VROOM_URL || 'http://vroom:3000';
const VROOM_OPTIMIZE_PATH = process.env.VROOM_OPTIMIZE_PATH || '/';
const MATRIX_SOURCE = process.env.MATRIX_SOURCE || 'request';
const OPTIMIZER_VALIDATE_MATRIX_ONLY = process.env.OPTIMIZER_VALIDATE_MATRIX_ONLY === 'true';
const GOOGLE_ROUTES_ENABLED = process.env.GOOGLE_ROUTES_ENABLED === 'true';
const GOOGLE_ROUTES_ALLOW_CALLS = process.env.GOOGLE_ROUTES_ALLOW_CALLS === 'true';
const GOOGLE_ROUTES_MOCK = process.env.GOOGLE_ROUTES_MOCK === 'true';
const MAX_GOOGLE_MATRIX_LOCATIONS = Number(process.env.MAX_GOOGLE_MATRIX_LOCATIONS || 10);
const AI_PREDICTOR_ENABLED = process.env.AI_PREDICTOR_ENABLED === 'true';
const AI_PREDICTOR_URL = process.env.AI_PREDICTOR_URL || 'http://ai-predictor:5001/adjust';
const AI_PREDICTOR_TIMEOUT_MS = Number(process.env.AI_PREDICTOR_TIMEOUT_MS || 5000);
const REDIS_URL = process.env.REDIS_URL;
const REDIS_ROUTE_TTL_SECONDS = Number(process.env.REDIS_ROUTE_TTL_SECONDS || 3600);

let redisClient;

const googleRoutesClient = new GoogleRoutesClient({
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  endpoint: process.env.GOOGLE_ROUTES_ENDPOINT,
  timeoutMs: Number(process.env.GOOGLE_ROUTES_TIMEOUT_MS || 20000),
  allowLiveCalls: GOOGLE_ROUTES_ALLOW_CALLS,
  mockMode: GOOGLE_ROUTES_MOCK,
  cacheTtlMs: Number(process.env.GOOGLE_ROUTES_CACHE_TTL_MS || 300000),
});

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).logiflow;

function getRedisClient() {
  if (!REDIS_URL) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  const Redis = require('ioredis');
  redisClient = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  redisClient.on('error', (error) => {
    logger.warn({ err: error }, 'redis_client_error');
  });

  return redisClient;
}

function buildRouteRedisKey(vehicleId) {
  return `route:vehicle:${vehicleId}`;
}

function getCorrelationId(call) {
  const rawHeader = call?.metadata?.get?.('x-correlation-id')?.[0];
  return rawHeader ? String(rawHeader) : 'unknown';
}

async function persistRoutesToRedis(grpcResponse, call, clientOverride) {
  const routes = grpcResponse?.routes || [];
  if (routes.length === 0) {
    return;
  }

  const client = clientOverride || getRedisClient();
  if (!client) {
    return;
  }

  try {
    if (client.status === 'wait' && typeof client.connect === 'function') {
      await client.connect();
    }

    const correlationId = getCorrelationId(call);
    const persistedAt = new Date().toISOString();

    for (const route of routes) {
      const vehicleId = String(route.vehicleId || '').trim();
      if (!vehicleId) {
        continue;
      }

      const key = buildRouteRedisKey(vehicleId);
      const value = JSON.stringify(
        {
          vehicleId,
          route,
          correlationId,
          persistedAt,
        },
        (_, rawValue) =>
          typeof rawValue === 'bigint' ? rawValue.toString() : rawValue,
      );
      await client.set(key, value, 'EX', REDIS_ROUTE_TTL_SECONDS);
    }
  } catch (error) {
    loggerFor(getCorrelationId(call)).warn(
      { err: error },
      'redis_persistence_skipped',
    );
  }
}

function mapProfile(profile) {
  const profileMap = {
    0: 'car',
    1: 'bicycle',
    2: 'foot',
  };
  return profileMap[profile] || 'car';
}

function createVroomIdMapper() {
  let nextId = 1;
  const toVroomMap = new Map();
  const fromVroomMap = new Map();

  return {
    toVroomId(originalId) {
      const safeOriginalId = String(originalId || '').trim();
      if (toVroomMap.has(safeOriginalId)) {
        return toVroomMap.get(safeOriginalId);
      }

      const assigned = nextId;
      nextId += 1;
      toVroomMap.set(safeOriginalId, assigned);
      fromVroomMap.set(String(assigned), safeOriginalId);
      return assigned;
    },
    fromVroomId(vroomId) {
      return fromVroomMap.get(String(vroomId));
    },
  };
}

function grpcToVroomRequest(req, idMapper) {
  const vroomReq = {
    jobs: [],
    shipments: [],
    vehicles: [],
  };

  if (req.jobs && req.jobs.length > 0) {
    vroomReq.jobs = req.jobs.map((job) => ({
      id: idMapper.toVroomId(job.id),
      location: [job.location.lon, job.location.lat],
      service: job.service || 0,
      amount: job.amount ? [job.amount] : [0],
      time_windows: job.timeWindowStart || job.timeWindowEnd
        ? [[job.timeWindowStart || 0, job.timeWindowEnd || 4294967295]]
        : [],
      skills: job.skills || [],
      priority: job.priority || 0,
    }));
  }

  if (req.shipments && req.shipments.length > 0) {
    vroomReq.shipments = req.shipments.map((shipment) => ({
      id: idMapper.toVroomId(shipment.id),
      pickup: {
        id: idMapper.toVroomId(shipment.pickup.id),
        location: [shipment.pickup.location.lon, shipment.pickup.location.lat],
        service: shipment.pickup.service || 0,
        amount: shipment.pickup.amount ? [shipment.pickup.amount] : [0],
        time_windows: shipment.pickup.timeWindowStart || shipment.pickup.timeWindowEnd
          ? [[shipment.pickup.timeWindowStart || 0, shipment.pickup.timeWindowEnd || 4294967295]]
          : [],
        skills: shipment.pickup.skills || [],
      },
      delivery: {
        id: idMapper.toVroomId(shipment.delivery.id),
        location: [shipment.delivery.location.lon, shipment.delivery.location.lat],
        service: shipment.delivery.service || 0,
        amount: shipment.delivery.amount ? [shipment.delivery.amount] : [0],
        time_windows: shipment.delivery.timeWindowStart || shipment.delivery.timeWindowEnd
          ? [[shipment.delivery.timeWindowStart || 0, shipment.delivery.timeWindowEnd || 4294967295]]
          : [],
        skills: shipment.delivery.skills || [],
      },
      skills: shipment.skills || [],
      priority: shipment.priority || 0,
    }));
  }

  if (req.vehicles && req.vehicles.length > 0) {
    vroomReq.vehicles = req.vehicles.map((vehicle) => ({
      id: idMapper.toVroomId(vehicle.id),
      profile: mapProfile(vehicle.profile),
      start: vehicle.start ? [vehicle.start.lon, vehicle.start.lat] : null,
      end: vehicle.end ? [vehicle.end.lon, vehicle.end.lat] : null,
      capacity: vehicle.capacity ? [vehicle.capacity] : [0],
      skills: vehicle.skills || [],
      time_window: vehicle.timeWindowStart || vehicle.timeWindowEnd
        ? [vehicle.timeWindowStart || 0, vehicle.timeWindowEnd || 4294967295]
        : [0, 4294967295],
      restrictions: vehicle.restrictions || [],
    }));
  }

  if (req.options) {
    vroomReq.options = {
      geometry: req.options.geometry || false,
      metric: req.options.metric || 'duration',
      optimize: req.options.optimize || true,
      algorithm: req.options.algorithm || 'greedy',
      max_jobs_per_route: req.options.maxJobsPerRoute || 0,
    };
  }

  return vroomReq;
}

function mapEntityId(value, idMapper) {
  if (!idMapper) {
    return String(value || '');
  }

  const originalId = idMapper.fromVroomId(value);
  return originalId !== undefined ? originalId : String(value || '');
}

function vroomToGrpcResponse(vroomRes, idMapper) {
  const response = {
    code: vroomRes.code || 0,
    error: vroomRes.error || '',
    routes: [],
    unassigned: [],
  };

  if (vroomRes.routes && vroomRes.routes.length > 0) {
    response.routes = vroomRes.routes.map((route) => ({
      vehicleId: mapEntityId(route.vehicle_id, idMapper),
      cost: route.cost || 0,
      distance: BigInt(route.distance || 0),
      duration: BigInt(route.duration || 0),
      steps: route.steps.map((step) => ({
        type: step.type || '',
        id: mapEntityId(step.id, idMapper),
        location: {
          lat: step.location ? step.location[1] : 0,
          lon: step.location ? step.location[0] : 0,
        },
        service: step.service || 0,
        waitingTime: step.waiting_time || 0,
        arrival: step.arrival || 0,
        departure: step.departure || 0,
        amount: step.amount || [],
        skills: step.skills || [],
      })),
      delivery: route.delivery || 0,
      pickup: route.pickup || 0,
    }));
  }

  if (vroomRes.unassigned && vroomRes.unassigned.length > 0) {
    response.unassigned = vroomRes.unassigned.map((unassigned) => ({
      id: mapEntityId(unassigned.id, idMapper),
      vehicleId: mapEntityId(unassigned.vehicle_id, idMapper),
      steps: (unassigned.steps || []).map((step) => ({
        type: step.type || '',
        id: mapEntityId(step.id, idMapper),
        location: {
          lat: step.location ? step.location[1] : 0,
          lon: step.location ? step.location[0] : 0,
        },
        service: step.service || 0,
      })),
    }));
  }

  if (vroomRes.matrix) {
    response.matrix = {
      distances: vroomRes.matrix.distances || [],
      durations: vroomRes.matrix.durations || [],
      locations: (vroomRes.matrix.locations || []).map((loc) => ({
        lat: loc[1] || 0,
        lon: loc[0] || 0,
      })),
    };
  }

  response.routingDistance = BigInt(vroomRes.summary ? vroomRes.summary.distance : 0);
  response.routingDuration = BigInt(vroomRes.summary ? vroomRes.summary.duration : 0);

  return response;
}

function shouldComputeGoogleMatrix(req) {
  return MATRIX_SOURCE === 'google';
}

function resolveDepartureTime(req) {
  return req?.departureTime || new Date().toISOString();
}

function isValidCoordinate(coordinate) {
  if (!coordinate) {
    return false;
  }

  const lat = Number(coordinate.lat);
  const lon = Number(coordinate.lon);
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function buildMatrixLocations(req) {
  const fromRequest = (req?.matrix?.locations || [])
    .filter(isValidCoordinate)
    .map((location) => ({ lat: Number(location.lat), lon: Number(location.lon) }));

  if (fromRequest.length > 0) {
    return fromRequest;
  }

  const dedupe = new Map();

  const addCoordinate = (coordinate) => {
    if (!isValidCoordinate(coordinate)) {
      return;
    }

    const lat = Number(coordinate.lat);
    const lon = Number(coordinate.lon);
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

    if (!dedupe.has(key)) {
      dedupe.set(key, { lat, lon });
    }
  };

  for (const vehicle of req?.vehicles || []) {
    addCoordinate(vehicle.start);
    addCoordinate(vehicle.end);
  }

  for (const job of req?.jobs || []) {
    addCoordinate(job.location);
  }

  for (const shipment of req?.shipments || []) {
    addCoordinate(shipment.pickup?.location);
    addCoordinate(shipment.delivery?.location);
  }

  return Array.from(dedupe.values());
}

async function maybeAttachGoogleMatrix(req, vroomRequest) {
  if (!shouldComputeGoogleMatrix(req)) {
    return;
  }

  if (!GOOGLE_ROUTES_ENABLED) {
    throw new Error('Google Routes is disabled. Set GOOGLE_ROUTES_ENABLED=true to enable matrix computation.');
  }

  const firstVehicleProfile = req.vehicles?.[0]?.profile;
  const travelMode = profileToGoogleTravelMode(firstVehicleProfile);
  const locations = buildMatrixLocations(req);

  if (locations.length === 0) {
    throw new Error(
      'Unable to build matrix: provide matrix.locations or at least one valid location in vehicles/jobs/shipments.',
    );
  }

  if (locations.length > MAX_GOOGLE_MATRIX_LOCATIONS) {
    throw new Error(
      `Google Routes guardrail triggered: locations=${locations.length}, max=${MAX_GOOGLE_MATRIX_LOCATIONS}.`,
    );
  }

  if (!GOOGLE_ROUTES_ALLOW_CALLS && !GOOGLE_ROUTES_MOCK) {
    throw new Error(
      'Google Routes live calls are blocked. Set GOOGLE_ROUTES_ALLOW_CALLS=true or GOOGLE_ROUTES_MOCK=true.',
    );
  }

  const matrixResult = await googleRoutesClient.computeRouteMatrix({
    locations,
    travelMode,
    departureTime: resolveDepartureTime(req),
  });

  vroomRequest.matrix = {
    distances: matrixResult.distances,
    durations: matrixResult.durations,
  };

  return matrixResult;
}

async function callAIPredictor(matrix, departureTime, correlationId) {
  const headers = { 'Content-Type': 'application/json' };
  if (correlationId) {
    headers['X-Correlation-Id'] = correlationId;
  }
  if (process.env.AI_PREDICTOR_INTERNAL_TOKEN) {
    headers['X-Internal-Token'] = process.env.AI_PREDICTOR_INTERNAL_TOKEN;
  }

  const response = await axios.post(
    AI_PREDICTOR_URL,
    {
      matrix,
      departure_time: departureTime,
    },
    {
      timeout: AI_PREDICTOR_TIMEOUT_MS,
      headers,
    },
  );

  return response.data;
}

// Wrap the predictor call in a circuit breaker so a single bad period
// does not slow every optimization down by AI_PREDICTOR_TIMEOUT_MS.
// Once errorThreshold % of recent calls have failed, the breaker opens
// and rejects calls immediately for resetTimeout ms; one trial call
// then probes recovery (half-open).
const aiPredictorBreaker = new CircuitBreaker(callAIPredictor, {
  timeout: AI_PREDICTOR_TIMEOUT_MS,
  errorThresholdPercentage: Number(process.env.AI_BREAKER_ERROR_PCT || 50),
  resetTimeout: Number(process.env.AI_BREAKER_RESET_MS || 30000),
  volumeThreshold: Number(process.env.AI_BREAKER_VOLUME || 5),
  rollingCountTimeout: Number(process.env.AI_BREAKER_WINDOW_MS || 10000),
  name: 'ai-predictor',
});

aiPredictorBreaker.on('open', () =>
  logger.warn({ event: 'ai_breaker_open' }, 'ai_breaker_open'),
);
aiPredictorBreaker.on('halfOpen', () =>
  logger.info({ event: 'ai_breaker_half_open' }, 'ai_breaker_half_open'),
);
aiPredictorBreaker.on('close', () =>
  logger.info({ event: 'ai_breaker_close' }, 'ai_breaker_close'),
);
aiPredictorBreaker.on('reject', () =>
  logger.warn({ event: 'ai_breaker_reject' }, 'ai_breaker_reject'),
);

async function optimizeRoutes(call, callback) {
  const correlationId = getCorrelationId(call);
  const log = loggerFor(correlationId);
  const startedAt = process.hrtime.bigint();
  log.info(
    {
      event: 'optimize_started',
      vehicles: call.request?.vehicles?.length || 0,
      jobs: call.request?.jobs?.length || 0,
      shipments: call.request?.shipments?.length || 0,
    },
    'optimize_started',
  );

  try {
    const idMapper = createVroomIdMapper();
    const vroomRequest = grpcToVroomRequest(call.request, idMapper);
    let matrixResult = await maybeAttachGoogleMatrix(call.request, vroomRequest);

    if (matrixResult?.source === 'fallback') {
      log.warn({ event: 'matrix_fallback_used' }, 'matrix_fallback_used');
    }

    if (AI_PREDICTOR_ENABLED && vroomRequest.matrix) {
      try {
        const aiResponse = await aiPredictorBreaker.fire(
          {
            distances: vroomRequest.matrix.distances,
            durations: vroomRequest.matrix.durations,
            locations: matrixResult?.locations || buildMatrixLocations(call.request),
          },
          resolveDepartureTime(call.request),
          correlationId,
        );

        if (aiResponse?.matrix?.durations && aiResponse?.matrix?.distances) {
          vroomRequest.matrix = {
            distances: aiResponse.matrix.distances,
            durations: aiResponse.matrix.durations,
          };

          matrixResult = {
            distances: aiResponse.matrix.distances,
            durations: aiResponse.matrix.durations,
            locations: aiResponse.matrix.locations || matrixResult?.locations || buildMatrixLocations(call.request),
            source: 'ai-adjusted',
          };
          log.info({ event: 'ai_predictor_applied' }, 'ai_predictor_applied');
        }
      } catch (error) {
        log.warn(
          { err: error, event: 'ai_predictor_unavailable' },
          'ai_predictor_unavailable',
        );
      }
    }

    if (OPTIMIZER_VALIDATE_MATRIX_ONLY && matrixResult) {
      callback(null, {
        code: 0,
        error: '',
        routes: [],
        unassigned: [],
        matrix: {
          distances: matrixResult.distances,
          durations: matrixResult.durations,
          locations: matrixResult.locations,
        },
        matrixSource: matrixResult.source || 'google',
        routingDistance: 0,
        routingDuration: 0,
      });
      return;
    }
    const vroomTargetUrl = new URL(VROOM_OPTIMIZE_PATH, `${VROOM_URL.replace(/\/$/, '')}/`).toString();

    const vroomRes = await axios.post(vroomTargetUrl, vroomRequest, {
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      timeout: 30000,
    });

    const grpcResponse = vroomToGrpcResponse(vroomRes.data, idMapper);
    if (matrixResult?.source) {
      grpcResponse.matrixSource = matrixResult.source;
    }

    await persistRoutesToRedis(grpcResponse, call);

    const durationMs = Number((process.hrtime.bigint() - startedAt) / BigInt(1_000_000));
    log.info(
      {
        event: 'optimize_completed',
        durationMs,
        routes: grpcResponse.routes?.length || 0,
        unassigned: grpcResponse.unassigned?.length || 0,
        matrixSource: grpcResponse.matrixSource,
      },
      'optimize_completed',
    );
    callback(null, grpcResponse);
  } catch (error) {
    const upstreamDetails = typeof error.response?.data === 'string'
      ? error.response.data
      : JSON.stringify(error.response?.data || {});
    const durationMs = Number((process.hrtime.bigint() - startedAt) / BigInt(1_000_000));
    log.error(
      {
        err: error,
        upstreamStatus: error.response?.status,
        upstreamDetails,
        durationMs,
        event: 'optimize_failed',
      },
      'optimize_failed',
    );
    const errorResponse = {
      code: error.response?.status || 500,
      error: `${error.message || 'Internal server error'}${upstreamDetails && upstreamDetails !== '{}' ? ` | ${upstreamDetails}` : ''}`,
      routes: [],
      unassigned: [],
      routingDistance: BigInt(0),
      routingDuration: BigInt(0),
    };
    callback(null, errorResponse);
  }
}

// gRPC standard health protocol (grpc.health.v1.Health). Probes:
//   grpc_health_probe -addr=:50051                 -> overall server health
//   grpc_health_probe -addr=:50051 -service=logiflow.RouteOptimizer
const HEALTH_SERVICE = 'logiflow.RouteOptimizer';
const healthImpl = new HealthImplementation({
  '': 'NOT_SERVING',
  [HEALTH_SERVICE]: 'NOT_SERVING',
});

function setHealth(status) {
  healthImpl.setStatus('', status);
  healthImpl.setStatus(HEALTH_SERVICE, status);
}

const SHUTDOWN_DEADLINE_MS = Number(process.env.SHUTDOWN_DEADLINE_MS || 25000);

function installShutdownHandlers(server) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal, event: 'shutdown_started' }, 'shutdown_started');

    // Stop reporting healthy so orchestrators stop sending new traffic.
    setHealth('NOT_SERVING');

    const forceTimer = setTimeout(() => {
      logger.warn({ event: 'shutdown_force' }, 'shutdown_force');
      try {
        server.forceShutdown();
      } catch (error) {
        logger.error({ err: error }, 'force_shutdown_failed');
      }
      closeRedisAndExit(1);
    }, SHUTDOWN_DEADLINE_MS);
    forceTimer.unref();

    server.tryShutdown((error) => {
      clearTimeout(forceTimer);
      if (error) {
        logger.error({ err: error, event: 'graceful_shutdown_error' }, 'graceful_shutdown_error');
        closeRedisAndExit(1);
        return;
      }
      logger.info({ event: 'grpc_drained' }, 'grpc_drained');
      closeRedisAndExit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error, event: 'uncaught_exception' }, 'uncaught_exception');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason, event: 'unhandled_rejection' }, 'unhandled_rejection');
  });
}

function closeRedisAndExit(code) {
  if (!redisClient) {
    process.exit(code);
    return;
  }
  redisClient
    .quit()
    .catch((error) => logger.warn({ err: error }, 'redis_quit_failed'))
    .finally(() => process.exit(code));
}

function main() {
  const server = new grpc.Server();
  server.addService(proto.RouteOptimizer.service, {
    optimizeRoutes: optimizeRoutes,
  });
  healthImpl.addToServer(server);

  const port = process.env.GRPC_PORT || '50051';
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      logger.error({ err }, 'grpc_bind_failed');
      process.exit(1);
    }
    logger.info({ port: boundPort, event: 'grpc_listening' }, 'grpc_listening');
    // bindAsync already starts the server; server.start() is deprecated.
    setHealth('SERVING');
    installShutdownHandlers(server);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  createVroomIdMapper,
  grpcToVroomRequest,
  vroomToGrpcResponse,
  buildMatrixLocations,
  maybeAttachGoogleMatrix,
  callAIPredictor,
  aiPredictorBreaker,
  buildRouteRedisKey,
  persistRoutesToRedis,
  optimizeRoutes,
  healthImpl,
  setHealth,
  HEALTH_SERVICE,
};
