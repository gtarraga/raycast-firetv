# JustWatch + HBO resolution — API traces

## 1. JustWatch Search
```bash
curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query Search($q: String!, $country: Country!, $lang: Language!) { popularTitles(country: $country, first: 10, filter: { searchQuery: $q }) { edges { node { content(country: $country, language: $lang) { fullPath title originalReleaseYear } } } } }","variables":{"q":"sopranos","country":"ES","lang":"es"}}'
```

## 2. JustWatch Offers (use fullPath from step 1)
```bash
curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query Offers($path: String!, $country: Country!) { urlV2(fullPath: $path) { id node { ... on Show { offers(country: $country, platform: WEB) { standardWebURL package { clearName } } } } } }","variables":{"path":"/es/serie/los-soprano","country":"ES"}}'
```

## 3. Get English title (for HBO.com slug)
```bash
curl -s -X POST https://apis.justwatch.com/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"query Content($path: String!, $country: Country!, $lang: Language!) { urlV2(fullPath: $path) { id node { ... on Show { content(country: $country, language: $lang) { title } } } } }","variables":{"path":"/es/serie/los-soprano","country":"ES","lang":"en"}}'
```

## 4. HBO.com scraper (slug from step 3 title)
```bash
curl -sL 'https://www.hbo.com/content/the-sopranos' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \
  | grep -oE 'play\.hbomax\.com/show/[a-f0-9-]+' | head -1
```

## 5. ADB deep link (use UUID from step 4)
```bash
adb shell am start -a android.intent.action.VIEW \
  -d 'https://play.hbomax.com/show/818c3d9d-1831-48a6-9583-0364a7f98453' \
  -f 0x10000020 -e source 30 com.hbo.hbonow
```
