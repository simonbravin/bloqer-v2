import { renderToBuffer } from "@react-pdf/renderer";

/** Server-side PDF from a react-pdf `<Document />` element. */
export async function renderReportPdfToBuffer(
  node: Parameters<typeof renderToBuffer>[0],
): Promise<Buffer> {
  const out = await renderToBuffer(node);
  return Buffer.from(out);
}
