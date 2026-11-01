export interface TagCount {
  name: string;
  count: number;
}

export function normalizeTag(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

export function tagKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sameTag(a: string, b: string): boolean {
  return tagKey(a) === tagKey(b);
}

export function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag == null) continue;
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function matchesTags(itemTags: string[], selected: string[]): boolean {
  return selected.every((tag) => itemTags.some((item) => sameTag(item, tag)));
}

export function countTags(list: { tags: string[] }[]): TagCount[] {
  const map = new Map<string, TagCount>();
  for (const item of list) {
    const seen = new Set<string>();
    for (const raw of item.tags) {
      const tag = normalizeTag(raw);
      if (tag == null) continue;
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = map.get(key);
      if (entry != null) entry.count += 1;
      else map.set(key, { name: tag, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || tagKey(a.name).localeCompare(tagKey(b.name))
  );
}
