import { LocalStorage } from "@raycast/api";

const LAST_QUERY_PREFIX = "last-query-";

export async function getLastQuery(key: string): Promise<string | undefined> {
  try {
    return await LocalStorage.getItem<string>(`${LAST_QUERY_PREFIX}${key}`);
  } catch {
    return undefined;
  }
}

export async function setLastQuery(key: string, query: string): Promise<void> {
  try {
    await LocalStorage.setItem(`${LAST_QUERY_PREFIX}${key}`, query);
  } catch {
    // silently ignore storage failures
  }
}
