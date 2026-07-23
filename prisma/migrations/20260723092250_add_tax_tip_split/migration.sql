-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableCode" TEXT NOT NULL,
    "groupLabel" TEXT,
    "imageUrl" TEXT,
    "rawLlmOutput" TEXT,
    "parseConfidence" REAL,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "tipAmount" REAL NOT NULL DEFAULT 0,
    "taxTipSplit" TEXT NOT NULL DEFAULT 'EVEN',
    "paidByParticipantId" TEXT,
    "expectedParticipants" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "Bill_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bill_paidByParticipantId_fkey" FOREIGN KEY ("paidByParticipantId") REFERENCES "Participant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bill" ("closedAt", "createdAt", "createdByUserId", "expectedParticipants", "groupLabel", "id", "imageUrl", "paidByParticipantId", "parseConfidence", "rawLlmOutput", "status", "tableCode", "taxAmount", "tipAmount") SELECT "closedAt", "createdAt", "createdByUserId", "expectedParticipants", "groupLabel", "id", "imageUrl", "paidByParticipantId", "parseConfidence", "rawLlmOutput", "status", "tableCode", "taxAmount", "tipAmount" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE UNIQUE INDEX "Bill_tableCode_key" ON "Bill"("tableCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
