/** Canonical UI values for JobsiteLog.shift / .weather (stored as free-text String?). */

export const JOBSITE_SHIFT_OPTIONS = [
  "Mañana",
  "Tarde",
  "Noche",
  "Jornada completa",
] as const;

export const JOBSITE_WEATHER_OPTIONS = [
  "Soleado",
  "Nublado",
  "Parcialmente nublado",
  "Lluvioso",
  "Tormenta",
  "Ventoso",
  "Niebla",
] as const;

export type JobsiteShiftOption = (typeof JOBSITE_SHIFT_OPTIONS)[number];
export type JobsiteWeatherOption = (typeof JOBSITE_WEATHER_OPTIONS)[number];

export function isKnownJobsiteShift(value: string): boolean {
  return (JOBSITE_SHIFT_OPTIONS as readonly string[]).includes(value);
}

export function isKnownJobsiteWeather(value: string): boolean {
  return (JOBSITE_WEATHER_OPTIONS as readonly string[]).includes(value);
}
