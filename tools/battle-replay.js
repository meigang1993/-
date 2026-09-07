const fs = require("fs");
const path = require("path");
const { record, verify } = require("./battle-replay-harness");

const root = path.resolve(__dirname, "..");
const defaultFile = path.join(root, ".qa-artifacts", "replays", "latest.json");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function replayFile() {
  const positional = process.argv.slice(3).find(value => !value.startsWith("--"));
  return path.resolve(root, positional || defaultFile);
}

async function main() {
  const command = process.argv[2];
  const file = replayFile();
  if (command === "record") {
    const input = {
      seed: Number(option("seed", 2971485)),
      missionId: option("mission", "machine_factory"),
      enemyId: option("enemy", "mechanical_goblin"),
      difficultyId: option("difficulty", "normal"),
      allyIds: option("allies", "lokar,besta_doll").split(",").filter(Boolean),
    };
    const replay = await record(input);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(replay, null, 2)}\n`);
    console.log(`Battle replay recorded: ${path.relative(root, file)} (${replay.randomCalls} random calls)`);
    return;
  }
  if (command === "verify") {
    const replay = JSON.parse(fs.readFileSync(file, "utf8"));
    const result = await verify(replay);
    console.log(`Battle replay verified: ${result.digest} (${result.randomCalls} random calls)`);
    return;
  }
  throw new Error("Usage: node tools/battle-replay.js <record|verify> [file] [--seed=N]");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
