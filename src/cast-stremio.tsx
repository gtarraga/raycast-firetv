import { showToast, Toast, Clipboard, LaunchProps } from "@raycast/api";
import { wakeAndExec } from "./hass";

interface Arguments {
  query?: string;
}

interface CinemetaResult {
  id: string;
  imdb_id: string;
  type: "movie" | "series";
  name: string;
  releaseInfo?: string;
}

interface CinemetaResponse {
  metas?: CinemetaResult[];
  rank?: number;
}

// Match tt followed by 7-8 digits
const IMDB_ID_RE = /^(tt\d{7,8})$/i;

async function searchCinemeta(query: string, type: "movie" | "series"): Promise<{ results: CinemetaResult[]; rank: number }> {
  const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const res = await fetch(url);
  if (!res.ok) return { results: [], rank: 0 };
  const data = (await res.json()) as CinemetaResponse;
  return {
    results: (data.metas || []).filter((m) => m.imdb_id),
    rank: data.rank || 0,
  };
}

export default async function Command(props: LaunchProps<{ arguments: Arguments }>) {
  let input = props.arguments?.query?.trim();

  if (!input) {
    const clip = await Clipboard.readText();
    if (clip) input = clip.trim();
  }

  if (!input) {
    await showToast(Toast.Style.Failure, "Enter a movie or show name, or IMDb ID");
    return;
  }

  const toast = await showToast(Toast.Style.Animated, `Searching "${input}"…`);

  try {
    let imdbId: string | null = null;
    let mediaType: "movie" | "series" = "movie";
    let title = input;

    // IMDb ID directly?
    const directMatch = input.match(IMDB_ID_RE);
    if (directMatch) {
      imdbId = directMatch[1];
      // Detect type from Cinemeta
      const metaRes = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`);
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { meta?: { type?: string; name?: string } };
        if (meta.meta?.type === "series") mediaType = "series";
        if (meta.meta?.name) title = meta.meta.name;
      }
    } else {
      // Search both movie and series in parallel, pick best by Cinemeta rank
      const [movieResults, seriesResults] = await Promise.all([
        searchCinemeta(input, "movie"),
        searchCinemeta(input, "series"),
      ]);

      // Pick the type with the higher rank, then take its top result
      let best: CinemetaResult | null = null;
      if (movieResults.rank >= seriesResults.rank) {
        best = movieResults.results[0] || seriesResults.results[0] || null;
      } else {
        best = seriesResults.results[0] || movieResults.results[0] || null;
      }

      if (!best) {
        toast.style = Toast.Style.Failure;
        toast.title = `Nothing found for "${input}"`;
        return;
      }

      imdbId = best.imdb_id;
      mediaType = best.type;
      title = best.name;
    }

    toast.message = `Opening ${title} (${imdbId})…`;

    await wakeAndExec(
      `am start -a android.intent.action.VIEW -d "stremio:///detail/${mediaType}/${imdbId}" com.stremio.one`,
    );

    toast.style = Toast.Style.Success;
    toast.title = `🎬 ${title}`;
    toast.message = `${mediaType} — ${imdbId}`;
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = err instanceof Error ? err.message : String(err);
  }
}
