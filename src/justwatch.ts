/**
 * JustWatch GraphQL API helper — free, no auth, region-aware.
 * Resolves show/movie names to streaming deep-link URLs for any platform.
 */

const JW_API = "https://apis.justwatch.com/graphql";

interface JustWatchOffer {
  standardWebURL: string;
  package: { clearName: string };
}

/** Map our internal platform keys to JustWatch package names */
const PLATFORM_MAP: Record<string, string[]> = {
  disney: ["Disney Plus"],
  hbo: ["Max", "HBO Max"],
  max: ["Max", "HBO Max"],
  prime: ["Amazon Prime Video", "Amazon Video"],
};

/** Map our internal platform keys to JustWatch package names */
export function getJWPlatforms(key: string): string[] {
  return PLATFORM_MAP[key] || [key];
}

async function jwQuery(query: string, variables: Record<string, unknown>) {
  const res = await fetch(JW_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`JustWatch HTTP ${res.status}`);
  return res.json();
}

/** Search JustWatch for a show/movie. Returns best title match with year. */
export async function searchJustWatch(
  query: string,
  country: string,
  lang: string,
): Promise<{ fullPath: string; title: string; year?: number } | null> {
  const data = await jwQuery(
    `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, first: 10, filter: { searchQuery: $q }) {
        edges { node { content(country: $country, language: $lang) { fullPath title originalReleaseYear } } }
      }
    }`,
    { q: query, country, lang },
  );
  const edges: Array<{ node: { content: { fullPath: string; title: string; originalReleaseYear?: number } } }> =
    data?.data?.popularTitles?.edges || [];
  if (!edges.length) return null;

  // Pick best match: exact title > starts with > contains
  const q = query.toLowerCase();
  const scored = edges.map((e) => {
    const t = e.node.content.title.toLowerCase();
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 50;
    else if (t.includes(q)) score = 25;
    return { ...e.node.content, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best?.fullPath) return null;
  return { fullPath: best.fullPath, title: best.title, year: best.originalReleaseYear };
}

/** Get all streaming offers for a JustWatch path. */
export async function getOffers(
  fullPath: string,
  country: string,
): Promise<JustWatchOffer[]> {
  const data = await jwQuery(
    `query Offers($path: String!, $country: Country!) {
      urlV2(fullPath: $path) {
        id node {
          ... on Show { offers(country: $country, platform: WEB) { standardWebURL package { clearName } } }
          ... on Movie { offers(country: $country, platform: WEB) { standardWebURL package { clearName } } }
        }
      }
    }`,
    { path: fullPath, country },
  );
  return data?.data?.urlV2?.node?.offers || [];
}

/** Resolve a show to a streaming URL on a specific platform. */
export async function resolveShow(
  query: string,
  platform: string,
  country: string,
  lang: string,
): Promise<{ url: string; title: string; year?: number; platformName: string } | null> {
  const targetPackages = getJWPlatforms(platform);

  const result = await searchJustWatch(query, country, lang);
  if (!result) return null;

  const offers = await getOffers(result.fullPath, country);

  const match = offers.find((o) => targetPackages.includes(o.package?.clearName || ""));
  if (!match) return null;

  // Clean affiliate tracking params from URL
  const url = match.standardWebURL?.replace(/[?&]utm_source=.*$/, "") || "";

  return { url, title: result.title, year: result.year, platformName: match.package?.clearName || "" };
}

/** Get ALL available platforms for a show. */
export async function getAllPlatforms(
  query: string,
  country: string,
  lang: string,
): Promise<Array<{ url: string; platform: string; title: string; year?: number }>> {
  const result = await searchJustWatch(query, country, lang);
  if (!result) return [];

  const offers = await getOffers(result.fullPath, country);

  return offers.map((o) => ({
    url: o.standardWebURL?.replace(/[?&]utm_source=.*$/, "") || "",
    platform: o.package?.clearName || "",
    title: result.title,
    year: result.year,
  }));
}
