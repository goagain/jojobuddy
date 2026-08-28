const url =
  "https://lifeattiktok.com/referral/tiktok/position/7613184212766607621/detail?token=NTsxNzg1ODE0NjY0OTkxOzczNTU1MTc5ODgwNjg5MDI0MDE7NzY3MDAxNDc5Mzg2OTcyMzk1Nzsy";

const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  },
});
const body = await res.text();
console.log("status", res.status, "len", body.length);

const scripts = [...body.matchAll(/<script[^>]*id="([^"]+)"[^>]*type="text\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
console.log(
  "json scripts",
  scripts.map((m) => ({ id: m[1], len: m[2].length })),
);

for (const m of scripts) {
  try {
    const j = JSON.parse(m[2]);
    console.log("script", m[1], "top keys", Object.keys(j).slice(0, 15));
    const s = JSON.stringify(j);
    if (s.includes("7613184212766607621")) console.log("  contains position id");
    if (/description|qualification|responsibilit/i.test(s)) console.log("  contains job text keys");
  } catch {
    console.log("parse fail", m[1]);
  }
}

const ld = [...body.matchAll(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
console.log("ld count", ld.length);
for (const m of ld) {
  try {
    const j = JSON.parse(m[1]);
    const type = j["@type"] ?? (Array.isArray(j) ? j.map((x) => x["@type"]) : Object.keys(j));
    console.log("ld", type);
  } catch {}
}

for (const key of [
  "job_description",
  "jobDescription",
  "postingTitle",
  "7613184212766607621",
  "minimumQualifications",
  "responsibility",
  "position_detail",
]) {
  console.log(key, body.includes(key));
}

const noScript = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
const text = noScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
console.log("static text len", text.length);
console.log("static preview", text.slice(0, 300));
