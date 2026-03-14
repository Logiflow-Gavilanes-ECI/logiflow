import { Test, TestingModule } from '@nestjs/testing';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';
import { StopRecord } from './stops.repository';

const mockStop: StopRecord = {
  id: 's1',
  lat: 4.609,
  lng: -74.081,
  demand: 20,
  priority: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('StopsController', () => {
  let controller: StopsController;
  let service: jest.Mocked<StopsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StopsController],
      providers: [
        {
          provide: StopsService,
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

    controller = module.get<StopsController>(StopsController);
    service = module.get(StopsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of stops', async () => {
      service.findAll.mockResolvedValue([mockStop]);

      const result = await controller.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });
  });

  describe('findOne', () => {
    it('should return a single stop', async () => {
      service.findOne.mockResolvedValue(mockStop);

      const result = await controller.findOne('s1');
      expect(result.id).toBe('s1');
    });
  });

  describe('create', () => {
    it('should create and return a stop', async () => {
      service.create.mockResolvedValue(mockStop);

      const result = await controller.create({ lat: 4.609, lng: -74.081, demand: 20 });

      expect(result.id).toBeDefined();
      expect(result.demand).toBe(20);
    });
  });

  describe('update', () => {
    it('should update and return the stop', async () => {
      service.update.mockResolvedValue({ ...mockStop, demand: 50 });

      const result = await controller.update('s1', { demand: 50 });
      expect(result.demand).toBe(50);
    });
  });

  describe('remove', () => {
    it('should call service.remove with the id', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('s1');
      expect(service.remove).toHaveBeenCalledWith('s1');
    });
  });
});
