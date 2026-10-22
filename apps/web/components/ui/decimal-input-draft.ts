import { roundToDecimals, tryParseUserDecimal } from "@bloqer/utils";

/** Tracks actual edits, so display rounding cannot become a persisted change. */
export class DecimalInputDraft {
  private edited = false;

  change(raw: string, precision: number): string | null {
    this.edited = true;
    return this.parse(raw, precision, "live");
  }

  commit(raw: string, precision: number): string | null {
    if (!this.edited) return null;
    const canonical = this.parse(raw, precision, "commit");
    if (canonical !== null) this.edited = false;
    return canonical;
  }

  reset(): void {
    this.edited = false;
  }

  private parse(raw: string, precision: number, mode: "live" | "commit"): string | null {
    const parsed = tryParseUserDecimal(raw, mode);
    if (parsed == null || parsed === "") return parsed;
    return roundToDecimals(parsed, precision);
  }
}
