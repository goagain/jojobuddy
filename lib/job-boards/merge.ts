import type { StoredBoardListing } from "./types";

/** Keep listings we already stored. Only ids we have never pulled are appended. */
export function mergeBoardListings(existing: StoredBoardListing[], incoming: StoredBoardListing[]) {
  const known = new Set(existing.map((listing) => listing.id));
  const added = incoming.filter((listing) => !known.has(listing.id));
  return {
    merged: [...existing, ...added],
    added,
  };
}
