-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "accountCount" INTEGER NOT NULL,
    "planTier" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "phone" TEXT,
    "contractStart" DATETIME,
    "contractEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "externalId" TEXT,
    "notes" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SupportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "emailTo" TEXT,
    "emailStatus" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "planTier" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_externalId_key" ON "Contract"("externalId");

-- CreateIndex
CREATE INDEX "Contract_planTier_idx" ON "Contract"("planTier");

-- CreateIndex
CREATE INDEX "Contract_companyName_idx" ON "Contract"("companyName");

-- CreateIndex
CREATE INDEX "SupportLog_contractId_idx" ON "SupportLog"("contractId");

-- CreateIndex
CREATE INDEX "SupportLog_occurredAt_idx" ON "SupportLog"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_name_key" ON "Staff"("name");
