// 预加载：只暴露最小安全信息，游戏本体无需 Node 能力
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('succubusKill', {
  isDesktop: true,
  platform: process.platform,
});
