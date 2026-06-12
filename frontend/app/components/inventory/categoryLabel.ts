import type { Category } from "@/lib/inventory";

/**
 * Human label for a category, showing one level of nesting as "Parent · Child"
 * so a flat <select> still communicates the localized grouping structure.
 */
export function categoryLabel(category: Category, all: Category[]): string {
  if (!category.parentId) return category.name;
  const parent = all.find((c) => c.id === category.parentId);
  return parent ? `${parent.name} · ${category.name}` : category.name;
}
