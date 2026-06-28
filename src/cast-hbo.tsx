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
    await showToast(Toast.Style.Failure, "Enter a Max show or movie name");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}" on Max…`);

  try {
    const p = prefs();
    const country = p.countryCode || "ES";
    const lang = country.toLowerCase();

    const result = await resolveShow(input, "hbo", country, lang);

    if (!result?.url) {
      toast.title = "Opening Max…";
      toast.message = "Not found on Max, launching app";
      await wakeAndCast(toast, "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020");
      toast.style = Toast.Style.Success;
      toast.title = "🎬 HBO / Max";
      toast.message = input;
      return;
    }

    toast.title = `Casting ${result.title}…`;
    toast.message = result.platformName;

    // Use play.max.com URL — Max app handles these
    const url = result.url.replace("play.hbomax.com", "play.max.com");
    await wakeAndCast(
      toast,
      `am start -a android.intent.action.VIEW -d "${url}" -f 0x10000020 -e source 30 com.hbo.hbonow`,
    );

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = `🎬 ${result.title}`;
    toast.message = result.platformName;
  } catch (err) {
    toast.title = "Opening Max…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await wakeAndCast(toast, "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020");
    toast.style = Toast.Style.Success;
    toast.title = "🎬 HBO / Max";
    toast.message = "App opened";
  }
}
