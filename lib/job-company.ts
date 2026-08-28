/** Strip legal suffixes so "Snap Inc." and "Snap" normalize to the same brand. */
const LEGAL_SUFFIX =
  /(?:[,.]\s*|\s+)(Inc\.?|Incorporated|LLC|L\.L\.C\.|Ltd\.?|Limited|Corp\.?|Corporation|Co\.?|Company|PLC|GmbH|AG|S\.A\.|B\.V\.|株式会社|有限公司|有限责任公司)$/iu;

export function normalizeCompanyName(raw: string): string {
  let name = raw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!name) return "";
  for (let i = 0; i < 4; i += 1) {
    const next = name.replace(LEGAL_SUFFIX, "").trim();
    if (next === name) break;
    name = next;
  }
  return name;
}

export function companyNamesEquivalent(a: string, b: string): boolean {
  const left = normalizeCompanyName(a).toLowerCase();
  const right = normalizeCompanyName(b).toLowerCase();
  if (!left || !right) return left === right;
  return left === right;
}
