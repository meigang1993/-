const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

function assertFastAudioOnset(file, maxOnsetMs) {
  const ffmpeg = require("ffmpeg-static");
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-f", "f32le", "-ac", "1", "-ar", "44100", "pipe:1",
  ], { encoding: null });
  assert.strictEqual(result.status, 0, result.stderr?.toString() || "audio decode failed");
  const samples = new Float32Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    Math.floor(result.stdout.byteLength / Float32Array.BYTES_PER_ELEMENT),
  );
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const onset = samples.findIndex(sample => Math.abs(sample) >= peak * .1);
  assert(onset >= 0 && onset / 44.1 <= maxOnsetMs,
    `magic hit onset must be within ${maxOnsetMs}ms, got ${(onset / 44.1).toFixed(1)}ms`);
}

assertFastAudioOnset(path.join(__dirname, "../publish/assets/sounds/magic-hit.mp3"), 40);

global.window = global;
require("../src/original/game-random.js");
global.performance = global.performance || { now: () => Date.now() };
const rafQueue = [];
let rafNow = performance.now();
global.requestAnimationFrame = callback => { rafQueue.push(callback); return rafQueue.length; };
global.document = {
  addEventListener() {},
  removeEventListener() {},
};
function flushRaf() {
  let count = 0;
  while (rafQueue.length) {
    rafNow += 300;
    rafQueue.shift()(rafNow);
    if (++count > 20) throw new Error("BGM fade did not settle");
  }
}

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));

class FakeBgmAudio {
  constructor() {
    FakeBgmAudio.instance = this;
    this._src = "";
    this.currentTime = 0;
    this.paused = true;
    this.volume = 0;
  }
  set src(value) {
    this._src = value;
    this.sources = [...(this.sources || []), value];
    this.pending?.reject(Object.assign(new Error("interrupted by a new load request"), { name: "AbortError" }));
    this.pending = null;
  }
  get src() { return this._src; }
  play() {
    this.paused = false;
    return new Promise((resolve, reject) => {
      this.pending = { reject };
      queueMicrotask(resolve);
    });
  }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; }
  load() {}
  addEventListener() {}
}

global.Audio = FakeBgmAudio;
global.GameData = { missions: [] };
global.startOpen = true;
require("../src/original/bgm.js");

