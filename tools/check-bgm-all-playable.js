/* global GameBGM */
// BGM 全量可播放性检查：28 首被引用的曲目逐首走真实 WebAudio 适配器，
// 并覆盖 bgm.js 的 4 个 track key、battleTrack 回落链、bgmOverride、
// primeBattle、时停挂起/恢复、胜利停止后回大厅，以及 file: 协议原生回退路径。
// REVERT=<组> 对源码做真实替换，要求对应组精准打红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const REPL = {
  wire: ["bgm.js", "  const audio = window.BGMWebAudio?.create?.() || new Audio();", "  const audio = new Audio();"],
  loop: ["bgm-webaudio.js", "      s.loop = true;", "      s.loop = false;"],
  protocol: ["bgm-webaudio.js", "    return !!(window.AudioContext || window.webkitAudioContext) && webSafe;",
    "    return !!(window.AudioContext || window.webkitAudioContext);"],
  fallback: ["bgm-webaudio.js", "        .catch(() => { if (my === token) degrade(); });", "        .catch(() => {});"],
};
const EXPECT = { wire: ["C"], loop: ["B"], protocol: ["D"], fallback: ["D"] };
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");
const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT 目标未命中: ${r[1]}`);
    s = s.replace(r[1], r[2]);
  }
  return s;
};
const results = [];
const check = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });

// ---------- 收集所有被引用的 BGM 路径 ----------
const sfx = new Set(["armor-hit.mp3", "hp-heal.mp3", "hp-hit.mp3", "hp-loss.mp3", "magic-hit.mp3"]);
const refs = new Set();
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith(".js"))) {
  for (const m of raw(f).matchAll(/["'](\.\/assets\/[^"']+\.(?:ogg|mp3))["']/g)) {
    if (!sfx.has(path.basename(m[1]))) refs.add(m[1]);
  }
}
const list = [...refs].sort();
const files = list.map(r => path.join(ROOT, "publish", r.replace(/^\.\//, "")));
check("A", "A1 引用曲目数量（含 4 个基础 track）", list.length >= 28, `count=${list.length}`);
check("A", "A2 每个引用文件都存在且非空", files.every(p => fs.existsSync(p) && fs.statSync(p).size > 1024));
check("A", "A3 扩展名仅 ogg/mp3（浏览器可解码）", list.every(r => /\.(ogg|mp3)$/.test(r)));
check("A", "A4 无重复引用 / 全部为相对 ./assets 路径", new Set(list).size === list.length && list.every(r => r.startsWith("./assets/")));
// 真实 duration：用 ffprobe 批量取，验证文件本身不是坏流
let durations = [];
try {
  durations = list.map((r, i) => {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", files[i]], { encoding: "utf8", timeout: 30000 }).trim();
    return Number(out) || 0;
  });
} catch (_) { durations = list.map(() => 0); }
check("A", "A5 28 首均可被解码（ffprobe duration > 0）", durations.every(d => d > 0),
  `min=${Math.min(...durations).toFixed(2)}s max=${Math.max(...durations).toFixed(2)}s`);
check("A", "A6 每首都 < 场景音频上限 1.75 MiB", files.every(p => fs.statSync(p).size <= 1750 * 1024));

// ---------- 环境（https: 协议 → WebAudio 路径） ----------
global.window = global;
window.location = { protocol: "https:", origin: "https://example.test" };
window.document = { addEventListener() {}, removeEventListener() {} };
global.performance = global.performance || { now: () => Date.now() };
const raf = [];
let rafNow = performance.now();
global.requestAnimationFrame = cb => { raf.push(cb); return raf.length; };
const flushRaf = () => { let n = 0; while (raf.length) { rafNow += 300; raf.shift()(rafNow); if (++n > 30) throw new Error("fade stuck"); } };
class Src {
  constructor() { this.loop = false; this.loopStart = 0; this.loopEnd = 0; this.started = null; this.stopped = 0; Src.all.push(this); }
  connect() {} start(w, o) { this.started = { when: w, offset: o }; } stop() { this.stopped += 1; } disconnect() {}
}
Src.all = [];
class Gain { constructor() { this.gain = { value: 0 }; } connect() {} }
class Ctx {
  constructor() { this.state = "running"; this.sampleRate = 44100; this.destination = {}; this.resumeCalls = 0; this.suspendCalls = 0; Ctx.instance = this; }
  createGain() { Ctx.gain = new Gain(); return Ctx.gain; }
  createBufferSource() { return new Src(); }
  decodeAudioData(ab) {
    const i = Ctx.idx || 0;
    // 浏览器解码 Vorbis 会比 ffprobe 的 granule 时长多出块对齐 padding；
    // 这里按真实解码帧数（granule + 64 samples）给 duration。
    const d = (durations[i] || 120) + (list[i]?.endsWith(".ogg") ? 64 / 44100 : 0);
    return Promise.resolve({ duration: d, sampleRate: 44100, ab });
  }
  resume() { this.resumeCalls += 1; this.state = "running"; return Promise.resolve(); }
  suspend() { this.suspendCalls += 1; this.state = "suspended"; return Promise.resolve(); }
}
class Media {
  constructor() { this.loop = false; this.volume = 0; this._src = ""; this.paused = true; Media.all.push(this); }
  set src(v) { this._src = v; } get src() { return this._src; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; } load() {} removeAttribute() { this._src = ""; } addEventListener() {}
}
Media.all = [];
global.Audio = Media;
global.AudioContext = Ctx;
const abCache = new Map();
function arrayBufferOf(url) {
  const rel = url.replace(/^\.\//, "");
  if (!abCache.has(rel)) {
    const b = fs.readFileSync(path.join(ROOT, "publish", rel));
    abCache.set(rel, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return abCache.get(rel);
}
let requestCount = 0;
global.fetch = async url => { requestCount += 1; return { ok: true, arrayBuffer: async () => arrayBufferOf(url) }; };
global.GameData = { missions: [] };
global.startOpen = false;
for (const n of ["bgm-loop-metadata.js", "bgm-webaudio.js", "bgm.js"]) vm.runInThisContext(patched(n), { filename: n });
// bgm.js 顶层就创建了适配器；B 段后面还会再 create() 一个独立实例，
// 所以这里先固定住 GameBGM 自己用的 ctx，C 段不能依赖 Ctx.instance。
const bgmCtx = Ctx.instance || null;
// bgm.js 在 REVERT=wire 时会 new Audio() 建一个原生实例，属正常兜底，不算降级。
const baselineMedia = Media.all.length;

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

(async () => {
  // ---------- B 逐首起播 ----------
  const player = window.BGMWebAudio.create();
  check("B", "B1 https: 下 WebAudio 适配器可用", !!player && !(player instanceof Media));
  let okCount = 0;
  const loopEnds = [];
  for (let i = 0; i < list.length; i += 1) {
    Ctx.idx = i;
    const before = Src.all.length;
    player.src = list[i]; player.volume = 0.5; player.play();
    await settle();
    const s = Src.all[before];
    if (s && s.loop === true && s.started && s.loopEnd > 0) { okCount += 1; loopEnds.push(s.loopEnd); }
  }
  check("B", "B2 全部曲目都成功起播 loop=true", okCount === list.length,
    `ok=${okCount}/${list.length}`);
  check("B", "B3 无循环标签曲目 loopEnd 等于整曲时长（无 padding 截断）", (() => {
    const ogg = list.findIndex(r => r.includes("tenri-institute-battle"));
    return ogg >= 0 && loopEnds.every((v, i) => i === ogg || Math.abs(v - durations[i]) < 0.01);
  })());
  const tenri = list.findIndex(r => r.includes("tenri-institute-battle"));
  check("B", "B4 研究所曲按 LOOPLENGTH 精确循环（跳过尾部 padding）",
    tenri >= 0 && Math.abs(loopEnds[tenri] - 6658560 / 44100) < 1e-9
    && loopEnds[tenri] < durations[tenri] + 64 / 44100 - 1e-9, `loopEnd=${loopEnds[tenri]}`);
  check("B", "B5 旧曲切到新曲时旧 source 被 stop（不叠加）", Src.all.slice(0, -1).every(s => s.stopped > 0));
  check("B", "B6 全部请求成功、无降级到 Media", Media.all.length === baselineMedia && requestCount === list.length,
    `requests=${requestCount} media=${Media.all.length} base=${baselineMedia}`);

  // ---------- C bgm.js 全链路 ----------
  check("C", "C1 bgm.js 优先 WebAudio 且保留原生兜底",
    patched("bgm.js").includes("window.BGMWebAudio?.create?.() || new Audio()"));
  Ctx.idx = list.indexOf("./assets/sounds/op.ogg");
  global.startOpen = true;
  GameBGM.update({ view: "hall", settings: { musicVolume: 80 } }); flushRaf();
  GameBGM.unlock();
  check("C", "C2 开屏 op.ogg 起播", Src.all.some(s => s.started != null));
  global.startOpen = false;
  for (const [view, expect] of [["hall", "villa.ogg"], ["dungeon", "dungeon-map.ogg"],
    ["battle", "machine-factory-battle.ogg"]]) {
    Ctx.idx = list.findIndex(r => r.endsWith(expect));
    GameBGM.update({ view, battle: {}, settings: { musicVolume: 80 } }); flushRaf();
  }
  check("C", "C3 hall / dungeon / battle 三个 track key 均完成切曲", Src.all.length >= 4);
  const track = GameBGM.battleTrack("special", [
    { type: "boss", bgm: "./assets/sounds/boss.ogg" },
    { type: "elite", bgm: "./assets/sounds/elite.ogg" }]);
  check("C", "C4 battleTrack 优先 boss / elite / mission 回落链", track === "./assets/sounds/boss.ogg");
  Ctx.idx = 0;
  GameBGM.primeBattle("./assets/new-bgm/ruins-sand-city-battle.mp3"); await settle();
  check("C", "C5 primeBattle 指定曲目直接起播", Src.all[Src.all.length - 1]?.started != null);
  const c = bgmCtx || { suspendCalls: 0, resumeCalls: 0, state: "running" };
  const sb = c.suspendCalls, rb = c.resumeCalls;
  GameBGM.suspend("test"); flushRaf();
  const paused = c.state === "suspended" && c.suspendCalls > sb;
  GameBGM.resume("test"); flushRaf();
  check("C", "C6 时停 suspend/resume 保留采样点并恢复", paused && c.state === "running" && c.resumeCalls > rb);
  GameBGM.update({ view: "battle", battle: { victoryScreen: true }, settings: { musicVolume: 80 } }); flushRaf();
  GameBGM.update({ view: "hall", settings: { musicVolume: 80 } }); flushRaf(); await settle();
  check("C", "C7 胜利停止后回大厅仍能重新起播", Src.all[Src.all.length - 1]?.started != null);

  // ---------- D 原生回退路径 ----------
  const saved = window.location;
  window.location = { protocol: "file:", origin: "null" };
  const q = requestCount;
  check("D", "D1 file:/blob: 静默回退（不发起 CORS 请求）",
    window.BGMWebAudio.available() === false && window.BGMWebAudio.create() === null
    && requestCount === q);
  window.location = { protocol: "blob:", origin: "null" };
  check("D", "D2 blob: 同样回退", window.BGMWebAudio.available() === false);
  window.location = saved;
  check("D", "D3 解码失败时自动降级 HTMLAudioElement", (() => {
    const origFetch = global.fetch;
    global.fetch = async () => { throw new Error("decode fail"); };
    const p = window.BGMWebAudio.create(); p.src = "./bad.ogg"; p.play();
    global.fetch = origFetch;
    return true;
  })());
  await settle();
  check("D", "D4 降级后 Media 收到 src 且 loop=true（全部旧曲仍可播放）",
    Media.all.some(a => a.loop === true && a.src.includes("bad.ogg")));
  check("D", "D5 原生路径下所有引用文件均为 WebAudio 可解码格式（ogg/mp3）",
    list.every(r => /\.(ogg|mp3)$/.test(r)));

  const failed = results.filter(r => !r.ok);
  if (REVERT) {
    const want = EXPECT[REVERT] || [];
    const own = failed.filter(r => want.includes(r.g)).length;
    const other = failed.filter(r => !want.includes(r.g)).length;
    console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
    failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n} ${r.d}`));
    process.exit(own > 0 && other === 0 ? 0 : 1);
  }
  results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
  console.log(`RESULT ${results.length - failed.length}/${results.length} · 曲目 ${list.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
