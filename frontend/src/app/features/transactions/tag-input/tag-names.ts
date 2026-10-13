export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-ES');
}

export function addTagName(tags: readonly string[], raw: string): string[] {
  const name = normalizeTagName(raw);
  if (name === '' || name.length > MAX_TAG_LENGTH || tags.length >= MAX_TAGS) {
    return [...tags];
  }
  return tags.includes(name) ? [...tags] : [...tags, name];
}
