import { NextResponse } from "next/server";
import { listFieldProjects, ServiceError } from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

function statusForServiceError(code: ServiceError["code"]): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "VALIDATION":
      return 400;
    default:
      return 500;
  }
}

export async function GET() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const projects = await listFieldProjects(ctx);
    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: statusForServiceError(err.code) });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
