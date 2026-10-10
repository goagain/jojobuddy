export type ForumAccount = {
  username: string;
  credits?: number;
  rice?: number;
};

export function parseForumAccount(payload: unknown): ForumAccount | null {
  const user = unwrapUser(payload);
  if (!user || typeof user !== "object") return null;
  const row = user as Record<string, unknown>;
  const username = typeof row.username === "string" ? row.username.trim() : "";
  if (!username) return null;
  const count =
    row.user_count && typeof row.user_count === "object" ? (row.user_count as Record<string, unknown>) : {};
  return {
    username,
    credits: readNumber(row.credits) ?? readNumber(count.credits),
    rice: readNumber(count.extcredits1) ?? readNumber(row.extcredits1),
  };
}

function unwrapUser(payload: unknown): unknown {
  const batches = Array.isArray(payload) ? payload : [payload];
  for (const batch of batches) {
    if (!batch || typeof batch !== "object") continue;
    const json = (batch as { result?: { data?: { json?: unknown } } }).result?.data?.json;
    if (json !== undefined) return json;
  }
  return null;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
