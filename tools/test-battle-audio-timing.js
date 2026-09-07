const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

global.window = global;
global.document = { addEventListener() {} };
global.location = { protocol: "blob:", origin: "null" };
global.state = { settings: { sfxVolume: 80, battleSpeed: 2 }, battle: {} };
let now = 1000;
Object.defineProperty(global, "performance", {
  configurable: true,
  value: { now: () => now },
});

const nodes = [];
const param = () => ({
  value: 0,
  setValueAtTime(value, at) { this.value = value; nodes.push(["set", value, at]); },
  linearRampToValueAtTime(value, at) { nodes.push(["linear", value, at]); },
  exponentialRampToValueAtTime(value, at) { nodes.push(["exponential", value, at]); },
});
class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 10;
    this.sampleRate = 1000;
    this.destination = {};
  }
  createOscillator() {
    const oscillator = {
      frequency: param(),
      connect() {},
      start(at) { nodes.push(["start", at]); },
      stop(at) { nodes.push(["stop", at]); },
    };
    return oscillator;
  }
  createGain() { return { gain: param(), connect() {} }; }
  createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
  createBufferSource() { return { connect() {}, start() {} }; }
  createBiquadFilter() { return { frequency: param(), Q: param(), connect() {} }; }
}
global.AudioContext = FakeAudioContext;
global.Audio = class {
  constructor(src = "") { this.src = src; }
  load() {}
  play() { return Promise.resolve(); }
  cloneNode() { return new global.Audio(this.src); }
};

function load(file) {
  vm.runInThisContext(fs.readFileSync(`src/original/${file}`, "utf8"), { filename: file });
}

load("battle-effect-animation.js");
load("battle-audio-samples.js");
load("battle-audio.js");
load("game-random.js");
load("battle-damage-audio.js");

(async () => {
  BattleAudio.unlockAudio();
  BattleAudio.tone(800, .2, "triangle", 100);
  await Promise.resolve();
  assert(nodes.some(item => item[0] === "start" && item[1] === 10.05),
    "BattleAudio tone delay must follow 2x battle animation speed");
  assert(nodes.some(item => item[0] === "stop" && item[1] === 10.17),
    "BattleAudio tone duration must follow 2x battle animation speed");

  nodes.length = 0;
  BattleDamageAudio.unlock();
  BattleDamageAudio.sound("poison");
  await Promise.resolve();
  assert(nodes.some(item => item[0] === "start" && item[1] === 10),
    "damage audio should start on the visual impact clock");
  assert(nodes.some(item => item[0] === "start" && item[1] === 10.045),
    "damage audio chained notes must scale their delay with battle speed");
  const firstHitStarts = nodes.filter(item => item[0] === "start").length;
  now += 40;
  BattleDamageAudio.sound("poison");
  await Promise.resolve();
  assert(nodes.filter(item => item[0] === "start").length === firstHitStarts * 2,
    "damage audio cooldown must follow battle speed without dropping valid rapid hits");

  console.log("Battle audio timing tests passed");
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
