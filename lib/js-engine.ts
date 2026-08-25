import { JSDOM, VirtualConsole } from "jsdom";

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function walkStrings(value: unknown, bag: string[], depth = 0) {
  if (depth > 8 || bag.length > 80) return;
  if (typeof value === "string") {
    const text = cleanText(value.replace(/<[^>]+>/g, " "));
    if (text.length >= 80) bag.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, bag, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (["jobSummary", "description", "minimumQualifications", "preferredQualifications"].includes(key)) {
        walkStrings(child, bag, depth + 1);
      } else {
        walkStrings(child, bag, depth + 1);
      }
    }
  }
}

function titleFrom(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const rec = value as Record<string, unknown>;
  for (const key of ["postingTitle", "title", "jobTitle", "name"]) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key] as string;
  }
  for (const child of Object.values(rec)) {
    const found = titleFrom(child);
    if (found) return found;
  }
  return "";
}

export async function runPageInJsEngine(
  html: string,
  url: string,
  timeoutMs = 8000,
): Promise<{ title: string; company: string; text: string }> {
  const virtualConsole = new VirtualConsole();
  virtualConsole.forwardTo(console, { jsdomErrors: "none" });

  const dom = new JSDOM(html, {
    url,
    referrer: url,
    contentType: "text/html",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
  });

  await Promise.race([
    new Promise((resolve) => {
      dom.window.addEventListener("load", () => resolve(null));
      setTimeout(resolve, 1200);
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  const win = dom.window as unknown as Record<string, unknown>;
  const bags: string[] = [];
  for (const key of Object.keys(win)) {
    if (key.startsWith("__") || key.toLowerCase().includes("hydrat") || key.toLowerCase().includes("data")) {
      try {
        walkStrings(win[key], bags);
      } catch {
        // ignore unreadable window keys
      }
    }
  }

  const doc = dom.window.document;
  const title =
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    doc.title.replace(/\s*[|\-–].*$/, "").trim();
  const company =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() || "";

  doc.querySelectorAll("script, style, noscript, nav, footer, header, iframe").forEach((el) => el.remove());
  const visible = cleanText(doc.body?.textContent ?? "").slice(0, 20000);
  const hydrated = [...new Set(bags)].sort((a, b) => b.length - a.length).slice(0, 6).join("\n\n");
  const text = (hydrated.length > visible.length * 0.6 ? hydrated : [visible, hydrated].filter(Boolean).join("\n\n")).slice(
    0,
    20000,
  );

  const foundTitle = titleFrom(win["__staticRouterHydrationData"]) || title;
  dom.window.close();

  return {
    title: foundTitle || "Untitled job",
    company,
    text: cleanText(text),
  };
}
