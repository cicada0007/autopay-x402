-- CreateTable Session
CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletPublicKey" TEXT NOT NULL,
  "sessionPublicKey" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "maxSignatures" INTEGER NOT NULL,
  "signaturesUsed" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Session_sessionPublicKey_key" ON "Session"("sessionPublicKey");

