/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Home Assistant URL - Base URL of your Home Assistant instance */
  "haUrl": string,
  /** Home Assistant Token - Long-lived access token from HA → Security */
  "haToken": string,
  /** Fire TV Entity - media_player entity for your Fire TV */
  "entityId": string,
  /** Projector connected - Wake the projector via Wake-on-LAN before casting */
  "hasProjector": boolean,
  /** Projector Entity - media_player entity for your projector (used to check on/off state) */
  "projectorEntityId"?: string,
  /** Projector MAC Address - MAC address for Wake-on-LAN magic packet */
  "projectorMac"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `cast-youtube` command */
  export type CastYoutube = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-stremio` command */
  export type CastStremio = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `cast-youtube` command */
  export type CastYoutube = {
  /** youtube link */
  "url": string
}
  /** Arguments passed to the `cast-stremio` command */
  export type CastStremio = {
  /** movie/series name */
  "query": string
}
}

