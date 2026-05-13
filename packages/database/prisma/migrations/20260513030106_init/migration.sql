-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TenantInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JournalEntrySourceType" AS ENUM ('MANUAL', 'SALES_INVOICE', 'COLLECTION', 'SUPPLIER_INVOICE', 'PAYMENT', 'INTERNAL_TRANSFER', 'STOCK_MOVEMENT', 'ADJUSTMENT', 'TREASURY_INFLOW', 'TREASURY_OUTFLOW');

-- CreateEnum
CREATE TYPE "AccountingMappingEventType" AS ENUM ('COLLECTION_CONFIRMED', 'PAYMENT_CONFIRMED', 'TREASURY_INFLOW', 'TREASURY_OUTFLOW', 'TREASURY_TRANSFER', 'STOCK_CONSUMPTION', 'MANUAL_CAPITAL_CONTRIBUTION', 'MANUAL_OWNER_LOAN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'PROCUREMENT', 'WAREHOUSE', 'SALES', 'VIEWER', 'PROJECT_MANAGER', 'SITE_FOREMAN', 'PROJECT_VIEWER');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactRoleType" AS ENUM ('CLIENT', 'SUPPLIER', 'SUBCONTRACTOR', 'EMPLOYEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactRoleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TaxIdType" AS ENUM ('CUIT', 'CUIL', 'CDI', 'FOREIGN', 'FINAL_CONSUMER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'RETURNED_FOR_CHANGES', 'APPROVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WbsNodeType" AS ENUM ('GROUP', 'ITEM');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('MATERIAL', 'LABOR', 'EQUIPMENT', 'SUBCONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreasuryAccountType" AS ENUM ('BANK', 'CASH', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "TreasuryAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountMovementType" AS ENUM ('INFLOW', 'OUTFLOW', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AccountMovementStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountMovementSourceType" AS ENUM ('COLLECTION', 'INTERNAL_TRANSFER', 'MANUAL_ADJUSTMENT', 'OPENING_BALANCE', 'PAYMENT');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InternalTransferStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobsiteLogStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobsiteLogIssueType" AS ENUM ('INCIDENT', 'BLOCKER', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "JobsiteLogIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "JobsiteLogIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "SubcontractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubcontractCertificationStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('CENTRAL', 'PROJECT', 'TEMPORARY', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockMovementSourceType" AS ENUM ('PURCHASE_RECEIPT', 'CONSUMPTION', 'TRANSFER', 'ADJUSTMENT', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "StockMovementStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarehouseTransferStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACT', 'PLAN', 'PERMIT', 'TECHNICAL', 'PHOTO', 'INVOICE', 'RECEIPT', 'CERTIFICATE', 'REPORT', 'JOBSITE_EVIDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADING', 'ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "LinkedEntityType" AS ENUM ('PROJECT', 'BUDGET', 'CERTIFICATION', 'SALES_INVOICE', 'SUPPLIER_INVOICE', 'PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'SUBCONTRACT', 'SUBCONTRACT_CERTIFICATION', 'JOBSITE_LOG', 'WAREHOUSE_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('PLACEHOLDER', 'R2', 'S3');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DOCUMENT_UPLOAD_CONFIRMED', 'JOBSITE_LOG_RETURNED', 'CERTIFICATION_APPROVED', 'RECEIVABLE_OVERDUE', 'PAYABLE_OVERDUE', 'NEGATIVE_STOCK', 'CERTIFICATION_APPROVED_WITHOUT_INVOICE', 'STALE_DOCUMENT_UPLOAD');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailDeliveryType" AS ENUM ('NOTIFICATION', 'OPERATIONAL_ALERT', 'REPORT_MANUAL', 'REPORT_SCHEDULED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('RESEND', 'DISABLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "fiscalId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "baseCurrency" TEXT NOT NULL DEFAULT 'ARS',
    "saasPlan" TEXT NOT NULL DEFAULT 'trial',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "billingCustomerId" VARCHAR(255),
    "suspendedReason" VARCHAR(512),
    "platformInternalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_module_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" VARCHAR(64) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "internalNotes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "targetTenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "fiscalId" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "roles" "UserRole"[],
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "email" VARCHAR(320) NOT NULL,
    "roles" "UserRole"[],
    "status" "TenantInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "fantasyName" TEXT,
    "taxId" TEXT,
    "taxIdType" "TaxIdType",
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AR',
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_roles" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "ContactRoleType" NOT NULL,
    "status" "ContactRoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "creditLimit" DECIMAL(18,2),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'ARS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_profiles" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'ARS',
    "bankAccount" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_profiles" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "specialty" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "clientContactId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AR',
    "type" "ProjectType" NOT NULL DEFAULT 'PRIVATE',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "expectedEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT NOT NULL,
    "parentBudgetId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalSalePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "internalNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_settings" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "overheadPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "financialCostPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "financialDaysAvg" INTEGER NOT NULL DEFAULT 0,
    "profitPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "taxPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_nodes" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "WbsNodeType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_items" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitCostDirect" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitSalePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCostDirect" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalSalePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_analysis_lines" (
    "id" TEXT NOT NULL,
    "costItemId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "coefficient" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "supplierContactId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_analysis_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "issueDate" DATE,
    "status" "CertificationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "internalNotes" TEXT,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_lines" (
    "id" TEXT NOT NULL,
    "certificationId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "unitSalePriceSnapshot" DECIMAL(18,4) NOT NULL,
    "budgetQty" DECIMAL(18,4) NOT NULL,
    "physicalPct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "previousQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currentQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cumulativeQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "periodAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "certificationId" TEXT,
    "number" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,4) NOT NULL,
    "lineTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "certificationLineId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "entryDate" DATE NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "JournalEntrySourceType" NOT NULL,
    "sourceId" VARCHAR(128),
    "description" VARCHAR(1024) NOT NULL,
    "reference" VARCHAR(256),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_mapping_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventType" "AccountingMappingEventType" NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "description" VARCHAR(1024),
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_mapping_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "description" VARCHAR(512),
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "type" "TreasuryAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "bankName" TEXT,
    "accountNumber" TEXT,
    "alias" TEXT,
    "notes" TEXT,
    "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "TreasuryAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "accountId" TEXT NOT NULL,
    "movementDate" DATE NOT NULL,
    "type" "AccountMovementType" NOT NULL,
    "sourceType" "AccountMovementSourceType" NOT NULL,
    "sourceId" TEXT,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AccountMovementStatus" NOT NULL DEFAULT 'CONFIRMED',
    "transferId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "collectionDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "status" "CollectionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "transferDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT,
    "status" "InternalTransferStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierContactId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purchaseOrderId" TEXT,
    "subcontractCertificationId" TEXT,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,4) NOT NULL,
    "lineTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierContactId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,4) NOT NULL,
    "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierContactId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "supplierInvoiceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierContactId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "expectedDeliveryDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "wbsNodeId" TEXT,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,4) NOT NULL,
    "lineTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierContactId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "receiptDate" DATE NOT NULL,
    "status" "PurchaseReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_lines" (
    "id" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantityReceived" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT '',
    "category" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL DEFAULT 'CENTRAL',
    "address" TEXT,
    "notes" TEXT,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "projectId" TEXT,
    "wbsNodeId" TEXT,
    "purchaseReceiptId" TEXT,
    "purchaseReceiptLineId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "sourceType" "StockMovementSourceType" NOT NULL,
    "sourceId" TEXT,
    "movementDate" DATE NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "totalCost" DECIMAL(18,4),
    "status" "StockMovementStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "warehouseTransferId" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontracts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorContactId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contractDate" DATE NOT NULL,
    "startDate" DATE,
    "expectedEndDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "SubcontractStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontract_lines" (
    "id" TEXT NOT NULL,
    "subcontractId" TEXT NOT NULL,
    "wbsNodeId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "certifiedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontract_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontract_certifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractId" TEXT NOT NULL,
    "subcontractorContactId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "certificationDate" DATE NOT NULL,
    "status" "SubcontractCertificationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontract_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontract_certification_lines" (
    "id" TEXT NOT NULL,
    "subcontractCertificationId" TEXT NOT NULL,
    "subcontractLineId" TEXT NOT NULL,
    "previousQty" DECIMAL(18,4) NOT NULL,
    "currentQty" DECIMAL(18,4) NOT NULL,
    "cumulativeQty" DECIMAL(18,4) NOT NULL,
    "remainingQty" DECIMAL(18,4) NOT NULL,
    "unitPriceSnapshot" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontract_certification_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobsite_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "logDate" DATE NOT NULL,
    "title" TEXT,
    "workFront" TEXT,
    "shift" TEXT,
    "status" "JobsiteLogStatus" NOT NULL DEFAULT 'DRAFT',
    "weather" TEXT,
    "generalNotes" TEXT,
    "blockers" TEXT,
    "incidents" TEXT,
    "safetyNotes" TEXT,
    "returnNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobsite_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobsite_log_progress" (
    "id" TEXT NOT NULL,
    "jobsiteLogId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "description" TEXT,
    "quantityCompleted" DECIMAL(18,4) NOT NULL,
    "physicalPct" DECIMAL(8,4),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobsite_log_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobsite_log_labor" (
    "id" TEXT NOT NULL,
    "jobsiteLogId" TEXT NOT NULL,
    "contactId" TEXT,
    "subcontractId" TEXT,
    "crewDescription" TEXT,
    "workersCount" INTEGER NOT NULL,
    "hoursWorked" DECIMAL(8,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobsite_log_labor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobsite_log_material_usages" (
    "id" TEXT NOT NULL,
    "jobsiteLogId" TEXT NOT NULL,
    "productId" TEXT,
    "warehouseId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobsite_log_material_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobsite_log_issues" (
    "id" TEXT NOT NULL,
    "jobsiteLogId" TEXT NOT NULL,
    "type" "JobsiteLogIssueType" NOT NULL,
    "severity" "JobsiteLogIssueSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JobsiteLogIssueStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobsite_log_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "number" INTEGER NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "transferDate" DATE NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "totalCost" DECIMAL(18,4),
    "notes" TEXT,
    "status" "WarehouseTransferStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'PLACEHOLDER',
    "storageBucket" TEXT,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkedEntityType" "LinkedEntityType",
    "linkedEntityId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "recipientUserId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "linkedEntityType" "LinkedEntityType",
    "linkedEntityId" TEXT,
    "projectId" TEXT,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" VARCHAR(998) NOT NULL,
    "emailType" "EmailDeliveryType" NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "providerMessageId" TEXT,
    "skippedReason" VARCHAR(256),
    "errorMessage" VARCHAR(512),
    "relatedEntityType" "LinkedEntityType",
    "relatedEntityId" TEXT,
    "reportType" VARCHAR(64),
    "reportFormat" VARCHAR(16),
    "idempotencyKey" VARCHAR(512),
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenant_module_settings_tenantId_idx" ON "tenant_module_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_module_settings_tenantId_moduleKey_key" ON "tenant_module_settings"("tenantId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_userId_key" ON "platform_admins"("userId");

-- CreateIndex
CREATE INDEX "platform_admins_active_idx" ON "platform_admins"("active");

-- CreateIndex
CREATE INDEX "platform_audit_logs_actorUserId_createdAt_idx" ON "platform_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_targetTenantId_createdAt_idx" ON "platform_audit_logs"("targetTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "companies_tenantId_idx" ON "companies"("tenantId");

-- CreateIndex
CREATE INDEX "user_memberships_tenantId_idx" ON "user_memberships"("tenantId");

-- CreateIndex
CREATE INDEX "user_memberships_tenantId_status_idx" ON "user_memberships"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_memberships_userId_tenantId_key" ON "user_memberships"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invitations_tokenHash_key" ON "tenant_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "tenant_invitations_tenantId_email_status_idx" ON "tenant_invitations"("tenantId", "email", "status");

-- CreateIndex
CREATE INDEX "tenant_invitations_tenantId_status_expiresAt_idx" ON "tenant_invitations"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "contacts_tenantId_status_idx" ON "contacts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "contacts_tenantId_legalName_idx" ON "contacts"("tenantId", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_tenantId_taxId_key" ON "contacts"("tenantId", "taxId");

-- CreateIndex
CREATE INDEX "contact_roles_tenantId_role_status_idx" ON "contact_roles"("tenantId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contact_roles_contactId_role_key" ON "contact_roles"("contactId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_contactId_key" ON "client_profiles"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_profiles_contactId_key" ON "supplier_profiles"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_profiles_contactId_key" ON "subcontractor_profiles"("contactId");

-- CreateIndex
CREATE INDEX "projects_tenantId_status_idx" ON "projects"("tenantId", "status");

-- CreateIndex
CREATE INDEX "projects_tenantId_clientContactId_idx" ON "projects"("tenantId", "clientContactId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenantId_code_key" ON "projects"("tenantId", "code");

-- CreateIndex
CREATE INDEX "budgets_projectId_status_idx" ON "budgets"("projectId", "status");

-- CreateIndex
CREATE INDEX "budgets_tenantId_projectId_idx" ON "budgets"("tenantId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_projectId_versionNumber_key" ON "budgets"("projectId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "budget_settings_budgetId_key" ON "budget_settings"("budgetId");

-- CreateIndex
CREATE INDEX "wbs_nodes_budgetId_parentId_idx" ON "wbs_nodes"("budgetId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "wbs_nodes_budgetId_code_key" ON "wbs_nodes"("budgetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_items_wbsNodeId_key" ON "cost_items"("wbsNodeId");

-- CreateIndex
CREATE INDEX "cost_items_budgetId_idx" ON "cost_items"("budgetId");

-- CreateIndex
CREATE INDEX "cost_analysis_lines_costItemId_idx" ON "cost_analysis_lines"("costItemId");

-- CreateIndex
CREATE INDEX "cost_analysis_lines_budgetId_idx" ON "cost_analysis_lines"("budgetId");

-- CreateIndex
CREATE INDEX "certifications_tenantId_projectId_idx" ON "certifications"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "certifications_budgetId_status_idx" ON "certifications"("budgetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certifications_projectId_number_key" ON "certifications"("projectId", "number");

-- CreateIndex
CREATE INDEX "certification_lines_wbsNodeId_idx" ON "certification_lines"("wbsNodeId");

-- CreateIndex
CREATE INDEX "certification_lines_certificationId_idx" ON "certification_lines"("certificationId");

-- CreateIndex
CREATE UNIQUE INDEX "certification_lines_certificationId_wbsNodeId_key" ON "certification_lines"("certificationId", "wbsNodeId");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_projectId_idx" ON "sales_invoices"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_certificationId_idx" ON "sales_invoices"("tenantId", "certificationId");

-- CreateIndex
CREATE INDEX "sales_invoices_tenantId_status_idx" ON "sales_invoices"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tenantId_companyId_number_key" ON "sales_invoices"("tenantId", "companyId", "number");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_invoiceId_idx" ON "sales_invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_certificationLineId_idx" ON "sales_invoice_lines"("certificationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_salesInvoiceId_key" ON "receivables"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "receivables_tenantId_projectId_idx" ON "receivables"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "receivables_tenantId_status_idx" ON "receivables"("tenantId", "status");

-- CreateIndex
CREATE INDEX "accounting_accounts_tenantId_companyId_idx" ON "accounting_accounts"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "accounting_accounts_tenantId_type_idx" ON "accounting_accounts"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_accounts_tenantId_companyId_code_key" ON "accounting_accounts"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_companyId_entryDate_idx" ON "journal_entries"("tenantId", "companyId", "entryDate");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_sourceType_sourceId_idx" ON "journal_entries"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_status_idx" ON "journal_entries"("tenantId", "status");

-- CreateIndex
CREATE INDEX "accounting_mapping_rules_tenantId_companyId_eventType_isAct_idx" ON "accounting_mapping_rules"("tenantId", "companyId", "eventType", "isActive");

-- CreateIndex
CREATE INDEX "journal_entry_lines_accountId_idx" ON "journal_entry_lines"("accountId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_projectId_idx" ON "journal_entry_lines"("projectId");

-- CreateIndex
CREATE INDEX "treasury_accounts_tenantId_status_idx" ON "treasury_accounts"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_tenantId_name_key" ON "treasury_accounts"("tenantId", "name");

-- CreateIndex
CREATE INDEX "account_movements_tenantId_accountId_movementDate_idx" ON "account_movements"("tenantId", "accountId", "movementDate");

-- CreateIndex
CREATE INDEX "account_movements_tenantId_sourceType_sourceId_idx" ON "account_movements"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "account_movements_transferId_idx" ON "account_movements"("transferId");

-- CreateIndex
CREATE INDEX "collections_tenantId_projectId_idx" ON "collections"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "collections_tenantId_receivableId_idx" ON "collections"("tenantId", "receivableId");

-- CreateIndex
CREATE INDEX "collections_tenantId_status_idx" ON "collections"("tenantId", "status");

-- CreateIndex
CREATE INDEX "internal_transfers_tenantId_status_idx" ON "internal_transfers"("tenantId", "status");

-- CreateIndex
CREATE INDEX "internal_transfers_tenantId_sourceAccountId_idx" ON "internal_transfers"("tenantId", "sourceAccountId");

-- CreateIndex
CREATE INDEX "internal_transfers_tenantId_destinationAccountId_idx" ON "internal_transfers"("tenantId", "destinationAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_subcontractCertificationId_key" ON "supplier_invoices"("subcontractCertificationId");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenantId_projectId_idx" ON "supplier_invoices"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenantId_status_idx" ON "supplier_invoices"("tenantId", "status");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenantId_supplierContactId_idx" ON "supplier_invoices"("tenantId", "supplierContactId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenantId_companyId_number_key" ON "supplier_invoices"("tenantId", "companyId", "number");

-- CreateIndex
CREATE INDEX "supplier_invoice_lines_invoiceId_idx" ON "supplier_invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payables_supplierInvoiceId_key" ON "payables"("supplierInvoiceId");

-- CreateIndex
CREATE INDEX "payables_tenantId_projectId_idx" ON "payables"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "payables_tenantId_status_idx" ON "payables"("tenantId", "status");

-- CreateIndex
CREATE INDEX "payments_tenantId_projectId_idx" ON "payments"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "payments_tenantId_payableId_idx" ON "payments"("tenantId", "payableId");

-- CreateIndex
CREATE INDEX "payments_tenantId_status_idx" ON "payments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "payments_tenantId_supplierInvoiceId_idx" ON "payments"("tenantId", "supplierInvoiceId");

-- CreateIndex
CREATE INDEX "payments_tenantId_supplierContactId_idx" ON "payments"("tenantId", "supplierContactId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_projectId_idx" ON "purchase_orders"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_status_idx" ON "purchase_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierContactId_idx" ON "purchase_orders"("tenantId", "supplierContactId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_companyId_number_key" ON "purchase_orders"("tenantId", "companyId", "number");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_wbsNodeId_idx" ON "purchase_order_lines"("wbsNodeId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_productId_idx" ON "purchase_order_lines"("productId");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenantId_projectId_idx" ON "purchase_receipts"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenantId_purchaseOrderId_idx" ON "purchase_receipts"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_receipts_tenantId_status_idx" ON "purchase_receipts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "purchase_receipts_warehouseId_idx" ON "purchase_receipts"("warehouseId");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_purchaseReceiptId_idx" ON "purchase_receipt_lines"("purchaseReceiptId");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_purchaseOrderLineId_idx" ON "purchase_receipt_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "products_tenantId_status_idx" ON "products"("tenantId", "status");

-- CreateIndex
CREATE INDEX "products_tenantId_companyId_idx" ON "products"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_companyId_sku_key" ON "products"("tenantId", "companyId", "sku");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_companyId_status_idx" ON "warehouses"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "warehouses_projectId_idx" ON "warehouses"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_companyId_name_key" ON "warehouses"("tenantId", "companyId", "name");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_warehouseId_productId_idx" ON "stock_movements"("tenantId", "warehouseId", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_productId_status_idx" ON "stock_movements"("tenantId", "productId", "status");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_projectId_idx" ON "stock_movements"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "stock_movements_purchaseReceiptId_idx" ON "stock_movements"("purchaseReceiptId");

-- CreateIndex
CREATE INDEX "stock_movements_warehouseTransferId_idx" ON "stock_movements"("warehouseTransferId");

-- CreateIndex
CREATE INDEX "subcontracts_tenantId_projectId_idx" ON "subcontracts"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "subcontracts_tenantId_status_idx" ON "subcontracts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "subcontracts_tenantId_subcontractorContactId_idx" ON "subcontracts"("tenantId", "subcontractorContactId");

-- CreateIndex
CREATE UNIQUE INDEX "subcontracts_tenantId_companyId_number_key" ON "subcontracts"("tenantId", "companyId", "number");

-- CreateIndex
CREATE INDEX "subcontract_lines_subcontractId_idx" ON "subcontract_lines"("subcontractId");

-- CreateIndex
CREATE INDEX "subcontract_lines_wbsNodeId_idx" ON "subcontract_lines"("wbsNodeId");

-- CreateIndex
CREATE INDEX "subcontract_certifications_tenantId_projectId_idx" ON "subcontract_certifications"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "subcontract_certifications_tenantId_subcontractId_idx" ON "subcontract_certifications"("tenantId", "subcontractId");

-- CreateIndex
CREATE INDEX "subcontract_certifications_tenantId_status_idx" ON "subcontract_certifications"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subcontract_certifications_subcontractId_number_key" ON "subcontract_certifications"("subcontractId", "number");

-- CreateIndex
CREATE INDEX "subcontract_certification_lines_subcontractCertificationId_idx" ON "subcontract_certification_lines"("subcontractCertificationId");

-- CreateIndex
CREATE INDEX "subcontract_certification_lines_subcontractLineId_idx" ON "subcontract_certification_lines"("subcontractLineId");

-- CreateIndex
CREATE INDEX "jobsite_logs_tenantId_projectId_logDate_idx" ON "jobsite_logs"("tenantId", "projectId", "logDate");

-- CreateIndex
CREATE INDEX "jobsite_logs_tenantId_status_idx" ON "jobsite_logs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "jobsite_log_progress_jobsiteLogId_idx" ON "jobsite_log_progress"("jobsiteLogId");

-- CreateIndex
CREATE INDEX "jobsite_log_progress_wbsNodeId_idx" ON "jobsite_log_progress"("wbsNodeId");

-- CreateIndex
CREATE INDEX "jobsite_log_labor_jobsiteLogId_idx" ON "jobsite_log_labor"("jobsiteLogId");

-- CreateIndex
CREATE INDEX "jobsite_log_labor_contactId_idx" ON "jobsite_log_labor"("contactId");

-- CreateIndex
CREATE INDEX "jobsite_log_material_usages_jobsiteLogId_idx" ON "jobsite_log_material_usages"("jobsiteLogId");

-- CreateIndex
CREATE INDEX "jobsite_log_issues_jobsiteLogId_idx" ON "jobsite_log_issues"("jobsiteLogId");

-- CreateIndex
CREATE INDEX "warehouse_transfers_tenantId_companyId_status_idx" ON "warehouse_transfers"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "warehouse_transfers_tenantId_sourceWarehouseId_idx" ON "warehouse_transfers"("tenantId", "sourceWarehouseId");

-- CreateIndex
CREATE INDEX "warehouse_transfers_tenantId_destinationWarehouseId_idx" ON "warehouse_transfers"("tenantId", "destinationWarehouseId");

-- CreateIndex
CREATE INDEX "warehouse_transfers_tenantId_productId_idx" ON "warehouse_transfers"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "warehouse_transfers_tenantId_transferDate_idx" ON "warehouse_transfers"("tenantId", "transferDate");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_transfers_tenantId_companyId_number_key" ON "warehouse_transfers"("tenantId", "companyId", "number");

-- CreateIndex
CREATE INDEX "document_attachments_tenantId_projectId_idx" ON "document_attachments"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "document_attachments_tenantId_linkedEntityType_linkedEntity_idx" ON "document_attachments"("tenantId", "linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE INDEX "document_attachments_tenantId_status_idx" ON "document_attachments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "notifications_tenantId_recipientUserId_status_createdAt_idx" ON "notifications"("tenantId", "recipientUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_projectId_createdAt_idx" ON "notifications"("tenantId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_linkedEntityType_linkedEntityId_idx" ON "notifications"("tenantId", "linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE INDEX "email_delivery_logs_tenantId_createdAt_idx" ON "email_delivery_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_tenantId_recipientEmail_createdAt_idx" ON "email_delivery_logs"("tenantId", "recipientEmail", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_tenantId_status_createdAt_idx" ON "email_delivery_logs"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_tenantId_emailType_createdAt_idx" ON "email_delivery_logs"("tenantId", "emailType", "createdAt");

-- CreateIndex
CREATE INDEX "email_delivery_logs_tenantId_relatedEntityType_relatedEntit_idx" ON "email_delivery_logs"("tenantId", "relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "email_delivery_logs_tenantId_idempotencyKey_idx" ON "email_delivery_logs"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_module_settings" ADD CONSTRAINT "tenant_module_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_targetTenantId_fkey" FOREIGN KEY ("targetTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_profiles" ADD CONSTRAINT "subcontractor_profiles_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_parentBudgetId_fkey" FOREIGN KEY ("parentBudgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_settings" ADD CONSTRAINT "budget_settings_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_nodes" ADD CONSTRAINT "wbs_nodes_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_nodes" ADD CONSTRAINT "wbs_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_analysis_lines" ADD CONSTRAINT "cost_analysis_lines_costItemId_fkey" FOREIGN KEY ("costItemId") REFERENCES "cost_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_analysis_lines" ADD CONSTRAINT "cost_analysis_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_lines" ADD CONSTRAINT "certification_lines_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "certifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_lines" ADD CONSTRAINT "certification_lines_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "certifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_certificationLineId_fkey" FOREIGN KEY ("certificationLineId") REFERENCES "certification_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_accounts" ADD CONSTRAINT "accounting_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounting_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_mapping_rules" ADD CONSTRAINT "accounting_mapping_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_mapping_rules" ADD CONSTRAINT "accounting_mapping_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_mapping_rules" ADD CONSTRAINT "accounting_mapping_rules_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_mapping_rules" ADD CONSTRAINT "accounting_mapping_rules_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_subcontractCertificationId_fkey" FOREIGN KEY ("subcontractCertificationId") REFERENCES "subcontract_certifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplierInvoiceId_fkey" FOREIGN KEY ("supplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseReceiptLineId_fkey" FOREIGN KEY ("purchaseReceiptLineId") REFERENCES "purchase_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseTransferId_fkey" FOREIGN KEY ("warehouseTransferId") REFERENCES "warehouse_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontracts" ADD CONSTRAINT "subcontracts_subcontractorContactId_fkey" FOREIGN KEY ("subcontractorContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_lines" ADD CONSTRAINT "subcontract_lines_subcontractId_fkey" FOREIGN KEY ("subcontractId") REFERENCES "subcontracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_lines" ADD CONSTRAINT "subcontract_lines_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certifications" ADD CONSTRAINT "subcontract_certifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certifications" ADD CONSTRAINT "subcontract_certifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certifications" ADD CONSTRAINT "subcontract_certifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certifications" ADD CONSTRAINT "subcontract_certifications_subcontractId_fkey" FOREIGN KEY ("subcontractId") REFERENCES "subcontracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certifications" ADD CONSTRAINT "subcontract_certifications_subcontractorContactId_fkey" FOREIGN KEY ("subcontractorContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certification_lines" ADD CONSTRAINT "subcontract_certification_lines_subcontractCertificationId_fkey" FOREIGN KEY ("subcontractCertificationId") REFERENCES "subcontract_certifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontract_certification_lines" ADD CONSTRAINT "subcontract_certification_lines_subcontractLineId_fkey" FOREIGN KEY ("subcontractLineId") REFERENCES "subcontract_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_logs" ADD CONSTRAINT "jobsite_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_logs" ADD CONSTRAINT "jobsite_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_logs" ADD CONSTRAINT "jobsite_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_progress" ADD CONSTRAINT "jobsite_log_progress_jobsiteLogId_fkey" FOREIGN KEY ("jobsiteLogId") REFERENCES "jobsite_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_progress" ADD CONSTRAINT "jobsite_log_progress_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_labor" ADD CONSTRAINT "jobsite_log_labor_jobsiteLogId_fkey" FOREIGN KEY ("jobsiteLogId") REFERENCES "jobsite_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_labor" ADD CONSTRAINT "jobsite_log_labor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_labor" ADD CONSTRAINT "jobsite_log_labor_subcontractId_fkey" FOREIGN KEY ("subcontractId") REFERENCES "subcontracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_material_usages" ADD CONSTRAINT "jobsite_log_material_usages_jobsiteLogId_fkey" FOREIGN KEY ("jobsiteLogId") REFERENCES "jobsite_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_material_usages" ADD CONSTRAINT "jobsite_log_material_usages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_material_usages" ADD CONSTRAINT "jobsite_log_material_usages_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobsite_log_issues" ADD CONSTRAINT "jobsite_log_issues_jobsiteLogId_fkey" FOREIGN KEY ("jobsiteLogId") REFERENCES "jobsite_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
