ALTER TABLE "User" ADD COLUMN "vehicleId" TEXT;

CREATE INDEX "User_vehicleId_idx" ON "User"("vehicleId");
