import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// Run when updating the curated point tracks; website builds need only these public assets.
const source = resolve(process.argv[2] ?? "../IAMOT_demo/experiments/balls-final");
const destination = fileURLToPath(new URL("../public/demo/iamot/", import.meta.url));
const data = JSON.parse(await readFile(join(source, "tracks.json"), "utf8"));
const palette = ["#58d9ff", "#ffcc64", "#ee86f4", "#80efaf", "#ff827d", "#a8a0ff"];
const colors = data.points.map((point, index) => {
  let hash = 0;
  for (const character of point.label || `point-${index}`) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
});
await mkdir(destination, { recursive: true });
await writeFile(join(destination, "tracks.json"), JSON.stringify({
  fps: data.fps, frames: data.frames, width: data.width, height: data.height,
  trail_seconds: 0.5, colors, tracks: data.tracks,
}));
await copyFile(join(source, "original.mp4"), join(destination, "video.mp4"));
await copyFile(join(source, "poster.jpg"), join(destination, "poster.jpg"));
await writeFile(join(destination, "source.json"), JSON.stringify({
  video: data.source.source_url,
  source_start: data.source.source_start + data.range.start / data.fps,
  source_end: data.source.source_start + (data.range.end + 1) / data.fps,
  model: "CoTracker3 scaled_online", points: data.points.length,
  selection_sha256: data.selection_sha256,
  trail_history: "0.5 seconds, cyclic across the loop; the hard-cut joining segment is omitted.",
}, null, 2));
console.log(`Prepared ${data.points.length} tracks / ${data.frames} frames in ${destination}`);
