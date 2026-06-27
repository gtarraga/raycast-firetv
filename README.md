# Raycast Fire TV

Cast YouTube and Stremio content to your Fire TV from Raycast, via Home Assistant.

## Commands

### Cast YouTube
Copy a YouTube link → open Raycast → "Cast YouTube" → Enter. Opens in SmartTube.

### Cast Stremio
Copy an IMDb ID (`tt1375666`) or type a movie/series name → Raycast → "Cast Stremio" → Enter. Searches Cinemeta (Stremio's metadata API) and opens directly in Stremio.

## Setup

```bash
bun install
bun run dev
```

Then configure in Raycast Preferences:
- **Home Assistant URL** — your HA instance (e.g. `https://ha.example.com`)
- **Long-Lived Access Token** — create in HA → Security → Long-lived access tokens
- **Fire TV Entity ID** — the `media_player` entity for your Fire TV (e.g. `media_player.guillem_fire_tv`)

## Requirements

- [Home Assistant](https://www.home-assistant.io/) with the [Android TV](https://www.home-assistant.io/integrations/androidtv/) integration configured for your Fire TV
- [SmartTube](https://smarttubeapp.github.io/) installed on Fire TV
- [Stremio](https://www.stremio.com/) installed on Fire TV
