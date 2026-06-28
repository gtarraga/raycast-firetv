import { showToast, Toast, LaunchProps } from "@raycast/api";
import { wakeAndCast } from "./hass";
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

  const toast = await showToast(Toast.Style.Animated, `Opening Prime Video for "${input}"…`);

  try {
    await wakeAndCast(
      toast,
      "am start -n com.amazon.avod/.client.activity.FireTvHomeScreenActivity -f 0x10000020",
    );
    await setLastQuery(STORAGE_KEY, input);

    toast.style = Toast.Style.Success;
    toast.title = "🎬 Prime Video";
    toast.message = input;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}
