const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const artifactRoot = path.join(root, ".qa-artifacts", "optimization");

function walk(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, predicate, output);
    else if (!predicate || predicate(full)) output.push(full);
  }
  return output;
}

function writeReport(name, data) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const file = path.join(artifactRoot, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function replacementFile(target) {
  const extension = path.extname(target);
  const stem = path.basename(target, extension);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(path.dirname(target), `.${stem}.${suffix}.tmp${extension}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

module.exports = { root, artifactRoot, walk, writeReport, formatBytes, replacementFile, run };
