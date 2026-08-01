"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type InputName =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "boost";

type CharacterId = "emmy" | "opie";

const githubPagesBase =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/OTGame")
    ? "/OTGame"
    : "";
const raceAsset = (path: string) => `${githubPagesBase}${path}`;
const gameSelectHref = githubPagesBase ? `${githubPagesBase}/` : "/";

type HudState = {
  speed: number;
  elapsed: number;
  x: number;
  z: number;
};

type Checkpoint = {
  name: string;
  short: string;
  detail: string;
  x: number;
  z: number;
  color: number;
};

type AudioController = {
  start: () => void;
  toggle: () => boolean;
  setCharacter: (character: CharacterId) => void;
  setEngine: (speed: number, active: boolean, boosting: boolean) => void;
  checkpoint: () => void;
  finish: () => void;
  collision: () => void;
  honk: () => void;
  dispose: () => void;
};

type SurfaceTriangle = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  denominator: number;
};

type SurfaceSampler = (x: number, z: number) => number | null;

const START = { x: -47, z: 26.67, heading: Math.PI };
const TRACK_GROUND_CLEARANCE = 0.34;
const TRACK_HALF_WIDTH = 2.25;
const ROAD_WIDTH = 9;
const X_ROADS = [-32, -23, -14, -5, 8, 20, 32];
const Z_ROADS = [-51, -40, -28, -16, -4, 8, 18, 31];

const CHECKPOINTS: Checkpoint[] = [
  {
    name: "Trader Joe’s",
    short: "T.J.’S",
    detail: "Pick up the snacks",
    x: -47.44,
    z: 53.4,
    color: 0xdf563e,
  },
  {
    name: "Colorado State Capitol",
    short: "CAPITOL",
    detail: "Cruise past the gold dome",
    x: -48,
    z: -24,
    color: 0xe0a72d,
  },
  {
    name: "Cheesman Park",
    short: "CHEESMAN",
    detail: "Circle Cheesman Park",
    x: 46,
    z: 8,
    color: 0x4f8a5b,
  },
  {
    name: "935 Penn",
    short: "HOME",
    detail: "Bring the little car home",
    x: START.x,
    z: 26.67,
    color: 0x5f8d67,
  },
];

const TRACK_CONTROL_POINTS = [
  new THREE.Vector3(START.x, 0, START.z),
  new THREE.Vector3(-47, 0, 42),
  new THREE.Vector3(-47, 0, 50),
  new THREE.Vector3(-47.44, 0, 53.4),
  new THREE.Vector3(-50.5, 0, 48.5),
  new THREE.Vector3(-50.8, 0, 6),
  new THREE.Vector3(-50, 0, -10),
  new THREE.Vector3(-48, 0, -24),
  new THREE.Vector3(-37, 0, -31),
  new THREE.Vector3(-30, 0, -43),
  new THREE.Vector3(-12, 0, -44),
  new THREE.Vector3(12, 0, -42),
  new THREE.Vector3(32, 0, -30),
  new THREE.Vector3(44, 0, -18),
  new THREE.Vector3(47, 0, -4),
  new THREE.Vector3(46, 0, 8),
  new THREE.Vector3(47, 0, 19),
  new THREE.Vector3(39, 0, 37),
  new THREE.Vector3(18, 0, 43),
  new THREE.Vector3(-12, 0, 43),
  new THREE.Vector3(-35, 0, 43),
  new THREE.Vector3(-50, 0, 36),
  new THREE.Vector3(-52, 0, 28),
];
const TRACK_CURVE = new THREE.CatmullRomCurve3(
  TRACK_CONTROL_POINTS,
  true,
  "catmullrom",
  0.25,
);

function seeded(seed: number) {
  const value = Math.sin(seed * 91.173) * 43758.5453;
  return value - Math.floor(value);
}

function buildSurfaceSampler(root: THREE.Object3D): SurfaceSampler {
  const grid = new Map<string, SurfaceTriangle[]>();
  const cellSize = 1.5;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.attributes.position;
    const index = object.geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const readVertex = (target: THREE.Vector3, offset: number) => {
        const vertexIndex = index
          ? index.getX(triangleIndex * 3 + offset)
          : triangleIndex * 3 + offset;
        return target
          .fromBufferAttribute(position, vertexIndex)
          .applyMatrix4(object.matrixWorld);
      };
      readVertex(a, 0);
      readVertex(b, 1);
      readVertex(c, 2);
      const denominator =
        (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-8) continue;

      const triangle: SurfaceTriangle = {
        ax: a.x,
        ay: a.y,
        az: a.z,
        bx: b.x,
        by: b.y,
        bz: b.z,
        cx: c.x,
        cy: c.y,
        cz: c.z,
        denominator,
      };
      const minCellX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
      const maxCellX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
      const minCellZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
      const maxCellZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = `${cellX},${cellZ}`;
          const triangles = grid.get(key) ?? [];
          triangles.push(triangle);
          grid.set(key, triangles);
        }
      }
    }
  });

  return (x, z) => {
    const triangles =
      grid.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? [];
    let surface: number | null = null;
    for (const triangle of triangles) {
      const weightA =
        ((triangle.bz - triangle.cz) * (x - triangle.cx) +
          (triangle.cx - triangle.bx) * (z - triangle.cz)) /
        triangle.denominator;
      const weightB =
        ((triangle.cz - triangle.az) * (x - triangle.cx) +
          (triangle.ax - triangle.cx) * (z - triangle.cz)) /
        triangle.denominator;
      const weightC = 1 - weightA - weightB;
      if (weightA < -0.002 || weightB < -0.002 || weightC < -0.002) continue;
      const height =
        weightA * triangle.ay +
        weightB * triangle.by +
        weightC * triangle.cy;
      surface = surface === null ? height : Math.max(surface, height);
    }
    return surface;
  };
}

const TRACK_SAMPLES = TRACK_CURVE.getSpacedPoints(520);

function prepareTrackHeights(sampleGround: SurfaceSampler) {
  const rawHeights = TRACK_SAMPLES.map(
    (point) => (sampleGround(point.x, point.z) ?? 2.4) + TRACK_GROUND_CLEARANCE,
  );
  let smoothed = rawHeights;
  for (let pass = 0; pass < 3; pass += 1) {
    const radius = pass === 0 ? 9 : 5;
    smoothed = smoothed.map((_, index) => {
      let sum = 0;
      let weight = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleIndex =
          (index + offset + smoothed.length) % smoothed.length;
        const sampleWeight = radius + 1 - Math.abs(offset);
        sum += smoothed[sampleIndex] * sampleWeight;
        weight += sampleWeight;
      }
      return sum / weight;
    });
  }
  TRACK_SAMPLES.forEach((point, index) => {
    point.y = smoothed[index];
  });
}

function closestTrackSample(x: number, z: number) {
  let closest = TRACK_SAMPLES[0];
  let distanceSquared = Number.POSITIVE_INFINITY;
  for (const point of TRACK_SAMPLES) {
    const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
    if (distance < distanceSquared) {
      distanceSquared = distance;
      closest = point;
    }
  }
  return { point: closest, distanceSquared };
}

function distanceToTrackSquared(x: number, z: number) {
  return closestTrackSample(x, z).distanceSquared;
}

function createTrackSampler(): SurfaceSampler {
  const driveableWidth = TRACK_HALF_WIDTH - 0.22;
  const driveableWidthSquared = driveableWidth ** 2;
  return (x, z) => {
    const closest = closestTrackSample(x, z);
    return closest.distanceSquared <= driveableWidthSquared
      ? closest.point.y + 0.02
      : null;
  };
}

function trackFrame(pointIndex: number) {
  const count = TRACK_SAMPLES.length - 1;
  const previous = TRACK_SAMPLES[(pointIndex - 1 + count) % count];
  const next = TRACK_SAMPLES[(pointIndex + 1) % count];
  const tangent = next.clone().sub(previous).setY(0).normalize();
  const lateral = new THREE.Vector3(tangent.z, 0, -tangent.x);
  return { tangent, lateral };
}

