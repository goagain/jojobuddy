export const UNNAMED_LOCATION = "__unnamed__";

/** One segment before the first comma, or the whole segment if no comma. */
export function parseLocationCity(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) return "";
  const comma = trimmed.indexOf(",");
  return (comma >= 0 ? trimmed.slice(0, comma) : trimmed).trim();
}

/** Split multi-location strings (by `/`) and normalize to city names. */
export function parseJobCities(location?: string): string[] {
  if (!location?.trim()) return [];
  const cities = new Set<string>();
  for (const part of location.split("/")) {
    const city = parseLocationCity(part);
    if (city) cities.add(city);
  }
  return [...cities];
}

/** Normalize raw city strings (comma-prefixed addresses, duplicates). */
export function normalizeJobLocations(raw: string[]): string[] {
  const cities = new Set<string>();
  for (const item of raw) {
    const city = parseLocationCity(item);
    if (city) cities.add(city);
  }
  return [...cities];
}

/** Store format: "Austin / Denver / Seattle". */
export function formatJobLocations(cities: string[]): string {
  return normalizeJobLocations(cities).join(" / ");
}

/** Prefer AI-extracted cities; fall back to adapter/HTML location. */
export function resolveJobLocation(insights: { locations: string[] }, fallback?: string): string {
  const fromAi = formatJobLocations(insights.locations);
  if (fromAi) return fromAi;
  return formatJobLocations(parseJobCities(fallback));
}

export function jobLocationKeys(job: { location?: string }): string[] {
  const cities = parseJobCities(job.location);
  return cities.length > 0 ? cities : [UNNAMED_LOCATION];
}

export function jobMatchesCityFilter(job: { location?: string }, selected: Set<string>) {
  if (selected.size === 0) return true;
  return jobLocationKeys(job).some((city) => selected.has(city));
}
