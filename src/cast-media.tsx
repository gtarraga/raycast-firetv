import { showToast, Toast, Clipboard, LaunchProps } from "@raycast/api";
import { wakeAndCast, prefs } from "./hass";
import { getAllPlatforms } from "./justwatch";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const STORAGE_KEY = "show";

/**
 * Resolve an HBO Max show-page URL by scraping hbo.com.
 *
 * Why not use JustWatch URLs directly?
 *   JustWatch `standardWebURL` for HBO Max gives video/watch pages that autoplay
 *   (e.g. S1E1) — user can't pick episode.  We want the show's landing page.
 *
 * Flow:
 *   1. Convert title to slug: lowercase, replace non-alphanumeric with dashes
 *   2. Fetch https://www.hbo.com/content/<slug>  (needs real User-Agent)
 *   3. Parse HTML for play.hbomax.com/show/<UUID> and extract the UUID
 *   4. Reconstruct clean show-page URL from UUID
 *
 * Falls back to null if hbo.com doesn't know the title (scraper returns 404
 * or the page doesn't embed a play.hbomax.com link).  Caller then opens the
 * HBO Max app home instead of deep-linking.
 */
async function resolveHboUrl(titles: string[]): Promise<string | null> {
  for (const title of titles) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/g, "");
    if (!slug) continue;
    const res = await fetch(`https://www.hbo.com/content/${slug}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) continue;
    const html = await res.text();
    const m = html.match(/play\.hbomax\.com\/show\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (m) return `https://play.hbomax.com/show/${m[1]}`;
  }
  return null;
}

interface PlatformDef {
  jwNames: string[];
  intent: (url: string) => string;
  fallbackIntent: string;
}

const PLATFORM_DEFS: Record<string, PlatformDef> = {
  hbo: {
    jwNames: ["Max", "HBO Max"],
    // HBO URLs come from resolveHboUrl() (hbo.com scraper → show page),
    // NOT from JustWatch `standardWebURL` directly.  JustWatch gives
    // video/watch links that autoplay S1E1; we want the show landing page
    // so user can choose what to watch.
    intent: (url) => `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.hbo.hbonow`,
    fallbackIntent: "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020",
  },
  disney: {
    jwNames: ["Disney Plus"],
    intent: (url) =>
      `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.disney.disneyplus`,
    fallbackIntent: "am start -n com.disney.disneyplus/com.bamtechmedia.dominguez.main.MainActivity -f 0x10000020",
  },
  netflix: {
    jwNames: ["Netflix"],
    intent: (url) => `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.netflix.ninja`,
    fallbackIntent:
      'am start -a android.intent.action.VIEW -d "https://www.netflix.com" -f 0x10000020 -e source 30 com.netflix.ninja',
  },
  prime: {
    jwNames: ["Amazon Prime Video", "Amazon Video"],
    // JustWatch Prime URLs are /detail?gti=... — may autoplay. Open app home.
    intent: () => "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020",
    fallbackIntent: "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020",
  },
  stremio: {
    jwNames: [], // Stremio resolved via JustWatch IMDb ID
    intent: (url) => `am start -a android.intent.action.VIEW -d "${url}" com.stremio.one`,
    fallbackIntent: "",
  },
};

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const clip = await Clipboard.readText();
    if (clip) input = clip.trim();
  }

  if (!input) {
    const last = await getLastQuery(STORAGE_KEY);
    if (last) input = last;
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter a show or movie name");
    return;
  }

  // YouTube URL → SmartTube (unchanged)
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(input)) {
    const toast = await showToast(Toast.Style.Animated, "Casting YouTube to SmartTube…");
    try {
      await wakeAndCast(toast, `am start -a android.intent.action.VIEW -d "${input}" org.smarttube.stable`);
      await setLastQuery(STORAGE_KEY, input);
      toast.style = Toast.Style.Success;
      toast.title = "▶ YouTube";
      toast.message = input.length > 70 ? input.slice(0, 67) + "…" : input;
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed";
      toast.message = err instanceof Error ? err.message : String(err);
    }
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}"…`);

  try {
    const p = prefs();
    const country = p.countryCode || "ES";
    const lang = country.toLowerCase();

    const priorityStr = p.platformPriority || "hbo,disney,netflix,stremio,prime";
    const priority = priorityStr.split(",").map((s) => s.trim().toLowerCase());

    const { offers: allPlatforms, meta } = await getAllPlatforms(input, country, lang);

    for (const platKey of priority) {
      const def = PLATFORM_DEFS[platKey];
      if (!def) continue;

      // Stremio — resolve IMDb ID from already-fetched JustWatch meta
      if (platKey === "stremio") {
        if (meta?.imdbId) {
          const type = meta.objectType === "SHOW" ? "series" : "movie";
          const intent = `am start -a android.intent.action.VIEW -d "stremio:///detail/${type}/${meta.imdbId}" com.stremio.one`;
          toast.title = `Casting via Stremio…`;
          toast.message = input;
          await wakeAndCast(toast, intent);
          await setLastQuery(STORAGE_KEY, input);
          toast.style = Toast.Style.Success;
          toast.title = `🎬 ${input}`;
          toast.message = "Stremio";
          return;
        }
        continue;
      }

      const match = allPlatforms.find((o) => def.jwNames.includes(o.platform));
      if (!match?.url) continue;

      const showName = match.title || input;
      const titleYear = match.year ? `${showName} · ${match.year}` : showName;

      // HBO Max: scrape hbo.com for show-page URL (JustWatch gives
      // video/watch links that autoplay — we want the landing page).
      if (platKey === "hbo") {
        const hboUrl = await resolveHboUrl([showName, input]);
        if (hboUrl) {
          toast.title = `Casting ${showName}…`;
          toast.message = match.platform;
          await wakeAndCast(toast, def.intent(hboUrl));
          await setLastQuery(STORAGE_KEY, input);
          toast.style = Toast.Style.Success;
          toast.title = `🎬 ${showName}`;
          toast.message = titleYear;
          return;
        }
        // hbo.com scraper didn't find the title — open HBO Max app home
        // (don't fall back to JustWatch video URL; it would autoplay)
        toast.title = `Opening HBO Max…`;
        toast.message = titleYear;
        await wakeAndCast(toast, def.fallbackIntent);
        await setLastQuery(STORAGE_KEY, input);
        toast.style = Toast.Style.Success;
        toast.title = `🎬 ${showName}`;
        toast.message = titleYear;
        return;
      }

      // Prime — open app home (URLs may autoplay)
      if (platKey === "prime") {
        toast.title = `Opening Prime Video…`;
        toast.message = titleYear;
        await wakeAndCast(toast, def.intent(""));
        await setLastQuery(STORAGE_KEY, input);
        toast.style = Toast.Style.Success;
        toast.title = `🎬 ${showName}`;
        toast.message = titleYear;
        return;
      }

      // Disney+ & Netflix — deep link to show page
      toast.title = `Casting ${showName}…`;
      toast.message = match.platform;
      await wakeAndCast(toast, def.intent(match.url));
      await setLastQuery(STORAGE_KEY, input);
      toast.style = Toast.Style.Success;
      toast.title = `🎬 ${showName}`;
      toast.message = titleYear;
      return;
    }

    // Nothing found — open Netflix
    toast.title = "Not found";
    toast.message = `"${input}" not on any platform`;
    await wakeAndCast(
      toast,
      'am start -a android.intent.action.VIEW -d "https://www.netflix.com" -f 0x10000020 -e source 30 com.netflix.ninja',
    );
    toast.style = Toast.Style.Success;
    toast.title = "🎬 Netflix";
    toast.message = "App opened";
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}
