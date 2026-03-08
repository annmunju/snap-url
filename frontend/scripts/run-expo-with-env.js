const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function loadEnvFile(filePath, targetEnv) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    targetEnv[key] = value;
  }
}

const [, , appEnv, ...expoArgs] = process.argv;

if (!appEnv || expoArgs.length === 0) {
  console.error("usage: node scripts/run-expo-with-env.js <environment> <expo args...>");
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, "..");
const childEnv = { ...process.env, APP_ENV: appEnv };

for (const fileName of [
  ".env",
  `.env.${appEnv}`,
  ".env.local",
  `.env.${appEnv}.local`,
]) {
  loadEnvFile(path.join(projectRoot, fileName), childEnv);
}

const child = spawn("npx", ["expo", ...expoArgs], {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
