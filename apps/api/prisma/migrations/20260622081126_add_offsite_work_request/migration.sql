-- CreateEnum
CREATE TYPE "OffSiteStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'OFFSITE');

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "workMode" "WorkMode" NOT NULL DEFAULT 'ONSITE';

-- AlterTable
ALTER TABLE "geofence_config" ALTER COLUMN "id" SET DEFAULT 'default';

-- CreateTable
CREATE TABLE "off_site_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "status" "OffSiteStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "off_site_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "off_site_requests_employeeId_idx" ON "off_site_requests"("employeeId");

-- CreateIndex
CREATE INDEX "off_site_requests_status_idx" ON "off_site_requests"("status");

-- CreateIndex
CREATE INDEX "off_site_requests_date_idx" ON "off_site_requests"("date");

-- AddForeignKey
ALTER TABLE "off_site_requests" ADD CONSTRAINT "off_site_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "off_site_requests" ADD CONSTRAINT "off_site_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
