import { redirect } from "next/navigation";

/** Redirige con mensaje de error de server action en query `actionError`. */
export function redirectWithActionError(path: string, error: string): never {
  const q = new URLSearchParams({ actionError: error });
  redirect(`${path}?${q.toString()}`);
}
