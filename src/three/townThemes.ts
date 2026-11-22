import * as THREE from 'three';
import type { TimeOfDay, TownTheme, WeatherMode } from '../types/town.ts';

export type ThemeMaterialRole =
  | 'stone'
  | 'trim'
  | 'wall'
  | 'brick'
  | 'roofPrimary'
  | 'roofSecondary'
  | 'wood'
  | 'darkWood'
  | 'metal'
  | 'gold'
  | 'window'
  | 'lantern'
  | 'torchFlame'
  | 'foliage'
  | 'crop'
  | 'glass'
  | 'banner'
  | 'crate';

interface MaterialSnapshot {
  colorHex: number;
  roughness: number;
  metalness: number;
  emissiveHex: number;
  emissiveIntensity: number;
}

interface RoleOverride {
  colorHex: number;
  roughness?: number;
  metalness?: number;
  emissiveHex?: number;
  emissiveIntensity?: number;
}

export interface ThemeAtmosphereSpec {
  skyHex: number;
  fogDensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  sunHex: number;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  rimHex: number;
  rimIntensity: number;
  windowEmissive: number;
  lanternEmissive: number;
  pointLightBaseIntensity: number;
  pointLightColors: [number, number, number];
  groundHex: number;
  foliageTintHex: number;
  hillHex: number;
  plazaTintHex: number;
  pathHex: number;
  waterColorHex: number;
  waterEmissiveHex: number;
  waterEmissiveIntensity: number;
  waterJetHex: number;
}

const FANTASY_ROLE_OVERRIDES: Record<ThemeMaterialRole, RoleOverride> = {
  stone: { colorHex: 0x4b3f6b, roughness: 0.78, metalness: 0.14 },
  trim: { colorHex: 0x7c6fa0, roughness: 0.56, metalness: 0.24 },
  wall: { colorHex: 0x56467a, roughness: 0.76, metalness: 0.12 },
  brick: { colorHex: 0x432b59, roughness: 0.8, metalness: 0.1 },
  roofPrimary: { colorHex: 0x5b21b6, roughness: 0.44, metalness: 0.28 },
  roofSecondary: { colorHex: 0x6d28d9, roughness: 0.48, metalness: 0.24 },
  wood: { colorHex: 0x3b264f, roughness: 0.72, metalness: 0.08 },
  darkWood: { colorHex: 0x261836, roughness: 0.78, metalness: 0.08 },
  metal: { colorHex: 0x2e2545, roughness: 0.34, metalness: 0.85 },
  gold: {
    colorHex: 0xfbbf24,
    roughness: 0.2,
    metalness: 0.92,
    emissiveHex: 0xb45309,
    emissiveIntensity: 0.22,
  },
  window: {
    colorHex: 0xfef3c7,
    roughness: 0.22,
    metalness: 0.05,
    emissiveHex: 0xf59e0b,
    emissiveIntensity: 1.9,
  },
  lantern: {
    colorHex: 0xf3e8ff,
    roughness: 0.18,
    metalness: 0.1,
    emissiveHex: 0xa855f7,
    emissiveIntensity: 2.25,
  },
  torchFlame: {
    colorHex: 0xfef08a,
    roughness: 0.2,
    metalness: 0.05,
    emissiveHex: 0xd97706,
    emissiveIntensity: 2.15,
  },
  foliage: { colorHex: 0x2a4559, roughness: 0.84, metalness: 0.04 },
  crop: { colorHex: 0xc084fc, roughness: 0.7, metalness: 0.08 },
  glass: {
    colorHex: 0xc4b5fd,
    roughness: 0.14,
    metalness: 0.15,
    emissiveHex: 0x6d28d9,
    emissiveIntensity: 0.28,
  },
  banner: {
    colorHex: 0x7e22ce,
    roughness: 0.5,
    metalness: 0.14,
    emissiveHex: 0x4c1d95,
    emissiveIntensity: 0.18,
  },
  crate: { colorHex: 0x6b4c7a, roughness: 0.76, metalness: 0.06 },
};

