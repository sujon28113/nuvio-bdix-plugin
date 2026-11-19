#!/usr/bin/env node

/**
 * Nuvio Provider Build & Transpilation Script
 *
 * Bundles ES modules from src/<provider>/ into a single Hermes / QuickJS-safe
 * CommonJS file in providers/<provider>.js.
 *
 * Transpiles ES2017+ async/await into ES2016 Generators, resolving the Hermes
 * engine constraint in NuvioTV & NuvioMobile.
 *
 * Usage:
 *   node build.js                  # Builds all providers in src/
 *   node build.js bdix-dhakaflix   # Builds only bdix-dhakaflix
 *   node build.js --minify         # Builds minified for release
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "src");
const outDir = path.join(__dirname, "providers");

// Modules supplied natively by Nuvio runtime if any
const EXTERNAL_MODULES = [
  "cheerio-without-node-native",
  "react-native-cheerio",
  "crypto-js",
  "axios"
];

function getProvidersToBuild() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (args.length > 0) {
    return args;
  }

  if (!fs.existsSync(srcDir)) {
    console.error("❌ src/ directory not found.");
    process.exit(1);
  }

  return fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

async function buildProvider(providerName, shouldMinify = false) {
  const providerDir = path.join(srcDir, providerName);
  const entryPoint = path.join(providerDir, "index.js");
  const outFile = path.join(outDir, `${providerName}.js`);

  if (!fs.existsSync(entryPoint)) {
    console.warn(`⚠️ Skipping ${providerName}: no ${entryPoint} found`);
    return false;
  }

  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: outFile,
      format: "cjs",
      platform: "neutral",
      target: "es2016", // Essential for Hermes / QuickJS async compatibility
      minify: shouldMinify,
      sourcemap: false,
      external: EXTERNAL_MODULES,
      banner: {
        js: `/**\n * ${providerName} - Built for Nuvio\n * Generated: ${new Date().toISOString()}\n */`
      },
      logLevel: "warning"
    });

    const stats = fs.statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`✅ Successfully built: providers/${providerName}.js (${sizeKB} KB)`);
    return true;
  } catch (err) {
    console.error(`❌ Build error for ${providerName}:`, err.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldMinify = args.includes("--minify");

  const providers = getProvidersToBuild();

  if (providers.length === 0) {
    console.log("No providers found in src/ directory.");
    return;
  }

  console.log(`\n📦 Building ${providers.length} provider(s)... [target: es2016/Hermes]\n`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let success = 0;
  let failed = 0;

  for (const provider of providers) {
    const ok = await buildProvider(provider, shouldMinify);
    if (ok) success++;
    else failed++;
  }

  console.log(`\n✨ Build Complete: ${success} built, ${failed} failed.\n`);
}

main().catch((err) => {
  console.error("Fatal build error:", err);
  process.exit(1);
});
