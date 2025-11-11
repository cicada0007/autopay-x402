-- CreateTable
CREATE TABLE "LedgerEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "requestId" TEXT,
    "paymentId" TEXT,
    "txHash" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LedgerEvent_timestamp_idx" ON "LedgerEvent"("timestamp" DESC);
CREATE INDEX "LedgerEvent_category_idx" ON "LedgerEvent"("category");
CREATE INDEX "LedgerEvent_event_idx" ON "LedgerEvent"("event");
CREATE INDEX "LedgerEvent_requestId_idx" ON "LedgerEvent"("requestId");
CREATE INDEX "LedgerEvent_paymentId_idx" ON "LedgerEvent"("paymentId");
CREATE INDEX "LedgerEvent_txHash_idx" ON "LedgerEvent"("txHash");


