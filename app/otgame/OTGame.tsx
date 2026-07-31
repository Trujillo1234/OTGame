"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type CharacterId = "emmy" | "opie";
type MatchPhase = "checkin" | "countdown" | "fight" | "finished";
type Direction = "left" | "right";
type ArenaId = "capitol" | "sixteenth" | "colfax" | "governors";

const githubPagesBase =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/OTGame")
    ? "/OTGame"
    : "";
const fightAsset = (path: string) => `${githubPagesBase}${path}`;
const gameSelectHref = githubPagesBase ? `${githubPagesBase}/` : "/";

type AnimationData = {
  fps: number;
  loop: boolean;
  frameCount: number;
  frames: string[];
  activeFrames?: number[];
  hitStopMs?: number;
  holdLastFrame?: boolean;
};

type CharacterManifest = {
  displayName: string;
  regularLook: string;
  powerLook: string;
  energyColor: string;
  animations: Record<string, AnimationData>;
};

type SpriteManifest = {
  inputWindowMs: number;
  characters: Record<CharacterId, CharacterManifest>;
};

type Fighter = {
  id: CharacterId;
  x: number;
  health: number;
  power: number;
  powered: boolean;
  poweredUntil: number;
  jumpStartedAt: number;
  jumpEndsAt: number;
  facingRight: boolean;
  action: string;
  actionStartedAt: number;
  hitApplied: boolean;
  hitFlashUntil: number;
  hitStunUntil: number;
  invulnerableUntil: number;
};

type CpuIntent = {
  x: number;
  until: number;
};

type GameState = {
  phase: MatchPhase;
  player: Fighter;
  cpu: Fighter;
  now: number;
  countdownEndsAt: number;
  roundEndsAt: number;
  cpuDecisionAt: number;
  cpuIntent: CpuIntent;
  winner: CharacterId | null;
  toast: string;
  toastUntil: number;
  shakeUntil: number;
  hitStopUntil: number;
  impact: ImpactEffect | null;
  comboCount: number;
  comboOwner: CharacterId | null;
  comboUntil: number;
};

type ImpactEffect = {
  id: number;
  x: number;
  y: number;
  heavy: boolean;
  blocked: boolean;
  attacker: CharacterId;
  until: number;
};

type AttackSpec = {
  damage: number;
  range: number;
  powerGain: number;
  knockback: number;
  hitStunMs: number;
  reaction?: "hit_reaction" | "knockdown_recover";
  heavy?: boolean;
};

const ATTACKS: Record<string, AttackSpec> = {
  punch: {
    damage: 6,
    range: 12,
    powerGain: 11,
    knockback: 2.5,
    hitStunMs: 260,
  },
  kick: {
    damage: 8,
    range: 14,
    powerGain: 13,
    knockback: 4.5,
    hitStunMs: 340,
  },
  jump_punch: {
    damage: 9,
    range: 15,
    powerGain: 14,
    knockback: 5,
    hitStunMs: 380,
  },
  jump_kick: {
    damage: 11,
    range: 17,
    powerGain: 16,
    knockback: 8,
    hitStunMs: 520,
    reaction: "knockdown_recover",
    heavy: true,
  },
  signature_throw: {
    damage: 24,
    range: 20,
    powerGain: 0,
    knockback: 3,
    hitStunMs: 760,
    reaction: "knockdown_recover",
    heavy: true,
  },
  signature_lunge: {
    damage: 27,
    range: 31,
    powerGain: 0,
    knockback: 22,
    hitStunMs: 680,
    reaction: "knockdown_recover",
    heavy: true,
  },
};

const ARENAS: Array<{
  id: ArenaId;
  name: string;
  shortName: string;
  image: string;
}> = [
  {
    id: "capitol",
    name: "Colorado State Capitol",
    shortName: "CAPITOL",
    image: fightAsset("/games/otgame/backgrounds/colorado-state-capitol.webp"),
  },
  {
    id: "sixteenth",
    name: "Sixteenth Street",
    shortName: "16TH STREET",
    image: fightAsset("/games/otgame/backgrounds/sixteenth-street.webp"),
  },
  {
    id: "colfax",
    name: "Colfax Avenue",
    shortName: "COLFAX",
    image: fightAsset("/games/otgame/backgrounds/colfax-avenue.webp"),
  },
  {
    id: "governors",
    name: "Governor's Park",
    shortName: "GOVERNOR'S PARK",
    image: fightAsset("/games/otgame/backgrounds/governors-park.webp"),
  },
];

const PASSIVE_ACTIONS = new Set([
  "idle",
  "powered_idle",
  "run_forward",
  "retreat",
  "jump",
]);

const LOCKED_ACTIONS = new Set([
  "powerup",
  "signature_throw",
  "signature_lunge",
  "hit_reaction",
  "knockdown_recover",
  "ko",
  "victory",
]);

const COMBO_ACTIONS: Record<string, string> = {
  AS: "jump_punch",
  AZ: "jump_kick",
};

const BASE_ACTIONS: Record<string, string> = {
  A: "jump",
  S: "punch",
  Z: "kick",
  X: "power",
};

const ROUND_LENGTH_MS = 60_000;
const JUMP_DURATION_MS = 960;
const PLAYER_START_X = 28;
const CPU_START_X = 72;

