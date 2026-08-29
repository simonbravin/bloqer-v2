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
import { buildScheduledReportPdfAttachments } from "@bloqer/report-pdf";

export const buildScheduledReportAttachment: BuildScheduledReportAttachmentFn = async (
  reportKey: ScheduledReportKey,
  format: ScheduledReportFormat,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportAttachment[]> => {
  await assertReportKeyEnabledAtRun(reportKey, ctx);
  if (format === "CSV") {
    const att = await buildScheduledReportCsvAttachmentForRunner(reportKey, projectId, params, ctx);
    return [att];
  }
  // PartialScheduledAttachmentsError (jobsite multi-PDF) may be thrown already fully formed
  // (prefixed filenames); do not wrap — runner duck-types and sends what succeeded.
  const pdfs = await buildScheduledReportPdfAttachments(reportKey, projectId, params, ctx);
  return pdfs.map((pdf) => ({
    reportKey,
    filename: prefixScheduledReportAttachmentFilename(reportKey, pdf.filename),
    content: pdf.content,
    contentType: pdf.contentType,
  }));
};
