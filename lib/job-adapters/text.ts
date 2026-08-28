import * as cheerio from "cheerio";

export function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string) {
  const $ = cheerio.load(`<div>${html}</div>`);
  $("script, style").remove();
  return cleanText($.root().text());
}
