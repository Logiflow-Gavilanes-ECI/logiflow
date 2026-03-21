const { checkHeartbeats } = require('../src/heartbeat');

describe('Offline detection', () => {
  let mockIo;

  beforeEach(() => {
    jest.useFakeTimers();
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('emits vehicle:offline when heartbeat exceeds threshold', () => {
    const vehicleHeartbeats = { 'v-001': 0 };
    const offlineVehicles = new Set();

    checkHeartbeats(mockIo, vehicleHeartbeats, offlineVehicles, 15000);

    expect(mockIo.to).toHaveBeenCalledWith('fleet');
    expect(mockIo.emit).toHaveBeenCalledWith('vehicle:offline', { vehicleId: 'v-001' });
    expect(offlineVehicles.has('v-001')).toBe(true);
  });

  test('emits vehicle:online when vehicle recovers', () => {
    const vehicleHeartbeats = { 'v-001': Date.now() };
    const offlineVehicles = new Set(['v-001']);

    checkHeartbeats(mockIo, vehicleHeartbeats, offlineVehicles, 15000);

    expect(mockIo.emit).toHaveBeenCalledWith('vehicle:online', { vehicleId: 'v-001' });
    expect(offlineVehicles.has('v-001')).toBe(false);
  });

  test('does not emit offline if vehicle is already in offlineVehicles', () => {
    const vehicleHeartbeats = { 'v-002': 0 };
    const offlineVehicles = new Set(['v-002']);

    checkHeartbeats(mockIo, vehicleHeartbeats, offlineVehicles, 15000);

    expect(mockIo.emit).not.toHaveBeenCalledWith('vehicle:offline', expect.anything());
  });

  test('handles multiple vehicles independently', () => {
    const vehicleHeartbeats = {
      'v-001': 0,
      'v-002': Date.now(),
      'v-003': 0,
    };
    const offlineVehicles = new Set(['v-002']);

    checkHeartbeats(mockIo, vehicleHeartbeats, offlineVehicles, 15000);

    expect(mockIo.emit).toHaveBeenCalledWith('vehicle:offline', { vehicleId: 'v-001' });
    expect(mockIo.emit).toHaveBeenCalledWith('vehicle:offline', { vehicleId: 'v-003' });
    expect(mockIo.emit).toHaveBeenCalledWith('vehicle:online', { vehicleId: 'v-002' });
  });
});
