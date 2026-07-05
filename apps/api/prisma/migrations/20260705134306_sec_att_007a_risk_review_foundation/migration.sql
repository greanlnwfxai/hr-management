-- CreateEnum
CREATE TYPE "AttendanceRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AttendanceRiskReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'REJECTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "AttendanceRiskResult" AS ENUM ('ACCEPTED', 'REJECTED', 'FLAGGED');

-- CreateTable
CREATE TABLE "attendance_risk_reviews" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "attendanceId" TEXT,
    "userId" TEXT,
    "action" "AttendanceNonceAction" NOT NULL,
    "result" "AttendanceRiskResult" NOT NULL,
    "riskLevel" "AttendanceRiskLevel" NOT NULL,
    "reasonCodes" TEXT[],
    "status" "AttendanceRiskReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "platform" TEXT,
    "metadataJson" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_risk_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_risk_reviews_employeeId_idx" ON "attendance_risk_reviews"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_risk_reviews_attendanceId_idx" ON "attendance_risk_reviews"("attendanceId");

-- CreateIndex
CREATE INDEX "attendance_risk_reviews_status_idx" ON "attendance_risk_reviews"("status");

-- CreateIndex
CREATE INDEX "attendance_risk_reviews_riskLevel_idx" ON "attendance_risk_reviews"("riskLevel");

-- CreateIndex
CREATE INDEX "attendance_risk_reviews_createdAt_idx" ON "attendance_risk_reviews"("createdAt");

-- AddForeignKey
ALTER TABLE "attendance_risk_reviews" ADD CONSTRAINT "attendance_risk_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_risk_reviews" ADD CONSTRAINT "attendance_risk_reviews_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_risk_reviews" ADD CONSTRAINT "attendance_risk_reviews_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
