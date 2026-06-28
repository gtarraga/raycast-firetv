/**
 * Cast HBO Max — standalone command (single platform).
 *
 * HBO URL resolution chain:
 *   1. resolveShow("hbo", ...) searches JustWatch for the title and filters
 *      offers to packages matching "Max" / "HBO Max".
 *   2. If found, `result.url` is JustWatch's `standardWebURL` — this is a
 *      video/watch page that may autoplay.  We rewrite the domain from
 *      play.hbomax.com → play.max.com because the HBO Max Android app handles
 *      play.max.com intents more reliably.
 *   3. If not found on HBO Max, fallback intent opens the HBO Max app home.
 *
 * Note: cast-media.tsx uses a different HBO path — it scrapes hbo.com for
 * the show landing page (avoids autoplay).  This standalone command uses
 * JustWatch URLs directly for simplicity/speed.
 */

import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast, prefs } from "./hass";
import { resolveShow } from "./justwatch";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const STORAGE_KEY = "hbo";

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const last = await getLastQuery(STORAGE_KEY);
    if (last) input = last;
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter an HBO Max show or movie name");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}" on HBO Max…`);

  try {
    const p = prefs();
    const country = p.countryCode || "ES";
    const lang = country.toLowerCase();

    const result = await resolveShow(input, "hbo", country, lang);

    if (!result?.url) {
      toast.title = "Opening HBO Max…";
      toast.message = "Not found on HBO Max, launching app";
      await wakeAndCast(toast, "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020");
      toast.style = Toast.Style.Success;
      toast.title = "HBO Max";
      toast.message = input;
      return;
    }

    const displayTitle = result.originalTitle || result.title;
    const footer = result.year ? `${displayTitle} · ${result.year}` : displayTitle;

    toast.title = `Casting ${result.title}…`;
    toast.message = footer;

    // JustWatch returns play.hbomax.com/video/watch/<id> — rewrite to
    // play.max.com because the HBO Max Android app (com.hbo.hbonow) handles
    // play.max.com intents natively on Fire TV.
    const url = result.url.replace("play.hbomax.com", "play.max.com");
    await wakeAndCast(
      toast,
      `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.hbo.hbonow`,
    );

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = "HBO Max";
    toast.message = footer;
  } catch (err) {
    toast.title = "Opening HBO Max…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await wakeAndCast(toast, "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020");
    toast.style = Toast.Style.Success;
    toast.title = "HBO Max";
    toast.message = "App opened";
  }
}
