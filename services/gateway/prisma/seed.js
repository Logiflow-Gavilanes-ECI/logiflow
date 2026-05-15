const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const ADMIN_EMAIL = 'admin@logiflow.app';
const ADMIN_NAME = 'Admin LogiFlow';
const ADMIN_PASSWORD = 'Admin2026!';
const DRIVER_PASSWORD = 'Driver2026!';

const DEMO_VEHICLES = [
  {
    id: 'v-001',
    lat: 4.711,
    lng: -74.0721,
    capacity: 1,
    plate: 'ABC-123',
    model: 'Toyota Hilux 2023',
    status: 'online',
    driver: {
      email: 'conductor@logiflow.app',
      name: 'Conductor Demo 1',
      password: DRIVER_PASSWORD,
    },
  },
  {
    id: 'v-002',
    lat: 4.682,
    lng: -74.0814,
    capacity: 1,
    plate: 'DEF-456',
    model: 'Renault Kangoo 2022',
    status: 'online',
    driver: {
      email: 'conductor2@logiflow.app',
      name: 'Conductor Demo 2',
      password: DRIVER_PASSWORD,
    },
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the Prisma seed.');
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  try {
    await seedDemoData(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function seedDemoData(prisma) {
  const [adminPasswordHash, ...driverPasswordHashes] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 10),
    ...DEMO_VEHICLES.map((vehicle) => bcrypt.hash(vehicle.driver.password, 10)),
  ]);

  await Promise.all(
    DEMO_VEHICLES.map((vehicle) =>
      prisma.vehicle.upsert({
        where: { id: vehicle.id },
        update: {
          lat: vehicle.lat,
          lng: vehicle.lng,
          capacity: vehicle.capacity,
          plate: vehicle.plate,
          model: vehicle.model,
          status: vehicle.status,
        },
        create: {
          id: vehicle.id,
          lat: vehicle.lat,
          lng: vehicle.lng,
          capacity: vehicle.capacity,
          plate: vehicle.plate,
          model: vehicle.model,
          status: vehicle.status,
        },
      }),
    ),
  );

  for (const [index, vehicle] of DEMO_VEHICLES.entries()) {
    await seedDemoDriver(prisma, vehicle, driverPasswordHashes[index]);
  }

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash: adminPasswordHash,
      role: 'admin',
      provider: 'local',
    },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      passwordHash: adminPasswordHash,
      role: 'admin',
      provider: 'local',
    },
  });

  console.log(`Seeded demo admin: ${ADMIN_EMAIL}`);
  for (const vehicle of DEMO_VEHICLES) {
    console.log(
      `Seeded demo conductor: ${vehicle.driver.email} vehicleId=${vehicle.id} plate=${vehicle.plate}`,
    );
  }
}

async function seedDemoDriver(prisma, vehicle, passwordHash) {
  const driver = vehicle.driver;
  const [driverByVehicleId, driverByEmail] = await Promise.all([
    prisma.user.findUnique({ where: { id: vehicle.id } }),
    prisma.user.findUnique({ where: { email: driver.email } }),
  ]);

  if (
    driverByVehicleId?.email &&
    driverByVehicleId.email !== driver.email &&
    driverByVehicleId.id !== driverByEmail?.id
  ) {
    throw new Error(
      `Cannot seed conductor: user id ${vehicle.id} already belongs to ${driverByVehicleId.email}.`,
    );
  }

  if (
    driverByVehicleId &&
    driverByEmail &&
    driverByVehicleId.id !== driverByEmail.id
  ) {
    throw new Error(
      `Cannot seed conductor: ${driver.email} exists with id ${driverByEmail.id}, but ${vehicle.id} is already in use.`,
    );
  }

  const data = {
    email: driver.email,
    name: driver.name,
    passwordHash,
    role: 'conductor',
    provider: 'local',
  };

  if (driverByEmail) {
    await prisma.user.update({
      where: { id: driverByEmail.id },
      data: {
        id: vehicle.id,
        ...data,
      },
    });
  } else if (driverByVehicleId) {
    await prisma.user.update({
      where: { id: vehicle.id },
      data,
    });
  } else {
    await prisma.user.create({
      data: {
        id: vehicle.id,
        ...data,
      },
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
