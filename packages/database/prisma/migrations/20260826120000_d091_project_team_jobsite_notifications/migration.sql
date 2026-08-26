-- D-091: project team roster (notification routing) + jobsite log notification types

CREATE TYPE "ProjectTeamMemberKind" AS ENUM ('PROJECT_MANAGER', 'SITE_FOREMAN', 'OTHER');

CREATE TABLE "project_team_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ProjectTeamMemberKind" NOT NULL DEFAULT 'OTHER',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_team_members_tenantId_projectId_userId_key" ON "project_team_members"("tenantId", "projectId", "userId");
CREATE INDEX "project_team_members_tenantId_projectId_idx" ON "project_team_members"("tenantId", "projectId");
CREATE INDEX "project_team_members_tenantId_userId_idx" ON "project_team_members"("tenantId", "userId");

ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'JOBSITE_LOG_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'JOBSITE_LOG_APPROVED';
