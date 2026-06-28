/**
 * Media resolution — search JustWatch, match platforms, build intents.
 * Pure logic, no Raycast dependency.
 */

import { searchJustWatchFull, JWTitleResult } from "../justwatch";

export interface MediaMatch {
  platform: string;
  url: string;
  intent: string;
  title: string;
  originalTitle?: string;
  year?: number;
  /** True when deep-link failed and we fell back to opening the app home */
  fallback?: boolean;
}

/** JustWatch package clearNames each platform key matches */
const JW_PLATFORMS: Record<string, string[]> = {
  hbo: ["Max", "HBO Max"],
  disney: ["Disney Plus"],
  netflix: ["Netflix"],
  prime: ["Amazon Prime Video", "Amazon Video"],
  stremio: [], // resolved via IMDb ID, not JustWatch offer
};

function platformMatches(plat: string, jwPackage: string): boolean {
  return (JW_PLATFORMS[plat] || []).includes(jwPackage);
}

// ── HBO Max URL resolution ──────────────────────────────────

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");
}

/** Extract HBO Max UUID from a URL (redirect target or search result). */
function extractUuid(url: string): string | null {
  const m = url.match(UUID_RE);
  return m ? m[0] : null;
}

/**
 * Resolve HBO Max show/movie URL to a landing-page UUID (avoids autoplay).
 *
 * Two-level fallback:
 * 1. Direct hbo.com vanity URL → follow redirect → extract UUID from final URL.
 *    Shows: hbo.com/<slug>   Movies: hbo.com/movies/<slug>
 * 2. Startpage web search for "<title> HBO Max" → regex UUID from results.
 *
 * Returns null when both levels fail (caller opens app home).
 */
async function resolveHboUrl(
  titles: string[],
  objectType: "SHOW" | "MOVIE",
): Promise<string | null> {
  for (const title of titles) {
    const slug = slugify(title);
    if (!slug) continue;

    // ── Level 1: direct hbo.com vanity URL ──────────────────
    const path = objectType === "MOVIE" ? `/movies/${slug}` : `/${slug}`;
    const url = `https://www.hbo.com${path}`;
    console.log("[resolve] hbo.com direct:", url, `(from "${title}")`);

    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });

    const uuid = extractUuid(res.url);
    if (uuid && res.url !== url) {
      const hboUrl = `https://play.hbomax.com/show/${uuid}`;
      console.log("[resolve] hbo.com redirect → UUID:", uuid);
      return hboUrl;
    }
    console.log("[resolve] hbo.com HTTP", res.status, `for ${path}`);

    // ── Level 2: Startpage web search ───────────────────────
    const spUrl = await searchStartpage(title);
    if (spUrl) {
      console.log("[resolve] Startpage →", spUrl);
      return spUrl;
    }
  }
  return null;
}

