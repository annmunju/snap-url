import type { DocumentListItem } from "@/api/types";

export const ALL_CATEGORY_KEY = "all";
export const FALLBACK_CATEGORY_KEY = "uncategorized";

export type CategorySelection = string;

export function applyCategoryFilter(
  items: DocumentListItem[],
  category: CategorySelection,
): DocumentListItem[] {
  if (category === ALL_CATEGORY_KEY) {
    return items;
  }
  return items.filter((item) => item.category_key === category);
}

