import { lruSet } from "@/lib/cache";
import { get } from "./tmdb-client";

const COMPANY_CACHE_MAX = 500;
const companyCache = new Map<string, number | null>();
const companyInflight = new Map<string, Promise<number | null>>();

export async function tmdbCompanyIdByName(key: string, name: string): Promise<number | null> {
  if (!key || !name) return null;
  const k = name.trim().toLowerCase();
  if (companyCache.has(k)) return companyCache.get(k) ?? null;
  if (companyInflight.has(k)) return companyInflight.get(k)!;
  const p = (async () => {
    const data = await get<{ results?: Array<{ id: number; name: string }> }>(key, "search/company", {
      query: name,
    });
    const results = data?.results ?? [];
    const exact = results.find((r) => r.name.trim().toLowerCase() === k);
    const id = exact?.id ?? results[0]?.id ?? null;
    lruSet(companyCache, k, id, COMPANY_CACHE_MAX);
    return id;
  })().finally(() => companyInflight.delete(k));
  companyInflight.set(k, p);
  return p;
}
