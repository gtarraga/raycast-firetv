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

// ── HBO scraper ──────────────────────────────────────────────

/** Scrape hbo.com for a show-page UUID. Returns null if not found. */
// ── Intent builders ───────────────────────────────────────────

function buildStremioIntent(imdbId: string, objectType: "SHOW" | "MOVIE"): string {
  const type = objectType === "SHOW" ? "series" : "movie";
  return `am start -a android.intent.action.VIEW -d "stremio:///detail/${type}/${imdbId}" com.stremio.one`;
}

function buildHboIntent(url: string): string {
  return `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.hbo.hbonow`;
}

/** Build a simple hbo.com URL from title slug — no UUID needed if the Max app handles these. */
function buildHboSimpleUrl(title: string, objectType?: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/g, "");
  const prefix = objectType === "MOVIE" ? "/movies" : "";
  return `https://www.hbo.com${prefix}/${slug}`;
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

function makeMatch(platform: string, url: string, intent: string, result: JWTitleResult): MediaMatch {
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
 * - HBO: scrapes hbo.com for show landing page (avoids autoplay).
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

    // HBO Max: use simple hbo.com URL — Max app on Fire TV handles these directly.
    //   Shows: https://www.hbo.com/<slug>
    //   Movies: https://www.hbo.com/movies/<slug>
    if (plat === "hbo") {
      if (!match?.url) continue; // not on HBO Max, try next platform
      const hboTitle = best.originalTitle || best.title;
      const hboUrl = buildHboSimpleUrl(hboTitle, best.objectType);
      console.log("[resolve] platform HBO — simple URL:", hboUrl);
      return makeMatch("hbo", hboUrl, buildHboIntent(hboUrl), best);
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
