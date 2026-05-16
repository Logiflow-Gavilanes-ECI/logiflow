import { PrismaService } from '../prisma/prisma.service';
import { StopsRepository } from './stops.repository';

type StopEntity = {
  id: string;
  address?: string | null;
  lat: number;
  lng: number;
  demand: number;
  priority: number;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('StopsRepository', () => {
  const createdAt = new Date('2026-05-14T09:00:00.000Z');
  const updatedAt = new Date('2026-05-14T09:30:00.000Z');

  let prisma: {
    stop: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let repository: StopsRepository;

  const stop = (overrides: Partial<StopEntity> = {}): StopEntity => ({
    id: 's-001',
    address: 'Warehouse',
    lat: 4.609,
    lng: -74.081,
    demand: 20,
    priority: 1,
    completedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      stop: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    repository = new StopsRepository(prisma as unknown as PrismaService);
  });

  it('finds all stops ordered by creation time and maps nullable fields', async () => {
    const completedAt = new Date('2026-05-14T10:00:00.000Z');
    prisma.stop.findMany.mockResolvedValueOnce([
      stop({ id: 's-001', address: undefined }),
      stop({ id: 's-002', completedAt }),
    ]);

    await expect(repository.findAll()).resolves.toEqual([
      {
        id: 's-001',
        address: null,
        lat: 4.609,
        lng: -74.081,
        demand: 20,
        priority: 1,
        completedAt: null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
      {
        id: 's-002',
        address: 'Warehouse',
        lat: 4.609,
        lng: -74.081,
        demand: 20,
        priority: 1,
        completedAt: completedAt.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(prisma.stop.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
    });
  });

  it('finds a stop by id or returns null', async () => {
    prisma.stop.findUnique
      .mockResolvedValueOnce(stop({ id: 's-123' }))
      .mockResolvedValueOnce(null);

    await expect(repository.findById('s-123')).resolves.toEqual(
      expect.objectContaining({ id: 's-123' }),
    );
    await expect(repository.findById('missing')).resolves.toBeNull();
    expect(prisma.stop.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 's-123' },
    });
    expect(prisma.stop.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'missing' },
    });
  });

  it('creates stops with the provided payload', async () => {
    const dto = {
      id: 's-new',
      address: 'Customer address',
      lat: 4.7,
      lng: -74.2,
      demand: 3,
      priority: 5,
    };
    prisma.stop.create.mockResolvedValueOnce(stop(dto));

    await expect(repository.create(dto)).resolves.toEqual(
      expect.objectContaining(dto),
    );
    expect(prisma.stop.create).toHaveBeenCalledWith({ data: dto });
  });

  it('updates only fields that are explicitly provided', async () => {
    prisma.stop.update.mockResolvedValueOnce(
      stop({
        lat: 4.8,
        lng: -74.3,
        demand: 8,
        priority: 2,
        address: 'Updated address',
      }),
    );

    await repository.update('s-001', {
      lat: 4.8,
      lng: -74.3,
      demand: 8,
      priority: 2,
      address: 'Updated address',
    });

    expect(prisma.stop.update).toHaveBeenCalledWith({
      where: { id: 's-001' },
      data: {
        lat: 4.8,
        lng: -74.3,
        demand: 8,
        priority: 2,
        address: 'Updated address',
      },
    });

    prisma.stop.update.mockResolvedValueOnce(stop());
    await repository.update('s-001', {});
    expect(prisma.stop.update).toHaveBeenLastCalledWith({
      where: { id: 's-001' },
      data: {},
    });
  });

  it('removes stops by id', async () => {
    prisma.stop.delete.mockResolvedValueOnce(stop());

    await expect(repository.remove('s-001')).resolves.toBeUndefined();
    expect(prisma.stop.delete).toHaveBeenCalledWith({
      where: { id: 's-001' },
    });
  });

  it('marks a stop as completed at the provided instant', async () => {
    const completedAt = new Date('2026-05-14T12:00:00.000Z');
    prisma.stop.update.mockResolvedValueOnce(stop({ completedAt }));

    await expect(
      repository.markCompleted('s-001', completedAt),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 's-001',
        completedAt: completedAt.toISOString(),
      }),
    );
    expect(prisma.stop.update).toHaveBeenCalledWith({
      where: { id: 's-001' },
      data: { completedAt },
    });
  });
});
