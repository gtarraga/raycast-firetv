import { LaunchProps } from "@raycast/api";
import { runCommand, launchYouTube } from "./lib/command";
import { isYouTubeUrl } from "./lib/youtube";

interface Arguments {
  query?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const query = props.arguments?.query?.trim();

  if (query && isYouTubeUrl(query)) {
    await launchYouTube(query);
    return;
  }

  await runCommand(props, ["hbo", "disney", "netflix", "stremio", "prime"], "show or movie", "show");
}
