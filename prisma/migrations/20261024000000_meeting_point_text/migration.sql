-- Optional meeting-point texts; SQLite additive migration.
-- Run on Ubuntu only after checking that neither column already exists.
ALTER TABLE "OperationDay" ADD COLUMN "meetingPointText" TEXT;
ALTER TABLE "OperationDayTeam" ADD COLUMN "meetingPointText" TEXT;
