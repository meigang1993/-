// Ogg Vorbis 循环点解析（供 WebAudio 采样级无缝使用，拆分文件避免单模块超行数约束）
// 直接读 Vorbis identification / comment header，不依赖 decodeAudioData 暴露元数据
// （浏览器 WebAudio 解码后只给 AudioBuffer，不保留 Vorbis comment）。
// 返回 { sampleRate, loopStart, loopEnd }，单位均为「源采样数」；无循环标签时
// loopStart=0 / loopEnd=null，由播放层退化为整曲循环，行为与旧版 audio.loop 一致。
window.BGMLoopMetadata = (() => {
  const VORBIS_ID = [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73];  // \x01vorbis
  const VORBIS_COMMENT = [0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]; // \x03vorbis

  const u32 = (b, i) => ((b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0);
  const find = (b, sig) => {
    outer: for (let i = 0; i + sig.length <= b.length; i += 1) {
      for (let j = 0; j < sig.length; j += 1) if (b[i + j] !== sig[j]) continue outer;
      return i;
    }
    return -1;
  };

  function parse(arrayBuffer) {
    try {
      const b = new Uint8Array(arrayBuffer);
      const id = find(b, VORBIS_ID);
      // identification header: type(1) + "vorbis"(6) + version(4) + channels(1) + rate(4)
      const sampleRate = id >= 0 && id + 16 <= b.length ? u32(b, id + 12) : 0;
      if (!sampleRate || sampleRate > 384000) return null;
      const base = { sampleRate, loopStart: 0, loopEnd: null };
      const c = find(b, VORBIS_COMMENT);
      if (c < 0) return base;
      // comment header: type(1) + "vorbis"(6) + vendor_len(4) + vendor + count(4) + [len(4)+"KEY=value"]...
      let p = c + 7;
      if (p + 4 > b.length) return base;
      const vendorLen = u32(b, p);
      p += 4 + vendorLen;
      if (p + 4 > b.length) return base;
      const count = Math.min(u32(b, p), 4096);
      p += 4;
      const dec = typeof TextDecoder === "function" ? new TextDecoder("utf-8") : null;
      let loopEnd = null;
      for (let i = 0; i < count && p + 4 <= b.length; i += 1) {
        const len = u32(b, p);
        p += 4;
        if (len > b.length - p) break;
        const entry = dec ? dec.decode(b.subarray(p, p + len)) : "";
        p += len;
        const eq = entry.indexOf("=");
        if (eq < 0) continue;
        const key = entry.slice(0, eq).toUpperCase(), value = entry.slice(eq + 1);
        if (key === "LOOPSTART") base.loopStart = Number(value) || 0;
        else if (key === "LOOPLENGTH") loopEnd = Number(value);
      }
      if (Number.isFinite(loopEnd) && loopEnd > 0) base.loopEnd = loopEnd;
      return base;
    } catch (_) {
      return null;
    }
  }

  return { parse };
})();
