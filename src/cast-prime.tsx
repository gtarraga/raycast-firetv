import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast, prefs } from "./hass";
import { resolveShow } from "./justwatch";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const STORAGE_KEY = "prime";

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
    const p = prefs();
    const country = p.countryCode || "ES";
    const lang = country.toLowerCase();

    const result = await resolveShow(input, "prime", country, lang);

    if (!result?.url) {
      toast.title = "Opening Prime Video…";
      toast.message = "Not found on Prime, launching app";
      await wakeAndCast(toast, "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020");
      toast.style = Toast.Style.Success;
      toast.title = "Prime Video";
      toast.message = input;
      return;
    }

    const displayTitle = result.originalTitle || result.title;
    const footer = result.year ? `${displayTitle} · ${result.year}` : displayTitle;

    toast.title = `Casting ${result.title}…`;
    toast.message = footer;

    await wakeAndCast(toast, `am start -a android.intent.action.VIEW -d "${result.url}" -f 0x10000020 com.amazon.avod`);

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = "Prime Video";
    toast.message = footer;
  } catch (err) {
    toast.title = "Opening Prime Video…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await wakeAndCast(toast, "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020");
    toast.style = Toast.Style.Success;
    toast.title = "Prime Video";
    toast.message = "App opened";
  }
}
