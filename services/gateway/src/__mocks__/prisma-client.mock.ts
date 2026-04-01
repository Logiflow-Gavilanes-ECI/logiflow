type VehicleEntity = {
  id: string;
  lat: number;
  lng: number;
  capacity: number;
  createdAt: Date;
  updatedAt: Date;
};

type StopEntity = {
  id: string;
  lat: number;
  lng: number;
  demand: number;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
};

type UserEntity = {
  id: string;
  role: 'admin' | 'conductor';
};

type RefreshTokenEntity = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  consumedAt?: Date;
};

export class PrismaClient {
  private readonly vehicleStore = new Map<string, VehicleEntity>();
  private readonly stopStore = new Map<string, StopEntity>();
  private readonly userStore = new Map<string, UserEntity>();
  private readonly refreshTokenStore = new Map<string, RefreshTokenEntity>();

  private nextId(prefix: 'v' | 's', size: number): string {
    return `${prefix}-${size + 1}`;
  }

  vehicle = {
    findMany: jest.fn(() => Array.from(this.vehicleStore.values())),
    findUnique: jest.fn(({ where }: { where: { id: string } }) => {
      return this.vehicleStore.get(where.id) ?? null;
    }),
    create: jest.fn(
      ({
        data,
      }: {
        data: { id?: string; lat: number; lng: number; capacity: number };
      }) => {
        const now = new Date();
        const id = data.id ?? this.nextId('v', this.vehicleStore.size);
        const created: VehicleEntity = {
          id,
          lat: data.lat,
          lng: data.lng,
          capacity: data.capacity,
          createdAt: now,
          updatedAt: now,
        };

        this.vehicleStore.set(id, created);
        return created;
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<{ lat: number; lng: number; capacity: number }>;
      }) => {
        const current = this.vehicleStore.get(where.id);
        if (!current) {
          throw new Error(`Vehicle not found: ${where.id}`);
        }

        const updated: VehicleEntity = {
          ...current,
          ...data,
          updatedAt: new Date(),
        };

        this.vehicleStore.set(where.id, updated);
        return updated;
      },
    ),
    delete: jest.fn(({ where }: { where: { id: string } }) => {
      const existing = this.vehicleStore.get(where.id);
      if (!existing) {
        throw new Error(`Vehicle not found: ${where.id}`);
      }

      this.vehicleStore.delete(where.id);
      return existing;
    }),
  };

  stop = {
    findMany: jest.fn(() => Array.from(this.stopStore.values())),
    findUnique: jest.fn(({ where }: { where: { id: string } }) => {
      return this.stopStore.get(where.id) ?? null;
    }),
    create: jest.fn(
      ({
        data,
      }: {
        data: {
          id?: string;
          lat: number;
          lng: number;
          demand: number;
          priority?: number;
        };
      }) => {
        const now = new Date();
        const id = data.id ?? this.nextId('s', this.stopStore.size);
        const created: StopEntity = {
          id,
          lat: data.lat,
          lng: data.lng,
          demand: data.demand,
          priority: data.priority ?? 0,
          createdAt: now,
          updatedAt: now,
        };

        this.stopStore.set(id, created);
        return created;
      },
    ),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<{
          lat: number;
          lng: number;
          demand: number;
          priority: number;
        }>;
      }) => {
        const current = this.stopStore.get(where.id);
        if (!current) {
          throw new Error(`Stop not found: ${where.id}`);
        }

        const updated: StopEntity = {
          ...current,
          ...data,
          updatedAt: new Date(),
        };

        this.stopStore.set(where.id, updated);
        return updated;
      },
    ),
    delete: jest.fn(({ where }: { where: { id: string } }) => {
      const existing = this.stopStore.get(where.id);
      if (!existing) {
        throw new Error(`Stop not found: ${where.id}`);
      }

      this.stopStore.delete(where.id);
      return existing;
    }),
  };

  user = {
    create: jest.fn(
      ({
        data,
      }: {
        data: { id?: string; role: 'admin' | 'conductor' };
      }) => {
        const id = data.id ?? `u-${this.userStore.size + 1}`;
        const created: UserEntity = {
          id,
          role: data.role,
        };

        this.userStore.set(id, created);
        return created;
      },
    ),
    upsert: jest.fn(
      ({
        where,
        update,
        create,
      }: {
        where: { id: string };
        update: { role: 'admin' | 'conductor' };
        create: { id: string; role: 'admin' | 'conductor' };
      }) => {
        const existing = this.userStore.get(where.id);

        if (existing) {
          const updated: UserEntity = {
            ...existing,
            ...update,
          };
          this.userStore.set(where.id, updated);
          return updated;
        }

        const created: UserEntity = {
          id: create.id,
          role: create.role,
        };
        this.userStore.set(create.id, created);
        return created;
      },
    ),
  };

  refreshToken = {
    create: jest.fn(
      ({
        data,
      }: {
        data: {
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        };
      }) => {
        const created: RefreshTokenEntity = {
          id: `rt-${this.refreshTokenStore.size + 1}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
        };

        this.refreshTokenStore.set(created.id, created);
        return created;
      },
    ),
  };

  $connect = jest.fn(() => Promise.resolve(undefined));
  $disconnect = jest.fn(() => Promise.resolve(undefined));
}
