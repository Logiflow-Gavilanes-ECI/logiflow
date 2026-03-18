import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleRecord } from './vehicles.repository';

const mockVehicle: VehicleRecord = {
  id: 'v1',
  lat: 4.711,
  lng: -74.072,
  capacity: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('VehiclesController', () => {
  let controller: VehiclesController;
  let service: jest.Mocked<VehiclesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        {
          provide: VehiclesService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<VehiclesController>(VehiclesController);
    service = module.get(VehiclesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of vehicles', async () => {
      service.findAll.mockResolvedValue([mockVehicle]);

      const result = await controller.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v1');
    });
  });

  describe('findOne', () => {
    it('should return a single vehicle', async () => {
      service.findOne.mockResolvedValue(mockVehicle);

      const result = await controller.findOne('v1');
      expect(result.id).toBe('v1');
    });
  });

  describe('create', () => {
    it('should create and return a vehicle', async () => {
      service.create.mockResolvedValue(mockVehicle);

      const result = await controller.create({
        lat: 4.711,
        lng: -74.072,
        capacity: 100,
      });

      expect(result.id).toBeDefined();
      expect(result.lat).toBe(4.711);
    });
  });

  describe('update', () => {
    it('should update and return the vehicle', async () => {
      service.update.mockResolvedValue({ ...mockVehicle, capacity: 200 });

      const result = await controller.update('v1', { capacity: 200 });
      expect(result.capacity).toBe(200);
    });
  });

  describe('remove', () => {
    it('should call service.remove with the id', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('v1');
      expect(service.remove.mock.calls).toContainEqual(['v1']);
    });
  });
});
