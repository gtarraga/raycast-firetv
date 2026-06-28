/**
 * YouTube URL detection and SmartTube intent.
 */

export function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url.trim());
}

export function buildYouTubeIntent(url: string): string {
  return `am start -a android.intent.action.VIEW -d "${url}" org.smarttube.stable`;
}
