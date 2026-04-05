import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { VehiclesRepository, VehicleRecord } from './vehicles.repository';
import { NotFoundException } from '@nestjs/common';
import { StopsService } from '../stops/stops.service';

const mockVehicle: VehicleRecord = {
  id: 'v1',
  lat: 4.711,
  lng: -74.072,
  capacity: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('VehiclesService', () => {
  let service: VehiclesService;
  let repo: jest.Mocked<VehiclesRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: VehiclesRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
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
    it('should return a vehicle by id', async () => {
      repo.findById.mockResolvedValue(mockVehicle);

      const found = await service.findOne('v1');
      expect(found).toEqual(mockVehicle);
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
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
