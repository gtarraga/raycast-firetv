# JustWatch GraphQL API Reference

Unofficial documentation. No auth required. Introspection disabled — everything here from reverse-engineering and public repos (notably [NoBraincellsLeft/JustWatch-Search](https://github.com/NoBraincellsLeft/JustWatch-Search)).

- **GraphQL endpoint**: `https://apis.justwatch.com/graphql`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`

---

## Enums & Scalars

| GraphQL Type   | Description                          | Examples                                  |
| -------------- | ------------------------------------ | ----------------------------------------- |
| `Country`      | 2-letter country code               | `US`, `ES`, `DE`, `GB`, `AU`, `BR`, `MX` |
| `Language`     | 2-letter language code              | `en`, `es`, `de`, `pt`, `fr`, `it`       |
| `ImageFormat`  | Poster / backdrop format            | `JPG`, `PNG`                              |
| `PosterProfile`| Poster resolution profile           | `S100`, `S718`                            |
| `BackdropProfile` | Backdrop resolution profile      | `S1920`                                   |
| `Platform`     | Streaming platform filter           | `WEB`, `ROKU_OS`                          |

---

## Quick Start (copy-paste)

### Get IMDb ID + TMDB ID for a title

```bash
curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query Search($q: String!, $country: Country!, $lang: Language!) { popularTitles(country: $country, first: 5, filter: { searchQuery: $q }) { edges { node { id objectId objectType content(country: $country, language: $lang) { title fullPath originalReleaseYear externalIds { imdbId tmdbId } } } } } }","variables":{"q":"the matrix","country":"US","lang":"en"}}'
```

### Get streaming providers for a title (needs fullPath from step 1)

```bash
# Step 1: get fullPath (e.g. "/us/movie/the-matrix")
# Step 2: query offers via urlV2
curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query { urlV2(fullPath: \"/us/movie/the-matrix\") { node { ... on MovieOrShowOrSeasonOrEpisode { offers(country: US, platform: WEB) { monetizationType presentationType retailPriceValue currency package { clearName } standardWebURL } } } } }"}'
```

### Full flow: search → get IMDb ID + TMDB ID + all offers

```bash
#!/bin/bash
QUERY="the sopranos"
COUNTRY="US"
LANG="en"

# 1. Search
RESULT=$(curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"query Search(\$q: String!, \$country: Country!, \$lang: Language!) { popularTitles(country: \$country, first: 3, filter: { searchQuery: \$q }) { edges { node { id objectType content(country: \$country, language: \$lang) { title fullPath originalReleaseYear externalIds { imdbId tmdbId } } } } } }\",\"variables\":{\"q\":\"$QUERY\",\"country\":\"$COUNTRY\",\"lang\":\"$LANG\"}}")

# Extract best match
TITLE=$(echo "$RESULT" | python3 -c "import sys,json; e=json.load(sys.stdin)['data']['popularTitles']['edges'][0]['node']['content']; print(e['title'])")
PATH=$(echo "$RESULT" | python3 -c "import sys,json; e=json.load(sys.stdin)['data']['popularTitles']['edges'][0]['node']['content']; print(e['fullPath'])")
IMDB=$(echo "$RESULT" | python3 -c "import sys,json; e=json.load(sys.stdin)['data']['popularTitles']['edges'][0]['node']['content']['externalIds']; print(e.get('imdbId',''))")
TMDB=$(echo "$RESULT" | python3 -c "import sys,json; e=json.load(sys.stdin)['data']['popularTitles']['edges'][0]['node']['content']['externalIds']; print(e.get('tmdbId',''))")

echo "Title: $TITLE"
echo "IMDb:  $IMDB"
echo "TMDB:  $TMDB"
echo ""

# 2. Get offers
OFFERS=$(curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"query { urlV2(fullPath: \\\"$PATH\\\") { node { ... on MovieOrShowOrSeasonOrEpisode { offers(country: $COUNTRY, platform: WEB) { monetizationType presentationType retailPriceValue currency package { clearName technicalName } standardWebURL } } } } }\"}")

echo "Streaming on:"
echo "$OFFERS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
offers = d['data']['urlV2']['node']['offers']
for o in offers:
    name = o['package']['clearName']
    type_ = o['monetizationType']
    price = o.get('retailPriceValue','?')
    curr = o.get('currency','')
    print(f'  {name} ({type_})' + (f' — {price} {curr}' if price else ''))
"
```

### 1. Search Titles — `popularTitles`

Search for movies/shows by query string. Returns `MovieOrShow` union type per edge.

```graphql
query Search($q: String!, $country: Country!, $lang: Language!) {
  popularTitles(
    country: $country
    first: 10
    filter: { searchQuery: $q }
    sortBy: POPULAR
    sortRandomSeed: 0
  ) {
    edges {
      node {
        id
        objectId
        objectType
        content(country: $country, language: $lang) {
          title
          fullPath
          originalReleaseYear
          originalReleaseDate
          runtime
          shortDescription
          genres { shortName }
          externalIds { imdbId tmdbId }
          posterUrl(profile: $profile, format: $formatPoster)
          backdrops(profile: $backdropProfile, format: $formatPoster) {
            backdropUrl
          }
        }
      }
    }
  }
}
```

**Variables**:
```json
{
  "q": "sopranos",
  "country": "ES",
  "lang": "es",
  "profile": "S718",
  "formatPoster": "JPG",
  "backdropProfile": "S1920"
}
```

**Response shape**:
```json
{
  "data": {
    "popularTitles": {
      "edges": [
        {
          "node": {
            "id": "ts20995",
            "objectId": 20995,
            "objectType": "SHOW",
            "content": {
              "title": "Los Soprano",
              "fullPath": "/es/serie/los-soprano",
              "originalReleaseYear": 1999,
              "runtime": null,
              "externalIds": {
                "imdbId": "tt0141842",
                "tmdbId": "1398"
              },
              "genres": [{ "shortName": "drama" }],
              "posterUrl": "https://images.justwatch.com/poster/...",
              "backdrops": [{ "backdropUrl": "https://..." }]
            }
          }
        }
      ]
    }
  }
}
```

### 2. Get Title by Node ID — `node(id:)`

Resolve a single `MovieOrShow` by its JustWatch node ID (e.g., `ts20995`).

```graphql
query GetTitleNode($nodeId: ID!, $language: Language!, $country: Country!) {
  node(id: $nodeId) {
    ... on MovieOrShow {
      id
      objectId
      objectType
      content(country: $country, language: $language) {
        title
        fullPath
        originalReleaseYear
        originalReleaseDate
        runtime
        shortDescription
        genres { shortName }
        externalIds { imdbId tmdbId }
        posterUrl(profile: S718, format: JPG)
        backdrops(profile: S1920, format: JPG) {
          backdropUrl
        }
      }
    }
  }
}
```

**Variables**:
```json
{ "nodeId": "ts20995", "country": "US", "language": "en" }
```

### 3. Get Title by Path — `urlV2(fullPath:)`

Resolve a title by its `fullPath` (e.g., `/us/movie/the-matrix`). Returns `Movie` or `Show` concrete types.

```graphql
query {
  urlV2(fullPath: "/us/movie/the-matrix") {
    id
    node {
      ... on Movie {
        id
        objectId
        objectType
        content(country: US, language: en) {
          title
          fullPath
          originalReleaseYear
          externalIds { imdbId tmdbId }
        }
      }
      ... on Show {
        id
        objectId
        objectType
        content(country: US, language: en) {
          title
          fullPath
          originalReleaseYear
          externalIds { imdbId tmdbId }
        }
      }
    }
  }
}
```

### 4. Get Offers — `offers()`

Get streaming availability per country. Must use `... on MovieOrShowOrSeasonOrEpisode` (the broader union). Each country gets an alias.

```graphql
query GetTitleOffers(
  $nodeId: ID!,
  $language: Language!,
  $filterBuy: OfferFilter!,
  $platform: Platform! = WEB
) {
  node(id: $nodeId) {
    ... on MovieOrShowOrSeasonOrEpisode {
      us: offers(country: US, platform: $platform, filter: $filterBuy) {
        ...TitleOffer
      }
      es: offers(country: ES, platform: $platform, filter: $filterBuy) {
        ...TitleOffer
      }
      de: offers(country: DE, platform: $platform, filter: $filterBuy) {
        ...TitleOffer
      }
    }
  }
}

fragment TitleOffer on Offer {
  id
  presentationType
  monetizationType
  retailPrice(language: $language)
  retailPriceValue
  currency
  lastChangeRetailPriceValue
  type
  package {
    id
    packageId
    clearName
    technicalName
    icon(profile: S100)
  }
  standardWebURL
  elementCount
  availableTo
  deeplinkRoku: deeplinkURL(platform: ROKU_OS)
  subtitleLanguages
  videoTechnology
  audioTechnology
  audioLanguages
}
```

**Variables**:
```json
{ "nodeId": "ts20995", "language": "en", "filterBuy": {}, "platform": "WEB" }
```

**Offer object**:

| Field                     | Type               | Description                                  |
| ------------------------- | ------------------ | -------------------------------------------- |
| `id`                      | `String`           | Offer ID                                     |
| `presentationType`        | `String`           | `sd`, `hd`, `4k`                             |
| `monetizationType`        | `String`           | `flatrate`, `rent`, `buy`, `ads`, `free`     |
| `retailPrice`             | `String`           | Formatted price (e.g. `"$3.99"`)             |
| `retailPriceValue`        | `Float`            | Numeric price                                |
| `currency`                | `String`           | `USD`, `EUR`, etc.                           |
| `lastChangeRetailPriceValue` | `Float`          | Previous price for delta                     |
| `type`                    | `String`           | Offer type                                   |
| `package.clearName`       | `String`           | Human-readable provider name (e.g. `"Netflix"`) |
| `package.technicalName`   | `String`           | Machine name (e.g. `"netflix"`)              |
| `package.icon`            | `String`           | Provider icon URL                            |
| `standardWebURL`          | `String`           | Deeplink to streaming service (includes affiliate tracking) |
| `elementCount`            | `Int`              | Episodes / seasons count                     |
| `subtitleLanguages`       | `[String]`         | Available subtitle languages                 |
| `audioLanguages`          | `[String]`         | Available audio languages                    |
| `videoTechnology`         | `[String]`         | e.g. `["HDR", "DOLBY_VISION"]`               |
| `audioTechnology`         | `[String]`         | e.g. `["DOLBY_ATMOS"]`                       |

---

## REST Endpoints

### Get URL Metadata — `GET /content/urls`

Returns page metadata including available locales (countries).

```
GET https://apis.justwatch.com/content/urls?path=%2Fes%2Fserie%2Flos-soprano
```

**Response keys**: `full_path`, `heading_1`, `heading_2`, `href_lang_tags`, `html_content`, `i18n_state`, `id`, `locale`, `meta_description`, `meta_title`, `object_id`, `object_type`, `scripts`, etc.

**`href_lang_tags`** — array of `{ locale: "en_US", href_lang: "en-US", href: "/us/tv-show/the-sopranos" }`. Use these to discover all supported countries for a title before querying offers.

---

## Content Partner REST API (requires token)

Separate REST API at `https://apis.justwatch.com/contentpartner/v2/content/...` — requires a partner `token` query parameter. Returns flat JSON with `imdb_id`, `tmdb_id`, `justwatch_id`, `offers`, `ranks`, etc.

**Routes**:
| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET`  | `/offers/object_type/{movie\|show}/id_type/{tmdb\|imdb\|justwatch}/locale/{locale}?id=<id>` | Offers by ID |
| `GET`  | `/titles/object_type/{movie\|show\|all}/locale/{locale}?query=<q>` | Search titles with offers |
| `GET`  | `/providers/all/locale/{locale}` | Provider metadata |
| `GET`  | `/genres/all/locale/{locale}` | Genre metadata |
| `GET`  | `/countries` | Supported countries |
| `GET`  | `/whytowatch/recommendations/object_type/{type}/id_type/{type}/locale/{locale}?id=<id>` | Editorial recommendations |
| `GET`  | `/offers/object_type/show/id_type/{type}/season_number/{n}/locale/{locale}?id=<id>` | Season/episode offers |

Docs: <https://apis.justwatch.com/docs/api/>

---

## Field Location Cheatsheet

| What | Where |
| ---- | ----- |
| `imdbId`, `tmdbId` | `content(country:, language:) { externalIds { imdbId tmdbId } }` |
| `title`, `fullPath`, `originalReleaseYear` | `content(country:, language:)` |
| `posterUrl`, `backdrops` | `content(country:, language:)` |
| `genres` | `content(country:, language:) { genres { shortName } }` |
| `runtime`, `shortDescription` | `content(country:, language:)` |
| `id`, `objectId`, `objectType` | directly on `node` (not inside `content()`) |
| `offers()` | `node { ... on MovieOrShowOrSeasonOrEpisode { <alias>: offers(...) { ... } } }` |

**Critical**: `externalIds` is a field of the `content()` return type, NOT of `MovieOrShow`/`Movie`/`Show`. Querying it on the node returns `GRAPHQL_VALIDATION_FAILED`.

---

## CORS

JustWatch blocks browser-origin requests. Workarounds:
- Server-side proxy (as NoBraincellsLeft/JustWatch-Search does)
- CORS proxy service (e.g., `cors-proxy.cooks.fyi`)
- Backend-only (Node.js, Python, etc.)
