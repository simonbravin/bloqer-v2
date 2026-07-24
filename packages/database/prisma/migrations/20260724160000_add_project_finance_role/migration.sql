-- AlterEnum: add PROJECT_FINANCE (D-056 company vs project finance)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PROJECT_FINANCE';
