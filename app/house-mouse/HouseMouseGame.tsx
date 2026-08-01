"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type Racer = "emmy" | "opie";
type Input = "forward" | "back" | "left" | "right" | "boost";

const pagesBase =
  typeof window !== "undefined" && window.location.pathname.startsWith("/OTGame")
    ? "/OTGame"
    : "";
const asset = (path: string) => `${pagesBase}${path}`;
const arcadeHref = pagesBase ? `${pagesBase}/` : "/";
const denverHref = pagesBase ? `${pagesBase}/penn-run/` : "/penn-run";

const CENTER = new THREE.Vector2(-7.3, -2.5);
const RADII = new THREE.Vector2(13.5, 9.1);
const TRACK_HALF_WIDTH = 0.92;

function trackPoint(angle: number, target = new THREE.Vector3()) {
  return target.set(
    CENTER.x + Math.cos(angle) * RADII.x,
    0.12,
    CENTER.y + Math.sin(angle) * RADII.y,
  );
}

function makeTrack(scene: THREE.Scene) {
  const count = 180;
  const positions: number[] = [];
  const colors: number[] = [];
  const inner: THREE.Vector3[] = [];
  const outer: THREE.Vector3[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const point = trackPoint(angle);
    const normal = new THREE.Vector3(
      Math.cos(angle) / RADII.x,
      0,
      Math.sin(angle) / RADII.y,
    ).normalize();
    inner.push(point.clone().addScaledVector(normal, -TRACK_HALF_WIDTH));
    outer.push(point.clone().addScaledVector(normal, TRACK_HALF_WIDTH));
  }
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    const vertices = [inner[i], outer[i], outer[next], inner[i], outer[next], inner[next]];
    for (const vertex of vertices) {
      positions.push(vertex.x, vertex.y, vertex.z);
      color.set(i % 18 < 9 ? 0xb98b56 : 0xc79c65);
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const path = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  );
  path.receiveShadow = true;
  scene.add(path);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4025, roughness: 0.85 });
  for (let i = 0; i < count; i += 6) {
    for (const side of [-1, 1]) {
      const angle = (i / count) * Math.PI * 2;
      const p = trackPoint(angle);
      const normal = new THREE.Vector3(Math.cos(angle) / RADII.x, 0, Math.sin(angle) / RADII.y).normalize();
      p.addScaledVector(normal, side * (TRACK_HALF_WIDTH + 0.08));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.34, 7), railMaterial);
      post.position.set(p.x, 0.25, p.z);
      post.castShadow = true;
      scene.add(post);
    }
  }

  const start = trackPoint(0);
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -3; col <= 3; col += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.035, 0.22),
        new THREE.MeshStandardMaterial({ color: (row + col) % 2 ? 0xf8edcf : 0x2b342d }),
      );
      tile.position.set(start.x + row * 0.22, 0.16, start.z + col * 0.22);
      scene.add(tile);
    }
  }
}

function makeRacer(scene: THREE.Scene, racer: Racer) {
  const root = new THREE.Group();
  const fallback = new THREE.Group();
  if (racer === "emmy") {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.22, 0.68),
      new THREE.MeshStandardMaterial({ color: 0xf06b42, roughness: 0.55 }),
    );
    body.position.y = 0.17;
    fallback.add(body);
  } else {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.3, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.75 }),
    );
    body.position.y = 0.32;
    fallback.add(body);
  }
  root.add(fallback);
  root.position.copy(trackPoint(0)).setY(0.16);
  scene.add(root);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    asset(racer === "emmy" ? "/models/little-car-color.glb?v=3" : "/models/opie-walking.glb?v=1"),
    (gltf) => {
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = racer === "emmy" ? 0.48 / Math.max(size.x, size.z) : 0.57 / size.y;
      model.scale.setScalar(scale);
      const scaled = new THREE.Box3().setFromObject(model);
      const center = scaled.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaled.min.y, -center.z);
      model.rotation.y = -Math.PI / 2;
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = true;
      });
      fallback.visible = false;
      root.add(model);
    },
  );
  return root;
}

