import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

async function buildOne(options) {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    return ctx;
  }
  await esbuild.build(options);
  return null;
}

async function buildAll() {
  const shared = {
    format: "esm",
    logLevel: "info",
    sourcemap: true,
  };

  await buildOne({
    ...shared,
    entryPoints: ["src/manifest.ts"],
    bundle: true,
    outfile: "dist/manifest.js",
    platform: "node",
    target: "node18",
  });

  await buildOne({
    ...shared,
    entryPoints: ["src/worker.ts"],
    bundle: true,
    outfile: "dist/worker.js",
    platform: "node",
    target: "node18",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });

  await buildOne({
    ...shared,
    entryPoints: ["src/ui/index.tsx"],
    bundle: true,
    outdir: "dist/ui",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });

  if (watch) {
    console.log("👀 Watching plugin worker, manifest, and UI builds");
    return;
  }

  console.log("✅ Build complete");
}

buildAll().catch(error => {
  console.error(error);
  process.exit(1);
});
