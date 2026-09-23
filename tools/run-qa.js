const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
require("./repository-toolchain");
const catalog = require("./qa-test-catalog");

const root = path.resolve(__dirname, "..");
const bin = name => path.join(root, "node_modules", ".bin", name);
const nodeTask = (name, file) => ({ name, command: process.execPath, args: [path.join(root, file)] });
const logicTasks = tests => tests.map(test =>
  nodeTask(`${test.group}/${test.id}`, `tools/${test.file}`));

const lintTasks = [
  {
    name: "eslint",
    command: process.execPath,
    args: [path.join(root, "tools/run-domain-lint.js"), "original"],
  },
  {
    name: "stylelint",
    command: bin("stylelint"),
    args: ["--cache", "--cache-location", ".qa-cache/stylelint", "publish/**/*.css"],
  },
  { name: "htmlhint", command: bin("htmlhint"), args: ["publish/**/*.html"] },
];

const coreTasks = [
  {
    name: "git save guard",
    command: process.execPath,
    args: [path.join(root, "tools/install-git-hooks.js"), "--check"],
  },
  nodeTask("runtime risks", "tools/check-runtime-risks.js"),
  nodeTask("static rules", "tools/check-static.js"),
  {
    name: "publish bundles",
    command: process.execPath,
    args: [path.join(root, "tools/build-publish-bundles.js"), "--check"],
  },
  nodeTask("data schema", "tools/validate-data.js"),
  nodeTask("data relations", "tools/validate-relations.js"),
  nodeTask("resources", "tools/check-resources.js"),
  nodeTask("asset budget", "tools/check-asset-budget.js"),
  nodeTask("script contracts", "tools/check-script-contracts.js"),
  {
    name: "duplicate budget",
    command: bin("jscpd"),
    args: ["--config", ".jscpd.json", "--no-colors", "--no-tips"],
  },
];

catalog.validate(root);
const allLogicTasks = logicTasks(catalog.tests);

const modes = {
  lint: lintTasks,
  core: coreTasks.slice(1),
  quick: [...lintTasks, ...coreTasks],
  logic: allLogicTasks,
  prebrowser: [...lintTasks, ...coreTasks, ...allLogicTasks],
};

function runTask(task) {
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(task.command, task.args, { cwd: root, env: process.env });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", error => resolve({ task, code: 1, output: `${output}${error.message}\n`, started }));
    child.on("close", code => resolve({ task, code: code ?? 1, output, started }));
  });
}

async function runQueue(tasks, concurrency) {
  const pending = [...tasks];
  const failures = [];
  async function worker() {
    while (pending.length) {
      const result = await runTask(pending.shift());
      const seconds = ((Date.now() - result.started) / 1000).toFixed(2);
      const marker = result.code === 0 ? "PASS" : "FAIL";
      process.stdout.write(`[${marker}] ${result.task.name} (${seconds}s)\n`);
      if (result.code !== 0) {
        process.stdout.write(result.output);
        failures.push(result);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  if (failures.length) process.exitCode = 1;
}

const mode = process.argv[2];
if (mode === "list") {
  for (const group of Object.keys(catalog.groups)) {
    const ids = catalog.tests.filter(test => test.group === group).map(test => test.id);
    console.log(`${group} (${ids.length})`);
    ids.forEach(id => console.log(`  ${id}`));
  }
  process.exit(0);
}
let tasks;
if (mode === "focus") {
  try {
    tasks = logicTasks(catalog.select(process.argv.slice(3)));
  } catch (error) {
    console.error(`${error.message}. Run npm run test:original:list for available names.`);
    process.exit(2);
  }
} else {
  tasks = modes[mode];
}
if (!tasks) {
  console.error(`Usage: node tools/run-qa.js <${Object.keys(modes).join("|")}|focus|list>`);
  process.exit(2);
}

const configuredConcurrency = Number.parseInt(process.env.QA_CONCURRENCY, 10);
const detectedConcurrency = os.availableParallelism?.() || os.cpus().length || 1;
const concurrency = Number.isFinite(configuredConcurrency)
  ? Math.max(1, configuredConcurrency)
  : Math.max(2, Math.min(4, detectedConcurrency));
runQueue(tasks, concurrency);
