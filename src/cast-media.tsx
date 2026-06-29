import { LaunchProps, Clipboard } from "@raycast/api";
import { runCommand, launchYouTube, launchDazn } from "./lib/command";
import { isYouTubeUrl } from "./lib/youtube";

interface Arguments {
  query?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let query = props.arguments?.query?.trim();

  // Clipboard only for YouTube links — non-YouTube titles resolve via args or last-used query
  if (!query) {
    const clip = await Clipboard.readText();
    if (clip) query = clip.trim();
  }

  if (query && isYouTubeUrl(query)) {
    await launchYouTube(query);
    return;
  }

  if (query?.toLowerCase() === "dazn") {
    await launchDazn();
    return;
  }

  await runCommand(props, ["hbo", "disney", "netflix", "stremio", "prime"], "show or movie", "show");
}
