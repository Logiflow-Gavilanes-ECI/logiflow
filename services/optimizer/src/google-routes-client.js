const axios = require('axios');

const DEFAULT_ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_CACHE_TTL_MS = 300000;

function parseDurationSeconds(durationValue) {
  if (!durationValue || typeof durationValue !== 'string') {
    return 0;
  }

  const trimmed = durationValue.trim();
  if (!trimmed.endsWith('s')) {
    return 0;
  }

  const numericPart = Number(trimmed.slice(0, -1));
  if (!Number.isFinite(numericPart)) {
    return 0;
  }

  return Math.round(numericPart);
}

function profileToGoogleTravelMode(profile) {
  if (profile === 1) {
    return 'BICYCLE';
  }
  if (profile === 2) {
    return 'WALK';
  }
  return 'DRIVE';
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(origin, destination) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(destination.lat - origin.lat);
  const dLon = toRadians(destination.lon - origin.lon);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);

  const a = (Math.sin(dLat / 2) ** 2)
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLon / 2) ** 2));

  return Math.round(2 * earthRadiusMeters * Math.asin(Math.sqrt(a)));
}

function averageSpeedMetersPerSecond(travelMode) {
  if (travelMode === 'WALK') {
    return 1.4;
  }
  if (travelMode === 'BICYCLE') {
    return 4.2;
  }
  return 11.1;
}

function buildCacheKey({ locations, travelMode, departureTime, mockMode }) {
  return JSON.stringify({ locations, travelMode, departureTime, mockMode });
}

class GoogleRoutesClient {
  constructor({
    apiKey,
    endpoint = DEFAULT_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    allowLiveCalls = false,
    mockMode = false,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.allowLiveCalls = allowLiveCalls;
    this.mockMode = mockMode;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  getFromCache(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  setCache(cacheKey, value) {
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  buildMockMatrix({ locations, travelMode }) {
    const count = locations.length;
    const distances = new Array(count * count).fill(0);
    const durations = new Array(count * count).fill(0);
    const speed = averageSpeedMetersPerSecond(travelMode);

    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < count; j += 1) {
        if (i === j) {
          continue;
        }

        const distance = haversineDistanceMeters(locations[i], locations[j]);
        const duration = Math.round(distance / speed);
        const offset = (i * count) + j;
        distances[offset] = distance;
        durations[offset] = duration;
      }
    }

    return {
      distances,
      durations,
      locations,
      source: 'mock',
    };
  }

  async computeRouteMatrix({ locations, travelMode = 'DRIVE', departureTime }) {
    if (!Array.isArray(locations) || locations.length === 0) {
      return { distances: [], durations: [], locations: [] };
    }

    const cacheKey = buildCacheKey({
      locations,
      travelMode,
      departureTime,
      mockMode: this.mockMode,
    });

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.mockMode) {
      const mockResult = this.buildMockMatrix({ locations, travelMode });
      this.setCache(cacheKey, mockResult);
      return mockResult;
    }

    if (!this.allowLiveCalls) {
      throw new Error('Google Routes live calls are disabled by guardrail (GOOGLE_ROUTES_ALLOW_CALLS=false).');
    }

    if (!this.isEnabled()) {
      throw new Error('GOOGLE_MAPS_API_KEY is required to use Google Routes matrix');
    }

    const origins = locations.map((location) => ({
      waypoint: {
        location: {
          latLng: {
            latitude: location.lat,
            longitude: location.lon,
          },
        },
      },
    }));

    const requestBody = {
      origins,
      destinations: origins,
      travelMode,
      units: 'METRIC',
      routingPreference: travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : undefined,
    };

    if (departureTime) {
      requestBody.departureTime = departureTime;
    }

    try {
      const response = await axios.post(this.endpoint, requestBody, {
        timeout: this.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': [
            'originIndex',
            'destinationIndex',
            'distanceMeters',
            'duration',
            'status',
            'condition',
          ].join(','),
        },
      });

      const originCount = locations.length;
      const distances = new Array(originCount * originCount).fill(0);
      const durations = new Array(originCount * originCount).fill(0);

      for (const row of response.data || []) {
        const i = Number(row.originIndex);
        const j = Number(row.destinationIndex);
        if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0) {
          continue;
        }

        const offset = (i * originCount) + j;
        distances[offset] = Math.round(Number(row.distanceMeters || 0));
        durations[offset] = parseDurationSeconds(row.duration);
      }

      const result = {
        distances,
        durations,
        locations,
        source: 'google',
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      const fallbackResult = {
        ...this.buildMockMatrix({ locations, travelMode }),
        source: 'fallback',
      };
      this.setCache(cacheKey, fallbackResult);
      return fallbackResult;
    }
  }
}

module.exports = {
  GoogleRoutesClient,
  profileToGoogleTravelMode,
};