function createFighter(id: CharacterId, x: number, facingRight: boolean): Fighter {
  return {
    id,
    x,
    health: 100,
    power: 64,
    powered: false,
    poweredUntil: 0,
    jumpStartedAt: 0,
    jumpEndsAt: 0,
    facingRight,
    action: "idle",
    actionStartedAt: 0,
    hitApplied: false,
    hitFlashUntil: 0,
    hitStunUntil: 0,
    invulnerableUntil: 0,
  };
}

function createInitialState(playerId: CharacterId = "emmy"): GameState {
  const cpuId: CharacterId = playerId === "emmy" ? "opie" : "emmy";
  return {
    phase: "checkin",
    player: createFighter(playerId, PLAYER_START_X, true),
    cpu: createFighter(cpuId, CPU_START_X, false),
    now: 0,
    countdownEndsAt: 0,
    roundEndsAt: 0,
    cpuDecisionAt: 0,
    cpuIntent: { x: 0, until: 0 },
    winner: null,
    toast: "Choose your fighter",
    toastUntil: Number.POSITIVE_INFINITY,
    shakeUntil: 0,
    hitStopUntil: 0,
    impact: null,
    comboCount: 0,
    comboOwner: null,
    comboUntil: 0,
  };
}

function animationFor(
  manifest: SpriteManifest,
  fighter: Fighter,
): AnimationData {
  const animations = manifest.characters[fighter.id].animations;
  return animations[fighter.action] ?? animations.idle;
}

function actionDuration(
  manifest: SpriteManifest,
  fighter: Fighter,
): number {
  const animation = animationFor(manifest, fighter);
  return (animation.frameCount / animation.fps) * 1000;
}

function frameFor(
  manifest: SpriteManifest,
  fighter: Fighter,
  now: number,
): { src: string; index: number } {
  const animation = animationFor(manifest, fighter);
  const elapsed = Math.max(0, now - fighter.actionStartedAt);
  const framePosition = (elapsed / 1000) * animation.fps;
  const rawIndex = Math.floor(framePosition);
  const index = animation.loop
    ? rawIndex % animation.frameCount
    : Math.min(animation.frameCount - 1, rawIndex);
  return {
    src: animation.frames[index],
    index,
  };
}

function startAction(fighter: Fighter, action: string, now: number): Fighter {
  return {
    ...fighter,
    action,
    actionStartedAt: now,
    hitApplied: false,
  };
}

function canMove(fighter: Fighter, now: number): boolean {
  return (
    now >= fighter.hitStunUntil &&
    PASSIVE_ACTIONS.has(fighter.action) ||
    (now >= fighter.hitStunUntil &&
      fighter.jumpEndsAt > 0 &&
      !LOCKED_ACTIONS.has(fighter.action))
  );
}

function readyAction(fighter: Fighter): string {
  return fighter.powered ? "powered_idle" : "idle";
}

function isAirborne(fighter: Fighter, now: number): boolean {
  return fighter.jumpEndsAt > now;
}

function fighterDistance(first: Fighter, second: Fighter): number {
  return Math.abs(first.x - second.x);
}

function startJump(fighter: Fighter, now: number): Fighter {
  if (isAirborne(fighter, now)) return fighter;
  return {
    ...startAction(fighter, "jump", now),
    jumpStartedAt: now,
    jumpEndsAt: now + JUMP_DURATION_MS,
  };
}

function resolveLanding(fighter: Fighter, now: number): Fighter {
  if (fighter.jumpEndsAt === 0 || now < fighter.jumpEndsAt) return fighter;
  const landed = { ...fighter, jumpStartedAt: 0, jumpEndsAt: 0 };
  return fighter.action === "jump"
    ? startAction(landed, readyAction(landed), now)
    : landed;
}

function jumpArc(fighter: Fighter, now: number): number {
  if (!isAirborne(fighter, now)) return 0;
  const progress = Math.max(
    0,
    Math.min(
      1,
      (now - fighter.jumpStartedAt) / (fighter.jumpEndsAt - fighter.jumpStartedAt),
    ),
  );
  return Math.sin(progress * Math.PI);
}

function resolveFinishedAction(
  manifest: SpriteManifest,
  fighter: Fighter,
  now: number,
): Fighter {
  if (PASSIVE_ACTIONS.has(fighter.action) || fighter.action === "ko") {
    return fighter;
  }
  if (now - fighter.actionStartedAt < actionDuration(manifest, fighter)) {
    return fighter;
  }
  if (fighter.action === "powerup") {
    return {
      ...startAction(fighter, "powered_idle", now),
      powered: true,
      poweredUntil: Number.POSITIVE_INFINITY,
      power: 100,
    };
  }
  if (fighter.action === "victory") return fighter;
  return startAction(
    fighter,
    isAirborne(fighter, now) ? "jump" : readyAction(fighter),
    now,
  );
}

function applyMovement(
  fighter: Fighter,
  opponent: Fighter,
  xIntent: number,
  deltaSeconds: number,
  now: number,
): Fighter {
  if (!canMove(fighter, now)) return fighter;
  if (xIntent === 0) {
    if (isAirborne(fighter, now)) return fighter;
    const idle = readyAction(fighter);
    return fighter.action === idle ? fighter : startAction(fighter, idle, now);
  }

  const movingToward =
    xIntent > 0 ? fighter.x < opponent.x : fighter.x > opponent.x;
  const movementAction = fighter.powered
    ? "powered_idle"
    : movingToward
      ? "run_forward"
      : "retreat";
  const next = {
    ...fighter,
    x: Math.max(
      7,
      Math.min(
        93,
        fighter.x +
          xIntent * (isAirborne(fighter, now) ? 44 : 28) * deltaSeconds,
      ),
    ),
  };
  if (isAirborne(fighter, now)) return next;
  return fighter.action === movementAction
    ? next
    : startAction(next, movementAction, now);
}

