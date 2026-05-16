export interface VehicleProfileDefaults {
  lat: number;
  lng: number;
  capacity: number;
  plate: string;
  model: string;
  status: string;
}

const DEMO_VEHICLE_PROFILES: Record<string, VehicleProfileDefaults> = {
  'v-001': {
    lat: 4.711,
    lng: -74.0721,
    capacity: 1,
    plate: 'ABC-123',
    model: 'Toyota Hilux 2023',
    status: 'online',
  },
  'v-002': {
    lat: 4.682,
    lng: -74.0814,
    capacity: 1,
    plate: 'DEF-456',
    model: 'Renault Kangoo 2022',
    status: 'online',
  },
};

export function buildVehicleProfileDefaults(
  vehicleId: string,
): VehicleProfileDefaults {
  const normalizedId = vehicleId.trim();
  const demoProfile = DEMO_VEHICLE_PROFILES[normalizedId];
  if (demoProfile) {
    return { ...demoProfile };
  }

  return {
    lat: 4.711,
    lng: -74.0721,
    capacity: 1,
    plate: buildVehiclePlate(normalizedId),
    model: buildVehicleModel(normalizedId),
    status: 'online',
  };
}

export function buildVehiclePlate(vehicleId: string): string {
  const normalizedId = vehicleId.trim();
  const demoPlate = DEMO_VEHICLE_PROFILES[normalizedId]?.plate;
  if (demoPlate) {
    return demoPlate;
  }

  return `LF-${stableNumericSuffix(normalizedId).toString().padStart(6, '0')}`;
}

export function buildVehicleModel(vehicleId: string): string {
  const normalizedId = vehicleId.trim();
  const demoModel = DEMO_VEHICLE_PROFILES[normalizedId]?.model;
  if (demoModel) {
    return demoModel;
  }

  return 'LogiFlow Demo Vehicle';
}

function stableNumericSuffix(input: string): number {
  const source = input || 'vehicle';
  let hash = 0;

  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000000;
  }

  return hash;
}
