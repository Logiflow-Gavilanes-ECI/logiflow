import { Test, TestingModule } from '@nestjs/testing';
import { StopsService } from './stops.service';
import { StopsRepository, StopRecord } from './stops.repository';
import { SocketClientService } from '../socket-client/socket-client.service';
import { NotFoundException } from '@nestjs/common';

const mockStop: StopRecord = {
  id: 's1',
  lat: 4.609,
  lng: -74.081,
  demand: 20,
  priority: 0,
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('StopsService', () => {
  let service: StopsService;
  let repo: jest.Mocked<StopsRepository>;
  let socketClient: jest.Mocked<SocketClientService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopsService,
        {
          provide: StopsRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            markCompleted: jest.fn(),
          },
        },
        {
          provide: SocketClientService,
          useValue: {
            emitStopCompleted: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StopsService>(StopsService);
    repo = module.get(StopsRepository);
    socketClient = module.get(SocketClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a stop and return it', async () => {
      repo.create.mockResolvedValue(mockStop);

      const stop = await service.create({
        lat: 4.609,
        lng: -74.081,
        demand: 20,
      });

      expect(repo.create.mock.calls).toContainEqual([
        {
          lat: 4.609,
          lng: -74.081,
          demand: 20,
        },
      ]);
      expect(stop.id).toBeDefined();
      expect(stop.lat).toBe(4.609);
      expect(stop.lng).toBe(-74.081);
      expect(stop.demand).toBe(20);
      expect(stop.priority).toBe(0);
      expect(stop.createdAt).toBeDefined();
    });

    it('should create a stop with custom id and priority', async () => {
      repo.create.mockResolvedValue({ ...mockStop, id: 's1', priority: 5 });

      const stop = await service.create({
        id: 's1',
        lat: 4.609,
        lng: -74.081,
        demand: 20,
        priority: 5,
      });

      expect(stop.id).toBe('s1');
      expect(stop.priority).toBe(5);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no stops', async () => {
      repo.findAll.mockResolvedValue([]);

      expect(await service.findAll()).toEqual([]);
    });

    it('should return all stops', async () => {
      repo.findAll.mockResolvedValue([mockStop, { ...mockStop, id: 's2' }]);

      const stops = await service.findAll();
      expect(stops).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return a stop by id', async () => {
      repo.findById.mockResolvedValue(mockStop);

      const found = await service.findOne('s1');
      expect(found).toEqual(mockStop);
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update stop fields', async () => {
      const updated = { ...mockStop, demand: 50, priority: 3 };
      repo.findById.mockResolvedValue(mockStop);
      repo.update.mockResolvedValue(updated);

      const result = await service.update('s1', { demand: 50, priority: 3 });

      expect(result.demand).toBe(50);
      expect(result.priority).toBe(3);
      expect(result.lat).toBe(4.609);
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update('unknown', { demand: 10 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a stop', async () => {
      repo.findById.mockResolvedValue(mockStop);
      repo.remove.mockResolvedValue(undefined);

      await service.remove('s1');

      expect(repo.remove.mock.calls).toContainEqual(['s1']);
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.remove('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('complete', () => {
    it('marks a pending stop as completed and returns the updated record', async () => {
      const completedAt = new Date().toISOString();
      repo.findById.mockResolvedValue(mockStop);
      repo.markCompleted.mockResolvedValue({ ...mockStop, completedAt });

      const result = await service.complete('s1');

      expect(repo.markCompleted.mock.calls).toContainEqual(['s1']);
      expect(result.completedAt).toBe(completedAt);
      expect(socketClient.emitStopCompleted).toHaveBeenCalledWith({
        stopId: 's1',
        completedAt,
      });
    });

    it('is idempotent — re-completing returns the existing record without re-writing', async () => {
      const completedAt = new Date().toISOString();
      repo.findById.mockResolvedValue({ ...mockStop, completedAt });

      const result = await service.complete('s1');

      expect(result.completedAt).toBe(completedAt);
      expect(repo.markCompleted).not.toHaveBeenCalled();
      expect(socketClient.emitStopCompleted).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.complete('unknown')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.markCompleted).not.toHaveBeenCalled();
      expect(socketClient.emitStopCompleted).not.toHaveBeenCalled();
    });

    it('does not fail the request when socket emission throws', async () => {
      const completedAt = new Date().toISOString();
      repo.findById.mockResolvedValue(mockStop);
      repo.markCompleted.mockResolvedValue({ ...mockStop, completedAt });
      socketClient.emitStopCompleted.mockImplementation(() => {
        throw new Error('boom');
      });

      const result = await service.complete('s1');
      expect(result.completedAt).toBe(completedAt);
    });
  });
});
