const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleRoutesClient, profileToGoogleTravelMode } = require('./google-routes-client');

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

function mapProfile(profile) {
  const profileMap = {
    0: 'car',
    1: 'bicycle',
    2: 'foot',
  };
  return profileMap[profile] || 'car';
}

function grpcToVroomRequest(req) {
  const vroomReq = {
    jobs: [],
    shipments: [],
    vehicles: [],
  };

  if (req.jobs && req.jobs.length > 0) {
    vroomReq.jobs = req.jobs.map((job) => ({
      id: parseInt(job.id, 10) || 0,
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
      id: parseInt(shipment.id, 10) || 0,
      pickup: {
        id: parseInt(shipment.pickup.id, 10) || 0,
        location: [shipment.pickup.location.lon, shipment.pickup.location.lat],
        service: shipment.pickup.service || 0,
        amount: shipment.pickup.amount ? [shipment.pickup.amount] : [0],
        time_windows: shipment.pickup.timeWindowStart || shipment.pickup.timeWindowEnd
          ? [[shipment.pickup.timeWindowStart || 0, shipment.pickup.timeWindowEnd || 4294967295]]
          : [],
        skills: shipment.pickup.skills || [],
      },
      delivery: {
        id: parseInt(shipment.delivery.id, 10) || 0,
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
      id: parseInt(vehicle.id, 10) || 0,
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

function vroomToGrpcResponse(vroomRes) {
  const response = {
    code: vroomRes.code || 0,
    error: vroomRes.error || '',
    routes: [],
    unassigned: [],
  };

  if (vroomRes.routes && vroomRes.routes.length > 0) {
    response.routes = vroomRes.routes.map((route) => ({
      vehicleId: String(route.vehicle_id || ''),
      cost: route.cost || 0,
      distance: BigInt(route.distance || 0),
      duration: BigInt(route.duration || 0),
      steps: route.steps.map((step) => ({
        type: step.type || '',
        id: String(step.id || ''),
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
      id: String(unassigned.id || ''),
      vehicleId: String(unassigned.vehicle_id || ''),
      steps: (unassigned.steps || []).map((step) => ({
        type: step.type || '',
        id: String(step.id || ''),
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
    departureTime: process.env.GOOGLE_ROUTES_DEPARTURE_TIME,
  });

  vroomRequest.matrix = {
    distances: matrixResult.distances,
    durations: matrixResult.durations,
  };

  return matrixResult;
}

async function optimizeRoutes(call, callback) {
  try {
    const vroomRequest = grpcToVroomRequest(call.request);
    const matrixResult = await maybeAttachGoogleMatrix(call.request, vroomRequest);

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
        routingDistance: 0,
        routingDuration: 0,
      });
      return;
    }
    const vroomTargetUrl = new URL(VROOM_OPTIMIZE_PATH, `${VROOM_URL.replace(/\/$/, '')}/`).toString();
    
    const vroomRes = await axios.post(vroomTargetUrl, vroomRequest, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const grpcResponse = vroomToGrpcResponse(vroomRes.data);
    callback(null, grpcResponse);
  } catch (error) {
    const upstreamDetails = typeof error.response?.data === 'string'
      ? error.response.data
      : JSON.stringify(error.response?.data || {});
    console.error('OptimizeRoutes failed:', error.message, upstreamDetails);
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

function main() {
  const server = new grpc.Server();
  server.addService(proto.RouteOptimizer.service, {
    optimizeRoutes: optimizeRoutes,
  });

  const port = process.env.GRPC_PORT || '50051';
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Failed to bind server:', err);
      process.exit(1);
    }
    console.log(`gRPC server listening on port ${port}`);
    server.start();
  });
}

main();
