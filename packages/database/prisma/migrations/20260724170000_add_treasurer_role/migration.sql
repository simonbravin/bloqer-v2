-- AlterEnum: add TREASURER (D-056 company cash role, segregation from FINANCE)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TREASURER';