function finishMatch(state: GameState, winner: CharacterId, now: number): GameState {
  const playerWon = state.player.id === winner;
  return {
    ...state,
    phase: "finished",
    winner,
    player:
      state.player.id === winner
        ? startAction(state.player, "victory", now)
        : startAction({ ...state.player, health: 0 }, "ko", now),
    cpu:
      state.cpu.id === winner
        ? startAction(state.cpu, "victory", now)
        : startAction({ ...state.cpu, health: 0 }, "ko", now),
    toast: playerWon ? "You win!" : `${state.cpu.id === winner ? state.cpu.id : state.player.id} wins`,
    toastUntil: Number.POSITIVE_INFINITY,
  };
}

function resolveAttack(
  manifest: SpriteManifest,
  attacker: Fighter,
  target: Fighter,
  now: number,
): {
  attacker: Fighter;
  target: Fighter;
  landed: boolean;
  impact: ImpactEffect | null;
} {
  const attack = ATTACKS[attacker.action];
  if (!attack || attacker.hitApplied) {
    return { attacker, target, landed: false, impact: null };
  }
  const animation = animationFor(manifest, attacker);
  const currentFrame = frameFor(manifest, attacker, now).index;
  const activeFrames = animation.activeFrames ?? [Math.floor(animation.frameCount / 2)];
  if (!activeFrames.includes(currentFrame)) {
    return { attacker, target, landed: false, impact: null };
  }

  const markedAttacker = { ...attacker, hitApplied: true };
  if (
    fighterDistance(attacker, target) > attack.range ||
    now < target.invulnerableUntil
  ) {
    return {
      attacker: markedAttacker,
      target,
      landed: false,
      impact: null,
    };
  }

  const guarding = target.action === "guard_dodge";
  const damage = Math.max(
    1,
    Math.round(
      attack.damage *
        (attacker.powered && !attacker.action.startsWith("signature_")
          ? 1.18
          : 1) *
        (guarding ? 0.24 : 1),
    ),
  );
  const nextHealth = Math.max(0, target.health - damage);
  const pushDirection = target.x >= attacker.x ? 1 : -1;
  const characterKnockback =
    attacker.powered && attacker.id === "opie" ? 9 : 0;
  const nextX = Math.max(
    7,
    Math.min(
      93,
      target.x + pushDirection * (attack.knockback + characterKnockback),
    ),
  );
  const reaction =
    attack.reaction ??
    (attacker.powered && attacker.id === "emmy"
      ? "knockdown_recover"
      : "hit_reaction");
  const struckTarget = {
    ...target,
    x: nextX,
    health: nextHealth,
    hitFlashUntil: now + 150,
    hitStunUntil: now + (guarding ? 140 : attack.hitStunMs),
    invulnerableUntil: now + (guarding ? 90 : 190),
  };
  const nextTarget =
    nextHealth <= 0
      ? startAction({ ...struckTarget, health: 0 }, "ko", now)
      : guarding
        ? { ...struckTarget, hitFlashUntil: now + 100 }
        : startAction(struckTarget, reaction, now);

  return {
    attacker: {
      ...markedAttacker,
      power: Math.min(
        100,
        attacker.power +
          (attacker.action.startsWith("signature_")
            ? 0
            : attacker.powered
              ? Math.ceil(attack.powerGain * 0.5)
              : attack.powerGain),
      ),
    },
    target: nextTarget,
    landed: true,
    impact: {
      id: Math.round(now * 10) + (attacker.id === "emmy" ? 1 : 2),
      x: (attacker.x + target.x) / 2,
      y: 36 + jumpArc(target, now) * 42,
      heavy: attack.heavy ?? attacker.action.startsWith("signature_"),
      blocked: guarding,
      attacker: attacker.id,
      until: now + (attack.heavy ? 300 : 220),
    },
  };
}

