const fs = require("node:fs");
const path = require("node:path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@expo",
  "cli",
  "build",
  "src",
  "start",
  "server",
  "metro",
  "dev-server",
  "createMetroMiddleware.js",
);

const from = 'res.setHeader("X-React-Native-Project-Root", metroConfig.projectRoot);';
const to =
  'res.setHeader("X-React-Native-Project-Root", encodeURI(metroConfig.projectRoot));';

try {
  if (!fs.existsSync(target)) {
    console.log("[patch-expo-header] target not found, skipping");
    process.exit(0);
  }

  const source = fs.readFileSync(target, "utf8");
  if (source.includes(to)) {
    console.log("[patch-expo-header] already patched");
    process.exit(0);
  }
  if (!source.includes(from)) {
    console.log("[patch-expo-header] pattern not found, skipping");
    process.exit(0);
  }

  fs.writeFileSync(target, source.replace(from, to), "utf8");
  console.log("[patch-expo-header] patched @expo/cli header encoding");
} catch (error) {
  console.error("[patch-expo-header] failed:", error);
  process.exit(1);
}
