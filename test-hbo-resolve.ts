/**
 * Standalone HBO Max URL resolver + ADB launcher test.
 * Run: bun test-hbo-resolve.ts "Succession"
 */

const args = process.argv.slice(2);
const query = args.join(" ") || "Succession";

interface JWResult {
  title: string;
  originalTitle?: string;
  year?: number;
  objectType: "SHOW" | "MOVIE";
  imdbId?: string;
  tmdbId?: string;
  offers: Array<{ platform: string; url: string }>;
}

// ── JustWatch search ─────────────────────────────────────────

async function searchJW(q: string): Promise<JWResult> {
  const body = JSON.stringify({
    query: `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, first: 5, filter: { searchQuery: $q }) {
        edges { node {
          id objectType
          content(country: $country, language: $lang) {
            title originalTitle fullPath originalReleaseYear
            externalIds { imdbId tmdbId }
          }
          offers(country: $country, platform: WEB) {
            standardWebURL monetizationType
            package { clearName }
          }
        }}
      }
    }`,
    variables: { q, country: "ES", lang: "es" },
  });

  const res = await fetch("https://apis.justwatch.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json: any = await res.json();
  const edge = json?.data?.popularTitles?.edges?.[0]?.node;
  if (!edge) throw new Error("No JustWatch results");

  const c = edge.content;
  return {
    title: c.title,
    originalTitle: c.originalTitle,
    year: c.originalReleaseYear,
    objectType: edge.objectType,
    imdbId: c.externalIds?.imdbId,
    tmdbId: c.externalIds?.tmdbId,
    offers: (edge.offers || []).map((o: any) => ({
      platform: o.package?.clearName || "",
      url: o.standardWebURL || "",
    })),
  };
}

// ── Slugify ───────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/g, "");
}

// ── UUID regex ────────────────────────────────────────────────

const UUID_RE = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;

function extractUuidFromUrl(url: string): string | null {
  // play.hbomax.com/show/<uuid> or play.max.com/show/<uuid>
  const m = url.match(/play\.(?:hbomax|max)\.com\/(?:show|page)\/([a-f0-9-]{36})/i);
  if (m) return m[1];

  // max.com/shows/<slug>/<uuid> or max.com/movies/<slug>/<uuid>
  const m2 = url.match(/max\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/i);
  if (m2) return m2[1];

  return null;
}

// ── HBO URL resolution ───────────────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function tryUrl(path: string, label: string): Promise<{ uuid: string; method: string } | null> {
  const url = `https://www.hbo.com${path}`;
  console.log(`  [${label}] Trying: ${url}`);

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });

  const finalUrl = res.url;
  console.log(`  [${label}] HTTP ${res.status} → final URL: ${finalUrl}`);

  // 1) Fast path: UUID in final redirect URL
  const u = extractUuidFromUrl(finalUrl);
  if (u) {
    console.log(`  [${label}] ✅ UUID from redirect URL: ${u}`);
    return { uuid: u, method: `redirect(${label})` };
  }

  if (!res.ok) {
    console.log(`  [${label}] ❌ HTTP ${res.status}`);
    return null;
  }

  const html = await res.text();

  // 2) Scrape HTML: max.com/shows/<slug>/<uuid> or max.com/movies/<slug>/<uuid>
  const m1 = html.match(/max\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/i);
  if (m1) {
    console.log(`  [${label}] ✅ UUID from HTML (max.com): ${m1[1]}`);
    return { uuid: m1[1], method: `html-max(${label})` };
  }

  // 3) Scrape HTML: play.hbomax.com/show/<uuid>
  const m2 = html.match(/play\.hbomax\.com\/shows?\/([a-f0-9-]{36})/i);
  if (m2) {
    console.log(`  [${label}] ✅ UUID from HTML (play.hbomax): ${m2[1]}`);
    return { uuid: m2[1], method: `html-play(${label})` };
  }

  // 4) Scrape HTML: seriesId near seasonNumber (TV shows)
  const sidRe = /seriesId[^a-f0-9]*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g;
  let sidExec: RegExpExecArray | null;
  while ((sidExec = sidRe.exec(html)) !== null) {
    const sid = sidExec[1];
    const after = html.slice(sidExec.index, sidExec.index + 2000);
    if (/seasonNumber\D*\d+/.test(after)) {
      console.log(`  [${label}] ✅ UUID from HTML (seriesId+season): ${sid}`);
      return { uuid: sid, method: `html-seriesId(${label})` };
    }
  }

  console.log(`  [${label}] ❌ No UUID found in HTML`);
  return null;
}

