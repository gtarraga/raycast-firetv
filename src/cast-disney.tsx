import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast, prefs } from "./hass";
import { resolveShow } from "./justwatch";
import { getLastQuery, setLastQuery } from "./storage";

interface Arguments {
  query?: string;
}

const STORAGE_KEY = "disney";

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
    const p = prefs();
    const country = p.countryCode || "ES";
    const lang = country.toLowerCase();

    const result = await resolveShow(input, "disney", country, lang);

    if (!result?.url) {
      toast.title = "Opening Disney+…";
      toast.message = "Not found on Disney+, launching app";
      await wakeAndCast(
        toast,
        "am start -n com.disney.disneyplus/com.bamtechmedia.dominguez.main.MainActivity -f 0x10000020",
      );
      toast.style = Toast.Style.Success;
      toast.title = "Disney+";
      toast.message = input;
      return;
    }

    const displayTitle = result.originalTitle || result.title;
    const footer = result.year ? `${displayTitle} · ${result.year}` : displayTitle;

    toast.title = `Casting ${result.title}…`;
    toast.message = footer;

    await wakeAndCast(
      toast,
      `am start -a android.intent.action.VIEW -d "${result.url}" -f 0x10000020 -e source 30 com.disney.disneyplus`,
    );

    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = "Disney+";
    toast.message = footer;
  } catch (err) {
    toast.title = "Opening Disney+…";
    toast.message = err instanceof Error ? err.message : "Search failed, launching app";
    await wakeAndCast(
      toast,
      "am start -n com.disney.disneyplus/com.bamtechmedia.dominguez.main.MainActivity -f 0x10000020",
    );
    toast.style = Toast.Style.Success;
    toast.title = "Disney+";
    toast.message = "App opened";
  }
}
