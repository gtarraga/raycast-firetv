/**
 * Sequential HBO Max resolver with 5s delay between Fire TV launches.
 * Run: bun test-hbo-resolve-live.ts
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IP = "192.168.1.122";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");
}

function extractUuid(url: string): string | null {
  const m = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  return m ? m[0] : null;
}

interface JWResult {
  title: string;
  originalTitle?: string;
  year?: number;
  objectType: "SHOW" | "MOVIE";
}

interface PathResult {
  path: string;
  status: number;
  finalUrl: string;
  uuid: string | null;
  note: string;
}

async function searchJW(q: string): Promise<JWResult | null> {
  const body = JSON.stringify({
    query: `query Search($q: String!, $country: Country!, $lang: Language!) {
      popularTitles(country: $country, first: 3, filter: { searchQuery: $q }) {
        edges { node { id objectType
          content(country: $country, language: $lang) { title originalTitle originalReleaseYear }
          offers(country: $country, platform: WEB) { package { clearName } }
        }}
      }
    }`,
    variables: { q, country: "ES", lang: "es" },
  });
  const res = await fetch("https://apis.justwatch.com/graphql", {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  const json: any = await res.json();
  const edge = json?.data?.popularTitles?.edges?.[0]?.node;
  if (!edge) return null;
  return {
    title: edge.content.title,
    originalTitle: edge.content.originalTitle,
    year: edge.content.originalReleaseYear,
    objectType: edge.objectType,
  };
}

async function tryPath(path: string): Promise<PathResult> {
  const url = `https://www.hbo.com${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });

  const finalUrl = res.url;
  const uuid = extractUuid(finalUrl);
  let note = "";

  if (res.status === 404) {
    note = "404";
  } else if (uuid && finalUrl !== url) {
    note = `redirect → UUID: ${uuid}`;
  } else if (uuid) {
    note = `UUID in URL: ${uuid}`;
  } else {
    // scrape HTML for fallback UUIDs
    const html = await res.text();
    const m1 = html.match(/play\.hbomax\.com\/shows?\/([a-f0-9-]{36})/i);
    if (m1) { note = `HTML scrape → UUID: ${m1[1]}`; return { path, status: res.status, finalUrl, uuid: m1[1], note }; }
    const m2 = html.match(/max\.com\/shows\/[a-z0-9-]+\/([a-f0-9-]{36})/i);
    if (m2) { note = `HTML scrape → UUID: ${m2[1]}`; return { path, status: res.status, finalUrl, uuid: m2[1], note }; }
    note = `200 no UUID`;
  }

  return { path, status: res.status, finalUrl, uuid, note };
}

async function sendAdb(uuid: string | null) {
  if (!uuid) {
    console.log("  [ADB] Opening HBO Max app home (no UUID)");
    const proc = Bun.spawn(["adb", "-s", `${IP}:5555`, "shell",
      "am start -n com.hbo.hbonow/com.wbd.beam.BeamActivity -f 0x10000020"], { stdout: "pipe", stderr: "pipe" });
    console.log("  [ADB]", (await new Response(proc.stdout).text()).trim());
    return;
  }
  const cmd = `am start -a android.intent.action.VIEW -d "https://play.hbomax.com/show/${uuid}" -f 0x10000020 -e source 30 com.hbo.hbonow`;
  console.log(`  [ADB] Launching with UUID: ${uuid}`);
  const proc = Bun.spawn(["adb", "-s", `${IP}:5555`, "shell", cmd], { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(proc.stdout).text()).trim();
  console.log("  [ADB]", out);
}

const TESTS = [
  "Succession",
  "The Batman",
  "The Sopranos",
  "Barry",
  "Dune",
  "The Wire",
  "Friends",
  "Tokyo Vice",
];

for (let i = 0; i < TESTS.length; i++) {
  const query = TESTS[i];
  console.log(`\n${"=".repeat(70)}`);
  console.log(`[${i + 1}/${TESTS.length}] "${query}"`);
  console.log(`${"=".repeat(70)}`);

  const jw = await searchJW(query);
  if (!jw) {
    console.log("  ❌ Not found on JustWatch");
    continue;
  }

  const titles = [jw.originalTitle, jw.title, query].filter(Boolean) as string[];
  console.log(`  JW: "${jw.title}" (${jw.objectType}${jw.year ? `, ${jw.year}` : ""})${jw.originalTitle ? ` orig:"${jw.originalTitle}"` : ""}`);

  const slug = slugify(titles[0]);
  console.log(`  Slug: "${slug}"`);

  // Build paths based on object type
  const paths: { path: string; label: string }[] = [];
  if (jw.objectType === "SHOW") {
    paths.push(
      { path: `/${slug}`, label: "Direct" },
      { path: `/series/${slug}`, label: "Series" },
      { path: `/tv/${slug}`, label: "TV" },
      { path: `/content/${slug}`, label: "Content" },
    );
  } else {
    paths.push(
      { path: `/movies/${slug}`, label: "Movies" },
      { path: `/movie/${slug}`, label: "Movie" },
      { path: `/content/movies/${slug}`, label: "Content/Movies" },
      { path: `/${slug}`, label: "Direct(-)" },
    );
  }

  let resolved: string | null = null;

  console.log("  Paths:");
  for (const p of paths) {
    const r = await tryPath(p.path);
    const icon = r.uuid ? "✅" : "❌";
    console.log(`    ${icon} /${p.label.padEnd(13)} → ${r.note}`);
    if (r.uuid && !resolved) resolved = r.uuid;
  }

  if (!resolved) {
    console.log("  Startpage:");
    const q = encodeURIComponent(`${query} HBO Max`);
    const spRes = await fetch(`https://www.startpage.com/sp/search?q=${q}`, { headers: { "User-Agent": UA } });
    const spHtml = await spRes.text();
    const spM = spHtml.match(/hbomax\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/i);
    if (spM) {
      resolved = spM[1];
      console.log(`    ✅ Startpage → UUID: ${resolved}`);
    } else {
      console.log("    ❌ Startpage failed");
    }
  }

  const icon = resolved ? "✅" : "❌";
  console.log(`  Result: ${icon} ${resolved || "NO UUID"}`);

  // Send to Fire TV
  if (i > 0) {
    console.log("  ⏳ Waiting 5s before ADB launch...");
    await new Promise(r => setTimeout(r, 5000));
  }
  await sendAdb(resolved);

  if (i < TESTS.length - 1) {
    console.log("  ⏳ Waiting 5s before next test...");
    await new Promise(r => setTimeout(r, 5000));
  }
}

console.log("\n🏁 All done!");
