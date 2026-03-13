import type { DocumentListItem } from "@/api/types";

const TITLE_PREFIX_REGEX = /^\s*title:\s*/i;
const JINA_MIRROR_REGEX = /jina markdown mirror from/i;
const URL_META_REGEX = /^\s*\[url 메타\]\s*/i;

export function cleanTitle(raw: string): string {
  return raw.replace(TITLE_PREFIX_REGEX, "").replace(URL_META_REGEX, "").trim();
}

export function cleanSummary(raw: string): string {
  return raw.replace(/\r/g, "").trim();
}

function extractCoreLineFromSummary(summary: string): string | null {
  const lines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const firstSectionIndex = lines.findIndex((line) => /^1[\)\.\-:]/.test(line));
  if (firstSectionIndex < 0) {
    return null;
  }

  const firstLine = lines[firstSectionIndex];
  const inline = firstLine
    .replace(/^1[\)\.\-:]\s*/u, "")
    .replace(/^한\s*줄\s*핵심\s*[:：-]?\s*/u, "")
    .trim();
  if (inline) {
    return inline;
  }

  const nextLine = lines[firstSectionIndex + 1];
  if (!nextLine || /^\d[\)\.\-:]/.test(nextLine)) {
    return null;
  }
  return nextLine.replace(/^[-•]\s*/u, "").trim() || null;
}

export function getListDescription(item: DocumentListItem): string {
  const description = item.description?.trim() ?? "";
  if (!description || JINA_MIRROR_REGEX.test(description)) {
    const summary = cleanSummary(item.summary);
    return extractCoreLineFromSummary(summary) ?? summary;
  }
  return description;
}
