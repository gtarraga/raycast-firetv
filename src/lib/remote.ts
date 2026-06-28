/**
 * Home Assistant / Fire TV remote control.
 * Pure device layer — no Raycast dependency.
 */

import { createSocket } from "dgram";

export interface RemoteConfig {
  haUrl: string;
  haToken: string;
  entityId: string;
  projectorEntityId?: string;
  projectorMac?: string;
}

async function haFetch(config: RemoteConfig, path: string, init?: RequestInit) {
  const base = config.haUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.haToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HA ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function callService(config: RemoteConfig, domain: string, service: string, data: Record<string, unknown>) {
  return haFetch(config, `/api/services/${domain}/${service}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function getState(config: RemoteConfig, entityId: string): Promise<string> {
  const res = await haFetch(config, `/api/states/${entityId}`);
  const json = (await res.json()) as { state: string };
  return json.state;
}

async function isOff(config: RemoteConfig, entityId: string): Promise<boolean> {
  try {
    const state = await getState(config, entityId);
    return state === "off" || state === "standby" || state === "unavailable";
  } catch {
    return true;
  }
}

function parseMac(mac: string): Buffer {
  const hex = mac.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) throw new Error(`Invalid MAC: ${mac}`);
  return Buffer.from(hex, "hex");
}

function sendWol(mac: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const macBuf = parseMac(mac);
    const packet = Buffer.alloc(6 + 16 * 6);
    packet.fill(0xff, 0, 6);
    for (let i = 0; i < 16; i++) macBuf.copy(packet, 6 + i * 6);

    const socket = createSocket("udp4");
    let done = false;
    const finish = (err?: Error | null) => {
      if (done) return;
      done = true;
      socket.close();
      if (err) reject(err);
      else resolve();
    };

    socket.on("error", (err) => finish(err));
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(packet, 9, "255.255.255.255", (err) => finish(err));
    });
  });
}

export async function wakeProjector(config: RemoteConfig, onProgress?: (msg: string) => void): Promise<boolean> {
  if (!config.projectorEntityId || !config.projectorMac) return false;

  const off = await isOff(config, config.projectorEntityId);
  if (!off) return false;

  onProgress?.("Turning On Projector…");
  await sendWol(config.projectorMac);
  await new Promise((r) => setTimeout(r, 5000));
  return true;
}

export async function wakeFireTV(
  config: RemoteConfig,
  projectorWasOff: boolean,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const tvOff = await isOff(config, config.entityId);

  if (tvOff) {
    onProgress?.(projectorWasOff ? "Waking Fire TV + Projector…" : "Waking Fire TV…");
    await callService(config, "androidtv", "adb_command", {
      entity_id: config.entityId,
      command: "input keyevent 26",
    });
    await new Promise((r) => setTimeout(r, 3000));
  } else if (projectorWasOff) {
    onProgress?.("Reconnecting Fire TV to Projector…");
    await callService(config, "androidtv", "adb_command", {
      entity_id: config.entityId,
      command: "input keyevent 3",
    });
    await new Promise((r) => setTimeout(r, 1000));
  } else {
    await callService(config, "media_player", "turn_on", { entity_id: config.entityId });
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function sendIntent(config: RemoteConfig, intent: string): Promise<void> {
  await callService(config, "androidtv", "adb_command", {
    entity_id: config.entityId,
    command: intent,
  });
}

/** Force-stop an Android app by package name (e.g. "com.hbo.hbonow"). */
export async function killApp(config: RemoteConfig, packageName: string): Promise<void> {
  await callService(config, "androidtv", "adb_command", {
    entity_id: config.entityId,
    command: `am force-stop ${packageName}`,
  });
}

export async function wakeAndLaunch(
  config: RemoteConfig,
  intent: string,
  onProgress?: (msg: string) => void,
  killPackage?: string,
): Promise<void> {
  const projWasOff = await wakeProjector(config, onProgress);
  await wakeFireTV(config, projWasOff, onProgress);
  if (killPackage) await killApp(config, killPackage);
  await sendIntent(config, intent);
}
