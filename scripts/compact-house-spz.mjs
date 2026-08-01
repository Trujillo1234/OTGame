import { readFile, writeFile } from "node:fs/promises";
import { transcodeSpz } from "@sparkjsdev/spark";

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) throw new Error("Usage: compact-house-spz.mjs input.spz output.spz");

const fileBytes = new Uint8Array(await readFile(source));
const result = await transcodeSpz({
  inputs: [{ fileBytes, pathOrUrl: source }],
  maxSh: 0,
  opacityThreshold: 0.55,
  clipXyz: {
    min: [-25, -3.5, -13],
    max: [9, 5.5, 8],
  },
});
const compact = result.fileBytes;
await writeFile(output, compact);
console.log(JSON.stringify({ bytes: compact.byteLength }));
