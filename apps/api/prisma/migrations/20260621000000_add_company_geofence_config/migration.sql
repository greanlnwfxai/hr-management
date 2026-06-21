-- CreateTable
CREATE TABLE "geofence_config" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "maxAccuracyMeters" INTEGER NOT NULL DEFAULT 100,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofence_config_pkey" PRIMARY KEY ("id")
);
