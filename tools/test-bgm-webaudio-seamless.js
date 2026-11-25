// BGM · WebAudio 采样级无缝专项检查
// 用真实 publish 里的研究所 OGG + 假的 AudioContext/fetch，走完整链路：
//   Ogg comment 解析 → decodeAudioData → AudioBufferSourceNode.loopStart/loopEnd
//   → bgm.js 淡入淡出 / 时停挂起 / 切曲 → 自动回退。
// REVERT=<组> 对源码做真实替换，要求对应组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const OGG = "publish/assets/new-bgm/tenri-institute-battle.c9d87b58.ogg";
const raw = name => fs.readFileSync(path.join(DIR, name), "utf8");
const REPL = {
  metadata: ["bgm-loop-metadata.js", "      if (Number.isFinite(loopEnd) && loopEnd > 0) base.loopEnd = loopEnd;", "      "],
  loopend: ["bgm-webaudio.js", "      s.loopEnd = loopEnd != null ? Math.min(loopEnd, buffer.duration) : buffer.duration;",
    "      s.loopEnd = buffer.duration;"],
  loopflag: ["bgm-webaudio.js", "      s.loop = true;", "      s.loop = false;"],
  wire: ["bgm.js", "  const audio = window.BGMWebAudio?.create?.() || new Audio();", "  const audio = new Audio();"],
};
const EXPECT_GROUPS = {
  metadata: ["A", "B"], loopend: ["B"], loopflag: ["B"], wire: ["C"],
};
const patched = name => {
  let s = raw(name);
  const r = REPL[REVERT];
  if (r && r[0] === name) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中：${r[1]}`);
    s = s.replace(r[1], r[2]);
  }
  return s;
};
const load = name => vm.runInThisContext(patched(name), { filename: name });

// ---------- 环境 ----------
const results = [];
const check = (group, name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail });
const oggPath = path.join(ROOT, OGG);
const oggBuf = fs.readFileSync(oggPath);
const oggAB = oggBuf.buffer.slice(oggBuf.byteOffset, oggBuf.byteOffset + oggBuf.byteLength);
const EXPECTED_LOOP_LENGTH = 6658560;
const EXPECTED_RATE = 44100;

global.window = global;
window.location = { protocol: "https:", origin: "https://example.test" };
window.document = { addEventListener() {}, removeEventListener() {} };
global.performance = global.performance || { now: () => Date.now() };
const raf = [];
let rafNow = performance.now();
global.requestAnimationFrame = cb => { raf.push(cb); return raf.length; };
function flushRaf() {
  let n = 0;
  while (raf.length) {
    rafNow += 300;
    raf.shift()(rafNow);
    if (++n > 20) throw new Error("fade did not settle");
  }
}

class FakeSource {
  constructor() {
    this.loop = false; this.loopStart = 0; this.loopEnd = 0;
    this.started = null; this.stopped = 0; this.connected = false;
    FakeSource.all.push(this);
  }
  connect() { this.connected = true; }
  start(when, offset) { this.started = { when, offset }; }
  stop() { this.stopped += 1; }
  disconnect() {}
}
FakeSource.all = [];
class FakeGain {
  constructor() { this.gain = { value: 0 }; this.connected = false; }
  connect() { this.connected = true; }
}
class FakeCtx {
  constructor() {
    this.state = "running"; this.sampleRate = EXPECTED_RATE;
    this.destination = {}; this.resumeCalls = 0; this.suspendCalls = 0;
    FakeCtx.instance = this;
  }
  createGain() { const g = new FakeGain(); FakeCtx.gain = g; return g; }
  createBufferSource() { return new FakeSource(); }
  decodeAudioData(ab) {
    return Promise.resolve({ duration: 6658624 / EXPECTED_RATE, sampleRate: EXPECTED_RATE, ab });
  }
  resume() { this.resumeCalls += 1; this.state = "running"; return Promise.resolve(); }
  suspend() { this.suspendCalls += 1; this.state = "suspended"; return Promise.resolve(); }
}
class FakeAudio {
  constructor() {
    this.loop = false; this.volume = 0; this._src = ""; this.paused = true;
    FakeAudio.all.push(this);
  }
  set src(v) { this._src = v; this.sources = [...(this.sources || []), v]; }
  get src() { return this._src; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() { this._src = ""; }
  addEventListener() {}
}
FakeAudio.all = [];
global.Audio = FakeAudio;
global.AudioContext = FakeCtx;
global.fetch = async url => ({ ok: true, arrayBuffer: async () => oggAB });

load("bgm-loop-metadata.js");
load("bgm-webaudio.js");
load("bgm.js");

const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

(async () => {
  // ---------- A 元数据解析 ----------
  const meta = window.BGMLoopMetadata.parse(oggAB);
  check("A", "A1 解析真实 Ogg 得到 44100Hz", !!meta && meta.sampleRate === EXPECTED_RATE,
    `rate=${meta && meta.sampleRate}`);
  check("A", "A2 LOOPSTART=0", !!meta && meta.loopStart === 0, `start=${meta && meta.loopStart}`);
  check("A", "A3 LOOPLENGTH=6658560（末页 granule）", !!meta && meta.loopEnd === EXPECTED_LOOP_LENGTH,
    `end=${meta && meta.loopEnd}`);
  check("A", "A4 非 Ogg / 空 buffer 安全返回 null",
    window.BGMLoopMetadata.parse(new ArrayBuffer(8)) === null);
  check("A", "A5 无循环标签的 Vorbis 退化整曲循环", (() => {
    const b = new Uint8Array(64);
    b.set([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 0);
    b[12] = 0x44; b[13] = 0xac; b[14] = 0; b[15] = 0; // 44100 LE
    const m = window.BGMLoopMetadata.parse(b.buffer);
    return m && m.loopEnd === null && m.loopStart === 0;
  })());

  // ---------- B 播放器精确循环 ----------
  const player = window.BGMWebAudio.create();
  check("B", "B1 create() 返回同构适配器（不是原生 Audio）",
    !!player && !(player instanceof FakeAudio) && player.loop === true);
  player.src = "./" + OGG.replace(/^publish\//, "");
  player.volume = 0.5;
  player.play();
  await settle();
  const s = FakeSource.all[0];
  check("B", "B2 source.loop === true", !!s && s.loop === true);
  check("B", "B3 loopStart === LOOPSTART/rate = 0", !!s && s.loopStart === 0,
    `loopStart=${s && s.loopStart}`);
  check("B", "B4 loopEnd === LOOPLENGTH/rate（跳过尾部 padding）",
    !!s && Math.abs(s.loopEnd - EXPECTED_LOOP_LENGTH / EXPECTED_RATE) < 1e-9
    && s.loopEnd < (6658624 / EXPECTED_RATE),
    `loopEnd=${s && s.loopEnd} duration=${6658624 / EXPECTED_RATE}`);
  check("B", "B5 从 offset 0 起播并连到 gain", !!s && s.started && s.started.offset === 0 && s.connected);
  check("B", "B6 volume 映射到 GainNode", FakeCtx.gain && FakeCtx.gain.gain.value === 0.5,
    `gain=${FakeCtx.gain && FakeCtx.gain.gain.value}`);
  check("B", "B7 切曲时旧 source 被 stop（防叠加）", (() => {
    const before = s ? s.stopped : 0;
    player.src = "./assets/sounds/other.ogg";
    return s && s.stopped > before;
  })());

  // ---------- C 接线 / 同构接口 / 时停 / 回退 ----------
  check("C", "C1 bgm.js 优先用 WebAudio 适配器并保留原生兜底",
    patched("bgm.js").includes("window.BGMWebAudio?.create?.() || new Audio()"));
  check("C", "C2 两个新模块在 startup-app 且位于 bgm.js 之前", (() => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/publish-bundles.json"), "utf8"));
    const v = m["startup-app"] || [];
    return v.includes("bgm-loop-metadata.js") && v.includes("bgm-webaudio.js")
      && v.indexOf("bgm-loop-metadata.js") < v.indexOf("bgm-webaudio.js")
      && v.indexOf("bgm-webaudio.js") < v.indexOf("bgm.js");
  })());
  check("C", "C3 全局白名单登记两个新模块",
    ["BGMLoopMetadata", "BGMWebAudio"].every(n =>
      fs.readFileSync(path.join(DIR, "runtime-globals.js"), "utf8").includes('"' + n + '"')));
  check("C", "C4 pause/resume 用 AudioContext 挂起（保留采样点）", (() => {
    const c = FakeCtx.instance;
    const before = c.suspendCalls, rb = c.resumeCalls;
    player.pause();
    const paused = player.paused === true && c.suspendCalls > before;
    player.play();
    return paused && c.resumeCalls > rb && player.paused === false;
  })());
  check("C", "C5 currentTime / removeAttribute / load 同构接口可用", (() => {
    player.currentTime = 0;
    player.removeAttribute("src");
    player.load();
    return player.src === "";
  })());
  check("C", "C6 无 AudioContext 时 create() 返回 null（原生兜底）", (() => {
    const saved = global.AudioContext;
    delete global.AudioContext;
    const r = window.BGMWebAudio.available() === false && window.BGMWebAudio.create() === null;
    global.AudioContext = saved;
    return r;
  })());
  check("C", "C7 解码失败自动降级 HTMLAudioElement", (() => {
    const origFetch = global.fetch;
    global.fetch = async () => { throw new Error("decode fail"); };
    const p = window.BGMWebAudio.create();
    p.src = "./bad.ogg";
    p.play();
    const ok = true; // 降级在 catch 的 microtask 里完成，下面统一 settle 后复核
    global.fetch = origFetch;
    return ok;
  })());
  await settle();
  check("C", "C8 降级后新 Audio 收到 src 且 loop=true",
    FakeAudio.all.some(a => a.loop === true && a.src.includes("bad.ogg")));
  check("C", "C9 file:// / blob: 协议静默回退（不发 CORS 请求）", (() => {
    const saved = window.location;
    let requests = 0;
    const savedFetch = global.fetch;
    global.fetch = async () => { requests += 1; throw new Error("should not fetch"); };
    window.location = { protocol: "file:", origin: "null" };
    const a = window.BGMWebAudio.available() === false && window.BGMWebAudio.create() === null;
    window.location = { protocol: "blob:", origin: "null" };
    const b = window.BGMWebAudio.available() === false && window.BGMWebAudio.create() === null;
    window.location = saved;
    global.fetch = savedFetch;
    return a && b && requests === 0;
  })());

  // ---------- D 真实文件 ----------
  const bin = oggBuf.toString("latin1");
  check("D", "D1 真实 OGG 含 LOOPSTART/LOOPLENGTH",
    bin.includes("LOOPSTART=0") && bin.includes("LOOPLENGTH=" + EXPECTED_LOOP_LENGTH));
  check("D", "D2 mission.bgm 指向该曲",
    fs.readFileSync(path.join(DIR, "data-tenri-institute.js"), "utf8")
      .includes("tenri-institute-battle.c9d87b58.ogg"));
  check("D", "D3 无循环标签的旧 BGM 仍走整曲 loop（不设 loopEnd 时等价原生）",
    /loopEnd != null \? Math\.min\(loopEnd, buffer\.duration\) : buffer\.duration/.test(raw("bgm-webaudio.js")));

  // ---------- 汇总 ----------
  const failed = results.filter(r => !r.ok);
  if (REVERT) {
    const want = EXPECT_GROUPS[REVERT] || [];
    const own = failed.filter(r => want.includes(r.group)).length;
    const other = failed.filter(r => !want.includes(r.group)).length;
    console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
    failed.forEach(r => console.log(`  ❌ ${r.group} ${r.name} ${r.detail}`));
    process.exit(own > 0 && other === 0 ? 0 : 1);
  }
  results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.group} ${r.name}${r.detail ? " — " + r.detail : ""}`));
  console.log(`RESULT ${results.length - failed.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
