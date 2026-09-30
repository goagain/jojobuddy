import { toStoredListing } from "./classify";
import { applyBoardQuery } from "./query";
import type { BoardListing, BoardQuery, StoredBoardListing } from "./types";

export function prepareListings(listings: BoardListing[], query: BoardQuery): StoredBoardListing[] {
  return applyBoardQuery(listings.map(toStoredListing), query);
}
