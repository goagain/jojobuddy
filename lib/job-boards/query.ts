import { FACET_VALUE_SEPARATOR, type BoardQuery, type StoredBoardListing } from "./types";

export const BOARD_MAX_JOBS = 200;

export function clampMaxJobs(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(BOARD_MAX_JOBS, Math.max(1, Math.floor(value)));
}

/** Apply site facets, role, level, and recency, then keep the newest maxJobs rows. */
export function applyBoardQuery(listings: StoredBoardListing[], query: BoardQuery): StoredBoardListing[] {
  const maxJobs = clampMaxJobs(query.maxJobs);
  let rows = listings;

  for (const [facetId, selected] of Object.entries(query.selections ?? {})) {
    if (!selected?.length) continue;
    const allow = new Set(selected);
    rows = rows.filter((listing) => facetSelected(listing.facets[facetId], allow));
  }

  if (query.role) {
    rows = rows.filter((listing) => listing.roleFamily === query.role);
  }

  if (query.levels?.length) {
    const allow = new Set(query.levels);
    rows = rows.filter((listing) => allow.has(listing.level));
  }

  if (query.postedWithinDays && query.postedWithinDays > 0) {
    const cutoff = Date.now() - query.postedWithinDays * 86_400_000;
    rows = rows.filter((listing) => {
      if (!listing.postedAt) return false;
      const posted = Date.parse(listing.postedAt);
      return !Number.isNaN(posted) && posted >= cutoff;
    });
  }

  rows = [...rows].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  return rows.slice(0, maxJobs);
}

function facetSelected(value: string | undefined, allow: Set<string>) {
  if (!value) return false;
  if (allow.has(value)) return true;
  if (!value.includes(FACET_VALUE_SEPARATOR)) return false;
  return value.split(FACET_VALUE_SEPARATOR).some((part) => allow.has(part));
}
