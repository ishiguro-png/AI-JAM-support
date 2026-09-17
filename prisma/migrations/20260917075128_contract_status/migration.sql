-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContractLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "contractStatus" TEXT,
    "quantity" INTEGER NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "externalId" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContractLine" ("contractId", "contractType", "endDate", "externalId", "id", "importedAt", "quantity", "startDate", "updatedAt") SELECT "contractId", "contractType", "endDate", "externalId", "id", "importedAt", "quantity", "startDate", "updatedAt" FROM "ContractLine";
DROP TABLE "ContractLine";
ALTER TABLE "new_ContractLine" RENAME TO "ContractLine";
CREATE UNIQUE INDEX "ContractLine_externalId_key" ON "ContractLine"("externalId");
CREATE INDEX "ContractLine_contractId_idx" ON "ContractLine"("contractId");
CREATE INDEX "ContractLine_contractStatus_idx" ON "ContractLine"("contractStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
