const axios = require('axios');
const { GoogleRoutesClient } = require('../src/google-routes-client');
const { buildMatrixLocations } = require('../src/server');

jest.mock('axios');

describe('Optimizer matrix behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('guardrail blocks live Google calls when allowLiveCalls=false', async () => {
    const client = new GoogleRoutesClient({
      apiKey: 'fake-key',
      allowLiveCalls: false,
      mockMode: false,
    });

    await expect(
      client.computeRouteMatrix({
        locations: [{ lat: 4.65, lon: -74.05 }, { lat: 4.66, lon: -74.06 }],
        travelMode: 'DRIVE',
        departureTime: '2026-03-24T13:00:00.000Z',
      }),
    ).rejects.toThrow('GOOGLE_ROUTES_ALLOW_CALLS=false');

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('buildMatrixLocations dedupes coordinates from vehicles/jobs/shipments', () => {
    const locations = buildMatrixLocations({
      vehicles: [
        {
          id: 'v-001',
          start: { lat: 4.650001, lon: -74.050001 },
          end: { lat: 4.650001, lon: -74.050001 },
        },
      ],
      jobs: [
        { id: 'j-001', location: { lat: 4.660001, lon: -74.060001 } },
        { id: 'j-002', location: { lat: 4.6600014, lon: -74.0600014 } },
      ],
      shipments: [
        {
          id: 's-001',
          pickup: { id: 'sp-001', location: { lat: 4.670001, lon: -74.070001 } },
          delivery: { id: 'sd-001', location: { lat: 4.680001, lon: -74.080001 } },
        },
      ],
    });

    expect(locations).toEqual([
      { lat: 4.650001, lon: -74.050001 },
      { lat: 4.660001, lon: -74.060001 },
      { lat: 4.670001, lon: -74.070001 },
      { lat: 4.680001, lon: -74.080001 },
    ]);
  });

  test('falls back to haversine matrix and marks source=fallback on Google 500', async () => {
    axios.post.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { error: 'internal' },
      },
    });

    const client = new GoogleRoutesClient({
      apiKey: 'fake-key',
      allowLiveCalls: true,
      mockMode: false,
    });

    const result = await client.computeRouteMatrix({
      locations: [
        { lat: 4.65, lon: -74.05 },
        { lat: 4.66, lon: -74.06 },
      ],
      travelMode: 'DRIVE',
      departureTime: '2026-03-24T22:00:00.000Z',
    });

    expect(result.source).toBe('fallback');
    expect(result.distances).toHaveLength(4);
    expect(result.durations).toHaveLength(4);
    expect(result.distances[1]).toBeGreaterThan(0);
    expect(result.durations[1]).toBeGreaterThan(0);
  });
});
