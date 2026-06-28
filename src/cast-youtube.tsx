import { showToast, Toast, Clipboard, LaunchProps } from "@raycast/api";
import { launchYouTube } from "./lib/command";
import { isYouTubeUrl } from "./lib/youtube";

interface Arguments {
  url?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let url = props.arguments?.url?.trim();

  if (!url) {
    const clip = await Clipboard.readText();
    if (clip) url = clip.trim();
  }

  if (!url) {
    await showToast(Toast.Style.Failure, "No YouTube URL");
    return;
  }

  if (!isYouTubeUrl(url)) {
    await showToast(Toast.Style.Failure, "Not a YouTube URL");
    return;
  }

  await launchYouTube(url);
}
