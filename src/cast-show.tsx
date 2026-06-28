import { showToast, Toast, Clipboard, LaunchProps } from "@raycast/api";
import { wakeAndCast, prefs } from "./hass";
import { getAllPlatforms } from "./justwatch";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const STORAGE_KEY = "show";

async function resolveHboUrl(titles: string[]): Promise<string | null> {
  // Try each title variant as hbo.com/content/<slug>
  for (const title of titles) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");
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
    // Use Wikidata P8298 for show page URL (avoids autoplay).
    // JustWatch video/watch URLs autoplay S1E1.
    intent: (url) =>
      `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.hbo.hbonow`,
    fallbackIntent: "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020",
  },
  disney: {
    jwNames: ["Disney Plus"],
    intent: (url) =>
      `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.disney.disneyplus`,
    fallbackIntent:
      "am start -n com.disney.disneyplus/com.bamtechmedia.dominguez.main.MainActivity -f 0x10000020",
  },
  netflix: {
    jwNames: ["Netflix"],
    intent: (url) =>
      `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.netflix.ninja`,
    fallbackIntent: 'am start -a android.intent.action.VIEW -d "https://www.netflix.com" -f 0x10000020 -e source 30 com.netflix.ninja',
  },
  prime: {
    jwNames: ["Amazon Prime Video", "Amazon Video"],
    // JustWatch Prime URLs are /detail?gti=... — may autoplay. Open app home.
    intent: () =>
      "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020",
    fallbackIntent:
      "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020",
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

    const priorityStr = p.platformPriority || "hbo,disney,netflix,prime";
    const priority = priorityStr.split(",").map((s) => s.trim().toLowerCase());

    const allPlatforms = await getAllPlatforms(input, country, lang);

    for (const platKey of priority) {
      const def = PLATFORM_DEFS[platKey];
      if (!def) continue;

      const match = allPlatforms.find((o) => def.jwNames.includes(o.platform));
      if (!match?.url) continue;

      const showName = match.title || input;
      const titleYear = match.year ? `${showName} · ${match.year}` : showName;

      // HBO — use Wikidata P8298 for show page URL (JustWatch gives video URLs)
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
        // Scraper failed — open app home, don't fall back to video URL
        toast.title = `Opening Max…`;
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
