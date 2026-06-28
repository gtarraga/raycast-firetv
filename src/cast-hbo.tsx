import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast } from "./hass";
import { searchWikidata, getClaimValues, WikidataSearchResult } from "./wikidata";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const MAX_PROPERTIES = ["P8298"];
const STORAGE_KEY = "hbo";
const APP_INTENT = 'am start -a android.intent.action.VIEW -d "https://play.max.com" com.hbo.hbonow';

function buildUrl(id: string): string {
  return `https://play.max.com/${id}`;
}

async function openApp(toast: Toast) {
  await wakeAndCast(toast, APP_INTENT);
  toast.style = Toast.Style.Success;
  toast.title = "🎬 HBO / Max";
  toast.message = "App opened";
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const last = await getLastQuery(STORAGE_KEY);
    if (last) input = last;
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter a Max show or movie name");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}" on Max…`);

  try {
    const results = await searchWikidata(input);

    if (results.length === 0) {
      toast.title = "Opening Max…";
      toast.message = `Nothing found for "${input}"`;
      await openApp(toast);
      return;
    }

    const topIds = results.slice(0, 5).map((r) => r.id);

    let best: WikidataSearchResult | null = null;
    let bestValue: string | null = null;

    for (const propId of MAX_PROPERTIES) {
      const values = await getClaimValues(topIds, propId);
      for (const r of results) {
        const val = values.get(r.id);
        if (val) {
          best = r;
          bestValue = val;
          break;
        }
      }
      if (best) break;
    }

    if (!best || !bestValue) {
      toast.title = "Opening Max…";
      toast.message = "No direct link, launching app";
      await openApp(toast);
      return;
    }

    const deepLink = buildUrl(bestValue);
    const subtitle = best.description || "Max";

    toast.title = `Casting ${best.label}…`;
    toast.message = subtitle;

    await wakeAndCast(toast, `am start -a android.intent.action.VIEW -d "${deepLink}" com.hbo.hbonow`);

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = `🎬 ${best.label}`;
    toast.message = subtitle;
  } catch (err) {
    toast.title = "Opening Max…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await openApp(toast);
  }
}
