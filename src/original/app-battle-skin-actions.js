let battleSkinChangeId = 0;
function captureBattleSkinArt(unit) {
  const wrapper = document.querySelector(`[data-target="${unit.uid}"] .unit-art`);
  return { image: wrapper?.querySelector("img") || null };
}
async function revealBattleSkinArt(unit, previous, isCurrent) {
  const wrapper = document.querySelector(`[data-target="${unit.uid}"] .unit-art`);
  const nextImage = wrapper?.querySelector("img");
  if (!wrapper || !nextImage || !previous.image || previous.image === nextImage) return;
  wrapper.classList.add("skin-switch-layer");
  previous.image.classList.add("skin-switch-old-art");
  wrapper.append(previous.image);
  try {
    await Promise.race([
      nextImage.decode?.() || Promise.resolve(),
      new Promise(resolve => setTimeout(resolve, 800)),
    ]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } catch (err) {
    console.warn("battle skin decode failed:", err.message, err.stack);
  } finally {
    previous.image.remove();
    wrapper.classList.remove("skin-switch-layer");
  }
  if (!isCurrent()) return;
}
async function equipBattleSkin(button) {
  const actionState = state;
  const skinId = button?.dataset?.battleEquipSkin;
  const skin = skinId ? SkinSystem.byId(skinId) : null;
  const actionBattle = actionState?.battle;
  if (actionState?.view !== "battle" || !skin || !actionBattle) return;
  const actionUnit = actionBattle.allies?.find(item => item.ref === skin.charId);
  if (!actionUnit) return;
  const formallyOwned = SkinSystem.owned(actionState, skin);
  const trial = !!actionBattle.test && !formallyOwned;
  if (!trial && !formallyOwned) return;
  const requestId = ++battleSkinChangeId;
  const isCurrent = () => requestId === battleSkinChangeId
    && window.state === actionState && actionState.view === "battle"
    && actionState.battle === actionBattle && actionBattle.allies?.includes(actionUnit);
  button.disabled = true;
  try {
    await window.GameBundles?.load?.("battle", { state: actionState, skinIds: [skin.id] });
    const failed = await window.GameAssets?.preloadAssets?.(
      [skin.art, skin.damagedArt, skin.victoryArt].filter(Boolean)
    );
    if (failed?.length) throw new Error("战斗皮肤素材加载失败");
    if (!isCurrent()) return;
    const changed = trial
      ? SkinSystem.testEquip(actionState, skin.charId, skin.id)
      : SkinSystem.equip(actionState, skin.id);
    if (!changed) return;
    if (!trial && actionBattle.test) delete actionState.testSkins?.[skin.charId];
    if (!trial) SkinSystem.markAppearance(actionState);
    const previousArt = captureBattleSkinArt(actionUnit);
    [window.NonokaIdolSkinFX, window.MannyGunSkinFX, window.BertisQueenSkinFX,
      window.FloraSonicSkinFX, window.WendyTeacherSkinFX,
      window.ElranaFallenPhysicianSkinFX, window.AngelicaBerserkerSkinFX,
      window.CharacterSkinFX].forEach(fx => fx?.cancel?.());
    actionUnit.art = skin.art; actionUnit.avatar = skin.art; actionUnit.skinName = skin.name;
    actionUnit.skinDynamicEffect = skin.dynamicEffect || null;
    actionUnit.skinDamagedArt = skin.damagedArt || null;
    actionUnit.skinVictoryArt = skin.victoryArt || null;
    actionBattle._skinSwitching = true;
    actionState.appearanceSaving = !trial;
    render();
    await revealBattleSkinArt(actionUnit, previousArt, isCurrent);
    if (!trial) await persistAppearanceNow(actionState);
  } catch (err) {
    if (!isCurrent()) return;
    console.error("battle skin style load failed:", err.code, err.message, err.stack);
    log("皮肤样式加载失败，请检查网络后重试。");
  } finally {
    if (isCurrent()) {
      actionState.appearanceSaving = false;
      render();
      delete actionBattle._skinSwitching;
    }
    if (button.isConnected) button.disabled = false;
  }
}
