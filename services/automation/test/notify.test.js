'use strict';

const { buildMessage } = require('../mock-server/message-builder');

function buildBasePayload() {
  return {
    eventType: 'TRAFFIC_JAM',
    riskLevel: 'HIGH',
    locationDescription: 'Autopista Norte - Calle 100, Bogota',
    affectedVehicles: ['V001', 'V003', 'V005'],
    action: 'Calculate detour and monitor ETA impact',
    timestamp: '2026-03-09T15:00:00.000Z',
  };
}

describe('buildMessage', () => {
  test('returns a string containing the event type', () => {
    const message = buildMessage(buildBasePayload());

    expect(typeof message).toBe('string');
    expect(message).toContain('TRAFFIC_JAM');
  });

  test('includes all affected vehicles in output', () => {
    const message = buildMessage(buildBasePayload());

    expect(message).toContain('V001');
    expect(message).toContain('V003');
    expect(message).toContain('V005');
  });

  test('throws when riskLevel is missing', () => {
    const payload = buildBasePayload();
    delete payload.riskLevel;

    expect(() => buildMessage(payload)).toThrow('Missing required field: riskLevel');
  });

  test('throws when affectedVehicles is missing or empty', () => {
    const missingPayload = buildBasePayload();
    delete missingPayload.affectedVehicles;

    const emptyPayload = buildBasePayload();
    emptyPayload.affectedVehicles = [];

    expect(() => buildMessage(missingPayload)).toThrow('Missing required field: affectedVehicles');
    expect(() => buildMessage(emptyPayload)).toThrow('Missing required field: affectedVehicles');
  });

  test('includes location description', () => {
    const message = buildMessage(buildBasePayload());

    expect(message).toContain('Autopista Norte - Calle 100, Bogota');
  });

  test('uses expected emoji for HIGH, CRITICAL and MEDIUM', () => {
    const highMessage = buildMessage(buildBasePayload());

    const criticalPayload = buildBasePayload();
    criticalPayload.riskLevel = 'CRITICAL';
    const criticalMessage = buildMessage(criticalPayload);

    const mediumPayload = buildBasePayload();
    mediumPayload.riskLevel = 'MEDIUM';
    const mediumMessage = buildMessage(mediumPayload);

    expect(highMessage).toContain('🟠');
    expect(criticalMessage).toContain('🔴');
    expect(mediumMessage).toContain('🟡');
  });

  test('formats timestamp as readable local time', () => {
    const message = buildMessage(buildBasePayload());

    expect(message).toContain('(Bogota)');
    expect(message).not.toContain('2026-03-09T15:00:00.000Z');
  });
});
