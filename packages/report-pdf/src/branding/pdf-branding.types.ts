export type PdfReportBranding = {
  tenantName: string;
  companyDisplayName: string | null;
  projectLabel: string | null;
  generatedByLabel: string | null;
  generatedAtIso: string;
};

export type ResolvePdfBrandingOptions = {
  projectId?: string;
};
