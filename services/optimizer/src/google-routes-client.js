const axios = require('axios');

const DEFAULT_ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const DEFAULT_TIMEOUT_MS = 20000;

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

class GoogleRoutesClient {
  constructor({
    apiKey,
    endpoint = DEFAULT_ENDPOINT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  async computeRouteMatrix({ locations, travelMode = 'DRIVE', departureTime }) {
    if (!this.isEnabled()) {
      throw new Error('GOOGLE_MAPS_API_KEY is required to use Google Routes matrix');
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      return { distances: [], durations: [], locations: [] };
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

    return {
      distances,
      durations,
      locations,
    };
  }
}

module.exports = {
  GoogleRoutesClient,
  profileToGoogleTravelMode,
};
