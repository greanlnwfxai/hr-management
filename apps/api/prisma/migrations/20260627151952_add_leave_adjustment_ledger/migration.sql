-- CreateTable
CREATE TABLE "leave_adjustments" (
    "id" TEXT NOT NULL,
    "leaveBalanceId" TEXT NOT NULL,
    "deltaDays" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "adjustedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_adjustments_leaveBalanceId_idx" ON "leave_adjustments"("leaveBalanceId");

-- CreateIndex
CREATE INDEX "leave_adjustments_createdAt_idx" ON "leave_adjustments"("createdAt");

-- CreateIndex
CREATE INDEX "leave_adjustments_actorUserId_idx" ON "leave_adjustments"("actorUserId");

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_leaveBalanceId_fkey" FOREIGN KEY ("leaveBalanceId") REFERENCES "leave_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
