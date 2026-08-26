export function htmlJsonError(label: string, status: number, body: string): Error {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 120);
  if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
    return new Error(
      `${label} returned an HTML page (${status}), not JSON. Check provider base URL, API key, and that the worker can reach the API.`,
    );
  }
  return new Error(`${label} returned invalid JSON (${status}): ${snippet}`);
}

export async function readResponseJson<T = Record<string, unknown>>(
  response: Response,
  label = "Server",
): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`${label} returned an empty body (${response.status})`);
  }
  if (body.trimStart().startsWith("<")) {
    throw htmlJsonError(label, response.status, body);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw htmlJsonError(label, response.status, body);
  }
}

export async function fetchJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  label = "Server",
): Promise<{ response: Response; data: T }> {
  const response = await fetch(url, init);
  const data = await readResponseJson<T>(response, label);
  return { response, data };
}
