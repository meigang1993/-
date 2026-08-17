const DesktopControls = (() => {
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return true;
      }
      if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        return true;
      }
      alert("当前预览沙箱不允许游戏内部全屏，请使用 Preview 面板自带的全屏按钮。");
    } catch (err) {
      console.warn("fullscreen failed:", err.message, err.stack);
      alert("全屏被浏览器或预览沙箱拦截，请使用 Preview 面板自带的全屏按钮。");
    }
    return false;
  }

  function handleKeydown(event) {
    if (event.key !== "F11" || event.repeat) return false;
    event.preventDefault();
    event.stopPropagation();
    toggleFullscreen();
    return true;
  }

  return { handleKeydown, toggleFullscreen };
})();
window.DesktopControls = DesktopControls;
