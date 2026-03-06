'use strict';

const trafficEvent = require('../sample-data/traffic-event.json');

const VALID_EVENT_TYPES = ['TRAFFIC_JAM', 'ROAD_CLOSURE', 'WEATHER_ALERT'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const REQUIRED_FIELDS = [
  'eventType',
  'severity',
  'location',
  'affectedVehicles',
  'timestamp',
  'detourRecommended',
];
const BOGOTA_LAT_MIN = 4.4;
const BOGOTA_LAT_MAX = 4.9;
const BOGOTA_LNG_MIN = -74.3;
const BOGOTA_LNG_MAX = -73.9;

describe('Traffic Event Payload', () => {
  test('should contain all required fields', () => {
    REQUIRED_FIELDS.forEach((field) => {
      expect(trafficEvent).toHaveProperty(field);
    });
  });

  test('affectedVehicles should be a non-empty array', () => {
    expect(Array.isArray(trafficEvent.affectedVehicles)).toBe(true);
    expect(trafficEvent.affectedVehicles.length).toBeGreaterThan(0);
  });

  test('eventType should be a valid enum value', () => {
    expect(VALID_EVENT_TYPES).toContain(trafficEvent.eventType);
  });

  test('location should have valid Bogotá coordinate ranges', () => {
    const { lat, lng } = trafficEvent.location;
    expect(lat).toBeGreaterThanOrEqual(BOGOTA_LAT_MIN);
    expect(lat).toBeLessThanOrEqual(BOGOTA_LAT_MAX);
    expect(lng).toBeGreaterThanOrEqual(BOGOTA_LNG_MIN);
    expect(lng).toBeLessThanOrEqual(BOGOTA_LNG_MAX);
  });

  test('severity should be a valid enum value', () => {
    expect(VALID_SEVERITIES).toContain(trafficEvent.severity);
  });
});

describe('Traffic Event Payload – Mock Server Validation', () => {
  let app;
  let request;

  beforeAll(() => {
    app = require('../mock-server/index');
    request = require('supertest');
  });

  test('should return 200 with valid payload', async () => {
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(trafficEvent);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('received');
    expect(response.body.vehiclesAffected).toBe(trafficEvent.affectedVehicles.length);
    expect(response.body).toHaveProperty('receivedAt');
  });

  test('should return 400 when eventType is missing', async () => {
    const payloadWithoutEventType = Object.assign({}, trafficEvent);
    delete payloadWithoutEventType.eventType;
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(payloadWithoutEventType);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
    expect(response.body.message).toContain('eventType');
  });

  test('should return 400 when affectedVehicles is missing', async () => {
    const payloadWithoutVehicles = Object.assign({}, trafficEvent);
    delete payloadWithoutVehicles.affectedVehicles;
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(payloadWithoutVehicles);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
    expect(response.body.message).toContain('affectedVehicles');
  });

  test('should return 400 when body is empty', async () => {
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });
});
