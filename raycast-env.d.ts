/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Home Assistant URL - Base URL of your Home Assistant instance */
  "haUrl": string,
  /** Long-Lived Access Token - Create one in HA → tap your name → Security → Long-lived access tokens */
  "haToken": string,
  /** Fire TV Entity ID - The media_player entity for your Fire TV */
  "entityId": string
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

