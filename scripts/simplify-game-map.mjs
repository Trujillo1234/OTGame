import { readFileSync, writeFileSync } from "node:fs";
import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
} from "three/examples/jsm/libs/fflate.module.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node simplify-game-map.mjs input.3mf output.3mf");
}

const archive = unzipSync(new Uint8Array(readFileSync(inputPath)));
const modelPath = "3D/3dmodel.model";
let modelText = strFromU8(archive[modelPath]);

function removeObject(objectId, nextObjectId) {
  const start = modelText.indexOf(`<object id="${objectId}"`);
  const end = modelText.indexOf(`<object id="${nextObjectId}"`, start);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find object ${objectId}`);
  }
  modelText = modelText.slice(0, start) + modelText.slice(end);
  modelText = modelText.replace(
    new RegExp(
      `<item\\b(?=[^>]*\\bobjectid="${objectId}")[^>]*/>\\s*`,
      "g",
    ),
    "",
  );
}

// The print-ready road and building meshes contain hundreds of thousands of
// triangles. The game replaces them with a smooth track and low-poly blocks.
removeObject(3, 4);
removeObject(4, 5);

archive[modelPath] = strToU8(modelText);
writeFileSync(outputPath, zipSync(archive, { level: 9 }));
