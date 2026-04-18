import { equal, ok } from "node:assert";
import { existsSync } from "node:fs";

const manifestPath = new URL("../dist/manifest.js", import.meta.url);
const uiBundlePath = new URL("../dist/ui/index.js", import.meta.url);

try {
  const manifest = await import(manifestPath.href);
  ok(manifest.default, "Manifest should have a default export");
  equal(manifest.default.id, "personal-admin", "Plugin ID should be personal-admin");
  equal(manifest.default.entrypoints.ui, "./dist/ui", "UI entrypoint should be declared");
  ok(existsSync(uiBundlePath), "UI bundle should be built");
  console.log("✅ Smoke test passed");
} catch (err) {
  console.error("❌ Smoke test failed — dist not built:", err.message);
  process.exit(1);
}
