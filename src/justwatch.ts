/**
 * JustWatch GraphQL API helper — free, no auth, region-aware.
 * Pure data fetching.  Platform matching and intent building live in lib/resolve.ts.
 */

const JW_API = "https://apis.justwatch.com/graphql";

export interface JWTitleResult {
  id: string;
  objectType: "SHOW" | "MOVIE";
  imdbId?: string;
  tmdbId?: string;
  title: string;
  originalTitle?: string;
  year?: number;
  fullPath: string;
  runtime?: number;
  genres?: string[];
  posterUrl?: string;
  offers?: Array<{
    url: string;
    platform: string;
    monetizationType: string;
  }>;
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

/** Search JustWatch — returns ranked results with IMDb IDs, offers, posters, etc. */
export async function searchJustWatchFull(query: string, country: string, lang: string): Promise<JWTitleResult[]> {
  const data = await jwQuery(
    `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, first: 10, filter: { searchQuery: $q }) {
        edges {
          node {
            id
            objectType
            content(country: $country, language: $lang) {
              title
              originalTitle
              fullPath
              originalReleaseYear
              runtime
              externalIds { imdbId tmdbId }
              genres { shortName }
              posterUrl(profile: S718, format: JPG)
            }
            offers(country: $country, platform: WEB) {
              standardWebURL
              monetizationType
              package { clearName }
            }
          }
        }
      }
    }`,
    { q: query, country, lang },
  );
  type RawEdge = {
    node: {
      id: string;
      objectType: "SHOW" | "MOVIE";
      content: {
        title: string;
        originalTitle?: string;
        fullPath: string;
        originalReleaseYear?: number;
        runtime?: number;
        externalIds?: { imdbId?: string; tmdbId?: string };
        genres?: Array<{ shortName: string }>;
        posterUrl?: string;
      };
      offers?: Array<{
        standardWebURL: string;
        monetizationType: string;
        package: { clearName: string };
      }>;
    };
  };
  const edges: RawEdge[] = data?.data?.popularTitles?.edges || [];

  return edges.map((e) => {
    const c = e.node.content;
    return {
      id: e.node.id,
      objectType: e.node.objectType,
      imdbId: c.externalIds?.imdbId,
      tmdbId: c.externalIds?.tmdbId,
      title: c.title,
      originalTitle: c.originalTitle,
      year: c.originalReleaseYear,
      fullPath: c.fullPath,
      runtime: c.runtime,
      genres: c.genres?.map((g) => g.shortName),
      posterUrl: c.posterUrl,
      offers: (e.node.offers || []).map((o) => ({
        url: o.standardWebURL?.replace(/[?&]utm_source=.*$/, "") || "",
        platform: o.package?.clearName || "",
        monetizationType: o.monetizationType,
      })),
    };
  });
}

/** Get a single title by JustWatch node ID (e.g. ts20995). */
export async function getTitleById(nodeId: string, country: string, lang: string): Promise<JWTitleResult | null> {
  const data = await jwQuery(
    `query GetTitle($nodeId: ID!, $country: Country!, $lang: Language!) {
      node(id: $nodeId) {
        ... on MovieOrShow {
          id
          objectType
          content(country: $country, language: $lang) {
            title
            originalTitle
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
    originalTitle: c.originalTitle as string | undefined,
    year: c.originalReleaseYear as number | undefined,
    fullPath: c.fullPath as string,
    runtime: c.runtime as number | undefined,
    genres: genres?.map((g) => g.shortName),
    posterUrl: c.posterUrl as string | undefined,
  };
}
