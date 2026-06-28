/**
 * End-to-end test of actual resolveMedia() with ADB launch.
 * Run: bun test-e2e.ts "Succession"
 */
import { resolveMedia } from "./src/lib/resolve";

const IP = "192.168.1.122";
const query = process.argv.slice(2).join(" ") || "Succession";

async function adb(intent: string) {
  const p = Bun.spawn(["adb", "-s", `${IP}:5555`, "shell", intent], { stdout: "pipe", stderr: "pipe" });
  console.log("[ADB]", (await new Response(p.stdout).text()).trim());
}

async function main() {
  console.log(`\n🔍 "${query}"`);
  const match = await resolveMedia(query, ["hbo"], "ES", "es");

  if (!match) { console.log("❌ no match"); return; }
  console.log(`✅ ${match.platform} → ${match.url || "(app home)"}`);
  console.log(`   intent: ${match.intent.slice(0, 120)}...`);
  if (match.fallback) console.log("   ⚠️  fallback");
  await adb(match.intent);
}
main();
