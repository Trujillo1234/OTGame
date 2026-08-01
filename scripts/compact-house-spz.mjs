import { readFile, writeFile } from "node:fs/promises";
import { SpzReader, SpzWriter } from "@sparkjsdev/spark";

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) throw new Error("Usage: compact-house-spz.mjs input.spz output.spz");

const fileBytes = new Uint8Array(await readFile(source));
const reader = new SpzReader({ fileBytes });
await reader.parseHeader();

const selected = new Uint8Array(reader.numSplats);
let count = 0;
await reader.parseSplats((index, x, y, z) => {
  const insideHouse = x > -25 && x < 9 && y > -3.5 && y < 5.5 && z > -13 && z < 8;
  if (insideHouse && index % 3 === 0) {
    selected[index] = 1;
    count += 1;
  }
});

const remap = new Int32Array(reader.numSplats);
remap.fill(-1);
let next = 0;
for (let index = 0; index < selected.length; index += 1) {
  if (selected[index]) remap[index] = next++;
}

const writer = new SpzWriter({
  numSplats: count,
  shDegree: reader.shDegree,
  fractionalBits: reader.fractionalBits,
  flagAntiAlias: reader.flagAntiAlias,
});
const target = (index) => remap[index];
const copyReader = new SpzReader({ fileBytes });
await copyReader.parseHeader();
await copyReader.parseSplats(
  (i, x, y, z) => { const j = target(i); if (j >= 0) writer.setCenter(j, x, y, z); },
  (i, alpha) => { const j = target(i); if (j >= 0) writer.setAlpha(j, alpha); },
  (i, r, g, b) => { const j = target(i); if (j >= 0) writer.setRgb(j, r, g, b); },
  (i, x, y, z) => { const j = target(i); if (j >= 0) writer.setScale(j, x, y, z); },
  (i, x, y, z, w) => { const j = target(i); if (j >= 0) writer.setQuat(j, x, y, z, w); },
  (i, sh1, sh2, sh3) => { const j = target(i); if (j >= 0) writer.setSh(j, sh1, sh2, sh3); },
);

const compact = await writer.finalize();
await writeFile(output, compact);
console.log(JSON.stringify({ sourceSplats: reader.numSplats, outputSplats: count, bytes: compact.byteLength }));
