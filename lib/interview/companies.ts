import { companyTypeaheadRequest, onePointFetch, type FetchLike } from "./onepoint";

export type CompanyHit = {
  identifier: string;
  name: string;
  logo?: string;
};

export function parseCompanyTypeahead(payload: unknown): CompanyHit[] {
  const batches = Array.isArray(payload) ? payload : [payload];
  const hits: CompanyHit[] = [];
  for (const batch of batches) {
    if (!batch || typeof batch !== "object") continue;
    const json = (batch as { result?: { data?: { json?: { results?: unknown } } } }).result?.data?.json;
    const results = json && typeof json === "object" ? json.results : undefined;
    if (!Array.isArray(results)) continue;
    for (const item of results) {
      if (!item || typeof item !== "object") continue;
      const row = item as { identifier?: unknown; name?: unknown; logo?: unknown };
      const identifier = typeof row.identifier === "string" ? row.identifier.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!identifier || !name) continue;
      hits.push({
        identifier,
        name,
        logo: typeof row.logo === "string" ? row.logo : undefined,
      });
    }
  }
  return hits;
}

export function pickCompany(query: string, hits: CompanyHit[]): CompanyHit | null {
  const q = query.trim().toLowerCase();
  if (!q || hits.length === 0) return null;
  return (
    hits.find((hit) => hit.identifier.toLowerCase() === q) ??
    hits.find((hit) => hit.name.toLowerCase() === q) ??
    hits.find((hit) => hit.name.toLowerCase().startsWith(q) || hit.identifier.toLowerCase().startsWith(q)) ??
    hits[0] ??
    null
  );
}

export async function resolveCompany(
  fetchImpl: FetchLike,
  query: string,
): Promise<CompanyHit> {
  const name = query.trim();
  try {
    const payload = await onePointFetch(fetchImpl, companyTypeaheadRequest(name), undefined, "");
    const picked = pickCompany(name, parseCompanyTypeahead(payload));
    if (picked) return picked;
  } catch {
    // The typed name is still a usable filter when lookup is down.
  }
  return { identifier: name.toLowerCase(), name };
}
