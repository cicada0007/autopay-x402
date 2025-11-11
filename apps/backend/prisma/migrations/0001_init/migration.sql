-- CreateTable AgentRequest
CREATE TABLE "AgentRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "endpoint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PAYMENT_REQUIRED',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "amount" TEXT NOT NULL DEFAULT '0',
  "currency" TEXT NOT NULL,
  "facilitatorUrl" TEXT NOT NULL,
  "paymentHash" TEXT,
  "metadata" TEXT,
  "responseData" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable Payment
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "txHash" TEXT NOT NULL,
  "amount" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "confirmedAt" DATETIME,
  "failureCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AgentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "category" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "details" TEXT,
  "requestId" TEXT,
  "paymentId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AgentRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRequest_paymentHash_key" ON "AgentRequest"("paymentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txHash_key" ON "Payment"("txHash");

