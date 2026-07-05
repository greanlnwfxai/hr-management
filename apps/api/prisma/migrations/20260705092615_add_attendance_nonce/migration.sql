-- CreateEnum
CREATE TYPE "AttendanceNonceAction" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'OFFSITE_CLOCK_IN', 'OFFSITE_CLOCK_OUT');

-- CreateTable
CREATE TABLE "attendance_nonces" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "action" "AttendanceNonceAction" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_nonces_tokenHash_key" ON "attendance_nonces"("tokenHash");

-- CreateIndex
CREATE INDEX "attendance_nonces_userId_idx" ON "attendance_nonces"("userId");

-- CreateIndex
CREATE INDEX "attendance_nonces_expiresAt_idx" ON "attendance_nonces"("expiresAt");
