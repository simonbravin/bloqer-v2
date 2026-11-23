import { readSupplierQuoteInvitation, respondToSupplierQuoteInvitation } from "@bloqer/services";
import { NextRequest } from "next/server";
import { guardSupplierQuoteRequest, readSupplierQuoteBody, supplierQuoteCookie, supplierQuoteHttpError, supplierQuoteJson } from "@/features/procurement/lib/supplier-quote-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ invitationId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    guardSupplierQuoteRequest(request);
    const { invitationId } = await context.params;
    return supplierQuoteJson(await readSupplierQuoteInvitation(invitationId, request.cookies.get(supplierQuoteCookie(invitationId))?.value ?? ""));
  } catch (error) { return supplierQuoteHttpError(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    guardSupplierQuoteRequest(request);
    const { invitationId } = await context.params;
    return supplierQuoteJson(await respondToSupplierQuoteInvitation(invitationId, request.cookies.get(supplierQuoteCookie(invitationId))?.value ?? "", await readSupplierQuoteBody(request)));
  } catch (error) { return supplierQuoteHttpError(error); }
}
