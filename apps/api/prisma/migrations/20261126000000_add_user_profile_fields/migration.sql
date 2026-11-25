-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "preferred_language" TEXT NOT NULL DEFAULT 'en';
