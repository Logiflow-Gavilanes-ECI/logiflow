const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const DEMO_VEHICLE_ID = 'v-001';
const ADMIN_EMAIL = 'admin@logiflow.app';
const ADMIN_NAME = 'Admin LogiFlow';
const ADMIN_PASSWORD = 'Admin2026!';
const DRIVER_EMAIL = 'conductor@logiflow.app';
const DRIVER_NAME = 'Conductor Demo';
const DRIVER_PASSWORD = 'Driver2026!';

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
  const [adminPasswordHash, driverPasswordHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 10),
    bcrypt.hash(DRIVER_PASSWORD, 10),
  ]);

  await prisma.vehicle.upsert({
    where: { id: DEMO_VEHICLE_ID },
    update: {
      lat: 4.711,
      lng: -74.0721,
      capacity: 1,
      plate: 'ABC-123',
      model: 'Toyota Hilux',
      status: 'online',
    },
    create: {
      id: DEMO_VEHICLE_ID,
      lat: 4.711,
      lng: -74.0721,
      capacity: 1,
      plate: 'ABC-123',
      model: 'Toyota Hilux',
      status: 'online',
    },
  });

  const [driverByVehicleId, driverByEmail] = await Promise.all([
    prisma.user.findUnique({ where: { id: DEMO_VEHICLE_ID } }),
    prisma.user.findUnique({ where: { email: DRIVER_EMAIL } }),
  ]);

  if (
    driverByVehicleId?.email &&
    driverByVehicleId.email !== DRIVER_EMAIL &&
    driverByVehicleId.id !== driverByEmail?.id
  ) {
    throw new Error(
      `Cannot seed conductor: user id ${DEMO_VEHICLE_ID} already belongs to ${driverByVehicleId.email}.`,
    );
  }

  if (
    driverByVehicleId &&
    driverByEmail &&
    driverByVehicleId.id !== driverByEmail.id
  ) {
    throw new Error(
      `Cannot seed conductor: ${DRIVER_EMAIL} exists with id ${driverByEmail.id}, but ${DEMO_VEHICLE_ID} is already in use.`,
    );
  }

  if (driverByEmail) {
    await prisma.user.update({
      where: { id: driverByEmail.id },
      data: {
        id: DEMO_VEHICLE_ID,
        email: DRIVER_EMAIL,
        name: DRIVER_NAME,
        passwordHash: driverPasswordHash,
        role: 'conductor',
        provider: 'local',
      },
    });
  } else if (driverByVehicleId) {
    await prisma.user.update({
      where: { id: DEMO_VEHICLE_ID },
      data: {
        email: DRIVER_EMAIL,
        name: DRIVER_NAME,
        passwordHash: driverPasswordHash,
        role: 'conductor',
        provider: 'local',
      },
    });
  } else {
    await prisma.user.create({
      data: {
        id: DEMO_VEHICLE_ID,
        email: DRIVER_EMAIL,
        name: DRIVER_NAME,
        passwordHash: driverPasswordHash,
        role: 'conductor',
        provider: 'local',
      },
    });
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
  console.log(
    `Seeded demo conductor: ${DRIVER_EMAIL} vehicleId=${DEMO_VEHICLE_ID}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
