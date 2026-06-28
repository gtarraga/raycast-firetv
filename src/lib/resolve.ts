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

// ── HBO scraper ──────────────────────────────────────────────

/** Scrape hbo.com for a show-page UUID. Returns null if not found. */
async function resolveHboUrl(titles: string[]): Promise<string | null> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };

  for (const title of titles) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/g, "");
    if (!slug) continue;

    // Try both /content/<slug> (shows) and /content/movies/<slug> (movies)
    for (const contentPath of [`/content/${slug}`, `/content/movies/${slug}`]) {
      const url = `https://www.hbo.com${contentPath}`;
      console.log("[resolve] hbo.com scrape:", url, `(from title "${title}")`);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.log("[resolve] hbo.com HTTP", res.status, `for ${contentPath}`);
        continue;
      }
      const html = await res.text();

      // Find seriesId that appears near seasonNumber — this is the page's own show.
      // HTML has escaped JSON: `\"seriesId\"` etc.
      // Strategy: find UUIDs near seriesId, check if seasonNumber nearby.
      const sidGlobal = /seriesId[^a-f0-9]*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g;
      let sidExec: RegExpExecArray | null;
      while ((sidExec = sidGlobal.exec(html)) !== null) {
        const sid = sidExec[1];
        const after = html.slice(sidExec.index, sidExec.index + 2000);
        if (/seasonNumber\D*\d+/.test(after)) {
          const hboUrl = `https://play.hbomax.com/show/${sid}`;
          console.log("[resolve] hbo.com found UUID (seriesId+episode):", hboUrl);
          return hboUrl;
        }
      }

      // New format: max.com/shows/<slug>/<uuid> or max.com/movies/<slug>/<uuid>
      const newMatch = html.match(
        /max\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
      );
      if (newMatch) {
        const hboUrl = `https://play.hbomax.com/show/${newMatch[1]}`;
        console.log("[resolve] hbo.com found UUID (max.com):", hboUrl);
        return hboUrl;
      }

      // Old format: play.hbomax.com/show/<uuid> or play.hbomax.com/shows/<uuid>
      const oldMatch = html.match(
        /play\.hbomax\.com\/shows?\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
      );
      if (oldMatch) {
        const hboUrl = `https://play.hbomax.com/show/${oldMatch[1]}`;
        console.log("[resolve] hbo.com found UUID (play.hbomax):", hboUrl);
        return hboUrl;
      }
    } // end content path loop

    console.log("[resolve] hbo.com no UUID in HTML for", slug);
  }
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

    // HBO Max: scrape hbo.com for show-page URL (JustWatch gives video/watch links)
    if (plat === "hbo") {
      if (!match?.url) continue; // not on HBO Max, try next platform
      const hboUrl = await resolveHboUrl([best.originalTitle, best.title, query].filter(Boolean) as string[]);
      if (hboUrl) {
        console.log("[resolve] platform HBO — scraped URL:", hboUrl);
        return makeMatch("hbo", hboUrl, buildHboIntent(hboUrl), best);
      }
      // scraper failed — open app home (don't fall back to video URL)
      console.log("[resolve] platform HBO — scraper failed, fallback to app home");
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
