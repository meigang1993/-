// 【魔刀阿波罗 / 角色牌存储牌】扣置飞牌「背面朝上」专项护栏。
// 正向：node tools/check-stored-card-face.js
// 反向：REVERT=front|leak|css|doc node tools/check-stored-card-face.js
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const MOTION = "src/original/battle-effect-card-motion.js";
  const CSS = "publish/battle-card-motion.css";
  if (REVERT === "front" && rel === MOTION) {
    // 还原 BUG：整批牌用第一张牌的正面渲染
    t = t.replace("const stack = window.BattleEffectCardDOM.back(",
      "const stack = window.BattleEffectCardDOM.front(", 1);
  }
  if (REVERT === "leak" && rel === MOTION) {
    // 还原 BUG：正面 DOM 仍残留牌名 / 卡图 / 效果文字
    t = t.replace('    stack.querySelector(".card-flight-front")?.replaceChildren();\n', "", 1);
  }
  if (REVERT === "css" && rel === CSS) {
    // 还原 BUG：叠层是深色空白，不是牌背
    t = t.replace("url('./assets/generated/succubus-card-back.1fdff617.webp') center / cover no-repeat, rgba(18,10,34,.92)",
      "rgba(18,10,34,.92)", 1);
  }
  if (REVERT === "doc" && rel === "src/original/update-notice-recent.js") {
    t = t.replace("扣置飞牌改为背面朝上", "扣置飞牌保持正面", 1);
  }
  return t;
};

const motion = read("src/original/battle-effect-card-motion.js");
const body = motion.slice(motion.indexOf("async function placeStoredCards"));
const dom = read("src/original/battle-effect-card-dom.js");
const css = read("publish/battle-card-motion.css");
const transfers = read("src/original/battle-effect-card-transfers.js");
const notice = read("src/original/update-notice-recent.js");
const settings = read("docs/original/game-settings.md");
const agents = read(".ohmyagent/AGENTS.md");
const diary = read("docs/开发日记.md");
const qa = read("tools/qa-test-catalog.js");
const guard = read("tools/check-character-card-storage.js");
const liveOld = read("tools/test-character-card-storage-live.js");
const liveNew = read("tools/test-stored-card-face-live.js");
const index = read("publish/index.html");

check("B1", "一次性放牌用 back() 创建飞牌，不再误用 front(cards[0]) 露出第一张牌面",
  body.includes("BattleEffectCardDOM.back(")
  && !/BattleEffectCardDOM\.front\(/.test(body));
check("B2", "正面侧 DOM 被清空：牌名 / 卡图 / 效果文字不写进飞行牌",
  body.includes('stack.querySelector(".card-flight-front")?.replaceChildren();')
  && body.includes("避免调试器/无 CSS 时泄露牌面"));
check("B3", "DOM 工厂 back() 置 is-back / dataset.cardFace=back，并提供 .card-flight-back 侧",
  /const back = \(card, enemy = false, className = ""\) =>\s*create\(card, \{ face: "back", enemy, className \}\);/.test(dom)
  && dom.includes('faceDown ? "is-back" : "is-front"')
  && dom.includes('shell.dataset.cardFace = faceDown ? "back" : "front"')
  && dom.includes('class="card-flight-side card-flight-back"'));
check("B4", "CSS 翻转到背面，且 .card-flight-back 使用真实牌背图",
  css.includes(".card-flight.is-back .card-flight-inner { transform: rotateY(180deg); }")
  && /\.card-flight-back \{[^}]*succubus-card-back[^}]*webp/.test(css)
  && fs.existsSync(path.join(ROOT, "publish/assets/generated/succubus-card-back.1fdff617.webp")));
check("B5", "叠层同样是牌背 + 背面补紫色光晕（对应原正面 seal 光晕）",
  /\.stored-place-layer \{[^}]*succubus-card-back[^}]*webp/.test(css)
  && css.includes(".card-flight.stored-card-place.is-back .card-flight-back"));
check("B6", "资源区分：牌背图保留、skill-art 0 张、card-art 卡牌图案 59 张全保留",
  (() => {
    const dir = path.join(ROOT, "publish/assets/generated/cards");
    if (!fs.existsSync(dir)) return false;
    const all = fs.readdirSync(dir);
    return all.filter(f => /^skill-art-.*\.webp$/.test(f)).length === 0
      && all.filter(f => /^card-art-.*\.webp$/.test(f)).length === 59;
  })());
check("B7", "返还动画仍走既有 transfer 链（拿到手里才按 revealFace 翻面），本轮未误改",
  transfers.includes('event.fromZone === "characterCard"')
  && /async function gainCards[\s\S]{0,900}flight\.transfer\(/.test(transfers)
  && transfers.includes('revealFace: !fromUnit && event.side !== "enemy"')
  && !/placeStoredCards\(/.test(transfers));
check("B8", "既有存储牌护栏新增 A16/A17 与 face 反向组，once 反向仍只红 A12",
  guard.includes('check("A16"') && guard.includes('check("A17"')
  && guard.includes('REVERT === "face"')
  && guard.includes('face: ["A16"]')
  && guard.includes('once: ["A12"]'));
check("B9", "实机验证齐备：既有实机 hook back + A3c，新专项实机断言 cardFace",
  liveOld.includes("const origBack") && liveOld.includes('T("A3c')
  && liveNew.includes("cardFace") && liveNew.includes("succubus-card-back")
  && liveNew.includes("RESULT"));
check("B10", "记忆文件与 QA 登记齐备：公告 149 行含「扣置飞牌改为背面朝上」",
  notice.trimEnd().split(/\r?\n/).length === 149
  && notice.includes("扣置飞牌改为背面朝上")
  && settings.includes("背面朝上") && agents.includes("背面朝上")
  && diary.includes("背面朝上")
  && qa.includes("test-stored-card-face-live.js")
  && qa.includes("check-stored-card-face.js"));
check("B11", "版本戳唯一（index.html 只有一枚 20260915-*），无旧版残留",
  (() => {
    const stamps = [...new Set(index.match(/20260915-\d+/g) || [])];
    return stamps.length === 1 && /^20260915-\d+$/.test(stamps[0]);
  })());
check("B12", "一次性放牌机制未被破坏：1 个 DOM / 1 次落位 / ×N 角标 / 位移兜底",
  (body.match(/BattleEffectCardDOM\.(front|back)\(/g) || []).length === 1
  && (body.match(/cardLand\?\.\(\)/g) || []).length === 1
  && !/flyFrontCards\(|Promise\.all/.test(body)
  && body.includes('badge.textContent = `×${count}`')
  && body.includes("Math.hypot(end.x - start.x, end.y - start.y) < 24"));

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  process.exit(red.length ? 1 : 0);
}
const EXPECT = {
  front: ["B1"], leak: ["B2"], css: ["B5"], doc: ["B10"],
}[REVERT] || [];
const same = JSON.stringify(red) === JSON.stringify(EXPECT);
console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
process.exit(same ? 0 : 1);
