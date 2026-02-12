#!/usr/bin/env node
// Clawtrl Wallet — npx installer
// Usage: npx clawtrl-wallet
// Downloads and runs install.sh from GitHub (works with or without root)

const { execSync, spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const INSTALL_URL =
  "https://raw.githubusercontent.com/PortalFnd/openclaw-skills/main/clawtrl-wallet/install.sh";

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  console.log("");
  console.log("  Clawtrl Wallet — downloading installer...");
  console.log("");

  try {
    const script = await download(INSTALL_URL);
    const tmpFile = path.join(os.tmpdir(), `clawtrl-install-${Date.now()}.sh`);
    fs.writeFileSync(tmpFile, script, { mode: 0o755 });

    const child = spawn("bash", [tmpFile], {
      stdio: "inherit",
      env: { ...process.env },
    });

    child.on("close", (code) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      process.exit(code || 0);
    });

    child.on("error", (err) => {
      console.error("  Failed to run installer:", err.message);
      console.error("  Try manually: curl -sSL " + INSTALL_URL + " | bash");
      try { fs.unlinkSync(tmpFile); } catch {}
      process.exit(1);
    });
  } catch (err) {
    console.error("  Failed to download installer:", err.message);
    console.error("  Try manually: curl -sSL " + INSTALL_URL + " | bash");
    process.exit(1);
  }
}

main();
