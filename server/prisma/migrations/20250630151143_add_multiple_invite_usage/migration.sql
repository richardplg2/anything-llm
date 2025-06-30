/*
  Warnings:

  - You are about to drop the column `claimedBy` on the `invites` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_invites" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "claimedByUsers" TEXT,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "workspaceIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_invites" ("code", "createdAt", "createdBy", "id", "lastUpdatedAt", "status", "workspaceIds") SELECT "code", "createdAt", "createdBy", "id", "lastUpdatedAt", "status", "workspaceIds" FROM "invites";
DROP TABLE "invites";
ALTER TABLE "new_invites" RENAME TO "invites";
CREATE UNIQUE INDEX "invites_code_key" ON "invites"("code");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
