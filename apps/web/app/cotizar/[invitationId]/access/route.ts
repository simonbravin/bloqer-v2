import { readSupplierQuoteInvitation } from "@bloqer/services";
import { getPublicAppBaseUrl } from "@bloqer/config";
import { NextRequest } from "next/server";
import { guardSupplierQuoteRequest, readSupplierQuoteBody, supplierQuoteCookie, supplierQuoteHttpError, supplierQuoteJson } from "@/features/procurement/lib/supplier-quote-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ invitationId: string }> }) {
  try {
    guardSupplierQuoteRequest(request);
    const { invitationId } = await context.params;
    const body = await readSupplierQuoteBody(request);
    const token = body && typeof body === "object" && "token" in body && typeof body.token === "string" ? body.token : "";
    const state = await readSupplierQuoteInvitation(invitationId, token);
    const response = supplierQuoteJson(state);
    if (state.state === "open") response.cookies.set(supplierQuoteCookie(invitationId), token, {
      httpOnly: true, secure: getPublicAppBaseUrl()?.startsWith("https://") ?? true,
      sameSite: "strict", path: `/cotizar/${invitationId}`, expires: new Date(state.expiresAt),
    });
    return response;
  } catch (error) { return supplierQuoteHttpError(error); }
}
