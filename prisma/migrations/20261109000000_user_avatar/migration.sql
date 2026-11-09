-- Profile photo for staff accounts (Admin > My profile). Only adds a nullable column.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;
