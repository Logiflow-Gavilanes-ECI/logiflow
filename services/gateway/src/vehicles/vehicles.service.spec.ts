import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { VehiclesRepository, VehicleRecord } from './vehicles.repository';
import { NotFoundException } from '@nestjs/common';
import { StopsService } from '../stops/stops.service';
import {
  buildVehicleModel,
  buildVehiclePlate,
} from './vehicle-profile.defaults';

const mockVehicle: VehicleRecord = {
  id: 'v1',
  lat: 4.711,
  lng: -74.072,
  capacity: 100,
  plate: null,
  model: null,
  status: 'online',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('VehiclesService', () => {
  let service: VehiclesService;
  let repo: jest.Mocked<VehiclesRepository>;
  let stopsService: jest.Mocked<StopsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: VehiclesRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            ensureExists: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: StopsService,
          useValue: {
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
    repo = module.get(VehiclesRepository);
    stopsService = module.get(StopsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a vehicle and return it', async () => {
      repo.create.mockResolvedValue(mockVehicle);

      const vehicle = await service.create({
        lat: 4.711,
        lng: -74.072,
        capacity: 100,
      });

      expect(repo.create.mock.calls).toContainEqual([
        {
          lat: 4.711,
          lng: -74.072,
          capacity: 100,
        },
      ]);
      expect(vehicle.id).toBeDefined();
      expect(vehicle.lat).toBe(4.711);
      expect(vehicle.lng).toBe(-74.072);
      expect(vehicle.capacity).toBe(100);
      expect(vehicle.createdAt).toBeDefined();
      expect(vehicle.updatedAt).toBeDefined();
    });

    it('should create a vehicle with custom id', async () => {
      repo.create.mockResolvedValue({ ...mockVehicle, id: 'custom-id' });

      const vehicle = await service.create({
        id: 'custom-id',
        lat: 4.711,
        lng: -74.072,
        capacity: 50,
      });

      expect(vehicle.id).toBe('custom-id');
    });
  });

  describe('findAll', () => {
    it('should return empty array when no vehicles', async () => {
      repo.findAll.mockResolvedValue([]);

      expect(await service.findAll()).toEqual([]);
    });

    it('should return all vehicles', async () => {
      repo.findAll.mockResolvedValue([
        mockVehicle,
        { ...mockVehicle, id: 'v2' },
      ]);

      const vehicles = await service.findAll();
      expect(vehicles).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return vehicle details by id', async () => {
      repo.findById.mockResolvedValue(mockVehicle);

      const found = await service.findOne('v1');
      expect(found).toEqual({
        id: 'v1',
        plate: buildVehiclePlate('v1'),
        model: buildVehicleModel('v1'),
        status: 'online',
        lat: 4.711,
        lng: -74.072,
        capacity: 100,
      });
    });

    it('should provision unknown ids for driver profile lookups', async () => {
      repo.findById.mockResolvedValue(null);
      repo.ensureExists.mockResolvedValue({
        ...mockVehicle,
        id: 'unknown',
      });

      await expect(service.findOne('unknown')).resolves.toEqual({
        id: 'unknown',
        plate: buildVehiclePlate('unknown'),
        model: buildVehicleModel('unknown'),
        status: 'online',
        lat: 4.711,
        lng: -74.072,
        capacity: 100,
      });
    });

    it('should use distinct demo plates for distinct demo vehicle ids', async () => {
      repo.findById.mockImplementation((id: string) =>
        Promise.resolve({
          ...mockVehicle,
          id,
          plate: null,
          model: null,
        }),
      );

      const first = await service.findOne('v-001');
      const second = await service.findOne('v-002');

      expect(first.plate).toBe('ABC-123');
      expect(second.plate).toBe('DEF-456');
      expect(first.plate).not.toBe(second.plate);
    });
  });

  describe('getAssignedRoute', () => {
    it('should return persisted stop addresses without synthetic labels', async () => {
      repo.findById.mockResolvedValue(mockVehicle);
      stopsService.findAll.mockResolvedValue([
        {
          id: 's-201',
          address: 'Cra 7 #45-12, Bogotá',
          lat: 4.7,
          lng: -74.0,
          demand: 1,
          priority: 1,
          completedAt: null,
          createdAt: '2026-05-14T10:00:00.000Z',
          updatedAt: '2026-05-14T10:00:00.000Z',
        },
      ]);

      await expect(service.getAssignedRoute('v1')).resolves.toEqual({
        vehicleId: 'v1',
        steps: [
          {
            stopId: 's-201',
            address: 'Cra 7 #45-12, Bogotá',
            lat: 4.7,
            lng: -74.0,
            arrivalOrder: 1,
            status: 'active',
          },
        ],
      });
    });

    it('should use demo delivery addresses when stored stops have no address yet', async () => {
      repo.findById.mockResolvedValue(mockVehicle);
      stopsService.findAll.mockResolvedValue([
        {
          id: 's-201',
          address: null,
          lat: 4.7,
          lng: -74.0,
          demand: 1,
          priority: 1,
          completedAt: null,
          createdAt: '2026-05-14T10:00:00.000Z',
          updatedAt: '2026-05-14T10:00:00.000Z',
        },
      ]);

      const route = await service.getAssignedRoute('v1');
      expect(route.steps[0].address).toBe('Cra 7 #45-12, Bogotá');
    });
  });

  describe('findDetails', () => {
    it('should return the mobile vehicle profile contract', async () => {
      repo.findById.mockResolvedValue({
        ...mockVehicle,
        id: 'v-001',
        plate: 'ABC-123',
        model: 'Toyota Hilux 2023',
      });

      await expect(service.findDetails('v-001')).resolves.toEqual({
        id: 'v-001',
        plate: 'ABC-123',
        model: 'Toyota Hilux 2023',
        status: 'online',
        lat: 4.711,
        lng: -74.072,
        capacity: 100,
      });
    });

    it('should provision the JWT vehicle id when it is not stored yet', async () => {
      repo.findById.mockResolvedValue(null);
      repo.ensureExists.mockResolvedValue({
        ...mockVehicle,
        id: 'de015a64-dcb6-40ce-9c3e-6d037e7c706c',
      });

      const result = await service.findDetails(
        'de015a64-dcb6-40ce-9c3e-6d037e7c706c',
      );

      expect(repo.ensureExists).toHaveBeenCalledWith(
        'de015a64-dcb6-40ce-9c3e-6d037e7c706c',
      );
      expect(result.id).toBe('de015a64-dcb6-40ce-9c3e-6d037e7c706c');
      expect(result.plate).toBe(
        buildVehiclePlate('de015a64-dcb6-40ce-9c3e-6d037e7c706c'),
      );
      expect(result.model).toBe(
        buildVehicleModel('de015a64-dcb6-40ce-9c3e-6d037e7c706c'),
      );
      expect(result.status).toBe('online');
      expect(result.lat).toBe(4.711);
      expect(result.lng).toBe(-74.072);
      expect(result.capacity).toBe(100);
    });
  });

  describe('update', () => {
    it('should update vehicle fields', async () => {
      const updated = { ...mockVehicle, lat: 5.0, capacity: 150 };
      repo.findById.mockResolvedValue(mockVehicle);
      repo.update.mockResolvedValue(updated);

      const result = await service.update('v1', { lat: 5.0, capacity: 150 });

      expect(result.lat).toBe(5.0);
      expect(result.lng).toBe(-74.072);
      expect(result.capacity).toBe(150);
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update('unknown', { lat: 5.0 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a vehicle', async () => {
      repo.findById.mockResolvedValue(mockVehicle);
      repo.remove.mockResolvedValue(undefined);

      await service.remove('v1');

      expect(repo.remove.mock.calls).toContainEqual(['v1']);
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.remove('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
