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
const PLATFORM_MAP: Record<string, string> = {
  disney: "Disney Plus",
  hbo: "Max",
  max: "Max",
  prime: "Amazon Prime Video",
};

/** Map our internal platform keys to JustWatch package names */
export function getJWPlatform(key: string): string {
  return PLATFORM_MAP[key] || key;
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

/** Search JustWatch for a show/movie. Returns the first match's fullPath. */
export async function searchJustWatch(
  title: string,
  country: string,
  lang: string,
): Promise<{ fullPath: string; title: string } | null> {
  const data = await jwQuery(
    `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, first: 3, filter: { searchQuery: $q }) {
        edges { node { content(country: $country, language: $lang) { fullPath title } } }
      }
    }`,
    { q: title, country, lang },
  );
  const edges = data?.data?.popularTitles?.edges;
  if (!edges?.length) return null;
  const content = edges[0]?.node?.content;
  if (!content?.fullPath) return null;
  return { fullPath: content.fullPath, title: content.title };
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
): Promise<{ url: string; title: string; platformName: string } | null> {
  const targetPackage = getJWPlatform(platform);

  const result = await searchJustWatch(query, country, lang);
  if (!result) return null;

  const offers = await getOffers(result.fullPath, country);

  const match = offers.find((o) => o.package?.clearName === targetPackage);
  if (!match) return null;

  // Clean affiliate tracking params from URL
  const url = match.standardWebURL?.replace(/[?&]utm_source=.*$/, "") || "";

  return { url, title: result.title, platformName: targetPackage };
}

/** Get ALL available platforms for a show. */
export async function getAllPlatforms(
  query: string,
  country: string,
  lang: string,
): Promise<Array<{ url: string; platform: string; title: string }>> {
  const result = await searchJustWatch(query, country, lang);
  if (!result) return [];

  const offers = await getOffers(result.fullPath, country);

  return offers.map((o) => ({
    url: o.standardWebURL?.replace(/[?&]utm_source=.*$/, "") || "",
    platform: o.package?.clearName || "",
    title: result.title,
  }));
}
