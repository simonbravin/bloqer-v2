import type { ScheduledReportFormat } from "@bloqer/database";
import type { ScheduledReportKey } from "@bloqer/validators";
import {
  assertReportKeyEnabledAtRun,
  buildScheduledReportCsvAttachmentForRunner,
  prefixScheduledReportAttachmentFilename,
  type BuildScheduledReportAttachmentFn,
  type ScheduledReportAttachment,
  type ServiceContext,
} from "@bloqer/services";
import { buildScheduledReportPdfAttachment } from "@bloqer/report-pdf";

export const buildScheduledReportAttachment: BuildScheduledReportAttachmentFn = async (
  reportKey: ScheduledReportKey,
  format: ScheduledReportFormat,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportAttachment> => {
  await assertReportKeyEnabledAtRun(reportKey, ctx);
  if (format === "CSV") {
    return buildScheduledReportCsvAttachmentForRunner(reportKey, projectId, params, ctx);
  }
  const pdf = await buildScheduledReportPdfAttachment(reportKey, projectId, params, ctx);
  return {
    reportKey,
    filename: prefixScheduledReportAttachmentFilename(reportKey, pdf.filename),
    content: pdf.content,
    contentType: pdf.contentType,
  };
};
