# Raycast Fire TV

Cast movies and shows to your Fire TV from Raycast, via Home Assistant. Type a title → auto-detects platform → deep-links into the right app. Supports HBO Max, Netflix, Disney+, Prime Video, Stremio, and YouTube. Automatically wakes your Fire TV and projector before casting.

## Commands

### Cast Media
Type any movie or show name → searches JustWatch → opens in the best available platform (priority: HBO Max → Disney+ → Netflix → Stremio → Prime). YouTube URLs auto-detected and sent to SmartTube.

### Cast YouTube
Copy a YouTube link → Raycast → opens in SmartTube.

### Cast HBO Max / Netflix / Disney+ / Prime Video
Target a specific platform. Searches JustWatch for regional availability and deep-links the show page.

### Cast Stremio
Type a movie/series name or paste a JustWatch ID (`ts20995`). Searches JustWatch for IMDb ID and opens in Stremio.

## Setup

```bash
bun install
bun run dev
```

### Preferences

| Setting | Details |
|---------|---------|
| **Home Assistant URL** | Your HA instance (e.g. `https://ha.local`) |
| **Home Assistant Token** | Long-lived access token (HA → Security) |
| **Fire TV Entity** | `media_player` entity for your Fire TV |
| **Projector connected** | Check if you use a projector |
| **Projector Entity** | `media_player` entity (used to check on/off) |
| **Projector MAC Address** | For Wake-on-LAN magic packet |

## Requirements

- An Android TV device. If using a Fire TV stick, it needs to run Fire OS. The newer Vega OS models (2025 onwards) won't work at all.
- [Home Assistant](https://www.home-assistant.io/) with the [Android TV](https://www.home-assistant.io/integrations/androidtv/) integration for your Fire TV
- [SmartTube](https://smarttubeapp.github.io/) installed on Fire TV
- [Stremio](https://www.stremio.com/) installed on Fire TV
- Optional: projector with Wake-on-LAN support

## How it works

1. If projector is off → sends Wake-on-LAN magic packet → waits for warm-up
2. If Fire TV is off → sends POWER keyevent (triggers HDMI-CEC for projector fallback)
3. Launches content in the relevant app

## References

Project was greatly improved referencing:
- [Hybirdss/smartest-tv](https://github.com/Hybirdss/smartest-tv).
- [NoBraincellsLetf/JustWatch-Search](https://github.com/NoBraincellsLeft/JustWatch-Search)