/** Search Startpage for a title's hbomax.com UUID. */
async function searchStartpage(title: string): Promise<string | null> {
  const q = encodeURIComponent(`${title} HBO Max`);
  const res = await fetch(`https://www.startpage.com/sp/search?q=${q}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/hbomax\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/i);
  if (m) return `https://play.hbomax.com/show/${m[1]}`;
  return null;
}

// ── Intent builders ───────────────────────────────────────────

function buildStremioIntent(imdbId: string, objectType: "SHOW" | "MOVIE"): string {
  const type = objectType === "SHOW" ? "series" : "movie";
  return `am start -a android.intent.action.VIEW -d "stremio:///detail/${type}/${imdbId}" com.stremio.one`;
}

function buildHboIntent(url: string): string {
  return `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.hbo.hbonow`;
}

function buildDisneyIntent(url: string): string {
  return `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.disney.disneyplus`;
}

function buildNetflixIntent(url: string): string {
  return `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.netflix.ninja`;
}

function buildPrimeIntent(): string {
  return "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020";
}

function buildIntent(platform: string, url: string): string {
  switch (platform) {
    case "hbo":
      return buildHboIntent(url);
    case "disney":
      return buildDisneyIntent(url);
    case "netflix":
      return buildNetflixIntent(url);
    case "prime":
      return buildPrimeIntent();
    default:
      return buildNetflixIntent(url);
  }
}

function makeMatch(
  platform: string,
  url: string,
  intent: string,
  result: JWTitleResult,
  fallback?: boolean,
): MediaMatch {
  return {
    platform,
    url,
    intent,
    title: result.title,
    originalTitle: result.originalTitle,
    year: result.year,
    fallback,
  };
}

// ── Main entry point ─────────────────────────────────────────

/**
 * Resolve a query to a specific platform's deep-link intent.
 * Platforms are tried in priority order.  Returns the first match.
 *
 * - HBO: resolves show-page URL via hbo.com redirect → Startpage fallback (avoids autoplay).
 *   Falls back to opening the HBO Max app home.
 * - Prime: always opens app home (JustWatch URLs may autoplay).
 * - Stremio: resolved via IMDb ID from JustWatch metadata.
 * - Disney+ / Netflix: deep-linked from JustWatch offer URL.
 *
 * Returns null only when NO platform matched at all.
 */
export async function resolveMedia(
  query: string,
  platforms: string[],
  country: string,
  lang: string,
): Promise<MediaMatch | null> {
  const results = await searchJustWatchFull(query, country, lang);
  const best = results[0];

  console.log("[resolve] query:", query);
  console.log("[resolve] country/lang:", country, lang);
  console.log(
    "[resolve] JustWatch #1:",
    best
      ? JSON.stringify({
          title: best.title,
          originalTitle: best.originalTitle,
          year: best.year,
          offers: (best.offers || []).map((o) => o.platform),
        })
      : "no results",
  );

  if (!best) return null;

  for (const plat of platforms) {
    // Stremio — resolved via IMDb ID, not JustWatch offer
    if (plat === "stremio") {
      if (best.imdbId) {
        console.log("[resolve] platform Stremio — IMDb:", best.imdbId);
        return makeMatch("stremio", "", buildStremioIntent(best.imdbId, best.objectType), best);
      }
      continue;
    }

    const match = (best.offers || []).find((o) => platformMatches(plat, o.platform));

    // HBO Max: resolve show-page URL via direct redirect → Startpage fallback.
    // Deliberately avoids JustWatch video/watch links (they autoplay).
    if (plat === "hbo") {
      if (!match?.url) continue; // not on HBO Max, try next platform
      const hboUrl = await resolveHboUrl(
        [best.originalTitle, best.title, query].filter(Boolean) as string[],
        best.objectType,
      );
      if (hboUrl) {
        console.log("[resolve] platform HBO — resolved:", hboUrl);
        return makeMatch("hbo", hboUrl, buildHboIntent(hboUrl), best);
      }
      // both levels failed — open app home
      console.log("[resolve] platform HBO — not found, app home");
      return makeMatch("hbo", "", "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020", best, true);
    }

    // Prime Video: open app home (detail URLs may autoplay)
    if (plat === "prime") {
      if (!match?.url) continue;
      console.log("[resolve] platform Prime — app home");
      return makeMatch("prime", "", buildPrimeIntent(), best);
    }

    // Disney+ / Netflix: deep-link from JustWatch offer URL
    if (match?.url) {
      console.log("[resolve] platform", plat, "— deep link:", match.url);
      return makeMatch(plat, match.url, buildIntent(plat, match.url), best);
    }
  }

  console.log("[resolve] no platform matched");
  return null;
}

/** Map internal platform key to human-readable display name */
export function platformDisplayName(platform: string): string {
  const names: Record<string, string> = {
    hbo: "HBO Max",
    disney: "Disney+",
    netflix: "Netflix",
    prime: "Prime Video",
    stremio: "Stremio",
  };
  return names[platform] || platform;
}