(async () => {
  GameBGM.update({ view: "hall", settings: { musicVolume: 80 } });
  flushRaf();
  GameBGM.unlock();
  global.startOpen = false;
  GameBGM.update({ view: "hall", settings: { musicVolume: 80 } });
  GameBGM.setVolume(0);
  flushRaf();
  assert(FakeBgmAudio.instance.src.endsWith("villa.m4a"), "volume changes during a fade must finish the pending BGM switch");
  assert.strictEqual(FakeBgmAudio.instance.volume, 0, "a fade must not overwrite the selected music volume");
  GameBGM.update({ view: "battle", battle: {}, settings: { musicVolume: 80 } });
  flushRaf();
  GameBGM.update({ view: "battle", battle: { victoryScreen: true }, settings: { musicVolume: 80 } });
  GameBGM.setVolume(100);
  flushRaf();
  assert(FakeBgmAudio.instance.paused && !FakeBgmAudio.instance.src, "changing volume during a stop fade must not revive the old BGM");
  GameBGM.update({ view: "hall", settings: { musicVolume: 80 } });
  flushRaf();
  global.GameData.missions = [{ id: "special", bgm: "./assets/sounds/mission-special.mp3" }];
  const target = GameBGM.battleTrack("special", [
    { type: "elite", bgm: "./assets/sounds/elite-special.mp3" },
    { type: "boss", bgm: "./assets/sounds/boss-special.mp3" },
  ]);
  const sourceCount = FakeBgmAudio.instance.sources.length;
  GameBGM.primeBattle(target);
  await Promise.resolve();
  await Promise.resolve();
  const primed = FakeBgmAudio.instance.sources.slice(sourceCount);
  assert(FakeBgmAudio.instance.src.endsWith("boss-special.mp3"), "battle priming must use the final boss track");
  assert(!primed.some(src => src.endsWith("machine-factory-battle.m4a")), "special battle priming must not assign the default battle track first");
  assert(!warnings.some(text => text.includes("BGM播放失败")), "stale BGM source-switch rejection must stay silent");

  let fetchCalls = 0, mediaLoads = 0, mediaPlays = 0;
  const playedSources = [];
  class FakeSfxAudio {
    constructor(src = "") { this.src = src; this.volume = 0; }
    load() { mediaLoads += 1; }
    play() { mediaPlays += 1; playedSources.push(this.src); return Promise.resolve(); }
    cloneNode() { return new FakeSfxAudio(this.src); }
  }
  class FakeAudioContext {
    constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
  }
  global.Audio = FakeSfxAudio;
  global.AudioContext = FakeAudioContext;
  global.location = { protocol: "blob:", origin: "null" };
  global.fetch = async () => { fetchCalls += 1; throw new Error("Failed to fetch"); };
  global.BattleDamageFX = { unlockAudio() {} };
  global.state = { settings: { sfxVolume: 80 }, battle: {} };
  require("../src/original/battle-audio-samples.js");
  require("../src/original/battle-audio.js");

  BattleAudio.unlockAudio();
  await new Promise(resolve => setTimeout(resolve, 60));
  BattleAudio.floatSfx("damage");
  BattleAudio.magicHit();
  const fallbackDeadline = Date.now() + 250;
  while (mediaPlays < 2 && Date.now() < fallbackDeadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.strictEqual(fetchCalls, 0, "opaque-origin battle audio must not use CORS-sensitive fetch");
  assert(mediaLoads >= 5, "battle audio fallback should warm every sample");
  assert(mediaPlays >= 2, "battle audio fallback should still play requested samples");
  assert(playedSources.some(src => src.endsWith("magic-hit.mp3")), "magic damage should use its sampled hit sound");
  assert(!warnings.some(text => text.includes("战斗音效预加载失败")), "fallback preload must not emit failure warnings");

  let mutedAudioNodes = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class MutedAudioContext {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    createBuffer() { mutedAudioNodes += 1; return { getChannelData: () => new Float32Array(1) }; }
    createBufferSource() { mutedAudioNodes += 1; return { connect() {}, start() {} }; }
    createBiquadFilter() { mutedAudioNodes += 1; return { connect() {}, frequency: param(), Q: param() }; }
    createGain() { mutedAudioNodes += 1; return { connect() {}, gain: param() }; }
    createOscillator() { mutedAudioNodes += 1; return { connect() {}, start() {}, stop() {}, frequency: param() }; }
  }
  global.AudioContext = MutedAudioContext;
  global.state = { settings: { sfxVolume: 0 }, battle: {} };
  require("../src/original/battle-damage-audio.js");
  require("../src/original/battle-damage-fx.js");
  let sampledMagicHits = 0, synthesizedMagicHits = 0;
  BattleAudio.magicHit = () => { sampledMagicHits += 1; };
  const damageSound = BattleDamageAudio.sound;
  BattleDamageAudio.sound = type => {
    if (type === "magic") synthesizedMagicHits += 1;
    damageSound(type);
  };
  BattleDamageFX.unlockAudio();
  BattleDamageFX.impact({ attackType: "magic", damageTypes: ["physical"] });
  BattleDamageFX.impact({ damageTypes: ["thunder"] });
  await Promise.resolve();
  assert.strictEqual(sampledMagicHits, 1, "magic damage should route to the sampled hit cue");
  assert.strictEqual(synthesizedMagicHits, 0, "magic damage should not layer the old synthesized cue");
  assert.strictEqual(mutedAudioNodes, 0, "muted elemental damage must not allocate Web Audio nodes");

  console.warn = originalWarn;
  console.log("Audio loading fallback tests passed");
})().catch(err => {
  console.warn = originalWarn;
  console.error(err.message);
  process.exit(1);
});
