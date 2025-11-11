-- CreateTable
CREATE TABLE "AutonomyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "valueScore" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "freshnessSeconds" INTEGER NOT NULL DEFAULT 300,
    "backoffSeconds" INTEGER NOT NULL DEFAULT 30,
    "lastScore" REAL,
    "lastRunAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" DATETIME,
    "lockedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AutonomyTask_endpoint_key" ON "AutonomyTask"("endpoint");

-- Trigger to update updatedAt
CREATE TRIGGER "AutonomyTask_updatedAt"
AFTER UPDATE ON "AutonomyTask"
FOR EACH ROW
BEGIN
  UPDATE "AutonomyTask" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = NEW."id";
END;


