export interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
}

export interface ServiceId {
  id: string;
  /** Raw value from Wikidata claim — used to build the deep-link URL */
  value: string;
}

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

export async function searchWikidata(query: string, limit = 8): Promise<WikidataSearchResult[]> {
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { search?: Array<{ id: string; label: string; description?: string }> };
  return (data.search || []).map((r) => ({
    id: r.id,
    label: r.label,
    description: r.description,
  }));
}

/**
 * Batch-fetch Wikidata claims and extract a single property value per entity.
 * Returns a Map of entity Q-ID → first value of `propertyId`.
 */
export async function getClaimValues(entityIds: string[], propertyId: string): Promise<Map<string, string>> {
  if (entityIds.length === 0) return new Map();
  const ids = entityIds.join("|");
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${ids}&props=claims&format=json`;
  const res = await fetch(url);
  if (!res.ok) return new Map();
  const data = (await res.json()) as {
    entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value: string } } }>> }>;
  };
  const result = new Map<string, string>();

  for (const [entityId, entity] of Object.entries(data.entities || {})) {
    const claims = entity.claims || {};
    const claimList = claims[propertyId];
    if (claimList?.length) {
      const val = claimList[0]?.mainsnak?.datavalue?.value;
      if (val) result.set(entityId, val);
    }
  }

  return result;
}

/**
 * Try multiple Wikidata properties in priority order; return the first match per entity.
 */
export async function getFirstClaimValue(entityIds: string[], propertyIds: string[]): Promise<Map<string, ServiceId>> {
  const result = new Map<string, ServiceId>();
  const remaining = new Set(entityIds);

  for (const prop of propertyIds) {
    if (remaining.size === 0) break;
    const values = await getClaimValues([...remaining], prop);
    for (const [qid, value] of values) {
      result.set(qid, { id: prop, value });
      remaining.delete(qid);
    }
  }

  return result;
}
