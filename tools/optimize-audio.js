const fs = require("fs");
const path = require("path");
const ffmpeg = require("ffmpeg-static");
const { root, walk, writeReport, formatBytes, replacementFile, run } = require("./optimization-utils");

const assetRoot = path.resolve(process.env.OPTIMIZE_ASSET_ROOT || path.join(root, "publish", "assets"));
const extensions = new Set([".m4a", ".mp3", ".ogg", ".wav"]);
const write = process.argv.includes("--write");
const requestedKbps = process.env.AUDIO_TARGET_KBPS == null
  ? null
  : Number(process.env.AUDIO_TARGET_KBPS);
const defaultKbps = { m4a: 48, mp3: 64, ogg: 48, wav: 64 };
const targetFor = format => requestedKbps == null
  ? defaultKbps[format] || 64
  : Math.max(32, requestedKbps);

function durationOf(text) {
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function numberFrom(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function encodeArgs(format, targetKbps) {
  if (format === "m4a") {
    return ["-codec:a", "aac", "-b:a", `${targetKbps}k`, "-ar", "44100"];
  }
  if (format === "mp3") {
    return ["-codec:a", "libmp3lame", "-b:a", `${targetKbps}k`, "-ar", "44100"];
  }
  if (format === "ogg") {
    return ["-codec:a", "libvorbis", "-b:a", `${targetKbps}k`, "-ar", "44100"];
  }
  return null;
}

async function inspect(file) {
  const originalStat = fs.statSync(file);
  const result = await run(ffmpeg, [
    "-nostdin", "-hide_banner", "-i", file,
    "-af", "silencedetect=noise=-50dB:d=0.5,volumedetect",
    "-f", "null", "-",
  ]);
  const text = `${result.stdout}\n${result.stderr}`;
  const duration = durationOf(text);
  if (!duration) throw new Error(`Cannot read audio duration: ${path.relative(root, file)}`);
  const before = originalStat.size;
  const format = path.extname(file).slice(1).toLowerCase();
  const targetKbps = targetFor(format);
  const estimated = Math.ceil(duration * targetKbps * 1000 / 8);
  const silence = [...text.matchAll(/silence_duration:\s*([\d.]+)/g)]
    .reduce((sum, match) => sum + Number(match[1]), 0);
  const item = {
    file: path.relative(root, file).replace(/\\/g, "/"),
    format,
    before,
    duration: Number(duration.toFixed(2)),
    targetKbps,
    bitrateKbps: numberFrom(text, /bitrate:\s*(\d+)\s*kb\/s/),
    meanVolumeDb: numberFrom(text, /mean_volume:\s*(-?[\d.]+)\s*dB/),
    maxVolumeDb: numberFrom(text, /max_volume:\s*(-?[\d.]+)\s*dB/),
    silenceSeconds: Number(silence.toFixed(2)),
    estimatedTarget: estimated,
    potentialSavings: Math.max(0, before - estimated),
    replaced: false,
  };
  const encoderArgs = encodeArgs(item.format, targetKbps);
  if (!write || !encoderArgs || duration < 20 || estimated >= before * 0.95) return item;
  const temporary = replacementFile(file);
  try {
    const encoded = await run(ffmpeg, [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", file,
      "-map_metadata", "-1", "-vn", ...encoderArgs, temporary,
    ]);
    if (encoded.code !== 0) throw new Error(encoded.stderr || `FFmpeg failed for ${item.file}`);
    const decoded = await run(ffmpeg, [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-i", temporary,
      "-f", "null", "-",
    ]);
    if (decoded.code !== 0) throw new Error(decoded.stderr || `FFmpeg decode failed for ${item.file}`);
    const after = fs.statSync(temporary).size;
    if (after < before * 0.98) {
      fs.chmodSync(temporary, originalStat.mode & 0o777);
      fs.renameSync(temporary, file);
      item.replaced = true;
      item.optimized = after;
      item.actualSavings = before - after;
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return item;
}

(async () => {
  if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error("ffmpeg-static binary is unavailable");
  if (requestedKbps != null && !Number.isFinite(requestedKbps)) {
    throw new Error("AUDIO_TARGET_KBPS must be a finite number");
  }
  const files = walk(assetRoot, file => extensions.has(path.extname(file).toLowerCase()));
  const results = [];
  for (const file of files) results.push(await inspect(file));
  const totals = results.reduce((sum, item) => ({
    before: sum.before + item.before,
    potentialSavings: sum.potentialSavings + item.potentialSavings,
    duration: sum.duration + item.duration,
    replaced: sum.replaced + (item.replaced ? 1 : 0),
  }), { before: 0, potentialSavings: 0, duration: 0, replaced: 0 });
  writeReport("audio", {
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "audit",
    targetKbps: requestedKbps == null ? defaultKbps : targetFor("mp3"),
    files: results.length,
    totals,
    results: results.sort((a, b) => b.potentialSavings - a.potentialSavings),
  });
  console.log(
    `Audio optimization ${write ? "write" : "audit"} passed: ${results.length} files, ` +
    `${Math.round(totals.duration)}s decoded, potential ${formatBytes(totals.potentialSavings)}, replaced ${totals.replaced}`
  );
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