const SOLARPUNK_ROLE_OVERRIDES: Record<ThemeMaterialRole, RoleOverride> = {
  stone: { colorHex: 0xe6c79c, roughness: 0.8, metalness: 0.04 },
  trim: { colorHex: 0xf4e3c6, roughness: 0.68, metalness: 0.08 },
  wall: { colorHex: 0xe8cca2, roughness: 0.78, metalness: 0.04 },
  brick: { colorHex: 0xc2593f, roughness: 0.76, metalness: 0.05 },
  roofPrimary: { colorHex: 0xb84a32, roughness: 0.6, metalness: 0.08 },
  roofSecondary: { colorHex: 0x0f766e, roughness: 0.42, metalness: 0.34 },
  wood: { colorHex: 0x9a5b32, roughness: 0.74, metalness: 0.05 },
  darkWood: { colorHex: 0x6b3d22, roughness: 0.8, metalness: 0.05 },
  metal: { colorHex: 0x8f6b43, roughness: 0.34, metalness: 0.78 },
  gold: {
    colorHex: 0xfbbf24,
    roughness: 0.22,
    metalness: 0.86,
    emissiveHex: 0x0891b2,
    emissiveIntensity: 0.16,
  },
  window: {
    colorHex: 0xfef9c3,
    roughness: 0.24,
    metalness: 0.08,
    emissiveHex: 0xfbbf24,
    emissiveIntensity: 0.55,
  },
  lantern: {
    colorHex: 0xcffafe,
    roughness: 0.15,
    metalness: 0.12,
    emissiveHex: 0x06b6d4,
    emissiveIntensity: 2.0,
  },
  torchFlame: {
    colorHex: 0xa5f3fc,
    roughness: 0.16,
    metalness: 0.1,
    emissiveHex: 0x22d3ee,
    emissiveIntensity: 1.95,
  },
  foliage: { colorHex: 0x0d9488, roughness: 0.76, metalness: 0.04 },
  crop: { colorHex: 0x10b981, roughness: 0.78, metalness: 0.04 },
  glass: {
    colorHex: 0x67e8f9,
    roughness: 0.12,
    metalness: 0.12,
    emissiveHex: 0x0891b2,
    emissiveIntensity: 0.34,
  },
  banner: { colorHex: 0x0d9488, roughness: 0.52, metalness: 0.08 },
  crate: { colorHex: 0xc97b4b, roughness: 0.74, metalness: 0.05 },
};

export const TREE_CANOPY_PALETTES: Record<TownTheme, [number, number, number]> = {
  meadow: [0x3f6e42, 0x4d7c4a, 0x355e3b],
  fantasy_night: [0x2a3b63, 0x374172, 0x243054],
  solarpunk_oasis: [0x0d9488, 0x10b981, 0x059669],
};

export const GRASS_TUFT_PALETTES: Record<TownTheme, [number, number, number, number]> = {
  meadow: [0x65a30d, 0x4d7c0f, 0x84cc16, 0x5c8d46],
  fantasy_night: [0x314169, 0x3f4c7a, 0x433878, 0x2b3b5c],
  solarpunk_oasis: [0x10b981, 0x14b8a6, 0x059669, 0x2dd4bf],
};

export const WILDFLOWER_PALETTES: Record<TownTheme, [number, number, number, number, number]> = {
  meadow: [0xf43f5e, 0xfbbf24, 0xfb923c, 0xa78bfa, 0xfef3c7],
  fantasy_night: [0xc084fc, 0xe879f9, 0xfde047, 0x818cf8, 0xf5d0fe],
  solarpunk_oasis: [0x22d3ee, 0xfb923c, 0xfde047, 0x34d399, 0xfef3c7],
};

export const COBBLE_PALETTES: Record<TownTheme, [number, number, number, number]> = {
  meadow: [0xa8a29e, 0x94a3b8, 0xcbd5e1, 0xb8a99a],
  fantasy_night: [0x5b527a, 0x4b4269, 0x70658f, 0x625680],
  solarpunk_oasis: [0xdcc098, 0xe6c79c, 0xc9a57b, 0xd4b287],
};

/**
 * Tags a MeshStandardMaterial with its semantic ThemeMaterialRole and snapshots its
 * original Alderbrook Meadow values so theme switching mutates materials in-place
 * with zero allocations and zero memory leaks.
 */
export function tagThemeMaterial<T extends THREE.MeshStandardMaterial>(
  mat: T,
  role: ThemeMaterialRole,
): T {
  if (!mat.userData.meadowBase) {
    const base: MaterialSnapshot = {
      colorHex: mat.color.getHex(),
      roughness: mat.roughness,
      metalness: mat.metalness,
      emissiveHex: mat.emissive.getHex(),
      emissiveIntensity: mat.emissiveIntensity,
    };
    mat.userData.meadowBase = base;
  }
  mat.userData.themeRole = role;
  return mat;
}

