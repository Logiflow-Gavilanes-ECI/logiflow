-- Track when a stop is marked completed by the driver. NULL means pending.
ALTER TABLE "Stop" ADD COLUMN "completedAt" TIMESTAMP(3);
