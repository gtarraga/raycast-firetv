import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast } from "./hass";
import { searchWikidata, getClaimValues, WikidataSearchResult } from "./wikidata";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const DISNEY_PROPERTIES = ["P6467", "P7596"]; // Hulu UUID (entity page), Disney+ shortcode
const STORAGE_KEY = "disney";
const APP_INTENT = 'am start -a android.intent.action.VIEW -d "https://www.disneyplus.com" com.disney.disneyplus';

function buildUrl(propId: string, value: string): string {
  if (propId === "P6467") return `https://www.disneyplus.com/browse/entity-${value}`;
  return `https://www.disneyplus.com/series/wp/${value}`;
}

async function openApp(toast: Toast) {
  await wakeAndCast(toast, APP_INTENT);
  toast.style = Toast.Style.Success;
  toast.title = "🎬 Disney+";
  toast.message = "App opened";
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const last = await getLastQuery(STORAGE_KEY);
    if (last) input = last;
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter a Disney+ show or movie name");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}" on Disney+…`);

  try {
    const results = await searchWikidata(input);

    if (results.length === 0) {
      toast.title = "Opening Disney+…";
      toast.message = `Nothing found for "${input}"`;
      await openApp(toast);
      return;
    }

    const topIds = results.slice(0, 5).map((r) => r.id);

    let best: WikidataSearchResult | null = null;
    let bestPropId: string | null = null;
    let bestValue: string | null = null;

    for (const propId of DISNEY_PROPERTIES) {
      const values = await getClaimValues(topIds, propId);
      for (const r of results) {
        const val = values.get(r.id);
        if (val) {
          best = r;
          bestPropId = propId;
          bestValue = val;
          break;
        }
      }
      if (best) break;
    }

    if (!best || !bestValue || !bestPropId) {
      toast.title = "Opening Disney+…";
      toast.message = "No direct link, launching app";
      await openApp(toast);
      return;
    }

    const deepLink = buildUrl(bestPropId, bestValue);
    const subtitle = best.description || "Disney+";

    toast.title = `Casting ${best.label}…`;
    toast.message = subtitle;

    await wakeAndCast(toast, `am start -a android.intent.action.VIEW -d "${deepLink}" com.disney.disneyplus`);

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = `🎬 ${best.label}`;
    toast.message = subtitle;
  } catch (err) {
    toast.title = "Opening Disney+…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await openApp(toast);
  }
}
