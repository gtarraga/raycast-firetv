import { getPreferenceValues } from "@raycast/api";

export interface Preferences {
  haUrl: string;
  haToken: string;
  entityId: string;
  hasProjector: boolean;
  projectorEntityId: string;
  projectorMac: string;
  countryCode: string;
  platformPriority: string;
}

let _prefs: Preferences | null = null;

export function prefs(): Preferences {
  if (!_prefs) _prefs = getPreferenceValues<Preferences>();
  return _prefs;
}