export function applyThemeToMaterial(mat: THREE.MeshStandardMaterial, theme: TownTheme): void {
  const role = mat.userData.themeRole as ThemeMaterialRole | undefined;
  const base = mat.userData.meadowBase as MaterialSnapshot | undefined;
  if (!role || !base) return;

  if (theme === 'meadow') {
    mat.color.setHex(base.colorHex);
    mat.roughness = base.roughness;
    mat.metalness = base.metalness;
    mat.emissive.setHex(base.emissiveHex);
    mat.emissiveIntensity = base.emissiveIntensity;
    return;
  }

  const table = theme === 'fantasy_night' ? FANTASY_ROLE_OVERRIDES : SOLARPUNK_ROLE_OVERRIDES;
  const override = table[role];
  if (!override) return;

  mat.color.setHex(override.colorHex);
  mat.roughness = override.roughness ?? base.roughness;
  mat.metalness = override.metalness ?? base.metalness;
  mat.emissive.setHex(override.emissiveHex ?? 0x000000);
  mat.emissiveIntensity = override.emissiveIntensity ?? 0;
}

export function applyThemeToObjectTree(root: THREE.Object3D, theme: TownTheme): void {
  const visited = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || visited.has(m)) continue;
      visited.add(m);
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        applyThemeToMaterial(m as THREE.MeshStandardMaterial, theme);
      }
    }
  });
}

