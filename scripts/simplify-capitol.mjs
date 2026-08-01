import { readFile, writeFile } from "node:fs/promises";
import { BufferAttribute, Mesh } from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";

const [, , inputPath, outputPath, ratioText = "0.35"] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error("Usage: node simplify-capitol.mjs input.stl output.stl [ratio]");
}

const ratio = Number(ratioText);
if (!(ratio > 0 && ratio <= 1)) throw new Error("Ratio must be between 0 and 1");

const source = await readFile(inputPath);
const sourceBuffer = source.buffer.slice(
  source.byteOffset,
  source.byteOffset + source.byteLength,
);
const loaded = new STLLoader().parse(sourceBuffer);
const geometry = mergeVertices(loaded, 0.001);
const positions = geometry.getAttribute("position");
const sourceIndices = Uint32Array.from(geometry.index.array);
const targetIndexCount = Math.max(
  3,
  Math.floor((sourceIndices.length * ratio) / 3) * 3,
);

await MeshoptSimplifier.ready;
const [indices] = MeshoptSimplifier.simplifySloppy(
  sourceIndices,
  positions.array,
  positions.itemSize,
  null,
  targetIndexCount,
  0.02,
);

geometry.setIndex(new BufferAttribute(indices, 1));
geometry.deleteAttribute("normal");
geometry.computeVertexNormals();
const binary = new STLExporter().parse(new Mesh(geometry), { binary: true });
await writeFile(outputPath, Buffer.from(binary.buffer));

console.log(
  `${inputPath}: ${sourceIndices.length / 3} -> ${indices.length / 3} triangles`,
);
