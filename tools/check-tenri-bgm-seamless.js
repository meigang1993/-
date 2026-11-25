// 研究所普通战斗 BGM · 无缝循环专项检查
// 复核：资源预算 / Vorbis end-padding 裁剪 / 首尾零样本闭合 / 循环点元数据 /
//       mission.bgm 接线 / 播放器原生 loop / 4 只怪不覆盖 mission 曲目。
// REVERT 时对源码或 Ogg 字节做真实篡改（不是把断言写死），要求对应组精准打红。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const REVERT = process.env.REVERT || "";
const BGM = "publish/assets/new-bgm/tenri-institute-battle.c9d87b58.ogg";
const SRC = "src/original/data-tenri-institute.js";
const EXPECT_GROUPS = { tags: ["C"], wire: ["D"], player: ["D"], override: ["D"] };

// 源码级真实替换（与项目内其它严格检查同一套 REVERT 机制）
const REPL = {
  wire: [SRC, 'bgm: "./assets/new-bgm/tenri-institute-battle.c9d87b58.ogg",',
    'bgm: "./assets/new-bgm/ruins-sand-city-battle.mp3",'],
  player: ["src/original/bgm.js", "  const audio = window.BGMWebAudio?.create?.() || new Audio();",
    "  const audio = new Audio();"],
  override: ["src/original/data-tenri-institute-enemies.js", "hp: 260, attack: 43,",
    'bgm: "./assets/override.ogg", hp: 260, attack: 43,'],
};
const patchedText = rel => {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const r = REPL[REVERT];
  if (r && r[0] === rel) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中：${r[1]}`);
    s = s.replace(r[1], r[2]);
  }
  return s;
};

const results = [];
const check = (group, name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail });
const full = path.join(ROOT, BGM);

// ---------- A 资源与预算 ----------
const exists = fs.existsSync(full);
const raw = exists ? fs.readFileSync(full) : Buffer.alloc(0);
const size = raw.length;
const crypto = require("crypto");
const sha = exists ? crypto.createHash("sha256").update(raw).digest("hex") : "";
check("A", "A1 专属战斗曲文件存在", exists && size > 0, `size=${size}`);
check("A", "A2 文件名版本戳 = sha256 前 8 位", sha.slice(0, 8) === "c9d87b58", `sha=${sha.slice(0, 8)}`);
const SCENE_LIMIT = 1750 * 1024; // check-asset-budget: 1.75 MiB
check("A", "A3 小于场景音频上限 1.75 MiB", size > 0 && size <= SCENE_LIMIT,
  `${(size / 1048576).toFixed(3)} MiB`);
check("A", "A4 文件名与路径均为 ASCII（check-static 约束）", /^[\x20-\x7e]+$/.test(BGM));

// 字节级真实篡改：REVERT=tags 把 LOOPSTART=0 改成 LOOPSTART=9（同长度，不破坏结构）
let bin = raw.toString("latin1");
if (REVERT === "tags") {
  if (!bin.includes("LOOPSTART=0")) throw new Error("LOOPSTART=0 未命中，无法构造反向");
  bin = bin.replace("LOOPSTART=0", "LOOPSTART=9");
}

// ---------- B PCM 首尾闭合与 padding ----------
let frames = 0, granule = 0, headRms = -1, tailRms = -1, first = null, last = null, jump = -1;
if (exists) {
  const pages = [];
  for (let i = 0; i < raw.length - 4; i += 1) {
    if (raw.slice(i, i + 4).toString("latin1") === "OggS") pages.push(i);
  }
  granule = pages.length ? Number(raw.readBigUInt64LE(pages[pages.length - 1] + 6)) : 0;
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", full, "-ac", "1", "-ar", "44100",
    "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  const buf = pcm.subarray(0, pcm.length - pcm.length % 2);
  frames = buf.length / 2;
  const s16 = i => buf.readInt16LE(i * 2);
  const rms = (a, b) => {
    let sum = 0;
    for (let i = a; i < b; i += 1) sum += s16(i) * s16(i);
    return Math.sqrt(sum / Math.max(1, b - a));
  };
  const F = 1323; // 30ms @ 44.1k
  headRms = rms(0, F); tailRms = rms(frames - F, frames);
  first = s16(0); last = s16(frames - 1); jump = Math.abs(last - first);
}
const padGap = frames - granule;
// 处理前原曲 gap=192；裁 padding 后重编码只剩 64（Vorbis 块对齐），阈值取 64。
check("B", "B1 Vorbis end-padding 已裁掉（解码帧数 - granule <= 64）",
  padGap >= 0 && padGap <= 64, `frames=${frames} granule=${granule} gap=${padGap}`);
check("B", "B2 首尾 30ms 淡化到零样本", first === 0 && last === 0 && jump === 0
  && headRms < 5 && tailRms < 5,
  `first=${first} last=${last} jump=${jump} headRMS=${headRms.toFixed(2)} tailRMS=${tailRms.toFixed(2)}`);

// ---------- C 循环点元数据 ----------
// Vorbis comment 是 [4-byte LE length][key=value] 连续存放，没有 \x00 终止符；
// 长度前缀就在 key 之前 4 字节。按它切出整条 comment，避免把下一条的长度字节吞进值里。
const tag = key => {
  const needle = key + "=";
  const i = bin.indexOf(needle);
  if (i < 4) return null;
  const len = raw.readUInt32LE(i - 4);
  if (len < needle.length || i + len > bin.length) return null;
  const entry = bin.slice(i, i + len);
  return entry.slice(needle.length);
};
const loopStart = tag("LOOPSTART"), loopLength = tag("LOOPLENGTH");
check("C", "C1 LOOPSTART=0 存在", loopStart === "0", `LOOPSTART=${loopStart}`);
check("C", "C2 LOOPLENGTH 等于末页 granule（采样单位）",
  Number(loopLength) === granule && Number(loopLength) === 6658560,
  `LOOPLENGTH=${loopLength} granule=${granule}`);
check("C", "C3 循环段覆盖整曲", Number(loopLength) > 0 && Number(loopLength) <= frames + 256);

// ---------- D 接线与播放器 ----------
const institute = patchedText(SRC);
const bgmJs = patchedText("src/original/bgm.js");
const enemiesJs = patchedText("src/original/data-tenri-institute-enemies.js");
const bundles = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/publish-bundles.json"), "utf8"));
check("D", "D1 mission.bgm 指向无缝专属曲",
  institute.includes('bgm: "./assets/new-bgm/tenri-institute-battle.c9d87b58.ogg",'));
const webaudioJs = patchedText("src/original/bgm-webaudio.js");
const metaJs = patchedText("src/original/bgm-loop-metadata.js");
check("D", "D2 播放器已升级 WebAudio 采样级循环（保留原生兜底）",
  bgmJs.includes("window.BGMWebAudio?.create?.() || new Audio()")
  && /s\.loop = true/.test(webaudioJs)
  && /s\.loopStart = loopStart \|\| 0/.test(webaudioJs)
  && /s\.loopEnd = loopEnd != null/.test(webaudioJs)
  && /LOOPSTART/.test(metaJs) && /LOOPLENGTH/.test(metaJs));
check("D", "D3 4 只怪数据表不覆盖 mission 曲目", !/bgm:\s*["']/.test(enemiesJs));
check("D", "D4 battleTrack 有 mission.bgm 回落分支", /\|\| mission\?\.bgm/.test(bgmJs));
check("D", "D5 数据表已进 bundle 清单",
  Object.values(bundles).flat().includes("data-tenri-institute-enemies.js"));
check("D", "D6 资源被源码引用（check:resources 不判 unused）",
  institute.includes("assets/new-bgm/tenri-institute-battle.c9d87b58.ogg"));
check("D", "D7 两个新模块在 startup-app 且位于 bgm.js 之前", (() => {
  const v = bundles["startup-app"] || [];
  return v.includes("bgm-loop-metadata.js") && v.includes("bgm-webaudio.js")
    && v.indexOf("bgm-loop-metadata.js") < v.indexOf("bgm-webaudio.js")
    && v.indexOf("bgm-webaudio.js") < v.indexOf("bgm.js");
})());
check("D", "D8 无循环标签的旧 BGM 退化整曲 loop（等价原生）",
  /loopEnd != null \? Math\.min\(loopEnd, buffer\.duration\) : buffer\.duration/.test(webaudioJs));

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
