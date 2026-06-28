-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('COMPANY_GEOFENCE', 'OFFSITE_PLANNED', 'OFFSITE_UNPLANNED');

-- CreateEnum
CREATE TYPE "AttendanceReviewStatus" AS ENUM ('AUTO_ACCEPTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'MISSING_CHECKOUT');

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "attendanceSource" "AttendanceSource" NOT NULL DEFAULT 'COMPANY_GEOFENCE',
ADD COLUMN     "checkInAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "checkInDistanceFromCompanyMeters" DOUBLE PRECISION,
ADD COLUMN     "checkInLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkInLongitude" DOUBLE PRECISION,
ADD COLUMN     "checkOutAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "checkOutDistanceFromCompanyMeters" DOUBLE PRECISION,
ADD COLUMN     "checkOutLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkOutLongitude" DOUBLE PRECISION,
ADD COLUMN     "offSiteRequestId" TEXT,
ADD COLUMN     "offsiteReason" VARCHAR(500),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "AttendanceReviewStatus",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "workLocationName" VARCHAR(200);

-- CreateIndex
CREATE INDEX "attendances_attendanceSource_idx" ON "attendances"("attendanceSource");

-- CreateIndex
CREATE INDEX "attendances_reviewStatus_idx" ON "attendances"("reviewStatus");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_offSiteRequestId_fkey" FOREIGN KEY ("offSiteRequestId") REFERENCES "off_site_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