export function createThemedAwningTexture(
  theme: TownTheme,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const stripes = 8;
    const w = canvas.width / stripes;
    const [stripeA, stripeB] =
      theme === 'fantasy_night'
        ? ['#5b21b6', '#fbbf24']
        : theme === 'solarpunk_oasis'
          ? ['#c2593f', '#14b8a6']
          : ['#c2410c', '#fef3c7'];
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? stripeA : stripeB;
      ctx.fillRect(i * w, 0, w, canvas.height);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

// Pre-allocated sun/moon direction vectors (zero per-frame allocations)
const SUN_POS_MEADOW: Record<TimeOfDay, THREE.Vector3> = {
  dawn: new THREE.Vector3(24, 9.5, 12),
  day: new THREE.Vector3(18, 26, 14),
  twilight: new THREE.Vector3(-24, 6.5, -14),
  night: new THREE.Vector3(-12, 22, -16),
};

const MOON_POS_FANTASY: Record<TimeOfDay, THREE.Vector3> = {
  dawn: new THREE.Vector3(-20, 18, -14),
  day: new THREE.Vector3(-14, 24, -15),
  twilight: new THREE.Vector3(-18, 16, -12),
  night: new THREE.Vector3(-12, 25, -16),
};

const SUN_POS_SOLARPUNK: Record<TimeOfDay, THREE.Vector3> = {
  dawn: new THREE.Vector3(26, 11, 14),
  day: new THREE.Vector3(23, 15.5, 16),
  twilight: new THREE.Vector3(-22, 9.5, 14),
  night: new THREE.Vector3(-16, 18, -14),
};

export function getThemeAtmosphere(
  theme: TownTheme,
  timeOfDay: TimeOfDay,
  weather: WeatherMode,
): ThemeAtmosphereSpec {
  if (theme === 'fantasy_night') {
    const isRain = weather === 'rain';
    const isWinter = weather === 'winter';
    const skyHex =
      timeOfDay === 'twilight'
        ? 0x1a153d
        : timeOfDay === 'dawn'
          ? 0x171b42
          : 0x0b1029;
    return {
      skyHex,
      fogDensity: isRain ? 0.019 : 0.016,
      hemiSkyHex: 0x4c4d94,
      hemiGroundHex: 0x1c1533,
      hemiIntensity: 0.66,
      sunHex: 0xdbeafe, // Silver moonlight
      sunIntensity: isRain ? 0.92 : 1.24,
      sunPos: MOON_POS_FANTASY[timeOfDay],
      rimHex: 0x9333ea,
      rimIntensity: 0.78,
      windowEmissive: 2.05,
      lanternEmissive: 2.35,
      pointLightBaseIntensity: 3.1,
      pointLightColors: [0xa855f7, 0xf59e0b, 0x9333ea],
      groundHex: isWinter ? 0x64749c : isRain ? 0x222c45 : 0x293352,
      foliageTintHex: isWinter ? 0x93a8d4 : 0xd8d4f2,
      hillHex: isWinter ? 0x4b5c82 : 0x1e2240,
      plazaTintHex: 0x8b82ad,
      pathHex: 0x5c537a,
      waterColorHex: 0x6366f1,
      waterEmissiveHex: 0x818cf8,
      waterEmissiveIntensity: 0.36,
      waterJetHex: 0xc7d2fe,
    };
  }

  if (theme === 'solarpunk_oasis') {
    const isNight = timeOfDay === 'night';
    const isTwilight = timeOfDay === 'twilight';
    const isRain = weather === 'rain';
    const isWinter = weather === 'winter';
    return {
      skyHex: isNight ? 0x132b38 : isTwilight ? 0xe8a87c : isRain ? 0xc2d8d3 : 0xf6d3a0,
      fogDensity: isRain ? 0.0155 : 0.0125,
      hemiSkyHex: isNight ? 0x2dd4bf : 0xfde68a,
      hemiGroundHex: isNight ? 0x134e4a : 0x2f705c,
      hemiIntensity: isNight ? 0.65 : 0.96,
      sunHex: isNight ? 0x67e8f9 : 0xffcf7d, // Golden-hour sunlight
      sunIntensity: (isNight ? 0.85 : 1.92) * (isRain ? 0.76 : 1.0),
      sunPos: SUN_POS_SOLARPUNK[timeOfDay],
      rimHex: 0x2dd4bf,
      rimIntensity: 0.74,
      windowEmissive: isNight || isTwilight ? 1.4 : 0.55,
      lanternEmissive: isNight || isTwilight ? 2.4 : 1.75,
      pointLightBaseIntensity: isNight ? 2.9 : isTwilight ? 2.2 : 1.35,
      pointLightColors: [0x22d3ee, 0xfbbf24, 0x06b6d4],
      groundHex: isWinter ? 0x99d5c9 : isRain ? 0x2f7a62 : 0x3d8f70,
      foliageTintHex: isWinter ? 0xb5f5ec : 0xffffff,
      hillHex: isWinter ? 0xa9c5b8 : 0xc99a6b,
      plazaTintHex: 0xf2d9b6,
      pathHex: 0xdcc098,
      waterColorHex: 0x22d3ee,
      waterEmissiveHex: 0x06b6d4,
      waterEmissiveIntensity: 0.48,
      waterJetHex: 0x67e8f9,
    };
  }

  // Theme 1: Alderbrook Meadow (Classic)
  const isNight = timeOfDay === 'night';
  const isTwilight = timeOfDay === 'twilight';
  const isDawn = timeOfDay === 'dawn';
  const isRain = weather === 'rain';
  const isWinter = weather === 'winter';

  const skyHex = isNight
    ? 0x0f172e
    : isTwilight
      ? 0x4c406e
      : isDawn
        ? 0xf6cbb8
        : 0xdcebf7;
  const hemiSkyHex = isNight
    ? 0x3b4d7a
    : isTwilight
      ? 0x818cf8
      : isDawn
        ? 0xfde2e4
        : 0xbae6fd;
  const hemiGroundHex = isNight
    ? 0x161f33
    : isTwilight
      ? 0x4b3348
      : isDawn
        ? 0x626b7a
        : 0x5c7252;
  const hemiIntensity = isNight ? 0.52 : isTwilight ? 0.68 : isDawn ? 0.85 : 0.92;
  const sunHex = isNight ? 0x93c5fd : isTwilight ? 0xfb923c : isDawn ? 0xfdba74 : 0xfff3d6;
  const sunIntensity =
    (isNight ? 0.62 : isTwilight ? 1.45 : isDawn ? 1.5 : 1.72) * (isRain ? 0.72 : 1.0);
  const rimHex = isNight ? 0x38bdf8 : isTwilight ? 0x6366f1 : isDawn ? 0xa5b4fc : 0xc7d2fe;
  const rimIntensity = isNight ? 0.55 : isTwilight ? 0.78 : isDawn ? 0.65 : 0.6;
  const baseLantern = isNight ? 2.35 : isTwilight ? 1.75 : isDawn ? 0.72 : 0.22;
  const stormEmissive = isRain ? 1.5 : isWinter ? 1.3 : 0;
  const targetGlow = Math.max(baseLantern, stormEmissive);

  const isStorm = isRain || isWinter;
  const pointLightBaseIntensity =
    isNight || isTwilight ? 2.7 : isStorm ? 1.9 : isDawn ? 0.65 : 0;

  return {
    skyHex,
    fogDensity: 0.015,
    hemiSkyHex,
    hemiGroundHex,
    hemiIntensity,
    sunHex,
    sunIntensity,
    sunPos: SUN_POS_MEADOW[timeOfDay],
    rimHex,
    rimIntensity,
    windowEmissive: targetGlow,
    lanternEmissive: targetGlow,
    pointLightBaseIntensity,
    pointLightColors: [0xfbbf24, 0xfbbf24, 0xfbbf24],
    groundHex: isWinter ? 0xcbd5e1 : isRain ? 0x557548 : 0x739558,
    foliageTintHex: isWinter ? 0xdbeafe : isRain ? 0xdbeee4 : 0xffffff,
    hillHex: isWinter ? 0xb4c6d9 : isRain ? 0x476640 : 0x5c7c48,
    plazaTintHex: 0xffffff,
    pathHex: 0xb6bec8,
    waterColorHex: 0x38bdf8,
    waterEmissiveHex: 0x0ea5e9,
    waterEmissiveIntensity: 0.14,
    waterJetHex: 0xe0f2fe,
  };
}
