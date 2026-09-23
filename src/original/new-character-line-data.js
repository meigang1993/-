(() => {
  const data = {
  skillLines: {
    gerda: {
      "萌虎慰劳": "累了吗？让我给你打打气，休息好再继续战斗吧。",
      "萌虎跑跑": "你跑得过我吗？",
    },
    hoshino_yi: {
      "偶像之星": "晚上好，我是A小町，星野依，天才般偶像，今天演唱新曲。",
      "巨蛋演出": "小依，你看到了吧，这就是你的梦想……",
      "梦想真理成功": "小依，我明白了，我会替你活着，照顾你儿子。",
      "梦想真理失败": "小依，我不明白你的梦想，但至少不会让杀害你的凶手逍遥法外！",
      "半魅魔精华回应": "交给我吧，海一。",
      "半魅魔血治疗": "海一，别怕，我会为你治疗。",
    },
    hoshino_kaiichi: {
      "半魅魔血": "妈妈说，我的血能维持魔力循环。",
      "半魅魔精华": target => target?.ref === "hoshino_yi" ? "妈妈，需要补充魔力吗？" : "大姐姐，接收我的半魅魔精华吧。",
      "梦想真理亲子": "妈妈，你又在表演这种魔术了，妈妈的粉色肠子好好看。",
    },
    nonoka: {
      "梦想真理揭露": "你！凋零者！难道真正的小依老师已经……",
    },
  },
  allyIntroLines: {
    gerda: "兽人公主格尔达参战，我可不会输给你们。",
    hoshino_yi: "晚上好，我是A小町，星野依，天才般偶像，今天演唱新曲。",
    hoshino_kaiichi: "魔力连接稳定，我会帮助大家。",
  },
  };
  if (!window.BattleLineData) return;
  Object.entries(data.skillLines).forEach(([ref, lines]) => {
    window.BattleLineData.skillLines[ref] = { ...(window.BattleLineData.skillLines[ref] || {}), ...lines };
  });
  Object.assign(window.BattleLineData.allyIntroLines, data.allyIntroLines);
})();
