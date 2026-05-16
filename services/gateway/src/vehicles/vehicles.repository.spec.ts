import { PrismaService } from '../prisma/prisma.service';
import { VehiclesRepository } from './vehicles.repository';
import { buildVehicleProfileDefaults } from './vehicle-profile.defaults';

type VehicleEntity = {
  id: string;
  lat: number;
  lng: number;
  capacity: number;
  plate?: string | null;
  model?: string | null;
  status?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('VehiclesRepository', () => {
  const createdAt = new Date('2026-05-14T10:00:00.000Z');
  const updatedAt = new Date('2026-05-14T11:00:00.000Z');

  let prisma: {
    vehicle: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let repository: VehiclesRepository;

  const vehicle = (overrides: Partial<VehicleEntity> = {}): VehicleEntity => ({
    id: 'v-001',
    lat: 4.711,
    lng: -74.072,
    capacity: 10,
    plate: 'ABC-123',
    model: 'Toyota Hilux 2023',
    status: 'online',
    createdAt,
    updatedAt,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      vehicle: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    repository = new VehiclesRepository(prisma as unknown as PrismaService);
  });

  it('finds all vehicles ordered by creation time and maps database fields', async () => {
    prisma.vehicle.findMany.mockResolvedValueOnce([
      vehicle({ id: 'v-001' }),
      vehicle({
        id: 'v-002',
        plate: undefined,
        model: undefined,
        status: undefined,
      }),
    ]);

    await expect(repository.findAll()).resolves.toEqual([
      {
        id: 'v-001',
        lat: 4.711,
        lng: -74.072,
        capacity: 10,
        plate: 'ABC-123',
        model: 'Toyota Hilux 2023',
        status: 'online',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
      {
        id: 'v-002',
        lat: 4.711,
        lng: -74.072,
        capacity: 10,
        plate: null,
        model: null,
        status: 'online',
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
    });
  });

  it('finds a vehicle by id or returns null', async () => {
    prisma.vehicle.findUnique
      .mockResolvedValueOnce(vehicle({ id: 'v-123' }))
      .mockResolvedValueOnce(null);

    await expect(repository.findById('v-123')).resolves.toEqual(
      expect.objectContaining({ id: 'v-123' }),
    );
    await expect(repository.findById('missing')).resolves.toBeNull();
    expect(prisma.vehicle.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'v-123' },
    });
    expect(prisma.vehicle.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'missing' },
    });
  });

  it('ensures a vehicle exists using deterministic profile defaults', async () => {
    const defaults = buildVehicleProfileDefaults('driver-42');
    prisma.vehicle.upsert.mockResolvedValueOnce(
      vehicle({
        id: 'driver-42',
        ...defaults,
      }),
    );

    await expect(repository.ensureExists('driver-42')).resolves.toEqual(
      expect.objectContaining({
        id: 'driver-42',
        plate: defaults.plate,
        model: defaults.model,
      }),
    );
    expect(prisma.vehicle.upsert).toHaveBeenCalledWith({
      where: { id: 'driver-42' },
      update: {},
      create: {
        id: 'driver-42',
        ...defaults,
      },
    });
  });

  it('creates vehicles with the provided payload', async () => {
    prisma.vehicle.create.mockResolvedValueOnce(
      vehicle({
        id: 'custom',
        lat: 4.8,
        lng: -74.1,
        capacity: 20,
        plate: 'XYZ-987',
        model: 'Van',
        status: 'maintenance',
      }),
    );

    const dto = {
      id: 'custom',
      lat: 4.8,
      lng: -74.1,
      capacity: 20,
      plate: 'XYZ-987',
      model: 'Van',
      status: 'maintenance',
    };

    await expect(repository.create(dto)).resolves.toEqual(
      expect.objectContaining(dto),
    );
    expect(prisma.vehicle.create).toHaveBeenCalledWith({ data: dto });
  });

  it('updates only fields that are explicitly provided', async () => {
    prisma.vehicle.update.mockResolvedValueOnce(
      vehicle({
        lat: 5.1,
        lng: -73.9,
        capacity: 30,
        plate: 'NEW-123',
        model: 'Updated model',
        status: 'offline',
      }),
    );

    await repository.update('v-001', {
      lat: 5.1,
      lng: -73.9,
      capacity: 30,
      plate: 'NEW-123',
      model: 'Updated model',
      status: 'offline',
    });

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v-001' },
      data: {
        lat: 5.1,
        lng: -73.9,
        capacity: 30,
        plate: 'NEW-123',
        model: 'Updated model',
        status: 'offline',
      },
    });

    prisma.vehicle.update.mockResolvedValueOnce(vehicle());
    await repository.update('v-001', {});
    expect(prisma.vehicle.update).toHaveBeenLastCalledWith({
      where: { id: 'v-001' },
      data: {},
    });
  });

  it('removes vehicles by id', async () => {
    prisma.vehicle.delete.mockResolvedValueOnce(vehicle());

    await expect(repository.remove('v-001')).resolves.toBeUndefined();
    expect(prisma.vehicle.delete).toHaveBeenCalledWith({
      where: { id: 'v-001' },
    });
  });
});
