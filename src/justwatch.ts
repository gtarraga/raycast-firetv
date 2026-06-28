/**
 * JustWatch GraphQL API helper — free, no auth, region-aware.
 * Resolves show/movie names to streaming deep-link URLs for any platform.
 */

const JW_API = "https://apis.justwatch.com/graphql";

export interface JWTitleResult {
  id: string;
  objectType: "SHOW" | "MOVIE";
  imdbId?: string;
  tmdbId?: string;
  title: string;
  year?: number;
  fullPath: string;
  runtime?: number;
  genres?: string[];
  posterUrl?: string;
}

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

const JW_ID_RE = /^ts\d+$/i;

export function isJWId(text: string): boolean {
  return JW_ID_RE.test(text.trim());
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

/** Search JustWatch — returns ranked results with IMDb IDs, posters, etc. */
export async function searchJustWatchFull(
  query: string,
  country: string,
  lang: string,
): Promise<JWTitleResult[]> {
  const data = await jwQuery(
    `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, first: 10, filter: { searchQuery: $q }) {
        edges {
          node {
            id
            objectType
            content(country: $country, language: $lang) {
              title
              fullPath
              originalReleaseYear
              runtime
              shortDescription
              externalIds { imdbId tmdbId }
              genres { shortName }
              posterUrl(profile: S718, format: JPG)
            }
          }
        }
      }
    }`,
    { q: query, country, lang },
  );
  const edges: Array<{ node: JWTitleResult & { content: Record<string, unknown> } }> =
    data?.data?.popularTitles?.edges || [];

  // Score and rank
  const q = query.toLowerCase();
  const scored = edges.map((e) => {
    const title = (e.node.content as Record<string, unknown>).title as string;
    const t = title?.toLowerCase() || "";
    let score = 0;
    if (t === q) score = 100;
    else if (t.startsWith(q)) score = 50;
    else if (t.includes(q)) score = 25;
    return { ...e.node, score };
  });
  scored.sort((a, b) => b.score - a.score);

  type RawContent = { title: string; fullPath: string; originalReleaseYear?: number; runtime?: number; externalIds?: { imdbId?: string; tmdbId?: string }; genres?: Array<{ shortName: string }>; posterUrl?: string };

  return scored.map((e) => {
    const c = e.content as unknown as RawContent;
    return {
      id: e.id,
      objectType: e.objectType,
      imdbId: c.externalIds?.imdbId,
      tmdbId: c.externalIds?.tmdbId,
      title: c.title,
      year: c.originalReleaseYear,
      fullPath: c.fullPath,
      runtime: c.runtime,
      genres: c.genres?.map((g) => g.shortName),
      posterUrl: c.posterUrl,
    };
  });
}

/** Get a single title by JustWatch node ID (e.g. ts20995). */
export async function getTitleById(
  nodeId: string,
  country: string,
  lang: string,
): Promise<JWTitleResult | null> {
  const data = await jwQuery(
    `query GetTitle($nodeId: ID!, $country: Country!, $lang: Language!) {
      node(id: $nodeId) {
        ... on MovieOrShow {
          id
          objectType
          content(country: $country, language: $lang) {
            title
            fullPath
            originalReleaseYear
            runtime
            externalIds { imdbId tmdbId }
            genres { shortName }
            posterUrl(profile: S718, format: JPG)
          }
        }
      }
    }`,
    { nodeId, country, lang },
  );
  const node = data?.data?.node;
  if (!node) return null;
  const c = node.content as Record<string, unknown>;
  const extIds = c.externalIds as Record<string, string> | undefined;
  const genres = c.genres as Array<{ shortName: string }> | undefined;
  return {
    id: node.id,
    objectType: node.objectType,
    imdbId: extIds?.imdbId,
    tmdbId: extIds?.tmdbId,
    title: c.title as string,
    year: c.originalReleaseYear as number | undefined,
    fullPath: c.fullPath as string,
    runtime: c.runtime as number | undefined,
    genres: genres?.map((g) => g.shortName),
    posterUrl: c.posterUrl as string | undefined,
  };
}

/** Search JustWatch for a show/movie. Returns best title match with year. */
export async function searchJustWatch(
  query: string,
  country: string,
  lang: string,
): Promise<{ fullPath: string; title: string; year?: number } | null> {
  const results = await searchJustWatchFull(query, country, lang);
  if (!results.length) return null;
  const best = results[0];
  return { fullPath: best.fullPath, title: best.title, year: best.year };
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