export function HouseMouseGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<Record<Input, boolean>>({ forward: false, back: false, left: false, right: false, boost: false });
  const [racer, setRacer] = useState<Racer>("emmy");
  const racerRef = useRef<Racer>("emmy");
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [speedLabel, setSpeedLabel] = useState(0);
  const [lap, setLap] = useState(1);
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);
  const resetRef = useRef<() => void>(() => undefined);
  const racerSwitchRef = useRef<(racer: Racer) => void>(() => undefined);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let frame = 0;
    let sparkRenderer: THREE.Object3D | undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaedbec);
    scene.fog = new THREE.Fog(0xaedbec, 28, 52);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.03, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x547044, 2.2));
    const sun = new THREE.DirectionalLight(0xfff2d4, 2.5);
    sun.position.set(-10, 22, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(31, 80),
      new THREE.MeshStandardMaterial({ color: 0x668c4e, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);
    makeTrack(scene);

    for (let i = 0; i < 30; i += 1) {
      const angle = (i / 30) * Math.PI * 2 + 0.13;
      const radius = i % 2 ? 16.3 : 11.1;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 + (i % 3) * 0.035, 8, 6),
        new THREE.MeshStandardMaterial({ color: [0xf8cf47, 0xee6d73, 0xf6f0dc][i % 3] }),
      );
      flower.position.set(CENTER.x + Math.cos(angle) * radius, 0.18, CENTER.y + Math.sin(angle) * radius * 0.68);
      scene.add(flower);
    }

    let actor = makeRacer(scene, racerRef.current);
    let currentRacer = racerRef.current;
    let heading = 0;
    let speed = 0;
    let previousAngle = 0;
    let totalAngle = 0;
    let last = performance.now();

    const rebuildRacer = (next: Racer) => {
      if (next === currentRacer) return;
      scene.remove(actor);
      currentRacer = next;
      actor = makeRacer(scene, next);
      resetRef.current();
    };
    racerSwitchRef.current = rebuildRacer;

    resetRef.current = () => {
      actor.position.copy(trackPoint(0)).setY(0.16);
      actor.rotation.set(0, 0, 0);
      heading = 0;
      speed = 0;
      previousAngle = 0;
      totalAngle = 0;
      setLap(1);
      finishedRef.current = false;
      setFinished(false);
    };

    import("@sparkjsdev/spark").then(({ SparkRenderer, SplatMesh }) => {
      if (disposed) return;
      const spark = new SparkRenderer({ renderer });
      sparkRenderer = spark;
      scene.add(spark);
      const house = new SplatMesh({
        url: asset("/models/house/house1.spz?v=3"),
        lod: true,
        onProgress: (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        },
        onLoad: () => {
          setProgress(100);
          setLoaded(true);
        },
      });
      house.position.set(0, 1.62, 0);
      scene.add(house);
    }).catch(() => setLoaded(true));

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const key = (event: KeyboardEvent, value: boolean) => {
      const map: Record<string, Input | undefined> = {
        ArrowUp: "forward", w: "forward", W: "forward",
        ArrowDown: "back", s: "back", S: "back",
        ArrowLeft: "left", a: "left", A: "left",
        ArrowRight: "right", d: "right", D: "right",
        b: "boost", B: "boost", Shift: "boost",
      };
      const input = map[event.key];
      if (input) {
        inputsRef.current[input] = value;
        event.preventDefault();
      }
    };
    const down = (event: KeyboardEvent) => key(event, true);
    const up = (event: KeyboardEvent) => key(event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (startedRef.current && !finishedRef.current) {
        const input = inputsRef.current;
        const boost = input.boost ? 1.55 : 1;
        const acceleration = input.forward ? 4.5 : input.back ? -3.2 : 0;
        speed += acceleration * dt;
        speed *= Math.pow(input.forward || input.back ? 0.985 : 0.94, dt * 60);
        speed = THREE.MathUtils.clamp(speed, -1.7, 4.7 * boost);
        const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        heading += steer * dt * 2.4 * THREE.MathUtils.clamp(Math.abs(speed) / 1.2, 0.25, 1.2) * Math.sign(speed || 1);
        actor.position.x += Math.sin(heading) * speed * dt;
        actor.position.z += Math.cos(heading) * speed * dt;
        const angle = Math.atan2((actor.position.z - CENTER.y) / RADII.y, (actor.position.x - CENTER.x) / RADII.x);
        const center = trackPoint(angle);
        const offset = new THREE.Vector2(actor.position.x - center.x, actor.position.z - center.z);
        if (offset.length() > TRACK_HALF_WIDTH * 0.82) {
          offset.setLength(TRACK_HALF_WIDTH * 0.82);
          actor.position.x = center.x + offset.x;
          actor.position.z = center.z + offset.y;
          speed *= 0.82;
        }
        let delta = angle - previousAngle;
        if (delta < -Math.PI) delta += Math.PI * 2;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta > -0.2) totalAngle += Math.max(0, delta);
        previousAngle = angle;
        const nextLap = Math.min(3, Math.floor(totalAngle / (Math.PI * 2)) + 1);
        setLap(nextLap);
        if (totalAngle >= Math.PI * 4) {
          speed = 0;
          startedRef.current = false;
          finishedRef.current = true;
          setFinished(true);
        }
      }
      actor.rotation.y = heading;
      if (currentRacer === "opie" && Math.abs(speed) > 0.15) actor.position.y = 0.16 + Math.abs(Math.sin(now * 0.013)) * 0.045;
      else actor.position.y = 0.16;
      const back = new THREE.Vector3(-Math.sin(heading) * 2.4, 1.55, -Math.cos(heading) * 2.4);
      const desired = actor.position.clone().add(back);
      camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
      camera.lookAt(actor.position.x, actor.position.y + 0.28, actor.position.z);
      setSpeedLabel(Math.round(Math.abs(speed) * 3.4));
      renderer.render(scene, camera);
    };
    animate(last);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      if (sparkRenderer) scene.remove(sparkRenderer);
      racerSwitchRef.current = () => undefined;
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const chooseRacer = (next: Racer) => {
    racerRef.current = next;
    setRacer(next);
    racerSwitchRef.current(next);
  };
  const begin = () => {
    resetRef.current();
    startedRef.current = true;
    setStarted(true);
  };
  const setInput = useCallback((input: Input, value: boolean) => {
    inputsRef.current[input] = value;
  }, []);
  const touchProps = useCallback((input: Input) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setInput(input, true);
    },
    onPointerUp: () => setInput(input, false),
    onPointerCancel: () => setInput(input, false),
    onLostPointerCapture: () => setInput(input, false),
  }), [setInput]);

  return (
    <main className="mouse-game">
      <div className="mouse-canvas" ref={mountRef} />
      <header className="mouse-topbar">
        <a href={arcadeHref}>← GAME SELECT</a>
        <strong>HOUSE MOUSE</strong>
        <span>{loaded ? "SCAN READY" : `LOADING HOUSE ${progress}%`}</span>
      </header>
      {started && !finished && (
        <div className="mouse-hud"><b>{speedLabel}</b><span>MPH</span><i>LAP {lap}/2</i></div>
      )}
      {started && !finished && (
        <div className="mouse-touch" aria-label="Touch controls">
          <div><button {...touchProps("left")}>←</button><button {...touchProps("right")}>→</button></div>
          <div><button {...touchProps("boost")}>BOOST</button><button {...touchProps("forward")}>GO</button></div>
        </div>
      )}
      {!started && (
        <section className="mouse-start">
          <div className="mouse-card">
            <span className="mouse-eyebrow">A REAL-HOUSE MICRO RACE</span>
            <h1>Race at mouse size.</h1>
            <p>Zip around your real house on a tiny garden path. Two laps, low rails, very small racers, enormous home.</p>
            <fieldset><legend>PICK YOUR RACER</legend><div>
              <button data-active={racer === "emmy"} onClick={() => chooseRacer("emmy")}><b>E</b><span><strong>EMMY</strong><small>MICRO CAR</small></span></button>
              <button data-active={racer === "opie"} onClick={() => chooseRacer("opie")}><b>O</b><span><strong>OPIE</strong><small>TINY RUNNER</small></span></button>
            </div></fieldset>
            <button className="mouse-start-button" onClick={begin}>{loaded ? "START THE HOUSE MOUSE RACE" : "START WHILE THE HOUSE LOADS"}<span>↗</span></button>
            <a className="mouse-course-link" href={denverHref}>← RACE THE TINY DENVER COURSE</a>
            <small>WASD / ARROWS · B OR SHIFT BOOST · TOUCH READY</small>
          </div>
        </section>
      )}
      {finished && (
        <section className="mouse-win"><div><span>HOUSE MOUSE CHAMPION</span><h2>YOU WIN!!!</h2><p>{racer === "emmy" ? "Emmy’s micro car" : "Opie’s tiny feet"} conquered the giant house.</p><button onClick={begin}>RACE AGAIN</button><a href={arcadeHref}>GAME SELECT</a></div></section>
      )}
    </main>
  );
}
