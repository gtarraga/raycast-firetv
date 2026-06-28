import { LaunchProps } from "@raycast/api";
import { runCommand } from "./lib/command";

interface Arguments {
  query?: string;
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  await runCommand(props, ["netflix"], "Netflix", "netflix");
}
