import { getPreferenceValues } from "@raycast/api";

export interface Preferences {
  haUrl: string;
  haToken: string;
  entityId: string;
}

let _prefs: Preferences | null = null;
export function prefs(): Preferences {
  if (!_prefs) _prefs = getPreferenceValues<Preferences>();
  return _prefs;
}

export async function callHAService(domain: string, service: string, data: Record<string, unknown>) {
  const p = prefs();
  const base = p.haUrl.replace(/\/+$/, "");
  const url = `${base}/api/services/${domain}/${service}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.haToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

export async function wakeAndExec(adbCmd: string) {
  const p = prefs();
  await callHAService("media_player", "turn_on", { entity_id: p.entityId });
  await new Promise((r) => setTimeout(r, 1500));
  await callHAService("androidtv", "adb_command", { entity_id: p.entityId, command: adbCmd });
}
