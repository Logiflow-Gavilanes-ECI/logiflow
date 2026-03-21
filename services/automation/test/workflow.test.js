'use strict';

const trafficEvent = require('../sample-data/traffic-event.json');

const VALID_EVENT_TYPES = ['traffic_jam', 'road_closure', 'weather_alert'];
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_RISK_LEVELS = ['HIGH', 'MEDIUM', 'LOW'];
const REQUIRED_FIELDS = ['eventType', 'severity', 'locationDescription', 'vehicles', 'stops', 'risk', 'maps', 'timestamp'];
const BOGOTA_LAT_MIN = 4.4;
const BOGOTA_LAT_MAX = 4.9;
const BOGOTA_LNG_MIN = -74.3;
const BOGOTA_LNG_MAX = -73.9;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('Traffic Event Payload', () => {
  test('should contain all required fields', () => {
    REQUIRED_FIELDS.forEach((field) => {
      expect(trafficEvent).toHaveProperty(field);
    });
  });

  test('vehicles and stops should be non-empty arrays', () => {
    expect(Array.isArray(trafficEvent.vehicles)).toBe(true);
    expect(trafficEvent.vehicles.length).toBeGreaterThan(0);
    expect(Array.isArray(trafficEvent.stops)).toBe(true);
    expect(trafficEvent.stops.length).toBeGreaterThan(0);
  });

  test('eventType should be a valid enum value', () => {
    expect(VALID_EVENT_TYPES).toContain(trafficEvent.eventType);
  });

  test('vehicle coordinates should be in valid Bogotá ranges', () => {
    trafficEvent.vehicles.forEach((vehicle) => {
      expect(vehicle.lat).toBeGreaterThanOrEqual(BOGOTA_LAT_MIN);
      expect(vehicle.lat).toBeLessThanOrEqual(BOGOTA_LAT_MAX);
      expect(vehicle.lng).toBeGreaterThanOrEqual(BOGOTA_LNG_MIN);
      expect(vehicle.lng).toBeLessThanOrEqual(BOGOTA_LNG_MAX);
    });
  });

  test('severity should be a valid enum value', () => {
    expect(VALID_SEVERITIES).toContain(trafficEvent.severity);
  });

  test('full payload includes risk object with riskLevel and recommendedAction', () => {
    expect(trafficEvent).toHaveProperty('risk');
    expect(trafficEvent.risk).toHaveProperty('riskLevel');
    expect(trafficEvent.risk).toHaveProperty('recommendedAction');
    expect(typeof trafficEvent.risk.recommendedAction).toBe('string');
    expect(trafficEvent.risk.recommendedAction.length).toBeGreaterThan(0);
  });

  test('risk.riskLevel should be one of HIGH, MEDIUM, LOW', () => {
    expect(VALID_RISK_LEVELS).toContain(trafficEvent.risk.riskLevel);
  });

  test('full payload includes maps object with detourRecommended as boolean', () => {
    expect(trafficEvent).toHaveProperty('maps');
    expect(trafficEvent.maps).toHaveProperty('detourRecommended');
    expect(typeof trafficEvent.maps.detourRecommended).toBe('boolean');
  });

  test('maps.alternativeRoutes should be a non-negative number', () => {
    expect(typeof trafficEvent.maps.alternativeRoutes).toBe('number');
    expect(trafficEvent.maps.alternativeRoutes).toBeGreaterThanOrEqual(0);
  });
});

describe('Traffic Event Payload – Mock Server Validation', () => {
  let app;
  let request;

  beforeAll(() => {
    app = require('../mock-server/index');
    request = require('supertest');
  });

  test('should return 201 with valid payload', async () => {
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(trafficEvent);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('accepted');
    expect(response.body.riskLevel).toBe(trafficEvent.risk.riskLevel);
    expect(response.body.vehiclesAffected).toBe(trafficEvent.vehicles.length);
    expect(response.body.detourRecommended).toBe(trafficEvent.maps.detourRecommended);
    expect(response.body).toHaveProperty('receivedAt');
  });

  test('should return 400 when eventType is missing', async () => {
    const payloadWithoutEventType = deepClone(trafficEvent);
    delete payloadWithoutEventType.eventType;
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(payloadWithoutEventType);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
    expect(response.body.message).toContain('eventType');
  });

  test('should return 400 when risk.riskLevel is missing', async () => {
    const payloadWithoutRiskLevel = deepClone(trafficEvent);
    delete payloadWithoutRiskLevel.risk.riskLevel;
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(payloadWithoutRiskLevel);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
    expect(response.body.message).toContain('risk.riskLevel');
  });

  test('should return 400 when maps.detourRecommended is missing', async () => {
    const payloadWithoutDetour = deepClone(trafficEvent);
    delete payloadWithoutDetour.maps.detourRecommended;
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send(payloadWithoutDetour);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
    expect(response.body.message).toContain('maps.detourRecommended');
  });

  test('should return 400 when body is empty', async () => {
    const response = await request(app)
      .post('/webhooks/traffic-event')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });
});
