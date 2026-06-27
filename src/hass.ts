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
  // 1. Wake Fire TV (WOL or ADB — triggers HDMI-CEC to wake projector too)
  await callHAService("media_player", "turn_on", { entity_id: p.entityId });
  // 2. Send WAKEUP keyevent — idempotent, also triggers CEC for projector
  await callHAService("androidtv", "adb_command", {
    entity_id: p.entityId,
    command: "input keyevent 224",
  });
  // 3. Give devices time to wake up
  await new Promise((r) => setTimeout(r, 2000));
  // 4. Send the content intent
  await callHAService("androidtv", "adb_command", { entity_id: p.entityId, command: adbCmd });
}
