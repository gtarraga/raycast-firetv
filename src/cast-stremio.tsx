import { showToast, Toast, Clipboard, LaunchProps } from "@raycast/api";
import { wakeAndCast, prefs } from "./hass";
import { searchJustWatchFull, getTitleById, isJWId, JWTitleResult } from "./justwatch";

interface Arguments {
  query?: string;
}

function buildStremioIntent(result: JWTitleResult): string {
  const type = result.objectType === "SHOW" ? "series" : "movie";
  return `am start -a android.intent.action.VIEW -d "stremio:///detail/${type}/${result.imdbId}" com.stremio.one`;
}

function formatLabel(result: JWTitleResult): string {
  const label = result.objectType === "SHOW" ? "Series" : "Movie";
  return result.year ? `${label} · ${result.year}` : label;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const clip = await Clipboard.readText();
    if (clip) input = clip.trim();
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter a movie or show name, or JustWatch ID (ts12345)");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}"…`);
  const p = prefs();
  const country = p.countryCode || "ES";
  const lang = country.toLowerCase().split("-")[0] || "es";

  try {
    let best: JWTitleResult | null = null;

    if (isJWId(input)) {
      best = await getTitleById(input, country, lang);
    } else {
      const results = await searchJustWatchFull(input, country, lang);
      best = results[0] || null;
    }

    if (!best || !best.imdbId) {
      toast.style = Toast.Style.Failure;
      toast.title = `Nothing found for "${input}"`;
      return;
    }

    const subtitle = formatLabel(best);

    toast.title = `Casting ${best.title}…`;
    toast.message = subtitle;

    await wakeAndCast(toast, buildStremioIntent(best));

    toast.style = Toast.Style.Success;
    toast.title = `🎬 ${best.title}`;
    toast.message = subtitle;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}
