import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast } from "./hass";
import { searchWikidata, getClaimValues, WikidataSearchResult } from "./wikidata";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const PRIME_PROPERTIES = ["P8055", "P5749"];
const STORAGE_KEY = "prime";
const APP_INTENT = 'am start -a android.intent.action.VIEW -d "https://app.primevideo.com" com.amazon.avod';

function buildUrl(id: string): string {
  return `amzn://com.amazon.tv.launcher/detail?provider=aiv&providerId=${id}`;
}

async function openApp(toast: Toast) {
  await wakeAndCast(toast, APP_INTENT);
  toast.style = Toast.Style.Success;
  toast.title = "🎬 Prime Video";
  toast.message = "App opened";
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const last = await getLastQuery(STORAGE_KEY);
    if (last) input = last;
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter a Prime Video show or movie name");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}" on Prime Video…`);

  try {
    const results = await searchWikidata(input);

    if (results.length === 0) {
      toast.title = "Opening Prime Video…";
      toast.message = `Nothing found for "${input}"`;
      await openApp(toast);
      return;
    }

    const topIds = results.slice(0, 5).map((r) => r.id);

    let best: WikidataSearchResult | null = null;
    let bestValue: string | null = null;

    for (const propId of PRIME_PROPERTIES) {
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
      toast.title = "Opening Prime Video…";
      toast.message = "No direct link, launching app";
      await openApp(toast);
      return;
    }

    const deepLink = buildUrl(bestValue);
    const subtitle = best.description || "Prime Video";

    toast.title = `Casting ${best.label}…`;
    toast.message = subtitle;

    await wakeAndCast(toast, `am start -a android.intent.action.VIEW -d "${deepLink}" com.amazon.avod`);

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = `🎬 ${best.label}`;
    toast.message = subtitle;
  } catch (err) {
    toast.title = "Opening Prime Video…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await openApp(toast);
  }
}
