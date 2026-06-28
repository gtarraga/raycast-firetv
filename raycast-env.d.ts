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
  /** Fire TV Entity - media_player entity for Fire TV */
  "entityId": string,
  /** Projector Connected - Wake projector via Wake-on-LAN before casting */
  "hasProjector": boolean,
  /** Projector Entity - media_player entity for projector */
  "projectorEntityId"?: string,
  /** JustWatch Country Code - 2-letter country code for regional content (e.g. ES, US, GB) */
  "countryCode": string,
  /** Platform Priority - Comma-separated order: hbo,disney,netflix,stremio,prime */
  "platformPriority": string,
  /** Projector MAC Address - MAC address for Wake-on-LAN magic packet */
  "projectorMac"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `cast-show` command */
  export type CastShow = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-youtube` command */
  export type CastYoutube = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-stremio` command */
  export type CastStremio = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-disney` command */
  export type CastDisney = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-netflix` command */
  export type CastNetflix = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-prime` command */
  export type CastPrime = ExtensionPreferences & {}
  /** Preferences accessible in the `cast-hbo` command */
  export type CastHbo = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `cast-show` command */
  export type CastShow = {
  /** Show/Movie Name or YouTube URL */
  "query": string
}
  /** Arguments passed to the `cast-youtube` command */
  export type CastYoutube = {
  /** YouTube Link */
  "url": string
}
  /** Arguments passed to the `cast-stremio` command */
  export type CastStremio = {
  /** Movie/Series Name */
  "query": string
}
  /** Arguments passed to the `cast-disney` command */
  export type CastDisney = {
  /** Show/Movie Name */
  "query": string
}
  /** Arguments passed to the `cast-netflix` command */
  export type CastNetflix = {
  /** Show/Movie Name */
  "query": string
}
  /** Arguments passed to the `cast-prime` command */
  export type CastPrime = {
  /** Show/Movie Name */
  "query": string
}
  /** Arguments passed to the `cast-hbo` command */
  export type CastHbo = {
  /** Show/Movie Name */
  "query": string
}
}

