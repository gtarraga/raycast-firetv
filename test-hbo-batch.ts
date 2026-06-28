/**
 * Batch test: resolve → ADB with 2s delays.
 * Run: bun test-hbo-batch.ts
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IP = "192.168.1.122";

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, ""); }
function extractUuid(url: string) { const m = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i); return m ? m[0] : null; }

async function direct(title: string, isMovie: boolean) {
  const path = isMovie ? `/movies/${slugify(title)}` : `/${slugify(title)}`;
  const res = await fetch(`https://www.hbo.com${path}`, { headers: { "User-Agent": UA }, redirect: "follow" });
  return extractUuid(res.url);
}
async function startpage(title: string) {
  const res = await fetch(`https://www.startpage.com/sp/search?q=${encodeURIComponent(title+" HBO Max")}`, { headers: { "User-Agent": UA } });
  const html = await res.text();
  const m = html.match(/hbomax\.com\/(?:shows|movies)\/[a-z0-9-]+\/([a-f0-9-]{36})/i);
  return m ? m[1] : null;
}
async function adb(uuid: string | null, label: string) {
  if (!uuid) { console.log(`  [ADB] ❌ no UUID — skipping`); return; }
  const cmd = `am start -a android.intent.action.VIEW -d "https://play.hbomax.com/show/${uuid}" -f 0x10000020 -e source 30 com.hbo.hbonow`;
  const p = Bun.spawn(["adb", "-s", `${IP}:5555`, "shell", cmd], { stdout: "pipe", stderr: "pipe" });
  console.log(`  [ADB] ✅ ${label}`);
}

const tests: [string, boolean][] = [
  ["Regular Show", false], ["Adventure Time", false], ["Rick and Morty", false],
  ["Peacemaker", false], ["Harley Quinn", false], ["Doom Patrol", false],
  ["Joker", true], ["Inception", true], ["The Dark Knight", true], ["Barbie", true],
];

console.log("🎯 Batch resolve → Fire TV (2s between)\n");

for (let i = 0; i < tests.length; i++) {
  const [title, isMovie] = tests[i];
  console.log(`[${i+1}/${tests.length}] ${title}`);
  let uuid = await direct(title, isMovie);
  let method = "direct";
  if (!uuid) { uuid = await startpage(title); method = "startpage"; }
  console.log(`  ${uuid ? "✅" : "❌"} ${method}: ${uuid || "NOT FOUND"}`);
  await adb(uuid, method === "direct" ? "redirect" : "Startpage");
  if (i < tests.length - 1) { await new Promise(r => setTimeout(r, 2000)); }
}
console.log("\n🏁 done");
