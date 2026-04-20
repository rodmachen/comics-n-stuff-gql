export interface SlugInput {
  name: string;
  yearBegan: number;
  id?: number;
}

export function seriesSlug({ name, yearBegan, id }: SlugInput): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  const slug = `${base}-${yearBegan}`;
  return id !== undefined ? `${slug}-${id}` : slug;
}
