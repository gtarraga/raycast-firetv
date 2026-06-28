/**
 * Raycast command adapter — input resolution, toast lifecycle, wiring.
 * Glue between Raycast (toasts, prefs, storage) and pure modules (resolve, remote).
 */

import { showToast, Toast, LaunchProps, Clipboard } from "@raycast/api";
import { resolveMedia, platformDisplayName } from "./resolve";
import { wakeAndLaunch, RemoteConfig } from "./remote";
import { getLastQuery, setLastQuery } from "../storage";
import { prefs } from "../hass";
import { buildYouTubeIntent } from "./youtube";

function buildRemoteConfig(): RemoteConfig {
  const p = prefs();
  return {
    haUrl: p.haUrl,
    haToken: p.haToken,
    entityId: p.entityId,
    projectorEntityId: p.hasProjector ? p.projectorEntityId : undefined,
    projectorMac: p.hasProjector ? p.projectorMac : undefined,
  };
}

function formatFooter(title: string, originalTitle: string | undefined, year: number | undefined): string {
  const display = originalTitle && originalTitle !== title ? originalTitle : title;
  return year ? `${display} · ${year}` : display;
}

/**
 * Resolve user input from command arguments, clipboard, and last-used storage.
 * Returns null if no input could be resolved (error toast already shown).
 */
export async function resolveInput(
  props: LaunchProps<{ arguments: { query?: string } }>,
  storageKey: string,
  errorLabel: string,
  opts?: { useClipboard?: boolean },
): Promise<string | null> {
  let input = props.arguments?.query?.trim();

  if (!input && opts?.useClipboard) {
    const clip = await Clipboard.readText();
    if (clip) input = clip.trim();
  }

  if (!input) {
    const last = await getLastQuery(storageKey);
    if (last) input = last;
  }

  if (!input) {
    await showToast(Toast.Style.Failure, `Enter a ${errorLabel} show or movie name`);
    return null;
  }

  return input;
}

/**
 * Full cast lifecycle: resolve input → search → resolve platform → wake & launch → toast.
 * Handles all JustWatch-based platforms (HBO Max, Disney+, Netflix, Prime Video, Stremio).
 *
 * @param props     Raycast command props (for arguments, clipboard)
 * @param platforms Platform keys in priority order, e.g. ["hbo", "disney"]
 * @param errorLabel Label for "Enter a ___ show or movie name" error toast
 * @param storageKey LocalStorage key for last-used query
 */
export async function runCommand(
  props: LaunchProps<{ arguments: { query?: string } }>,
  platforms: string[],
  errorLabel: string,
  storageKey: string,
): Promise<void> {
  const input = await resolveInput(props, storageKey, errorLabel);
  if (!input) return;

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}"…`);

  try {
    const p = prefs();
    const country = p.countryCode || "ES";
    const lang = country.toLowerCase();

    const match = await resolveMedia(input, platforms, country, lang);
    const config = buildRemoteConfig();

    if (!match) {
      // Nothing found — open Netflix as fallback (any app would do, Netflix has widest coverage)
      toast.title = "Not found";
      toast.message = `"${input}" not on any platform`;
      await wakeAndLaunch(
        config,
        'am start -a android.intent.action.VIEW -d "https://www.netflix.com" -f 0x10000020 -e source 30 com.netflix.ninja',
        (msg) => {
          toast.message = msg;
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "Netflix";
      toast.message = "App opened";
      return;
    }

    const footer = formatFooter(match.title, match.originalTitle, match.year);
    const displayName = platformDisplayName(match.platform);

    toast.title = `Opening ${displayName}…`;
    toast.message = footer;
    await wakeAndLaunch(config, match.intent, (msg) => {
      toast.message = msg;
    });
    await setLastQuery(storageKey, input);
    toast.style = Toast.Style.Success;
    toast.title = displayName;
    toast.message = footer;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Launch a YouTube URL on SmartTube.
 * URL must already be validated (caller checks isYouTubeUrl).
 */
export async function launchYouTube(url: string): Promise<void> {
  const toast = await showToast(Toast.Style.Animated, "Casting YouTube to SmartTube…");

  try {
    const config = buildRemoteConfig();
    await wakeAndLaunch(config, buildYouTubeIntent(url), (msg) => {
      toast.message = msg;
    });
    await setLastQuery("youtube", url);
    toast.style = Toast.Style.Success;
    toast.title = "▶ YouTube";
    toast.message = url.length > 70 ? url.slice(0, 67) + "…" : url;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}