// ── Startpage fallback ───────────────────────────────────────

async function startpageSearch(title: string): Promise<{ uuid: string; method: string } | null> {
  console.log(`  [startpage] Searching: "${title} HBO Max"`);
  const q = encodeURIComponent(`${title} HBO Max`);
  const res = await fetch(`https://www.startpage.com/sp/search?q=${q}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;

  const html = await res.text();
  // Look for hbomax.com or max.com URLs with UUIDs
  for (const re of [
    /hbomax\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/gi,
    /max\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/gi,
    /play\.hbomax\.com\/shows?\/([a-f0-9-]{36})/gi,
    /play\.max\.com\/show\/([a-f0-9-]{36})/gi,
  ]) {
    const m = re.exec(html);
    if (m) {
      console.log(`  [startpage] ✅ Found: ${m[1]}`);
      return { uuid: m[1], method: "startpage" };
    }
  }
  console.log(`  [startpage] ❌ No UUID in results`);
  return null;
}

// ── Main resolver ────────────────────────────────────────────

async function resolveHboUrl(result: JWResult): Promise<{ uuid: string; method: string; url: string } | null> {
  const titles = [result.originalTitle, result.title, query].filter(Boolean) as string[];
  const isShow = result.objectType === "SHOW";

  for (const title of titles) {
    const slug = slugify(title);
    if (!slug) continue;
    console.log(`\n[slug] "${slug}" (from "${title}")`);

    // Paths to try, ordered by likelihood of success.
    // Shows: /<slug>, /series/<slug>, /tv/<slug>, /content/<slug>
    // Movies: /movies/<slug>, /movie/<slug>, /content/movies/<slug>
    const paths = isShow
      ? [`/${slug}`, `/series/${slug}`, `/tv/${slug}`, `/content/${slug}`]
      : [`/movies/${slug}`, `/movie/${slug}`, `/content/movies/${slug}`, `/${slug}`];

    for (const path of paths) {
      const r = await tryUrl(path, "primary");
      if (r) return { ...r, url: `https://play.hbomax.com/show/${r.uuid}` };
    }

    // Startpage fallback
    const sp = await startpageSearch(title);
    if (sp) return { ...sp, url: `https://play.hbomax.com/show/${sp.uuid}` };
  }

  return null;
}

// ── ADB launcher ─────────────────────────────────────────────

async function sendAdbIntent(ip: string, intent: string) {
  const shellCmd = `am start -a android.intent.action.VIEW -d "https://play.hbomax.com/show/${intent}" -f 0x10000020 -e source 30 com.hbo.hbonow`;
  console.log(`\n[ADB] Sending: ${shellCmd}`);

  const proc = Bun.spawn(["adb", "-s", `${ip}:5555`, "shell", shellCmd], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  console.log("[ADB] stdout:", out.trim());
  if (err.trim()) console.log("[ADB] stderr:", err.trim());
}

// ── Main ─────────────────────────────────────────────────────

const IP = "192.168.1.122";

async function main() {
  console.log(`\n🔍 Searching JustWatch for: "${query}"`);
  const jw = await searchJW(query);
  console.log(`✅ Found: "${jw.title}" (${jw.objectType}, ${jw.year})`);
  console.log(`   IMDb: ${jw.imdbId || "N/A"}  TMDB: ${jw.tmdbId || "N/A"}`);
  console.log(`   Offers: ${jw.offers.map((o) => o.platform).join(", ")}`);

  const hboOffer = jw.offers.find((o) => o.platform === "Max" || o.platform === "HBO Max");
  if (!hboOffer) {
    console.log("\n❌ Not available on HBO Max. Available on:", jw.offers.map((o) => o.platform).join(", "));
    return;
  }

  console.log(`\n🎯 Resolving HBO Max URL…`);
  const resolved = await resolveHboUrl(jw);

  if (!resolved) {
    console.log("\n❌ Could not resolve HBO Max URL. Would fall back to app home.");
    await sendAdbIntent(IP, ""); // app home
    return;
  }

  console.log(`\n✅ Resolved via [${resolved.method}]`);
  console.log(`   UUID: ${resolved.uuid}`);
  console.log(`   URL:  ${resolved.url}`);

  // Send to Fire TV
  await sendAdbIntent(IP, resolved.uuid);
}

main().catch((err) => {
  console.error("💥", err);
  process.exit(1);
});
