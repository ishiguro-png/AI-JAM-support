/*
  Warnings:

  - You are about to drop the column `accountCount` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `contractEnd` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `contractStart` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `planTier` on the `Contract` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ContractLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "externalId" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Contract" ("companyName", "contactEmail", "contactName", "createdAt", "id", "importedAt", "notes", "phone", "status", "updatedAt") SELECT "companyName", "contactEmail", "contactName", "createdAt", "id", "importedAt", "notes", "phone", "status", "updatedAt" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE INDEX "Contract_companyName_idx" ON "Contract"("companyName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ContractLine_externalId_key" ON "ContractLine"("externalId");

-- CreateIndex
CREATE INDEX "ContractLine_contractId_idx" ON "ContractLine"("contractId");

-- CreateIndex
CREATE INDEX "ContractLine_startDate_endDate_idx" ON "ContractLine"("startDate", "endDate");