function createRibbonGeometry(
  centerOffset: number,
  halfWidth: number,
  heightOffset: number,
) {
  const count = TRACK_SAMPLES.length - 1;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const point = TRACK_SAMPLES[index];
    const { lateral } = trackFrame(index);
    const center = point.clone().addScaledVector(lateral, centerOffset);
    const left = center.clone().addScaledVector(lateral, halfWidth);
    const right = center.clone().addScaledVector(lateral, -halfWidth);
    positions.push(
      left.x,
      center.y + heightOffset,
      left.z,
      right.x,
      center.y + heightOffset,
      right.z,
    );
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const left = index * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;
    indices.push(left, right, nextLeft, right, nextRight, nextLeft);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTrackSlabGeometry() {
  const count = TRACK_SAMPLES.length - 1;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const point = TRACK_SAMPLES[index];
    const top = point.y;
    const bottom = point.y - 0.3;
    const { lateral } = trackFrame(index);
    const left = point.clone().addScaledVector(lateral, TRACK_HALF_WIDTH);
    const right = point.clone().addScaledVector(lateral, -TRACK_HALF_WIDTH);
    positions.push(
      left.x,
      top,
      left.z,
      right.x,
      top,
      right.z,
      left.x,
      bottom,
      left.z,
      right.x,
      bottom,
      right.z,
    );
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const base = index * 4;
    const nextBase = next * 4;
    indices.push(
      base,
      base + 1,
      nextBase,
      base + 1,
      nextBase + 1,
      nextBase,
      base + 2,
      nextBase + 2,
      base + 3,
      base + 3,
      nextBase + 2,
      nextBase + 3,
      base,
      nextBase,
      base + 2,
      base + 2,
      nextBase,
      nextBase + 2,
      base + 1,
      base + 3,
      nextBase + 1,
      base + 3,
      nextBase + 3,
      nextBase + 1,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addRaceTrack(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "race-track";

  const slab = new THREE.Mesh(
    createTrackSlabGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x263234,
      roughness: 0.88,
      metalness: 0.03,
    }),
  );
  slab.receiveShadow = true;
  slab.castShadow = true;
  group.add(slab);

  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0643b,
    roughness: 0.72,
  });
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(
      createRibbonGeometry(
        side * (TRACK_HALF_WIDTH - 0.16),
        0.16,
        0.035,
      ),
      curbMaterial,
    );
    curb.receiveShadow = true;
    group.add(curb);
  }

  const dashGeometry = new THREE.BoxGeometry(0.09, 0.035, 0.82);
  const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd55c });
  for (let index = 0; index < 72; index += 2) {
    const t = index / 72;
    const point = TRACK_CURVE.getPointAt(t);
    const surface = closestTrackSample(point.x, point.z).point.y;
    const tangent = TRACK_CURVE.getTangentAt(t).setY(0).normalize();
    const dash = new THREE.Mesh(dashGeometry, dashMaterial);
    dash.position.set(point.x, surface + 0.045, point.z);
    dash.rotation.y = Math.atan2(tangent.x, tangent.z);
    group.add(dash);
  }

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff5d7,
    roughness: 0.7,
  });
  for (const side of [-1, 1]) {
    const railPoints: THREE.Vector3[] = [];
    for (let index = 0; index < TRACK_SAMPLES.length - 1; index += 8) {
      const point = TRACK_SAMPLES[index].clone();
      const { lateral } = trackFrame(index);
      point.addScaledVector(lateral, side * (TRACK_HALF_WIDTH + 0.02));
      point.y += 0.4;
      railPoints.push(point);
    }
    const railCurve = new THREE.CatmullRomCurve3(
      railPoints,
      true,
      "catmullrom",
      0.25,
    );
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(railCurve, 260, 0.085, 6, true),
      railMaterial,
    );
    rail.castShadow = true;
    group.add(rail);
  }

  scene.add(group);
  return group;
}

function addSimplifiedCity(
  scene: THREE.Scene,
  sampleGround: SurfaceSampler,
) {
  type Block = {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
  };
  const palettes: Block[][] = [[], [], []];
  for (let x = -72; x <= 68; x += 7) {
    for (let z = -67; z <= 68; z += 7) {
      const variation = seeded(x * 4.73 + z * 2.17);
      const isCathedralFootprint =
        Math.abs(x + 47.1) < 6.5 && Math.abs(z + 35.8) < 7;
      if (
        variation < 0.47 ||
        distanceToTrackSquared(x, z) < 34 ||
        isCathedralFootprint
      ) {
        continue;
      }
      const ground = sampleGround(x, z);
      if (ground === null) continue;
      const width = 2.7 + seeded(x * 7 + z) * 1.8;
      const depth = 2.6 + seeded(x - z * 5) * 1.8;
      const height = 1.6 + seeded(x * 3 - z * 8) * 4.7;
      palettes[Math.floor(seeded(x * 11 + z * 13) * 3)].push({
        x,
        y: ground + height / 2 + 0.02,
        z,
        width,
        height,
        depth,
      });
    }
  }

  const colors = [0xc99969, 0xe1c18e, 0x9b6652];
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  palettes.forEach((blocks, paletteIndex) => {
    const mesh = new THREE.InstancedMesh(
      blockGeometry,
      new THREE.MeshStandardMaterial({
        color: colors[paletteIndex],
        roughness: 0.94,
        flatShading: true,
      }),
      blocks.length,
    );
    blocks.forEach((block, index) => {
      position.set(block.x, block.y, block.z);
      scale.set(block.width, block.height, block.depth);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

function removeReplacedLandmarks(mesh: THREE.Mesh) {
  const geometry = mesh.geometry.clone();
  const position = geometry.getAttribute("position");
  if (!position) return;
  const sourceIndex = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: position.count }, (_, index) => index);
  const kept: number[] = [];
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let index = 0; index < sourceIndex.length; index += 3) {
    centroid.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner += 1) {
      vertex
        .fromBufferAttribute(position, sourceIndex[index + corner])
        .applyMatrix4(mesh.matrixWorld);
      centroid.add(vertex);
    }
    centroid.multiplyScalar(1 / 3);
    const isPrintedCapitol =
      centroid.x > -66.5 &&
      centroid.x < -52.5 &&
      centroid.z > -33 &&
      centroid.z < -22;
    const isPrintedArtMuseum =
      centroid.x > -82 &&
      centroid.x < -70.5 &&
      centroid.z > -19 &&
      centroid.z < -12;
    const isPrintedCathedral =
      centroid.x > -52.5 &&
      centroid.x < -41.5 &&
      centroid.z > -41.5 &&
      centroid.z < -30.5;
    if (!isPrintedCapitol && !isPrintedArtMuseum && !isPrintedCathedral) {
      kept.push(
        sourceIndex[index],
        sourceIndex[index + 1],
        sourceIndex[index + 2],
      );
    }
  }

  geometry.setIndex(kept);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry.dispose();
  mesh.geometry = geometry;
}

function addDetailedCapitol(scene: THREE.Scene, groundY: number) {
  const capitol = new THREE.Group();
  capitol.name = "colorado-state-capitol-detailed";
  capitol.position.set(-59.25, groundY + 0.04, -27.5);

  const model = new THREE.Group();
  model.scale.setScalar(0.12);
  capitol.add(model);
  const loader = new STLLoader();
  const addPart = (
    path: string,
    material: THREE.MeshStandardMaterial,
    centerX: number,
    centerZ: number,
    y: number,
  ) => {
    loader.load(raceAsset(path), (geometry) => {
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(-centerX, y, -centerZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
    });
  };

  addPart(
    "/models/capitol/colorado-state-capitol-base.stl?v=1",
    new THREE.MeshStandardMaterial({
      color: 0xe8e0ca,
      roughness: 0.76,
    }),
    52.5658,
    43.5658,
    0,
  );
  addPart(
    "/models/capitol/colorado-state-capitol-dome.stl?v=1",
    new THREE.MeshStandardMaterial({
      color: 0xd7a62d,
      metalness: 0.42,
      roughness: 0.38,
    }),
    10.9105,
    10.9105,
    25.5,
  );

  const label = createLabel("STATE CAPITOL", "#8b6918");
  label.position.set(0, 9.2, 0);
  label.scale.set(4.8, 1.2, 1);
  capitol.add(label);
  scene.add(capitol);
}

function addDetailedArtMuseum(scene: THREE.Scene, groundY: number) {
  const museum = new THREE.Group();
  museum.name = "denver-art-museum-detailed";
  museum.position.set(-76.2, groundY + 0.04, -15.4);

  new STLLoader().load(
    raceAsset("/models/art-museum/denver-art-museum.stl?v=1"),
    (geometry) => {
      geometry.center();
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0xc8d0cf,
          metalness: 0.32,
          roughness: 0.48,
          flatShading: true,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(0.2, 0.2, 0.36);
      mesh.position.y = 2.65;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      museum.add(mesh);
    },
  );

  const label = createLabel("DENVER ART MUSEUM", "#526c70");
  label.position.set(0, 6.35, 0);
  label.scale.set(5.3, 1.15, 1);
  museum.add(label);
  scene.add(museum);
}

function addDetailedCathedral(scene: THREE.Scene, groundY: number) {
  const cathedral = new THREE.Group();
  cathedral.name = "cathedral-basilica-detailed";
  cathedral.position.set(-47.1, groundY + 0.04, -35.8);

  new STLLoader().load(
    raceAsset("/models/cathedral/denver-cathedral.stl?v=1"),
    (geometry) => {
      geometry.center();
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0xd8c6a6,
          roughness: 0.82,
          metalness: 0.02,
          flatShading: true,
        }),
      );
      mesh.scale.setScalar(0.125);
      mesh.position.y = 4.88;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cathedral.add(mesh);
    },
  );

  const label = createLabel("DENVER CATHEDRAL", "#765c42");
  label.position.set(0, 9.8, 0);
  label.scale.set(4.8, 1.1, 1);
  cathedral.add(label);
  scene.add(cathedral);
}