function chooseCpuAction(
  state: GameState,
  now: number,
): Pick<GameState, "cpu" | "cpuDecisionAt" | "cpuIntent" | "toast" | "toastUntil"> {
  let cpu = state.cpu;
  const distance = fighterDistance(cpu, state.player);
  const toward = cpu.x < state.player.x ? 1 : -1;

  if (!cpu.powered && cpu.power >= 100 && PASSIVE_ACTIONS.has(cpu.action)) {
    cpu = startAction(cpu, "powerup", now);
    return {
      cpu,
      cpuDecisionAt: now + 1_100,
      cpuIntent: { x: 0, until: now + 1_100 },
      toast: `${cpu.id === "emmy" ? "Emmy" : "Opie"} powered up!`,
      toastUntil: now + 1_300,
    };
  }

  if (distance > 17) {
    return {
      cpu,
      cpuDecisionAt: now + 420 + Math.random() * 260,
      cpuIntent: {
        x: distance > 13 ? toward : 0,
        until: now + 520,
      },
      toast: state.toast,
      toastUntil: state.toastUntil,
    };
  }

  const roll = Math.random();
  let action =
    roll < 0.12
      ? "guard_dodge"
      : roll < 0.23
        ? "jump"
        : roll < 0.56
          ? "punch"
          : "kick";
  if (cpu.powered) {
    if (cpu.power >= 50 && roll > 0.72) {
      action = cpu.id === "emmy" ? "signature_throw" : "signature_lunge";
      cpu = { ...cpu, power: Math.max(0, cpu.power - 50) };
    }
  }
  if (isAirborne(cpu, now)) {
    if (action === "punch") action = "jump_punch";
    if (action === "kick") action = "jump_kick";
  }
  cpu = action === "jump" ? startJump(cpu, now) : startAction(cpu, action, now);
  return {
    cpu,
    cpuDecisionAt: now + 500 + Math.random() * 420,
    cpuIntent: { x: 0, until: now + 400 },
    toast: state.toast,
    toastUntil: state.toastUntil,
  };
}

type FightAudio = {
  start: () => void;
  toggle: () => boolean;
  jump: () => void;
  swing: (heavy?: boolean) => void;
  hit: (heavy?: boolean) => void;
  powerUp: (character: CharacterId) => void;
  finish: (won: boolean) => void;
  dispose: () => void;
};

function createFightAudio(): FightAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let effectsBus: GainNode | null = null;
  let musicTrack: HTMLAudioElement | null = null;
  let enabled = true;
  let active = false;

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
    effectsBus = context.createGain();
    master.gain.value = enabled ? 0.56 : 0.0001;
    effectsBus.gain.value = 0.62;
    effectsBus.connect(master);
    master.connect(context.destination);
    return context;
  };

  const tone = (
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    bus: GainNode | null,
    delay = 0,
    endFrequency?: number,
  ) => {
    const audio = ensureContext();
    if (!audio || !bus || !enabled) return;
    const startAt = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        startAt + duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.04);
  };

  const noise = (duration: number, volume: number, delay = 0) => {
    const audio = ensureContext();
    if (!audio || !effectsBus || !enabled) return;
    const length = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const startAt = audio.currentTime + delay;
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 680;
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(effectsBus);
    source.start(startAt);
  };

  return {
    start: () => {
      active = true;
      const audio = ensureContext();
      if (!audio) return;
      if (audio.state === "suspended") void audio.resume();
      if (!musicTrack) {
        musicTrack = new Audio(
          fightAsset("/games/otgame/audio/denver-fight-club.mp3"),
        );
        musicTrack.loop = true;
        musicTrack.volume = 0.34;
      }
      if (enabled) void musicTrack.play().catch(() => undefined);
    },
    toggle: () => {
      enabled = !enabled;
      const audio = ensureContext();
      if (audio && audio.state === "suspended" && enabled) void audio.resume();
      if (master && audio) {
        master.gain.setTargetAtTime(
          enabled ? 0.56 : 0.0001,
          audio.currentTime,
          0.025,
        );
      }
      if (musicTrack) {
        if (enabled && active) void musicTrack.play().catch(() => undefined);
        else musicTrack.pause();
      }
      return enabled;
    },
    jump: () => {
      tone(180, 0.16, 0.16, "sine", effectsBus, 0, 420);
    },
    swing: (heavy = false) => {
      tone(
        heavy ? 150 : 260,
        heavy ? 0.22 : 0.12,
        heavy ? 0.2 : 0.11,
        "sawtooth",
        effectsBus,
        0,
        heavy ? 60 : 120,
      );
    },
    hit: (heavy = false) => {
      noise(heavy ? 0.22 : 0.12, heavy ? 0.28 : 0.17);
      tone(
        heavy ? 55 : 82,
        heavy ? 0.26 : 0.15,
        heavy ? 0.25 : 0.13,
        "square",
        effectsBus,
      );
    },
    powerUp: (character) => {
      const notes =
        character === "emmy"
          ? [392, 523.25, 659.25, 783.99]
          : [349.23, 466.16, 587.33, 698.46];
      notes.forEach((frequency, index) => {
        tone(frequency, 0.34, 0.16, "triangle", effectsBus, index * 0.08);
      });
    },
    finish: (won) => {
      const notes = won
        ? [392, 523.25, 659.25, 783.99]
        : [293.66, 246.94, 196, 146.83];
      notes.forEach((frequency, index) => {
        tone(frequency, 0.32, 0.17, "square", effectsBus, index * 0.11);
      });
    },
    dispose: () => {
      if (musicTrack) {
        musicTrack.pause();
        musicTrack.src = "";
      }
      if (context) void context.close();
    },
  };
}

