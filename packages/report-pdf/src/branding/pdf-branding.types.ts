export type PdfReportBranding = {
  tenantName: string;
  companyDisplayName: string | null;
  projectLabel: string | null;
  generatedByLabel: string | null;
  generatedAtIso: string;
  /** Tenant logo as data URI when configured ([D-071]); never Bloqer product mark. */
  logoDataUri: string | null;
};

export type ResolvePdfBrandingOptions = {
  projectId?: string;
};
