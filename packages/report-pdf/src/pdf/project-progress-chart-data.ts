import type { ProjectProgressSeriesPoint } from "@bloqer/services";

export type ProgressPdfPlotSeries = {
  name: string;
  values: (string | null)[];
  color: string;
  dashed?: boolean;
};

export function buildProgressCommercialSeries(
  points: readonly ProjectProgressSeriesPoint[],
  colors: { certified: string; invoiced: string; collected: string },
): ProgressPdfPlotSeries[] {
  const definitions = [
    { key: "certified", name: "Certificado" },
    { key: "invoiced", name: "Facturado" },
    { key: "collected", name: "Cobrado" },
  ] as const;
  return definitions
    .filter(({ key }) => points.some((point) => point[key] !== null))
    .map(({ key, name }) => ({
      name,
      color: colors[key],
      values: points.map((point) => point[key]),
    }));
}

/** Visual coordinates only. A negative amount extends left from the zero axis. */
export function projectProgressBarGeometry(values: readonly number[], width: number) {
  const finite = values.map((value) => (Number.isFinite(value) ? value : 0));
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const span = max - min || 1;
  const coordinate = (value: number) => ((value - min) / span) * width;
  const zeroX = coordinate(0);
  return {
    zeroX,
    segments: finite.map((value) => {
      const end = coordinate(value);
      return { x: Math.min(end, zeroX), width: Math.abs(end - zeroX) };
    }),
  };
}