function addSky(scene: THREE.Scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 skyPosition;
        void main() {
          skyPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 skyPosition;
        void main() {
          float horizon = smoothstep(-35.0, 155.0, skyPosition.y);
          vec3 low = vec3(0.76, 0.91, 0.94);
          vec3 high = vec3(0.26, 0.58, 0.83);
          gl_FragColor = vec4(mix(low, high, horizon), 1.0);
        }
      `,
    }),
  );
  scene.add(sky);

  const clouds = new THREE.Group();
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 2);
  const cloudMaterial = new THREE.MeshLambertMaterial({
    color: 0xfffdf2,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    fog: false,
    flatShading: true,
  });
  for (let index = 0; index < 15; index += 1) {
    const angle = (index / 15) * Math.PI * 2;
    const distance = 88 + seeded(index * 9) * 48;
    const cloud = new THREE.Group();
    cloud.position.set(
      Math.cos(angle) * distance - 10,
      39 + seeded(index * 5) * 25,
      Math.sin(angle) * distance,
    );
    cloud.rotation.y = -angle;
    for (let puff = 0; puff < 5; puff += 1) {
      const mesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
      mesh.position.set((puff - 2) * 2.1, seeded(index * 17 + puff) * 1.2, 0);
      mesh.scale.set(
        2.1 + seeded(index + puff * 7),
        1.25 + seeded(index * 3 + puff) * 0.65,
        1.45,
      );
      cloud.add(mesh);
    }
    clouds.add(cloud);
  }
  scene.add(clouds);
  return clouds;
}

type OpiePartName = "body" | "leftLeg" | "rightLeg" | "leftArm" | "rightArm";

type OpieRunningRig = {
  root: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
};

type PartBuffers = {
  position: number[];
  normal: number[];
  uv: number[];
};

function createOpieRunningRig(model: THREE.Object3D): OpieRunningRig {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const root = new THREE.Group();
  root.name = "opie-running-rig";

  const groups: Record<OpiePartName, THREE.Group> = {
    body: new THREE.Group(),
    leftLeg: new THREE.Group(),
    rightLeg: new THREE.Group(),
    leftArm: new THREE.Group(),
    rightArm: new THREE.Group(),
  };
  groups.body.name = "opie-body-and-head";
  groups.leftLeg.name = "opie-left-leg";
  groups.rightLeg.name = "opie-right-leg";
  groups.leftArm.name = "opie-left-arm";
  groups.rightArm.name = "opie-right-arm";

  const pivots: Record<OpiePartName, THREE.Vector3> = {
    body: new THREE.Vector3(),
    leftLeg: new THREE.Vector3(
      center.x,
      bounds.min.y + size.y * 0.43,
      center.z - size.z * 0.13,
    ),
    rightLeg: new THREE.Vector3(
      center.x,
      bounds.min.y + size.y * 0.43,
      center.z + size.z * 0.13,
    ),
    leftArm: new THREE.Vector3(
      center.x,
      bounds.min.y + size.y * 0.64,
      center.z - size.z * 0.28,
    ),
    rightArm: new THREE.Vector3(
      center.x,
      bounds.min.y + size.y * 0.64,
      center.z + size.z * 0.28,
    ),
  };

  (Object.keys(groups) as OpiePartName[]).forEach((part) => {
    groups[part].position.copy(pivots[part]);
    root.add(groups[part]);
  });

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const sourceGeometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    const positions = sourceGeometry.getAttribute("position");
    const normals = sourceGeometry.getAttribute("normal");
    const uvs = sourceGeometry.getAttribute("uv");
    if (!positions || !normals) {
      sourceGeometry.dispose();
      return;
    }

    const buffers: Record<OpiePartName, PartBuffers> = {
      body: { position: [], normal: [], uv: [] },
      leftLeg: { position: [], normal: [], uv: [] },
      rightLeg: { position: [], normal: [], uv: [] },
      leftArm: { position: [], normal: [], uv: [] },
      rightArm: { position: [], normal: [], uv: [] },
    };
    const transform = object.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    const transformed = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ];
    const transformedNormal = new THREE.Vector3();

    for (let index = 0; index < positions.count; index += 3) {
      const centroid = new THREE.Vector3();
      for (let vertex = 0; vertex < 3; vertex += 1) {
        transformed[vertex]
          .fromBufferAttribute(positions, index + vertex)
          .applyMatrix4(transform);
        centroid.add(transformed[vertex]);
      }
      centroid.multiplyScalar(1 / 3);
      const relativeHeight = (centroid.y - bounds.min.y) / size.y;
      const outsideTorso =
        Math.abs(centroid.z - center.z) > size.z * 0.19;
      let part: OpiePartName = "body";

      if (relativeHeight < 0.43) {
        part = centroid.z < center.z ? "leftLeg" : "rightLeg";
      } else if (relativeHeight < 0.68 && outsideTorso) {
        part = centroid.z < center.z ? "leftArm" : "rightArm";
      }

      for (let vertex = 0; vertex < 3; vertex += 1) {
        const point = transformed[vertex].clone().sub(pivots[part]);
        buffers[part].position.push(point.x, point.y, point.z);
        transformedNormal
          .fromBufferAttribute(normals, index + vertex)
          .applyMatrix3(normalMatrix)
          .normalize();
        buffers[part].normal.push(
          transformedNormal.x,
          transformedNormal.y,
          transformedNormal.z,
        );
        if (uvs) {
          buffers[part].uv.push(uvs.getX(index + vertex), uvs.getY(index + vertex));
        }
      }
    }

    const material = Array.isArray(object.material)
      ? object.material[0]
      : object.material;
    (Object.keys(buffers) as OpiePartName[]).forEach((part) => {
      const data = buffers[part];
      if (data.position.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(data.position, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(data.normal, 3),
      );
      if (data.uv.length > 0) {
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uv, 2));
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      groups[part].add(mesh);
    });
    sourceGeometry.dispose();
  });

  return {
    root,
    leftLeg: groups.leftLeg,
    rightLeg: groups.rightLeg,
    leftArm: groups.leftArm,
    rightArm: groups.rightArm,
  };
}

function createGameAudio(): AudioController {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let engineBus: GainNode | null = null;
  let effectsBus: GainNode | null = null;
  let engine: OscillatorNode | null = null;
  let engineGain: GainNode | null = null;
  let musicTimer: number | null = null;
  let musicStep = 0;
  let enabled = true;
  let active = false;
  let character: CharacterId = "emmy";
  let lastCollision = 0;
  let lastFootstep = 0;
  let wasBoosting = false;

  const ensureContext = () => {
    if (context) return context;
    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) return null;

    context = new AudioContextClass();
    master = context.createGain();
    musicBus = context.createGain();
    engineBus = context.createGain();
    effectsBus = context.createGain();
    master.gain.value = enabled ? 0.58 : 0.0001;
    musicBus.gain.value = 0.23;
    engineBus.gain.value = 0.58;
    effectsBus.gain.value = 0.52;
    musicBus.connect(master);
    engineBus.connect(master);
    effectsBus.connect(master);
    master.connect(context.destination);

    engine = context.createOscillator();
    engineGain = context.createGain();
    engine.type = "sawtooth";
    engine.frequency.value = 54;
    engineGain.gain.value = 0.0001;
    engine.connect(engineGain);
    engineGain.connect(engineBus);
    engine.start();
    return context;
  };

  const tone = (
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    bus: GainNode | null,
    delay = 0,
  ) => {
    const audio = ensureContext();
    if (!audio || !bus || !enabled) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + Math.max(0.06, duration),
    );
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  };

  const playMusicStep = () => {
    if (!active || !enabled) return;
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    const bass = [130.81, 130.81, 146.83, 146.83, 110, 110, 130.81, 130.81];
    const note = musicStep % melody.length;
    tone(melody[note], 0.34, 0.12, "triangle", musicBus);
    if (note % 2 === 0) {
      tone(bass[note], 0.64, 0.09, "sine", musicBus);
    }
    musicStep += 1;
  };

  const start = () => {
    active = true;
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume();
    if (musicTimer === null) {
      playMusicStep();
      musicTimer = window.setInterval(playMusicStep, 430);
    }
  };

  return {
    start,
    toggle: () => {
      enabled = !enabled;
      const audio = ensureContext();
      if (audio && audio.state === "suspended" && enabled) void audio.resume();
      if (master && audio) {
        master.gain.setTargetAtTime(
          enabled ? 0.58 : 0.0001,
          audio.currentTime,
          0.025,
        );
      }
      if (enabled && active) playMusicStep();
      return enabled;
    },
    setCharacter: (nextCharacter) => {
      character = nextCharacter;
      if (engine) engine.type = character === "emmy" ? "sawtooth" : "triangle";
      if (context && engineGain && character === "opie") {
        engineGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.025);
      }
      wasBoosting = false;
    },
    setEngine: (speed, isDriving, boosting) => {
      if (!context || !engine || !engineGain) return;
      const velocity = Math.abs(speed);
      const boostActive = enabled && isDriving && boosting;
      engine.frequency.setTargetAtTime(
        character === "emmy"
          ? 62 + velocity * 7.4 + (boostActive ? 88 : 0)
          : 98 + velocity * 10 + (boostActive ? 62 : 0),
        context.currentTime,
        boostActive ? 0.035 : 0.08,
      );
      engineGain.gain.setTargetAtTime(
        enabled && isDriving && character === "emmy"
          ? 0.085 + Math.min(velocity / 58, 0.15) + (boostActive ? 0.07 : 0)
          : 0.0001,
        context.currentTime,
        boostActive ? 0.035 : 0.09,
      );

      if (
        character === "opie" &&
        enabled &&
        isDriving &&
        velocity > 0.35 &&
        context.currentTime - lastFootstep >
          Math.max(0.12, 0.34 - velocity * 0.025)
      ) {
        lastFootstep = context.currentTime;
        tone(
          boostActive ? 105 : 82,
          0.085,
          boostActive ? 0.23 : 0.17,
          "triangle",
          effectsBus,
        );
        tone(
          boostActive ? 165 : 132,
          0.055,
          boostActive ? 0.11 : 0.075,
          "square",
          effectsBus,
          0.018,
        );
      }

      if (boostActive && !wasBoosting) {
        tone(
          character === "emmy" ? 220 : 330,
          0.24,
          0.2,
          character === "emmy" ? "sawtooth" : "triangle",
          effectsBus,
        );
        tone(440, 0.28, 0.12, "triangle", effectsBus, 0.08);
      }
      wasBoosting = boostActive;
    },
    checkpoint: () => {
      tone(523.25, 0.2, 0.2, "triangle", effectsBus);
      tone(659.25, 0.24, 0.18, "triangle", effectsBus, 0.13);
    },
    finish: () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        tone(frequency, 0.36, 0.18, "triangle", effectsBus, index * 0.12);
      });
    },
    collision: () => {
      const now = performance.now();
      if (now - lastCollision < 320) return;
      lastCollision = now;
      tone(82.41, 0.18, 0.24, "sawtooth", effectsBus);
      tone(55, 0.22, 0.18, "square", effectsBus, 0.025);
    },
    honk: () => {
      tone(330, 0.22, 0.18, "square", effectsBus);
      tone(261.63, 0.24, 0.13, "square", effectsBus, 0.025);
    },
    dispose: () => {
      if (musicTimer !== null) window.clearInterval(musicTimer);
      if (engine) engine.stop();
      if (context) void context.close();
    },
  };
}

function createGroundMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x716b49,
    roughness: 1,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCityWorldPosition;",
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvCityWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCityWorldPosition;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float earthPattern =
          sin(vCityWorldPosition.x * 0.31) *
          sin(vCityWorldPosition.z * 0.27);
        float fineGrain = sin(
          (vCityWorldPosition.x + vCityWorldPosition.z) * 1.7
        );
        diffuseColor.rgb *= 0.9 + earthPattern * 0.055 + fineGrain * 0.018;`,
      );
  };
  material.customProgramCacheKey = () => "tiny-denver-ground-v1";
  return material;
}

function createBuildingMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xc69c69,
    roughness: 0.82,
    metalness: 0.015,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCityWorldPosition;",
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvCityWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCityWorldPosition;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 cityFaceNormal = normalize(
          cross(dFdx(vCityWorldPosition), dFdy(vCityWorldPosition))
        );
        float wallMask =
          1.0 - smoothstep(0.5, 0.86, abs(cityFaceNormal.y));
        vec2 facadePosition =
          abs(cityFaceNormal.x) > abs(cityFaceNormal.z)
            ? vec2(vCityWorldPosition.z, vCityWorldPosition.y)
            : vec2(vCityWorldPosition.x, vCityWorldPosition.y);
        vec2 windowCell = fract(facadePosition * vec2(0.72, 0.62));
        float windowX =
          step(0.18, windowCell.x) * step(windowCell.x, 0.76);
        float windowY =
          step(0.2, windowCell.y) * step(windowCell.y, 0.7);
        float windowMask = windowX * windowY * wallMask;
        vec2 windowIndex = floor(facadePosition * vec2(0.72, 0.62));
        float windowRandom = fract(
          sin(dot(windowIndex, vec2(12.9898, 78.233))) * 43758.5453
        );
        vec3 darkGlass = vec3(0.12, 0.22, 0.23);
        vec3 warmGlass = vec3(0.72, 0.47, 0.2);
        vec3 glassColor = mix(
          darkGlass,
          warmGlass,
          step(0.83, windowRandom)
        );
        float masonryVariation =
          0.92 + 0.08 * sin(floor(facadePosition.y * 1.25));
        diffuseColor.rgb *= mix(1.0, masonryVariation, wallMask);
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          glassColor,
          windowMask * 0.78
        );
        float roofMask = smoothstep(0.78, 0.96, abs(cityFaceNormal.y));
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          vec3(0.29, 0.31, 0.27),
          roofMask * 0.62
        );`,
      );
  };
  material.customProgramCacheKey = () => "tiny-denver-facades-v1";
  return material;
}

function createLabel(text: string, color = "#17221c") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff9e8";
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 26);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 10;
  context.stroke();
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 54px Arial";
  context.fillText(text, 256, 67);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(9, 2.25, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function createGroundLabel(text: string, color = "#fff9e8") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Group();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 62px Arial";
  context.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marking = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  marking.rotation.x = -Math.PI / 2;
  marking.renderOrder = 5;
  return marking;
}

function addRoad(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  depth: number,
  name?: string,
) {
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, depth),
    new THREE.MeshStandardMaterial({ color: 0x303733, roughness: 0.96 }),
  );
  road.position.set(x, 0.03, z);
  road.receiveShadow = true;
  scene.add(road);

  const longAxisIsX = width > depth;
  const length = longAxisIsX ? width : depth;
  const sidewalkMaterial = new THREE.MeshStandardMaterial({
    color: 0xcac6b6,
    roughness: 0.94,
  });
  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(
        longAxisIsX ? width : 1.15,
        0.16,
        longAxisIsX ? 1.15 : depth,
      ),
      sidewalkMaterial,
    );
    sidewalk.position.set(
      x + (longAxisIsX ? 0 : side * (width / 2 + 0.58)),
      0.04,
      z + (longAxisIsX ? side * (depth / 2 + 0.58) : 0),
    );
    sidewalk.receiveShadow = true;
    scene.add(sidewalk);
  }

  for (let offset = -length / 2 + 2; offset < length / 2; offset += 4) {
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(
        longAxisIsX ? 1.75 : 0.07,
        0.035,
        longAxisIsX ? 0.07 : 1.75,
      ),
      new THREE.MeshBasicMaterial({ color: 0xb7b89d }),
    );
    dash.position.set(
      x + (longAxisIsX ? offset : 0),
      0.12,
      z + (longAxisIsX ? 0 : offset),
    );
    scene.add(dash);
  }

  if (name) {
    const label = createGroundLabel(name);
    label.position.set(x, 0.19, z);
    label.rotation.z = longAxisIsX ? 0 : Math.PI / 2;
    scene.add(label);
  }
}

function addTree(scene: THREE.Scene, x: number, z: number, size = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.12 * size,
      0.16 * size,
      1.25 * size,
      7,
    ),
    new THREE.MeshStandardMaterial({ color: 0x744b35, roughness: 1 }),
  );
  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.75 * size, 1),
    new THREE.MeshStandardMaterial({
      color: seeded(x * 2 + z) > 0.45 ? 0x3e7955 : 0x5b8b5e,
      roughness: 0.9,
      flatShading: true,
    }),
  );
  trunk.position.set(x, 0.7 * size, z);
  crown.position.set(x, 1.8 * size, z);
  trunk.castShadow = true;
  crown.castShadow = true;
  scene.add(trunk, crown);
}

function addWindows(
  group: THREE.Group,
  width: number,
  height: number,
  depth: number,
  floors: number,
  columns: number,
  accent = 0x263d3b,
) {
  const material = new THREE.MeshStandardMaterial({
    color: accent,
    metalness: 0.12,
    roughness: 0.32,
  });
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      const windowWidth = Math.min(1.15, (width - 1.2) / columns - 0.35);
      const windowHeight = Math.min(1.35, height / floors - 0.65);
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(windowWidth, windowHeight, 0.09),
        material,
      );
      window.position.set(
        -width / 2 + 0.65 + (column + 0.5) * ((width - 1.3) / columns),
        0.65 + (floor + 0.5) * ((height - 0.75) / floors),
        -depth / 2 - 0.06,
      );
      group.add(window);
    }
  }
}

function addStyledBuilding(
  scene: THREE.Scene,
  style: number,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  seed: number,
) {
  const group = new THREE.Group();
  const brickColors = [0x8f4938, 0xa9583f, 0x77453a, 0xb26c4a];
  const trim = new THREE.MeshStandardMaterial({
    color: 0xdfd2b8,
    roughness: 0.9,
  });

  if (style === 0) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: brickColors[Math.floor(seeded(seed) * brickColors.length)],
        roughness: 0.92,
      }),
    );
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);
    addWindows(group, width, height, depth, Math.max(2, Math.floor(height / 2.5)), 3);
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.35, 0.3, depth + 0.25),
      trim,
    );
    cornice.position.y = height;
    group.add(cornice);
    const stoop = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.45, 1.4),
      trim,
    );
    stoop.position.set(0, 0.22, -depth / 2 - 0.7);
    group.add(stoop);
  } else if (style === 1) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.82, height * 0.78, depth * 0.88),
      new THREE.MeshStandardMaterial({
        color: seeded(seed + 1) > 0.5 ? 0xc9906e : 0xe0c8a6,
        roughness: 0.9,
      }),
    );
    body.position.y = (height * 0.78) / 2;
    body.castShadow = true;
    group.add(body);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(width * 0.59, height * 0.3, 4),
      new THREE.MeshStandardMaterial({
        color: 0x4d554f,
        roughness: 0.84,
      }),
    );
    roof.position.y = height * 0.9;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = depth / width;
    roof.castShadow = true;
    group.add(roof);
    addWindows(
      group,
      width * 0.82,
      height * 0.76,
      depth * 0.88,
      2,
      2,
      0x31524d,
    );
    const porch = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.55, 0.24, 1.6),
      trim,
    );
    porch.position.set(0, 0.55, -depth * 0.44 - 0.78);
    group.add(porch);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 1.45, 8),
        trim,
      );
      post.position.set(side * width * 0.2, 1.2, -depth * 0.44 - 1.25);
      group.add(post);
    }
  } else if (style === 2) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: seeded(seed + 2) > 0.5 ? 0xdad8c7 : 0xbcc8ba,
        roughness: 0.86,
      }),
    );
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);
    const floors = Math.max(2, Math.floor(height / 2.35));
    for (let floor = 0; floor < floors; floor += 1) {
      const ribbon = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.84, 0.88, 0.1),
        new THREE.MeshStandardMaterial({
          color: 0x304a4e,
          roughness: 0.34,
        }),
      );
      ribbon.position.set(0, 1.25 + floor * 2.1, -depth / 2 - 0.06);
      group.add(ribbon);
      const balcony = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.88, 0.14, 0.9),
        trim,
      );
      balcony.position.set(0, 0.72 + floor * 2.1, -depth / 2 - 0.48);
      group.add(balcony);
    }
    const entry = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 2.15, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x17221c }),
    );
    entry.position.set(0, 1.08, -depth / 2 - 0.08);
    group.add(entry);
  } else {
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: brickColors[Math.floor(seeded(seed + 3) * brickColors.length)],
        roughness: 0.94,
      }),
    );
    upper.position.y = height / 2;
    upper.castShadow = true;
    group.add(upper);
    const storefront = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, Math.min(2.5, height * 0.45), 0.16),
      new THREE.MeshStandardMaterial({
        color: 0x203e42,
        roughness: 0.28,
      }),
    );
    storefront.position.set(
      0,
      Math.min(1.25, height * 0.23),
      -depth / 2 - 0.1,
    );
    group.add(storefront);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, 0.24, 1.05),
      new THREE.MeshStandardMaterial({
        color: seeded(seed + 4) > 0.5 ? 0xc95436 : 0x2d604b,
        roughness: 0.75,
      }),
    );
    awning.position.set(0, 2.45, -depth / 2 - 0.55);
    awning.rotation.x = -0.16;
    group.add(awning);
    if (height > 4) addWindows(group, width, height, depth, 2, 3);
  }

  group.position.set(x, 0.12, z);
  scene.add(group);
}

function addBuildings(scene: THREE.Scene) {
  let seed = 1;

  for (let xi = 0; xi < X_ROADS.length - 1; xi += 1) {
    for (let zi = 0; zi < Z_ROADS.length - 1; zi += 1) {
      const buildingSetback = ROAD_WIDTH / 2 + 0.75;
      const left = X_ROADS[xi] + buildingSetback;
      const right = X_ROADS[xi + 1] - buildingSetback;
      const top = Z_ROADS[zi] + buildingSetback;
      const bottom = Z_ROADS[zi + 1] - buildingSetback;
      if (right <= left || bottom <= top) continue;

      const blockX = (left + right) / 2;
      const blockZ = (top + bottom) / 2;
      const nearCapitol =
        blockX < -10 && blockX > -24 && blockZ < -36;
      const nearTrader =
        blockX > -12 && blockX < 0 && blockZ > 13;
      const nearHome =
        blockX > 8 && blockX < 20 && blockZ > -1 && blockZ < 9;
      if (nearCapitol || nearTrader || nearHome) continue;

      const count = seeded(seed++) > 0.48 ? 2 : 1;
      for (let n = 0; n < count; n += 1) {
        const width = Math.max(2.4, (right - left) / count - 0.8);
        const depth = Math.max(2.8, bottom - top);
        const height = 2.6 + seeded(seed++) * 7;
        const x = left + width / 2 + n * ((right - left) / count);
        addStyledBuilding(
          scene,
          (xi + zi + n) % 4,
          x,
          blockZ,
          width,
          depth,
          height,
          seed++,
        );
      }
    }
  }

  for (let i = 0; i < 44; i += 1) {
    const roadSide = i % 2 === 0;
    const x = roadSide
      ? -29 + seeded(i + 20) * 58
      : [-27, -18.5, 1.5, 14, 26][i % 5];
    const z = roadSide
      ? [-34, -22, -10, 13, 25][i % 5]
      : -47 + seeded(i + 90) * 73;
    if (Math.hypot(x - 8, z - 2) > 4) {
      addTree(scene, x, z, 0.72 + seeded(i) * 0.32);
    }
  }
}

function addLandmarks(scene: THREE.Scene) {
  const trader = new THREE.Group();
  const traderBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 5.2, 6.4),
    new THREE.MeshStandardMaterial({ color: 0x30373c, roughness: 0.74 }),
  );
  traderBuilding.position.y = 2.6;
  traderBuilding.castShadow = true;
  trader.add(traderBuilding);
  new THREE.TextureLoader().load(
    raceAsset("/images/trader-joes-storefront.webp?v=1"),
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const facade = new THREE.Mesh(
        new THREE.PlaneGeometry(8.65, 4.32),
        new THREE.MeshBasicMaterial({ map: texture }),
      );
      facade.position.set(0, 2.55, -3.23);
      facade.rotation.y = Math.PI;
      trader.add(facade);
    },
  );
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.18, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x1c2528, roughness: 0.68 }),
  );
  canopy.position.set(0, 2.05, -3.85);
  trader.add(canopy);
  for (let i = -3.6; i <= 3.6; i += 0.9) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffd37a,
        emissive: 0xffb84d,
        emissiveIntensity: 1.8,
      }),
    );
    bulb.position.set(i, 1.98, -4.55);
    trader.add(bulb);
  }
  trader.position.set(-10, 0.15, 24);
  scene.add(trader);

  const home = new THREE.Group();
  const homeBody = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, 6.2, 5.6),
    new THREE.MeshStandardMaterial({ color: 0xdedfd8, roughness: 0.86 }),
  );
  homeBody.position.y = 3.1;
  homeBody.castShadow = true;
  home.add(homeBody);
  const homeGlass = new THREE.MeshStandardMaterial({
    color: 0x2a3c3d,
    roughness: 0.28,
    metalness: 0.12,
  });
  for (let floor = 0; floor < 3; floor += 1) {
    for (const column of [-3.7, -2.1, 2.1, 3.7]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 1.15, 0.09),
        homeGlass,
      );
      window.position.set(column, 1.25 + floor * 1.85, -2.86);
      home.add(window);
    }
  }
  const entry = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, 3.35, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1f2a29, roughness: 0.58 }),
  );
  entry.position.set(0, 1.68, -2.92);
  home.add(entry);
  for (const side of [-1, 1]) {
    const garage = new THREE.Mesh(
      new THREE.BoxGeometry(2.85, 1.45, 0.13),
      new THREE.MeshStandardMaterial({ color: 0xc5c9c2, roughness: 0.86 }),
    );
    garage.position.set(side * 3.35, 0.78, -2.93);
    home.add(garage);
  }
  for (let step = 0; step < 3; step += 1) {
    const stair = new THREE.Mesh(
      new THREE.BoxGeometry(2.3 + step * 0.25, 0.18, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x7e786c, roughness: 0.96 }),
    );
    stair.position.set(0, 0.1 + step * 0.18, -3.4 - step * 0.43);
    home.add(stair);
  }
  const homeLabel = createLabel("935 PENN", "#2d604b");
  homeLabel.position.set(0, 4.4, -3.05);
  homeLabel.scale.set(2.2, 0.55, 1);
  home.add(homeLabel);
  home.position.set(14.2, 0.15, 2);
  scene.add(home);
}

function addCheckpoint(
  scene: THREE.Scene,
  checkpoint: Checkpoint,
  surfaceHeight: number,
) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.11, 10, 32),
    new THREE.MeshStandardMaterial({
      color: checkpoint.color,
      emissive: checkpoint.color,
      emissiveIntensity: 0.35,
      roughness: 0.45,
    }),
  );
  ring.position.y = 1.15;
  ring.rotation.y = Math.PI / 2;
  ring.castShadow = true;
  group.add(ring);
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 1.05, 8),
    new THREE.MeshStandardMaterial({ color: checkpoint.color }),
  );
  pin.position.y = 0.52;
  group.add(pin);
  group.position.set(checkpoint.x, surfaceHeight, checkpoint.z);
  group.userData.ring = ring;
  scene.add(group);
  return group;
}

function MiniMap({
  x,
  z,
  checkpoint,
}: {
  x: number;
  z: number;
  checkpoint: number;
}) {
  const left = THREE.MathUtils.clamp(4 + ((x + 68) / 118) * 92, 4, 96);
  const top = THREE.MathUtils.clamp(4 + ((z + 48) / 106) * 92, 4, 96);
  return (
    <div className="mini-map" aria-label="Course mini map">
      <span className="map-cheesman" />
      <span className="map-route map-route-west" />
      <span className="map-route map-route-north" />
      <span className="map-route map-route-park-east" />
      <span className="map-route map-route-south" />
      <span className="map-route map-route-home-leg" />
      <span className="map-route map-route-trader-leg" />
      <span
        className="map-pin map-pin-trader"
        data-active={checkpoint === 0}
      />
      <span
        className="map-pin map-pin-capitol"
        data-active={checkpoint === 1}
      />
      <span
        className="map-pin map-pin-cheesman"
        data-active={checkpoint === 2}
      />
      <span
        className="map-pin map-pin-home"
        data-active={checkpoint === 3}
      />
      <span className="map-car" style={{ left: `${left}%`, top: `${top}%` }}>
        ▲
      </span>
      <span className="map-north">N</span>
    </div>
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function PennRunGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Record<InputName, boolean>>({
    forward: false,
    back: false,
    left: false,
    right: false,
    boost: false,
  });
  const startedRef = useRef(false);
  const restartRef = useRef<() => void>(() => undefined);
  const hornRef = useRef<() => void>(() => undefined);
  const audioRef = useRef<AudioController | null>(null);
  const selectedCharacterRef = useRef<CharacterId>("emmy");
  const characterSwitchRef = useRef<(character: CharacterId) => void>(
    () => undefined,
  );
  const [started, setStarted] = useState(false);
  const [character, setCharacter] = useState<CharacterId>("emmy");
  const [opieReady, setOpieReady] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapProgress, setMapProgress] = useState(0);
  const [checkpoint, setCheckpoint] = useState(0);
  const [finished, setFinished] = useState(false);
  const [toast, setToast] = useState("Follow the orange rails to Trader Joe’s");
  const [hud, setHud] = useState<HudState>({
    speed: 0,
    elapsed: 0,
    x: START.x,
    z: START.z,
  });

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const setInput = useCallback((name: InputName, value: boolean) => {
    inputRef.current[name] = value;
  }, []);

  const touchProps = useCallback(
    (name: InputName) => ({
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setInput(name, true);
      },
      onPointerUp: () => setInput(name, false),
      onPointerCancel: () => setInput(name, false),
      onLostPointerCapture: () => setInput(name, false),
    }),
    [setInput],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x86c5dc);
    scene.fog = new THREE.Fog(0xb8dfe6, 145, 275);

    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 420);
    camera.position.set(-22, 74, 92);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xeaf8ff, 0x5e684b, 2.4);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff0c2, 3.4);
    sun.position.set(-35, 55, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 220;
    scene.add(sun);

    const cloudLayer = addSky(scene);
    const sampleTrack = createTrackSampler();
    const checkpointGroups: THREE.Group[] = [];

    const car = new THREE.Group();
    car.position.set(START.x, 3, START.z);
    car.rotation.y = -START.heading - Math.PI / 2;
    scene.add(car);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 20),
      new THREE.MeshBasicMaterial({
        color: 0x17221c,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.55, 1);
    shadow.position.y = 0.04;
    car.add(shadow);

    const emmyCharacter = new THREE.Group();
    emmyCharacter.name = "emmy-character";
    const opieCharacter = new THREE.Group();
    opieCharacter.name = "opie-character";
    const opieMotion = new THREE.Group();
    opieMotion.name = "opie-walk-motion";
    opieCharacter.add(opieMotion);
    car.add(emmyCharacter, opieCharacter);
    let opieRunningRig: OpieRunningRig | null = null;

    const showCharacter = (nextCharacter: CharacterId) => {
      emmyCharacter.visible = nextCharacter === "emmy";
      opieCharacter.visible = nextCharacter === "opie";
      shadow.scale.set(
        nextCharacter === "opie" ? 0.72 : 1,
        nextCharacter === "opie" ? 0.72 : 0.55,
        1,
      );
    };
    characterSwitchRef.current = showCharacter;
    showCharacter(selectedCharacterRef.current);

    const characterLoader = new GLTFLoader();
    characterLoader.setMeshoptDecoder(MeshoptDecoder);
    characterLoader.load(
      raceAsset("/models/little-car-color.glb?v=3"),
      (gltf) => {
        const model = gltf.scene;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            for (const texture of [
              material.map,
              material.normalMap,
              material.roughnessMap,
              material.metalnessMap,
            ]) {
              if (texture) {
                texture.anisotropy = Math.min(
                  8,
                  renderer.capabilities.getMaxAnisotropy(),
                );
              }
            }
          }
        });
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const scale = 0.86 / Math.max(size.x, size.z);
        model.scale.setScalar(scale);
        const scaledBounds = new THREE.Box3().setFromObject(model);
        const center = scaledBounds.getCenter(new THREE.Vector3());
        model.position.set(
          -center.x,
          -scaledBounds.min.y + 0.08,
          -center.z,
        );
        emmyCharacter.add(model);
      },
      undefined,
      () =>
        setToast("The car model took a wrong turn — reload to try again"),
    );

    characterLoader.load(
      raceAsset("/models/opie-walking.glb?v=1"),
      (gltf) => {
        const model = gltf.scene;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          const walkingMaterials = materials.map((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) {
              return material.clone();
            }
            for (const texture of [
              material.map,
              material.normalMap,
              material.roughnessMap,
              material.metalnessMap,
            ]) {
              if (texture) {
                texture.anisotropy = Math.min(
                  8,
                  renderer.capabilities.getMaxAnisotropy(),
                );
              }
            }
            return material.clone();
          });
          object.material = Array.isArray(object.material)
            ? walkingMaterials
            : walkingMaterials[0];
        });

        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const scale = 1.08 / size.y;
        model.scale.setScalar(scale);
        const scaledBounds = new THREE.Box3().setFromObject(model);
        const center = scaledBounds.getCenter(new THREE.Vector3());
        model.position.set(
          -center.x,
          -scaledBounds.min.y + 0.045,
          -center.z,
        );
        model.rotation.y = -Math.PI / 2;
        opieRunningRig = createOpieRunningRig(model);
        opieMotion.add(opieRunningRig.root);
        setOpieReady(true);
      },
      undefined,
      () => {
        setOpieReady(false);
        setToast("Opie could not join the race — reload to try again");
      },
    );

    const cityPalette: Record<
      string,
      { color: number; roughness: number; metalness?: number }
    > = {
      base_and_title: { color: 0x716b49, roughness: 1 },
      parks: { color: 0x557e45, roughness: 0.96 },
      landmarks: { color: 0xd89038, roughness: 0.68, metalness: 0.08 },
      home: { color: 0xc74542, roughness: 0.72 },
      pool: { color: 0x36abc4, roughness: 0.26, metalness: 0.12 },
    };
    new ThreeMFLoader().load(
      raceAsset("/models/cap-hill/penelopes-tiny-denver-race.3mf?v=1"),
      (cityMap) => {
        cityMap.rotation.x = -Math.PI / 2;
        cityMap.updateMatrixWorld(true);
        cityMap.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          let layer: THREE.Object3D | null = object;
          let layerName = "base_and_title";
          while (layer) {
            if (cityPalette[layer.name]) {
              layerName = layer.name;
              break;
            }
            layer = layer.parent;
          }
          if (layerName === "landmarks") removeReplacedLandmarks(object);
          const style = cityPalette[layerName];
          const oldMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          oldMaterials.forEach((material) => material.dispose());
          object.material =
            layerName === "base_and_title"
                ? createGroundMaterial()
                : new THREE.MeshStandardMaterial({
                    color: style.color,
                    roughness: style.roughness,
                    metalness: style.metalness ?? 0,
                    flatShading: true,
                  });
          object.receiveShadow = true;
          object.castShadow =
            layerName === "landmarks" ||
            layerName === "home";
        });
        scene.add(cityMap);
        cityMap.updateMatrixWorld(true);
        const groundLayer = cityMap.getObjectByName("base_and_title");
        if (!groundLayer) {
          setToast("The ground layer is missing — reload the map to try again");
          return;
        }
        const sampleGround = buildSurfaceSampler(groundLayer);
        prepareTrackHeights(sampleGround);
        addRaceTrack(scene);
        CHECKPOINTS.forEach((point) => {
          const checkpointSurface = closestTrackSample(point.x, point.z).point.y;
          checkpointGroups.push(
            addCheckpoint(scene, point, checkpointSurface + 0.06),
          );
        });
        addSimplifiedCity(scene, sampleGround);
        addDetailedCapitol(
          scene,
          sampleGround(-59.25, -27.5) ?? 0.08,
        );
        addDetailedArtMuseum(
          scene,
          sampleGround(-76.2, -15.4) ?? 0.08,
        );
        addDetailedCathedral(
          scene,
          sampleGround(-47.1, -35.8) ?? 0.08,
        );
        car.position.y = (sampleTrack(START.x, START.z) ?? 2.8) + 0.06;
        setMapProgress(100);
        setMapReady(true);
        setToast("The Denver ground loop is ready — follow the orange rails");
      },
      (progress) => {
        if (!progress.total) return;
        setMapProgress(
          Math.min(90, Math.round((progress.loaded / progress.total) * 90)),
        );
      },
      () => {
        setToast("Tiny Denver could not unfold — reload to try again");
      },
    );

    const gameAudio = createGameAudio();
    gameAudio.setCharacter(selectedCharacterRef.current);
    audioRef.current = gameAudio;
    hornRef.current = gameAudio.honk;

    let heading = START.heading;
    let speed = 0;
    let driftVelocity = 0;
    let activeCheckpoint = 0;
    let elapsed = 0;
    let lastFrame = performance.now();
    let lastHudUpdate = 0;
    let finishLocked = false;
    let celebrationStartedAt = 0;
    let opieStride = 0;

    const resetGame = () => {
      car.position.set(
        START.x,
        (sampleTrack(START.x, START.z) ?? 2.8) + 0.06,
        START.z,
      );
      heading = START.heading;
      speed = 0;
      driftVelocity = 0;
      activeCheckpoint = 0;
      elapsed = 0;
      finishLocked = false;
      celebrationStartedAt = 0;
      setCheckpoint(0);
      setFinished(false);
      setToast("Follow the orange rails to Trader Joe’s");
      setHud({
        speed: 0,
        elapsed: 0,
        x: START.x,
        z: START.z,
      });
    };
    restartRef.current = resetGame;

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    window.addEventListener("resize", resize);

    const keyMap: Record<string, InputName | undefined> = {
      arrowup: "forward",
      w: "forward",
      arrowdown: "back",
      s: "back",
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
      shift: "boost",
      b: "boost",
      " ": "boost",
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (keyMap[key]) {
        inputRef.current[keyMap[key]!] = true;
        event.preventDefault();
      }
      if (key === "r") resetGame();
      if (key === "h" && !event.repeat) gameAudio.honk();
      if (key === "m" && !event.repeat) {
        setSoundOn(gameAudio.toggle());
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (keyMap[key]) inputRef.current[keyMap[key]!] = false;
    };
    window.addEventListener("keydown", onKeyDown, {
      passive: false,
    });
    window.addEventListener("keyup", onKeyUp);

    const lookTarget = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    let animationId = 0;
    const animate = (now: number) => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min((now - lastFrame) / 1000, 0.04);
      lastFrame = now;
      const input = inputRef.current;

      if (startedRef.current && !finishLocked) {
        elapsed += delta;
        const throttle =
          input.forward || input.boost ? 1 : input.back ? -0.65 : 0;
        const boosting = input.boost && speed >= 0;
        const acceleration = boosting ? 7.2 : 4.2;
        if (throttle !== 0) speed += throttle * acceleration * delta;
        else speed *= Math.pow(0.18, delta);
        const topSpeed = boosting ? 8.6 : 5.5;
        if (!boosting && speed > topSpeed) {
          speed = THREE.MathUtils.lerp(speed, topSpeed, 0.08);
        }
        speed = THREE.MathUtils.clamp(speed, -2.4, 8.6);

        const steer =
          (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (Math.abs(speed) > 0.25) {
          const direction = speed >= 0 ? 1 : -1;
          heading +=
            steer *
            direction *
            (0.72 + Math.min(Math.abs(speed) / 4.5, 0.8)) *
            delta;
        }

        const isEmmy = selectedCharacterRef.current === "emmy";
        const isDrifting =
          isEmmy && Math.abs(speed) > 2 && steer !== 0;
        const driftStrength = boosting ? 1.45 : 0.62;
        const targetDrift = isDrifting
          ? -steer *
            Math.min(Math.abs(speed) / 5.5, 1.35) *
            driftStrength
          : 0;
        driftVelocity = THREE.MathUtils.lerp(
          driftVelocity,
          targetDrift,
          1 - Math.exp(-(isDrifting ? 5.5 : 7.5) * delta),
        );

        const nextX =
          car.position.x +
          (Math.sin(heading) * speed +
            Math.cos(heading) * driftVelocity) *
            delta;
        const nextZ =
          car.position.z +
          (-Math.cos(heading) * speed +
            Math.sin(heading) * driftVelocity) *
            delta;
        const nextSurface = sampleTrack(nextX, nextZ);
        if (nextSurface !== null) {
          car.position.x = nextX;
          car.position.y = nextSurface + 0.06;
          car.position.z = nextZ;
        } else {
          speed *= -0.22;
          driftVelocity *= -0.25;
          gameAudio.collision();
        }
        const driftYaw =
          selectedCharacterRef.current === "emmy"
            ? driftVelocity * 0.14
            : 0;
        car.rotation.y = -heading - Math.PI / 2 + driftYaw;
        car.rotation.z = THREE.MathUtils.lerp(
          car.rotation.z,
          ((input.left ? 1 : 0) - (input.right ? 1 : 0)) *
            Math.min(Math.abs(speed) / 35, 0.08),
          0.08,
        );

        const targetPoint = CHECKPOINTS[activeCheckpoint];
        const distance = Math.hypot(
          car.position.x - targetPoint.x,
          car.position.z - targetPoint.z,
        );
        if (
          distance < 2.75 &&
          (activeCheckpoint > 0 || elapsed > 2.5)
        ) {
          if (activeCheckpoint === CHECKPOINTS.length - 1) {
            finishLocked = true;
            celebrationStartedAt = now;
            speed = 0;
            gameAudio.finish();
            setFinished(true);
            setToast(
              `Home in ${formatTime(elapsed)} — beautiful driving`,
            );
          } else {
            gameAudio.checkpoint();
            activeCheckpoint += 1;
            setCheckpoint(activeCheckpoint);
            const nextMessages = [
              "",
              "Snacks secured — take Logan north",
              "Gold dome spotted — follow Colfax east to Cheesman Park",
              "Cheesman loop complete — bring it home to Penn",
            ];
            setToast(nextMessages[activeCheckpoint]);
          }
        }
      } else if (!startedRef.current) {
        const idleTime = now * 0.00014;
        camera.position.set(
          -42 + Math.sin(idleTime) * 92,
          62,
          8 + Math.cos(idleTime) * 92,
        );
      }

      cloudLayer.rotation.y += delta * 0.004;
      gameAudio.setEngine(
        speed,
        startedRef.current && !finishLocked,
        input.boost,
      );

      const opieMoving =
        selectedCharacterRef.current === "opie" &&
        startedRef.current &&
        !finishLocked;
      const walkAmount = opieMoving
        ? THREE.MathUtils.clamp(Math.abs(speed) / 2.8, 0, 1)
        : 0;
      opieStride += delta * (2.4 + Math.abs(speed) * 3.1) * walkAmount;
      opieMotion.position.y =
        Math.abs(Math.sin(opieStride * 2)) * 0.035 * walkAmount +
        (walkAmount === 0 ? Math.sin(now * 0.0015) * 0.006 : 0);
      opieMotion.rotation.z =
        Math.sin(opieStride) * 0.035 * walkAmount;
      opieMotion.rotation.x =
        Math.sin(opieStride * 2) * 0.016 * walkAmount;
      if (opieRunningRig) {
        const strideSwing = Math.sin(opieStride) * 0.82 * walkAmount;
        opieRunningRig.leftLeg.rotation.z = strideSwing;
        opieRunningRig.rightLeg.rotation.z = -strideSwing;
        opieRunningRig.leftArm.rotation.z = -strideSwing * 0.82;
        opieRunningRig.rightArm.rotation.z = strideSwing * 0.82;
        opieRunningRig.leftLeg.rotation.x = 0;
        opieRunningRig.rightLeg.rotation.x = 0;
      }

      checkpointGroups.forEach((group, index) => {
        const ring = group.userData.ring as THREE.Mesh;
        ring.rotation.z += delta * (index === activeCheckpoint ? 1.9 : 0.5);
        group.visible = !finishLocked && index === activeCheckpoint;
        const pulse =
          index === activeCheckpoint
            ? 1 + Math.sin(now * 0.006) * 0.08
            : 0.82;
        group.scale.setScalar(pulse);
      });

      if (startedRef.current && finishLocked) {
        const celebrationTime = Math.max(
          0,
          (now - celebrationStartedAt) / 1000,
        );
        const orbitProgress = reduceMotion
          ? 1
          : THREE.MathUtils.clamp(celebrationTime / 4.6, 0, 1);
        const easedOrbit = 1 - (1 - orbitProgress) ** 3;
        const victoryAngle =
          -heading +
          easedOrbit * Math.PI * 1.08 +
          (reduceMotion
            ? 0
            : Math.max(0, celebrationTime - 4.6) * 0.18);
        const victoryRadius = THREE.MathUtils.lerp(4.2, 3.15, easedOrbit);
        const desiredCamera = new THREE.Vector3(
          car.position.x + Math.sin(victoryAngle) * victoryRadius,
          car.position.y +
            THREE.MathUtils.lerp(2.45, 1.85, easedOrbit) +
            Math.sin(celebrationTime * 1.1) * 0.08,
          car.position.z + Math.cos(victoryAngle) * victoryRadius,
        );
        camera.position.lerp(
          desiredCamera,
          1 - Math.pow(0.0005, delta),
        );
        car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, 0, 0.08);
      } else if (startedRef.current) {
        const behind = new THREE.Vector3(
          -Math.sin(heading) * 4.2,
          2.45,
          Math.cos(heading) * 4.2,
        );
        const desiredCamera = car.position.clone().add(behind);
        camera.position.lerp(
          desiredCamera,
          1 - Math.pow(0.002, delta),
        );
      }
      if (startedRef.current && finishLocked) {
        lookTarget.set(
          car.position.x,
          car.position.y + 0.55,
          car.position.z,
        );
      } else if (startedRef.current) {
        lookTarget.set(
          car.position.x + Math.sin(heading) * 1.45,
          car.position.y + 0.52,
          car.position.z - Math.cos(heading) * 1.45,
        );
      } else {
        lookTarget.set(-43, 13, 8);
      }
      cameraTarget.lerp(
        lookTarget,
        1 - Math.pow(0.0004, delta),
      );
      camera.lookAt(cameraTarget);

      if (now - lastHudUpdate > 110) {
        lastHudUpdate = now;
        setHud({
          speed: Math.abs(speed) * 7,
          elapsed,
          x: car.position.x,
          z: car.position.z,
        });
      }
      renderer.render(scene, camera);
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      gameAudio.dispose();
      audioRef.current = null;
      characterSwitchRef.current = () => undefined;
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      });
    };
  }, []);

  const routeInstruction = useMemo(() => {
    if (finished) return "Joyride complete";
    return CHECKPOINTS[checkpoint].detail;
  }, [checkpoint, finished]);

  const startGame = () => {
    if (!mapReady || (character === "opie" && !opieReady)) return;
    restartRef.current();
    audioRef.current?.start();
    setStarted(true);
  };

  const chooseCharacter = (nextCharacter: CharacterId) => {
    selectedCharacterRef.current = nextCharacter;
    setCharacter(nextCharacter);
    characterSwitchRef.current(nextCharacter);
    audioRef.current?.setCharacter(nextCharacter);
    setToast(
      nextCharacter === "opie"
        ? "Opie is warmed up and ready to run the loop"
        : "Emmy’s little car is ready at the starting line",
    );
  };

  return (
    <main className="game-shell">
      <div
        ref={mountRef}
        className="game-canvas"
        aria-label="3D Capitol Hill driving game"
      />

      <header className="brand-bar">
        <div className="brand-mark" aria-label="Penn Run">
          <span className="brand-kicker">PENELOPE’S TINY DENVER</span>
          <span className="brand-name">PENN RUN</span>
        </div>
        <div className="route-pill">
          <span className="route-number">01</span>
          <span>{routeInstruction}</span>
        </div>
      </header>

      <button
        className="audio-toggle"
        type="button"
        aria-pressed={soundOn}
        aria-label={soundOn ? "Mute music and sound" : "Turn on music and sound"}
        onClick={() => {
          const audio = audioRef.current;
          if (audio) setSoundOn(audio.toggle());
        }}
      >
        {soundOn ? "SOUND ON" : "SOUND OFF"}
      </button>
      <a className="game-select-link" href={gameSelectHref}>
        ← GAME SELECT
      </a>

      <section className="hud-panel" aria-label="Drive status">
        <div className="speed">
          <span className="speed-number">{Math.round(hud.speed)}</span>
          <span className="speed-unit">MPH</span>
        </div>
        <div className="hud-rule" />
        <div className="time-block">
          <span>JOY RIDE</span>
          <strong>{formatTime(hud.elapsed)}</strong>
        </div>
        <button
          className="horn-button"
          onClick={() => hornRef.current()}
          aria-label="Honk the horn"
        >
          HONK
        </button>
        <button
          className="boost-button"
          {...touchProps("boost")}
          aria-label="Hold for speed boost"
        >
          BOOST
        </button>
      </section>

      <aside className="course-panel">
        <div className="course-heading">
          <span>THE LOOP</span>
          <strong>DENVER, CO</strong>
        </div>
        <MiniMap x={hud.x} z={hud.z} checkpoint={checkpoint} />
        <ol className="stops">
          {CHECKPOINTS.map((stop, index) => (
            <li
              key={stop.short}
              data-state={
                index < checkpoint || finished
                  ? "done"
                  : index === checkpoint
                    ? "now"
                    : "next"
              }
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stop.short}</strong>
            </li>
          ))}
        </ol>
      </aside>

      <div className="toast" role="status">
        <span className="toast-dot" />
        {toast}
      </div>

      <div className="keyboard-help" aria-hidden="true">
        <span>
          <kbd>WASD</kbd> DRIVE
        </span>
        <span>
          <kbd>H</kbd> HONK
        </span>
        <span>
          <kbd>B / SHIFT</kbd> TURBO
        </span>
        <span>
          <kbd>M</kbd> SOUND
        </span>
        <span>
          <kbd>R</kbd> RESET
        </span>
      </div>

      <div className="touch-controls" aria-label="Touch driving controls">
        <div className="touch-steer">
          <button {...touchProps("left")} aria-label="Steer left">
            ←
          </button>
          <button {...touchProps("right")} aria-label="Steer right">
            →
          </button>
        </div>
        <div className="touch-pedals">
          <button {...touchProps("boost")} aria-label="Hold for turbo speed">
            BOOST
          </button>
          <button {...touchProps("forward")} aria-label="Accelerate">
            GO
          </button>
          <button {...touchProps("back")} aria-label="Brake and reverse">
            REV
          </button>
        </div>
      </div>

      <footer className="data-credit">
        Denver miniature · OSM, DRCOG &amp; USGS ·{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </footer>

      {!started && (
        <section className="start-screen">
          <div className="start-card">
            <span className="eyebrow">
              THE TINY DENVER GRAND PRIX
            </span>
            <h1>Race the neighborhood loop.</h1>
            <p>
              Choose Emmy’s little car or running Opie, then
              follow the wide, ground-level course across the Capitol Hill
              miniature. Grab the snacks, salute the gold dome, circle
              Cheesman Park, and use BOOST to fly down the orange rails home.
            </p>
            <fieldset className="character-picker">
              <legend>PICK YOUR RACER</legend>
              <div className="character-options">
                <button
                  type="button"
                  className="character-option"
                  data-selected={character === "emmy"}
                  onClick={() => chooseCharacter("emmy")}
                  aria-pressed={character === "emmy"}
                >
                  <span className="character-badge">E</span>
                  <span className="character-copy">
                    <strong>EMMY</strong>
                    <span className="character-detail">LITTLE CAR</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="character-option"
                  data-selected={character === "opie"}
                  onClick={() => chooseCharacter("opie")}
                  aria-pressed={character === "opie"}
                  disabled={!opieReady}
                >
                  <span className="character-badge">O</span>
                  <span className="character-copy">
                    <strong>OPIE</strong>
                    <span className="character-detail">
                      {opieReady ? "RUNNING FREE" : "GETTING READY…"}
                    </span>
                  </span>
                </button>
              </div>
            </fieldset>
            <div className="start-route" aria-label="Route">
              <span>935 PENN</span>
              <b>→</b>
              <span>TRADER JOE’S</span>
              <b>→</b>
              <span>CAPITOL</span>
              <b>→</b>
              <span>CHEESMAN</span>
              <b>→</b>
              <span>HOME</span>
            </div>
            <button
              className="start-button"
              onClick={startGame}
              disabled={!mapReady || (character === "opie" && !opieReady)}
            >
              {mapReady
                ? "START THE TINY DENVER RACE"
                : `UNFOLDING TINY DENVER ${mapProgress}%`}
              <span>{mapReady ? "↗" : "…"}</span>
            </button>
            <a className="other-game-link" href="/denver-fight-club">
              PLAY DENVER FIGHT CLUB <span>→</span>
            </a>
            <small>
              Emmy drives · Opie runs · Press B or hold BOOST for extra speed
            </small>
            <small className="model-credit">
              Museum model by{" "}
              <a
                href="https://www.thingiverse.com/thing:199067"
                target="_blank"
                rel="noreferrer"
              >
                Andy Zimmerman
              </a>{" "}
              · CC BY-SA 3.0
            </small>
            <small className="model-credit">
              Cathedral model by MiniWorld3D · provided by the project owner
            </small>
          </div>
        </section>
      )}

      {finished && (
        <section className="win-overlay" aria-live="assertive">
          <div className="win-confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--confetti-x": `${(index * 37) % 100}%`,
                    "--confetti-delay": `${(index % 8) * -0.22}s`,
                    "--confetti-duration": `${2.2 + (index % 5) * 0.2}s`,
                    "--confetti-tilt": `${(index * 47) % 180}deg`,
                    backgroundColor: [
                      "#f0643b",
                      "#ffd55c",
                      "#2d604b",
                      "#36abc4",
                      "#fff9e8",
                    ][index % 5],
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <h2 className="win-title">YOU WIN!!!</h2>
          <div className="finish-card">
            <span className="eyebrow">LOOP COMPLETE</span>
            <h3>Home before the ice cream melted.</h3>
            <p>{formatTime(hud.elapsed)} around Capitol Hill.</p>
            <button onClick={() => restartRef.current()}>
              DRIVE IT AGAIN ↻
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
