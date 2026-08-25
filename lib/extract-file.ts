import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_BYTES = 8 * 1024 * 1024;

function extension(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export async function extractTextFromUpload(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<string> {
  if (input.buffer.byteLength > MAX_BYTES) {
    throw new Error("File exceeds 8MB — compress it or upload as text");
  }

  const ext = extension(input.filename);
  const mime = input.mimeType.toLowerCase();

  if (ext === "doc") {
    throw new Error("Legacy .doc is not supported — save as .docx / PDF / Markdown");
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    return result.value.trim();
  }

  if (ext === "pdf" || mime.includes("pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(input.buffer));
    const extracted = await extractText(pdf, { mergePages: true });
    const text = extracted.text;
    return (Array.isArray(text) ? text.join("\n\n") : text).trim();
  }

  if (
    ["md", "markdown", "txt", "text", "json"].includes(ext) ||
    mime.startsWith("text/") ||
    mime.includes("markdown") ||
    mime.includes("json")
  ) {
    return input.buffer.toString("utf8").trim();
  }

  throw new Error("Only Word (.docx), PDF, Markdown, and plain text are supported");
}