export function OTGame() {
  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  const [selected, setSelected] = useState<CharacterId>("emmy");
  const [selectedArena, setSelectedArena] = useState<ArenaId>("capitol");
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [soundOn, setSoundOn] = useState(true);
  const heldDirections = useRef(new Set<Direction>());
  const inputBuffer = useRef<Array<{ key: string; time: number }>>([]);
  const lastFrameAt = useRef(0);
  const audioRef = useRef<FightAudio | null>(null);
  const lastPlayerAction = useRef("");
  const lastCpuAction = useRef("");
  const lastPlayerHit = useRef(0);
  const lastCpuHit = useRef(0);
  const lastPhase = useRef<MatchPhase>("checkin");

  useEffect(() => {
    const audio = createFightAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(fightAsset("/games/otgame/sprites/manifest.json"))
      .then((response) => {
        if (!response.ok) throw new Error("Sprite manifest could not be loaded");
        return response.text();
      })
      .then((manifestText) => {
        const data = JSON.parse(
          githubPagesBase
            ? manifestText.replaceAll(
                '"/games/',
                `"${githubPagesBase}/games/`,
              )
            : manifestText,
        ) as SpriteManifest;
        if (cancelled) return;
        setManifest(data);
        const frames = Object.values(data.characters).flatMap((character) =>
          Object.values(character.animations).flatMap((animation) => animation.frames),
        );
        frames.forEach((src) => {
          const image = new Image();
          image.src = src;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setGame((current) => ({
            ...current,
            toast: "The fighters could not enter the arena",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startMatch = useCallback(() => {
    if (!manifest) return;
    audioRef.current?.start();
    const now = performance.now();
    const cpuId: CharacterId = selected === "emmy" ? "opie" : "emmy";
    setGame({
      phase: "countdown",
      player: { ...createFighter(selected, PLAYER_START_X, true), actionStartedAt: now },
      cpu: { ...createFighter(cpuId, CPU_START_X, false), actionStartedAt: now },
      now,
      countdownEndsAt: now + 2_700,
      roundEndsAt: 0,
      cpuDecisionAt: now + 3_100,
      cpuIntent: { x: 0, until: now },
      winner: null,
      toast: "Ready?",
      toastUntil: now + 2_700,
      shakeUntil: 0,
      hitStopUntil: 0,
      impact: null,
      comboCount: 0,
      comboOwner: null,
      comboUntil: 0,
    });
    heldDirections.current.clear();
    inputBuffer.current = [];
  }, [manifest, selected]);

  const setDirection = useCallback((direction: Direction, active: boolean) => {
    if (active) heldDirections.current.add(direction);
    else heldDirections.current.delete(direction);
  }, []);

  const triggerAction = useCallback(
    (rawKey: string) => {
      if (!manifest) return;
      const key = rawKey.toUpperCase();
      const now = performance.now();
      inputBuffer.current = inputBuffer.current
        .filter((entry) => now - entry.time <= manifest.inputWindowMs)
        .concat({ key, time: now })
        .slice(-2);
      const sequence = inputBuffer.current.map((entry) => entry.key).join("");
      const combo = COMBO_ACTIONS[sequence];
      if (combo) inputBuffer.current = [];

      setGame((current) => {
        if (current.phase !== "fight") return current;
        let action = combo ?? BASE_ACTIONS[key];
        let player = current.player;
        let toast = current.toast;
        let toastUntil = current.toastUntil;
        if (!action) return current;
        if (
          LOCKED_ACTIONS.has(player.action) ||
          now < player.hitStunUntil ||
          now < current.hitStopUntil
        ) {
          return current;
        }

        if (action === "power") {
          if (isAirborne(player, now)) {
            return {
              ...current,
              toast: "Land before using your power move!",
              toastUntil: now + 900,
            };
          }
          if (player.powered) {
            if (player.power < 50) {
              return {
                ...current,
                toast: "Build 50% power for your signature move!",
                toastUntil: now + 900,
              };
            }
            action =
              player.id === "emmy" ? "signature_throw" : "signature_lunge";
            player = { ...player, power: player.power - 50 };
            toast =
              player.id === "emmy" ? "BJJ TAKEDOWN!" : "FENCING LAUNCH!";
            toastUntil = now + 900;
          } else {
            if (player.power < 100) {
              return {
                ...current,
                toast: `Power ${Math.round(player.power)}% - keep fighting!`,
                toastUntil: now + 900,
              };
            }
            action = "powerup";
            toast = `${player.id === "emmy" ? "Pink gi" : "Fencing"} power!`;
            toastUntil = now + 1_200;
          }
        }

        if (action === "jump") {
          return {
            ...current,
            player: startJump(player, now),
            toast,
            toastUntil,
          };
        }

        if (isAirborne(player, now)) {
          if (action === "punch") action = "jump_punch";
          if (action === "kick") action = "jump_kick";
        }

        return {
          ...current,
          player: startAction(player, action, now),
          toast,
          toastUntil,
        };
      });
    },
    [manifest],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setDirection(
          event.key.replace("Arrow", "").toLowerCase() as Direction,
          true,
        );
        return;
      }
      if (["a", "s", "z", "x"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        triggerAction(event.key);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setDirection(
        event.key.replace("Arrow", "").toLowerCase() as Direction,
        false,
      );
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setDirection, triggerAction]);

  useEffect(() => {
    if (!manifest) return;
    let animationFrame = 0;

    const step = (now: number) => {
      const deltaSeconds = Math.min(
        0.034,
        lastFrameAt.current === 0 ? 0 : (now - lastFrameAt.current) / 1000,
      );
      lastFrameAt.current = now;
      setGame((current) => {
        if (current.phase === "fight" && now < current.hitStopUntil) {
          return current;
        }
        let state: GameState = { ...current, now };
        if (state.phase === "countdown" && now >= state.countdownEndsAt) {
          state = {
            ...state,
            phase: "fight",
            roundEndsAt: now + ROUND_LENGTH_MS,
            toast: "Fight!",
            toastUntil: now + 900,
          };
        }
        if (state.phase !== "fight") return state;

        let player = resolveFinishedAction(
          manifest,
          resolveLanding(state.player, now),
          now,
        );
        let cpu = resolveFinishedAction(
          manifest,
          resolveLanding(state.cpu, now),
          now,
        );
        const horizontal =
          (heldDirections.current.has("right") ? 1 : 0) -
          (heldDirections.current.has("left") ? 1 : 0);
        player = applyMovement(
          player,
          cpu,
          horizontal,
          deltaSeconds,
          now,
        );

        if (now >= state.cpuDecisionAt && canMove(cpu, now)) {
          const decision = chooseCpuAction({ ...state, player, cpu }, now);
          cpu = decision.cpu;
          state = { ...state, ...decision };
        }
        if (now < state.cpuIntent.until) {
          cpu = applyMovement(
            cpu,
            player,
            state.cpuIntent.x,
            deltaSeconds,
            now,
          );
        }

        player = { ...player, facingRight: player.x <= cpu.x };
        cpu = { ...cpu, facingRight: cpu.x <= player.x };

        let landed = false;
        const playerAttack = resolveAttack(manifest, player, cpu, now);
        player = playerAttack.attacker;
        cpu = playerAttack.target;
        landed ||= playerAttack.landed;
        const cpuAttack = resolveAttack(manifest, cpu, player, now);
        cpu = cpuAttack.attacker;
        player = cpuAttack.target;
        landed ||= cpuAttack.landed;
        const latestImpact = cpuAttack.impact ?? playerAttack.impact;
        const latestComboOwner = cpuAttack.impact
          ? cpu.id
          : playerAttack.impact
            ? player.id
            : null;

        if (Math.abs(player.x - cpu.x) < 7) {
          const middle = (player.x + cpu.x) / 2;
          player = { ...player, x: middle + (player.x < cpu.x ? -3.6 : 3.6) };
          cpu = { ...cpu, x: middle + (cpu.x < player.x ? -3.6 : 3.6) };
        }

        state = {
          ...state,
          player,
          cpu,
          shakeUntil: landed
            ? now + (latestImpact?.heavy ? 180 : 95)
            : state.shakeUntil,
          hitStopUntil: landed
            ? now + (latestImpact?.heavy ? 125 : 70)
            : state.hitStopUntil,
          impact: latestImpact ?? state.impact,
          comboCount:
            latestComboOwner === null
              ? state.comboCount
              : state.comboOwner === latestComboOwner &&
                  now < state.comboUntil
                ? state.comboCount + 1
                : 1,
          comboOwner: latestComboOwner ?? state.comboOwner,
          comboUntil: latestComboOwner === null ? state.comboUntil : now + 1_100,
        };

        if (player.health <= 0 || cpu.health <= 0) {
          const winner = player.health > 0 ? player.id : cpu.id;
          return finishMatch(state, winner, now);
        }
        if (now >= state.roundEndsAt) {
          const winner = player.health >= cpu.health ? player.id : cpu.id;
          return finishMatch(state, winner, now);
        }
        return state;
      });
      animationFrame = requestAnimationFrame(step);
    };
    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [manifest]);

  const playerFrame = useMemo(
    () =>
      manifest
        ? frameFor(manifest, game.player, game.now)
        : {
            src: fightAsset("/games/otgame/sprites/emmy/animations/idle/frame-00.png"),
            index: 0,
          },
    [game.now, game.player, manifest],
  );
  const cpuFrame = useMemo(
    () =>
      manifest
        ? frameFor(manifest, game.cpu, game.now)
        : {
            src: fightAsset("/games/otgame/sprites/opie/animations/idle/frame-00.png"),
            index: 0,
          },
    [game.now, game.cpu, manifest],
  );
  const timeLeft =
    game.phase === "fight"
      ? Math.max(0, Math.ceil((game.roundEndsAt - game.now) / 1000))
      : 60;
  const countdown =
    game.phase === "countdown"
      ? Math.max(1, Math.ceil((game.countdownEndsAt - game.now) / 900))
      : null;
  const playerWon = game.winner === game.player.id;
  const currentArena =
    ARENAS.find((arena) => arena.id === selectedArena) ?? ARENAS[0];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (game.player.action !== lastPlayerAction.current) {
      if (game.player.action === "jump") audio.jump();
      if (ATTACKS[game.player.action]) {
        audio.swing(game.player.action.startsWith("signature_"));
      }
      if (game.player.action === "powerup") audio.powerUp(game.player.id);
      lastPlayerAction.current = game.player.action;
    }
    if (game.cpu.action !== lastCpuAction.current) {
      if (game.cpu.action === "jump") audio.jump();
      if (ATTACKS[game.cpu.action]) {
        audio.swing(game.cpu.action.startsWith("signature_"));
      }
      if (game.cpu.action === "powerup") audio.powerUp(game.cpu.id);
      lastCpuAction.current = game.cpu.action;
    }
    if (game.player.hitFlashUntil > lastPlayerHit.current) {
      audio.hit(game.cpu.action.startsWith("signature_"));
      lastPlayerHit.current = game.player.hitFlashUntil;
    }
    if (game.cpu.hitFlashUntil > lastCpuHit.current) {
      audio.hit(game.player.action.startsWith("signature_"));
      lastCpuHit.current = game.cpu.hitFlashUntil;
    }
    if (game.phase === "finished" && lastPhase.current !== "finished") {
      audio.finish(playerWon);
    }
    lastPhase.current = game.phase;
  }, [
    game.cpu.action,
    game.cpu.hitFlashUntil,
    game.cpu.id,
    game.phase,
    game.player.action,
    game.player.hitFlashUntil,
    game.player.id,
    playerWon,
  ]);

  const touchDirectionProps = (direction: Direction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDirection(direction, true);
    },
    onPointerUp: () => setDirection(direction, false),
    onPointerCancel: () => setDirection(direction, false),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  const fighterStyle = (fighter: Fighter) => {
    const arc = jumpArc(fighter, game.now);
    return ({
      "--fighter-x": `${fighter.x}%`,
      "--fighter-bottom": "25.5%",
      "--fighter-jump": `${arc * 44}vh`,
      "--fighter-scale": "1",
      "--sprite-scale": 1,
      "--shadow-scale": 1 - arc * 0.42,
      "--shadow-opacity": 0.28 - arc * 0.17,
      "--fighter-facing": fighter.facingRight ? 1 : -1,
      "--fighter-depth": fighter.id === game.player.id ? 42 : 41,
    }) as React.CSSProperties;
  };

  return (
    <main
      className="ot-shell"
      data-phase={game.phase}
      style={
        {
          "--arena-image": `url("${currentArena.image}")`,
          "--fight-cover-image": `url("${fightAsset("/games/otgame/og-denver-fight-club.png")}")`,
        } as React.CSSProperties
      }
    >
      <Link href={gameSelectHref} className="fight-game-select">
        ← GAME SELECT
      </Link>
      <button
        type="button"
        className="fight-audio-toggle"
        aria-pressed={soundOn}
        aria-label={soundOn ? "Mute music and sound" : "Turn on music and sound"}
        onClick={() => {
          const audio = audioRef.current;
          if (audio) setSoundOn(audio.toggle());
        }}
      >
        {soundOn ? "SOUND ON" : "SOUND OFF"}
      </button>
      <section
        className={`ot-arena ${game.now < game.shakeUntil ? "is-shaking" : ""}`}
        aria-label={`Denver Fight Club at ${currentArena.name}`}
      >
        <div className="ot-sky" />

        <header className="fight-hud" aria-label="Fight status">
          <div className="fighter-status fighter-status-player">
            <div className="fighter-name-line">
              <strong>{manifest?.characters[game.player.id].displayName ?? "Emmy"}</strong>
              <span>{game.player.powered ? "POWERED" : "PLAYER"}</span>
            </div>
            <div className="health-track">
              <i style={{ width: `${game.player.health}%` }} />
            </div>
            <div className="power-track power-track-pink">
              <i style={{ width: `${game.player.power}%` }} />
            </div>
          </div>

          <div className="round-clock">
            <span>ROUND 1</span>
            <strong>{String(timeLeft).padStart(2, "0")}</strong>
          </div>

          <div className="fighter-status fighter-status-cpu">
            <div className="fighter-name-line">
              <strong>{manifest?.characters[game.cpu.id].displayName ?? "Opie"}</strong>
              <span>{game.cpu.powered ? "POWERED" : "CPU"}</span>
            </div>
            <div className="health-track">
              <i style={{ width: `${game.cpu.health}%` }} />
            </div>
            <div className="power-track power-track-blue">
              <i style={{ width: `${game.cpu.power}%` }} />
            </div>
          </div>
        </header>

        <div
          className={`fighter fighter-player ${game.now < game.player.hitFlashUntil ? "is-hit" : ""} ${game.player.powered ? "is-powered" : ""} ${game.player.action === "powerup" ? "is-powering" : ""}`}
          style={fighterStyle(game.player)}
        >
          <span className="fighter-shadow" />
          {game.player.action === "powerup" && (
            <span className={`power-aura power-aura-${game.player.id}`} />
          )}
          <img className="fighter-frame" src={playerFrame.src} alt="" draggable={false} />
        </div>

        <div
          className={`fighter fighter-cpu ${game.now < game.cpu.hitFlashUntil ? "is-hit" : ""} ${game.cpu.powered ? "is-powered" : ""} ${game.cpu.action === "powerup" ? "is-powering" : ""}`}
          style={fighterStyle(game.cpu)}
        >
          <span className="fighter-shadow" />
          {game.cpu.action === "powerup" && (
            <span className={`power-aura power-aura-${game.cpu.id}`} />
          )}
          <img className="fighter-frame" src={cpuFrame.src} alt="" draggable={false} />
        </div>

        {game.impact && game.now < game.impact.until && (
          <span
            key={game.impact.id}
            className={`hit-impact ${game.impact.heavy ? "hit-impact-heavy" : ""} ${game.impact.blocked ? "hit-impact-blocked" : ""}`}
            data-attacker={game.impact.attacker}
            style={
              {
                "--impact-x": game.impact.x,
                "--impact-y": game.impact.y,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        )}

        {game.comboCount >= 2 && game.now < game.comboUntil && (
          <div
            className="combo-badge"
            data-owner={game.comboOwner === game.player.id ? "player" : "cpu"}
            aria-live="polite"
          >
            <strong>{game.comboCount}</strong>
            <span>HIT COMBO</span>
          </div>
        )}

        {(game.phase === "countdown" || game.toastUntil > game.now) && (
          <div
            className={`fight-callout ${game.phase === "countdown" ? "fight-callout-count" : ""}`}
            aria-live="polite"
          >
            {game.phase === "countdown"
              ? countdown === 1
                ? "FIGHT!"
                : countdown
              : game.toast}
          </div>
        )}

        <div className="desktop-controls" aria-hidden="true">
          <span><kbd>← →</kbd> MOVE</span>
          <span><kbd>A</kbd> JUMP</span>
          <span><kbd>S</kbd> PUNCH</span>
          <span><kbd>Z</kbd> KICK</span>
          <span><kbd>X</kbd> POWER / SIGNATURE</span>
        </div>

        {game.phase === "fight" && (
          <div className="phone-controls" aria-label="Touch fighting controls">
            <div className="touch-dpad" aria-label="Movement">
              <button className="dpad-left" aria-label="Move left" {...touchDirectionProps("left")}>←</button>
              <button className="dpad-right" aria-label="Move right" {...touchDirectionProps("right")}>→</button>
            </div>
            <div className="touch-actions" aria-label="Actions">
              <button className="action-a" aria-label="A jump" onPointerDown={() => triggerAction("A")}>A</button>
              <button className="action-s" aria-label="S punch" onPointerDown={() => triggerAction("S")}>S</button>
              <button className="action-z" aria-label="Z kick" onPointerDown={() => triggerAction("Z")}>Z</button>
              <button className="action-x" aria-label="X power or signature move" onPointerDown={() => triggerAction("X")}>X</button>
            </div>
          </div>
        )}

        <footer className="arena-credit">
          {currentArena.name} arena · Music:{" "}
          <a
            href="https://www.udio.com/embed/tX1diqoRL8ujFrpi9AbMBz"
            target="_blank"
            rel="noreferrer"
          >
            Denver Fight Club track on Udio
          </a>
        </footer>
      </section>

      {game.phase === "checkin" && (
        <section className="fighter-checkin">
          <div className="checkin-card">
            <div className="checkin-topline">
              <span className="checkin-eyebrow">DENVER FIGHT CLUB · CHECK-IN</span>
              <Link href={gameSelectHref} className="penn-run-link">GAME SELECT ↗</Link>
            </div>
            <h1>Denver Fight Club</h1>
            <p>
              Emmy vs. Opie. Move left and right, jump for real, and attack
              from the ground or the air. Build the meter, press X to
              transform, then press X again for your fighter&apos;s signature move.
            </p>
            <fieldset className="fighter-picker">
              <legend>WHO ARE YOU PLAYING?</legend>
              <div className="fighter-options">
                {(["emmy", "opie"] as CharacterId[]).map((id) => (
                  <button
                    type="button"
                    key={id}
                    className="fighter-option"
                    data-selected={selected === id}
                    onClick={() => setSelected(id)}
                    aria-pressed={selected === id}
                  >
                    <img
                      src={fightAsset(`/games/otgame/sprites/${id}/animations/idle/frame-00.png`)}
                      alt=""
                    />
                    <span>
                      <strong>{id === "emmy" ? "EMMY" : "OPIE"}</strong>
                      <small>
                        {id === "emmy"
                          ? "PINK BJJ POWER"
                          : "BLUE FENCING POWER"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="arena-picker">
              <legend>CHOOSE THE LOCATION</legend>
              <div className="arena-options">
                {ARENAS.map((arena) => (
                  <button
                    type="button"
                    key={arena.id}
                    data-selected={selectedArena === arena.id}
                    onClick={() => setSelectedArena(arena.id)}
                    aria-pressed={selectedArena === arena.id}
                    style={{ backgroundImage: `url("${arena.image}")` }}
                  >
                    <span>{arena.shortName}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="checkin-combos" aria-label="Special move combinations">
              <span><b>AS</b> AIR PUNCH</span>
              <span><b>AZ</b> AIR KICK</span>
              <span><b>X</b> POWER → SIGNATURE</span>
              <span><b>HITS</b> STUN + KNOCKBACK</span>
            </div>
            <button
              className="enter-arena"
              type="button"
              onClick={startMatch}
              disabled={!manifest}
            >
              {manifest ? "ENTER THE ARENA" : "CALLING THE FIGHTERS..."}
              <span>{manifest ? "↗" : "…"}</span>
            </button>
            <small className="checkin-note">
              Computer: left/right + A/S/Z/X · Phone: six on-screen controls
            </small>
          </div>
        </section>
      )}

      {game.phase === "finished" && (
        <section className="round-over" aria-live="assertive">
          <div className="round-over-card">
            <span className="checkin-eyebrow">ROUND COMPLETE</span>
            <h2>
              {playerWon ? "You win!" : `${game.winner === "emmy" ? "Emmy" : "Opie"} wins!`}
            </h2>
            <p>
              {playerWon
                ? "That combo timing was excellent."
                : "The CPU got this one. Build your meter and unleash X next round."}
            </p>
            <button type="button" onClick={startMatch}>
              REMATCH <span>↻</span>
            </button>
            <button
              type="button"
              className="change-fighter"
              onClick={() => setGame(createInitialState(selected))}
            >
              CHANGE FIGHTER
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
