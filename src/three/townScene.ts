import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ALL_PLOT_IDS,
  MAX_TOWN_AGENTS,
  PLOT_META,
  type AgentId,
  type AgentRecord,
  type GraphicsQuality,
  type HatStyle,
  type LocationId,
  type PlotId,
  type TimeOfDay,
  type TownStructure,
  type WeatherMode,
} from '../types/town.ts';
import {
  buildScatteredTownDetails,
  createRipplingWaterMaterial,
  createWindSwayMaterial,
  type TownDetailsHandle,
  type WaterUniforms,
  type WindUniforms,
} from './townEnvironment.ts';
import {
  buildCompletedStructureMesh,
  buildEmptyPlotMesh,
  buildScaffoldingMesh,
  disposeStructureGroup,
} from './townStructures.ts';

export interface ProjectedLabel {
  x: number;
  y: number;
  visible: boolean;
}

export interface AgentWorldCoord {
  x: number;
  z: number;
}

export interface TownSceneCallbacks {
  onSelectAgent: (agentId: AgentId) => void;
  onSelectLocation: (locationId: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onLabelUpdate?: (positions: Record<AgentId, ProjectedLabel>) => void;
  onMinimapUpdate?: (coords: Record<AgentId, AgentWorldCoord>) => void;
  onUserOrbitStart?: () => void;
}

interface LandmarkConfig {
  id: LocationId;
  center: THREE.Vector3;
  gatherPoint: THREE.Vector3;
  lookTarget: THREE.Vector3;
}

const LANDMARKS: Record<LocationId, LandmarkConfig> = {
  town_hall: {
    id: 'town_hall',
    center: new THREE.Vector3(0, 0, -10.5),
    gatherPoint: new THREE.Vector3(0, 0, -6.2),
    lookTarget: new THREE.Vector3(0, 1.4, -10.5),
  },
  workshop: {
    id: 'workshop',
    center: new THREE.Vector3(10.5, 0, -0.5),
    gatherPoint: new THREE.Vector3(6.2, 0, -0.5),
    lookTarget: new THREE.Vector3(10.5, 1.2, -0.5),
  },
  market: {
    id: 'market',
    center: new THREE.Vector3(-10.5, 0, -0.5),
    gatherPoint: new THREE.Vector3(-6.2, 0, -0.5),
    lookTarget: new THREE.Vector3(-10.5, 1.2, -0.5),
  },
  park: {
    id: 'park',
    center: new THREE.Vector3(0, 0, 10.2),
    gatherPoint: new THREE.Vector3(0, 0, 5.8),
    lookTarget: new THREE.Vector3(0, 1.0, 10.2),
  },
};

const PLAZA_CENTER = new THREE.Vector3(0, 0, 0);

const CORE_SLOT_OFFSETS: Record<string, [number, number]> = {
  mayor_sterling: [0, 0],
  commander_vance: [-1.35, 0.75],
  architect_lyra: [1.35, 0.75],
  worker_kai: [-1.1, -1.05],
  worker_pip: [1.1, -1.05],
};

function getAgentSlotOffset(agentId: AgentId, index: number, out: THREE.Vector3): THREE.Vector3 {
  const core = CORE_SLOT_OFFSETS[agentId];
  if (core) {
    return out.set(core[0], 0, core[1]);
  }
  const extraIdx = Math.max(0, index - 5);
  const angle = extraIdx * 2.39996 + 0.65; // Golden angle spread around landmark/plot
  const radius = 1.15 + Math.floor(extraIdx / 5) * 0.75;
  return out.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

interface AtmospherePreset {
  skyHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  sunHex: number;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  rimHex: number;
  rimIntensity: number;
  lanternEmissive: number;
}

const ATMOSPHERE_PRESETS: Record<TimeOfDay, AtmospherePreset> = {
  dawn: {
    skyHex: 0xf6cbb8,
    hemiSkyHex: 0xfde2e4,
    hemiGroundHex: 0x626b7a,
    hemiIntensity: 0.85,
    sunHex: 0xfdba74,
    sunIntensity: 1.5,
    sunPos: new THREE.Vector3(24, 9.5, 12),
    rimHex: 0xa5b4fc,
    rimIntensity: 0.65,
    lanternEmissive: 0.72,
  },
  day: {
    skyHex: 0xdcebf7,
    hemiSkyHex: 0xbae6fd,
    hemiGroundHex: 0x5c7252,
    hemiIntensity: 0.92,
    sunHex: 0xfff3d6,
    sunIntensity: 1.72,
    sunPos: new THREE.Vector3(18, 26, 14),
    rimHex: 0xc7d2fe,
    rimIntensity: 0.6,
    lanternEmissive: 0.22,
  },
  twilight: {
    skyHex: 0x4c406e,
    hemiSkyHex: 0x818cf8,
    hemiGroundHex: 0x4b3348,
    hemiIntensity: 0.68,
    sunHex: 0xfb923c,
    sunIntensity: 1.45,
    sunPos: new THREE.Vector3(-24, 6.5, -14),
    rimHex: 0x6366f1,
    rimIntensity: 0.78,
    lanternEmissive: 1.75,
  },
  night: {
    skyHex: 0x0f172e,
    hemiSkyHex: 0x3b4d7a,
    hemiGroundHex: 0x161f33,
    hemiIntensity: 0.52,
    sunHex: 0x93c5fd,
    sunIntensity: 0.62,
    sunPos: new THREE.Vector3(-12, 22, -16),
    rimHex: 0x38bdf8,
    rimIntensity: 0.55,
    lanternEmissive: 2.35,
  },
};

interface CharacterRig {
  id: AgentId;
  name: string;
  slotIndex: number;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  selectionRing: THREE.Mesh;
  activeRing: THREE.Mesh;
  ownedMaterials: THREE.Material[];
  waypoints: THREE.Vector3[];
  currentLocation: LocationId;
  currentPlotId: PlotId | null;
  walkPhase: number;
  spawnTimer: number;
  isMoving: boolean;
  facingAngle: number;
}

interface SharedRigAssets {
  shadowPlaneGeo: THREE.PlaneGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  selectionRingGeo: THREE.RingGeometry;
  selectionMat: THREE.MeshBasicMaterial;
  activeRingGeo: THREE.RingGeometry;
  legGeo: THREE.BoxGeometry;
  bootGeo: THREE.BoxGeometry;
  torsoGeo: THREE.BoxGeometry;
  armGeo: THREE.BoxGeometry;
  handGeo: THREE.SphereGeometry;
  headGeo: THREE.BoxGeometry;
  eyeGeo: THREE.BoxGeometry;
  strawBrimGeo: THREE.CylinderGeometry;
  strawTopGeo: THREE.CylinderGeometry;
  capGeo: THREE.CylinderGeometry;
  capVisorGeo: THREE.BoxGeometry;
  helmetGeo: THREE.SphereGeometry;
  beretGeo: THREE.CylinderGeometry;
  hoodGeo: THREE.BoxGeometry;
  apronGeo: THREE.BoxGeometry;
  skinMat: THREE.MeshStandardMaterial;
  bootMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshStandardMaterial;
  metalMat: THREE.MeshStandardMaterial;
  defaultPantsMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function createSharedRigAssets(shadowTex: THREE.CanvasTexture): SharedRigAssets {
  const shadowPlaneGeo = new THREE.PlaneGeometry(1.1, 1.1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const selectionRingGeo = new THREE.RingGeometry(0.55, 0.68, 24);
  const selectionMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const activeRingGeo = new THREE.RingGeometry(0.44, 0.54, 24);

  const legGeo = new THREE.BoxGeometry(0.18, 0.52, 0.2);
  const bootGeo = new THREE.BoxGeometry(0.2, 0.14, 0.26);
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.72, 0.32);
  const armGeo = new THREE.BoxGeometry(0.16, 0.54, 0.16);
  const handGeo = new THREE.SphereGeometry(0.09, 8, 8);
  const headGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.04);

  const strawBrimGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.04, 12);
  const strawTopGeo = new THREE.CylinderGeometry(0.2, 0.23, 0.16, 10);
  const capGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.14, 10);
  const capVisorGeo = new THREE.BoxGeometry(0.32, 0.04, 0.18);
  const helmetGeo = new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const beretGeo = new THREE.CylinderGeometry(0.27, 0.21, 0.11, 10);
  const hoodGeo = new THREE.BoxGeometry(0.48, 0.44, 0.48);
  const apronGeo = new THREE.BoxGeometry(0.5, 0.44, 0.04);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xfde2c8, roughness: 0.62, metalness: 0.02 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.55, metalness: 0.1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.24, metalness: 0.88 });
  const defaultPantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75, metalness: 0.05 });

  const geometries = [
    shadowPlaneGeo,
    selectionRingGeo,
    activeRingGeo,
    legGeo,
    bootGeo,
    torsoGeo,
    armGeo,
    handGeo,
    headGeo,
    eyeGeo,
    strawBrimGeo,
    strawTopGeo,
    capGeo,
    capVisorGeo,
    helmetGeo,
    beretGeo,
    hoodGeo,
    apronGeo,
  ];
  const materials = [shadowMat, selectionMat, skinMat, bootMat, eyeMat, metalMat, defaultPantsMat];

  return {
    shadowPlaneGeo,
    shadowMat,
    selectionRingGeo,
    selectionMat,
    activeRingGeo,
    legGeo,
    bootGeo,
    torsoGeo,
    armGeo,
    handGeo,
    headGeo,
    eyeGeo,
    strawBrimGeo,
    strawTopGeo,
    capGeo,
    capVisorGeo,
    helmetGeo,
    beretGeo,
    hoodGeo,
    apronGeo,
    skinMat,
    bootMat,
    eyeMat,
    metalMat,
    defaultPantsMat,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

// Pre-allocated scratch helpers (zero GC inside animation loop)
const _projVec = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetColor = new THREE.Color();
const _arcStart = new THREE.Vector3();
const _arcMid = new THREE.Vector3();
const _arcEnd = new THREE.Vector3();
const _slotOffset = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.16)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAwningStripeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const stripes = 8;
    const w = canvas.width / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#c2410c' : '#fef3c7';
      ctx.fillRect(i * w, 0, w, canvas.height);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCobbleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(0, 0, 256, 256);
    const tones = ['#94a3b8', '#cbd5e1', '#a8a29e', '#b8bec8'];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let y = 0; y < 256; y += 32) {
      const offset = (y / 32) % 2 === 0 ? 0 : 16;
      for (let x = -16; x < 256; x += 32) {
        ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
        ctx.beginPath();
        ctx.roundRect(x + offset + 2, y + 2, 28, 28, 6);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function addContactShadow(
  parent: THREE.Object3D,
  shadowTex: THREE.CanvasTexture,
  radiusX: number,
  radiusZ: number,
  opacity = 0.85,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  parent.add(mesh);
  return mesh;
}

function buildTownHall(
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'landmark:town_hall';
  group.userData = { locationId: 'town_hall' };

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe2dcd0, roughness: 0.85, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.65, metalness: 0.1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.55, metalness: 0.18 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.72, metalness: 0.05 });
  const clockMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });
  lanternMats.push(clockMat);

  addContactShadow(group, shadowTex, 3.8, 3.0);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.35, 4.4), trimMat);
  plinth.position.y = 0.175;
  group.add(plinth);

  const hall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 3.6), stoneMat);
  hall.position.y = 0.35 + 1.4;
  group.add(hall);

  const colGeo = new THREE.CylinderGeometry(0.14, 0.17, 2.6, 10);
  [-1.6, -0.65, 0.65, 1.6].forEach((x) => {
    const col = new THREE.Mesh(colGeo, trimMat);
    col.position.set(x, 1.65, 1.95);
    group.add(col);
  });

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.15), doorMat);
  door.position.set(0, 1.2, 1.82);
  group.add(door);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 1.6, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.15 + 0.8;
  group.add(roof);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), stoneMat);
  tower.position.set(0, 4.1, 0.2);
  group.add(tower);

  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), clockMat);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, 4.45, 0.92);
  group.add(dial);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.4, 4), roofMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, 5.9, 0.2);
  group.add(spire);

  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), goldMat);
  finial.position.set(0, 6.75, 0.2);
  group.add(finial);

  return group;
}

function buildWorkshop(
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'landmark:workshop';
  group.userData = { locationId: 'workshop' };

  const brickMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.88, metalness: 0.04 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78, metalness: 0.05 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.58, metalness: 0.15 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.85 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.65,
    roughness: 0.3,
  });
  lanternMats.push(glowMat);

  addContactShadow(group, shadowTex, 3.2, 2.8);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.3, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 }),
  );
  base.position.y = 0.15;
  group.add(base);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 3.2), brickMat);
  walls.position.y = 1.4;
  group.add(walls);

  [-1.95, 1.95].forEach((x) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.25, 3.32), timberMat);
    beam.position.set(x, 1.4, 0);
    group.add(beam);
  });

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.8, 1.5, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.92);
  roof.position.y = 3.25;
  group.add(roof);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.0, 0.65), brickMat);
  chimney.position.set(1.2, 3.6, -0.7);
  group.add(chimney);

  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 1.2), glowMat);
  windowMesh.position.set(-2.12, 1.5, 0);
  group.add(windowMesh);

  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.55, 8), timberMat);
  stump.position.set(-2.7, 0.275, 0.8);
  group.add(stump);

  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.3), ironMat);
  anvil.position.set(-2.7, 0.68, 0.8);
  group.add(anvil);

  const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.2, 8);
  [
    [-2.7, 0.14, -0.7],
    [-2.7, 0.14, -1.0],
    [-2.7, 0.38, -0.85],
  ].forEach(([x, y, z]) => {
    const log = new THREE.Mesh(logGeo, timberMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(x, y, z);
    group.add(log);
  });

  return group;
}

function buildMarket(
  shadowTex: THREE.CanvasTexture,
  awningTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'landmark:market';
  group.userData = { locationId: 'market' };

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78, metalness: 0.04 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c2b0c, roughness: 0.84, metalness: 0.04 });
  const awningMat = new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.65, metalness: 0.02 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72, metalness: 0.05 });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.35,
  });
  lanternMats.push(lanternMat);

  addContactShadow(group, shadowTex, 3.2, 2.8);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 3.8), darkWoodMat);
  deck.position.y = 0.11;
  group.add(deck);

  const postGeo = new THREE.CylinderGeometry(0.1, 0.11, 2.5, 8);
  [
    [-1.8, 1.35, -1.5],
    [1.8, 1.35, -1.5],
    [-1.8, 1.35, 1.5],
    [1.8, 1.35, 1.5],
  ].forEach(([x, y, z]) => {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(x, y, z);
    group.add(post);
  });

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.18, 3.7), awningMat);
  canopy.position.set(0, 2.65, 0);
  canopy.rotation.z = -0.06;
  group.add(canopy);

  const counter1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 2.6), woodMat);
  counter1.position.set(-1.1, 0.64, 0);
  group.add(counter1);

  const counter2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 2.6), woodMat);
  counter2.position.set(1.1, 0.64, 0);
  group.add(counter2);

  const cratePositions: Array<[number, number, number, number]> = [
    [2.5, 0.35, 0.9, 0.6],
    [2.5, 0.35, -0.1, 0.55],
    [2.5, 0.88, 0.4, 0.48],
    [-1.1, 1.25, 0.6, 0.4],
  ];
  cratePositions.forEach(([x, y, z, s]) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(x, y, z);
    group.add(crate);
  });

  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), lanternMat);
  lantern.position.set(1.85, 2.25, 1.5);
  group.add(lantern);

  return group;
}

function buildPark(
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
  waterUniforms: WaterUniforms,
): { group: THREE.Group; waterMesh: THREE.Mesh; waterJet: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'landmark:park';
  group.userData = { locationId: 'park' };

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.78, metalness: 0.08 });
  const waterMat = createRipplingWaterMaterial(waterUniforms);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.76 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });
  const lampGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.35,
    roughness: 0.25,
  });
  lanternMats.push(lampGlowMat);

  addContactShadow(group, shadowTex, 3.0, 3.0, 0.65);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.45, 20), stoneMat);
  basin.position.y = 0.225;
  basin.castShadow = true;
  basin.receiveShadow = true;
  group.add(basin);

  const waterGeo = new THREE.RingGeometry(0.05, 1.85, 28, 8);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = 0.45;
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.46, 1.15, 12), stoneMat);
  ped.position.y = 0.85;
  ped.castShadow = true;
  group.add(ped);

  const tier = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.35, 0.28, 14), stoneMat);
  tier.position.y = 1.45;
  tier.castShadow = true;
  group.add(tier);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), stoneMat);
  finial.position.y = 1.8;
  group.add(finial);

  const waterJet = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.58, 10),
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.68,
    }),
  );
  waterJet.position.y = 2.15;
  group.add(waterJet);

  const benchAngles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.5];
  benchAngles.forEach((angle) => {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.5), woodMat);
    seat.position.y = 0.42;
    seat.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.1), woodMat);
    back.position.set(0, 0.68, -0.2);
    back.castShadow = true;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.45), ironMat);
    legL.position.set(-0.6, 0.21, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.45), ironMat);
    legR.position.set(0.6, 0.21, 0);
    bench.add(seat, back, legL, legR);
    bench.position.set(Math.cos(angle) * 3.25, 0, Math.sin(angle) * 3.25);
    bench.lookAt(0, 0, 0);
    group.add(bench);
  });

  // Two wrought-iron park lanterns
  [-2.8, 2.8].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 8), ironMat);
    post.position.set(x, 1.1, -2.4);
    post.castShadow = true;
    const globe = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), lampGlowMat);
    globe.position.set(x, 2.32, -2.4);
    group.add(post, globe);
  });

  return { group, waterMesh, waterJet };
}

function buildCharacter(
  agent: AgentRecord,
  slotIndex: number,
  assets: SharedRigAssets,
  spawnAtPlaza: boolean,
): CharacterRig {
  const root = new THREE.Group();
  root.name = `agent:${agent.id}`;
  root.userData = { agentId: agent.id };

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const ownedMaterials: THREE.Material[] = [];
  const coatColor = agent.outfitColors?.coat || agent.accentColor;
  const coatMat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.52, metalness: 0.08 });
  ownedMaterials.push(coatMat);

  let pantsMat = assets.defaultPantsMat;
  if (agent.outfitColors?.pants) {
    pantsMat = new THREE.MeshStandardMaterial({
      color: agent.outfitColors.pants,
      roughness: 0.75,
      metalness: 0.05,
    });
    ownedMaterials.push(pantsMat);
  }

  const shadowPlane = new THREE.Mesh(assets.shadowPlaneGeo, assets.shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.03, 0);
  root.add(shadowPlane);

  const selectionRing = new THREE.Mesh(assets.selectionRingGeo, assets.selectionMat);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.04;
  selectionRing.visible = false;
  root.add(selectionRing);

  const activeRingMat = new THREE.MeshBasicMaterial({
    color: coatColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  ownedMaterials.push(activeRingMat);
  const activeRing = new THREE.Mesh(assets.activeRingGeo, activeRingMat);
  activeRing.rotation.x = -Math.PI / 2;
  activeRing.position.y = 0.045;
  activeRing.visible = false;
  root.add(activeRing);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, 0.64, 0);
  const leftLeg = new THREE.Mesh(assets.legGeo, pantsMat);
  leftLeg.position.y = -0.26;
  const leftBoot = new THREE.Mesh(assets.bootGeo, assets.bootMat);
  leftBoot.position.set(0, -0.56, 0.03);
  leftLegPivot.add(leftLeg, leftBoot);
  bodyGroup.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, 0.64, 0);
  const rightLeg = new THREE.Mesh(assets.legGeo, pantsMat);
  rightLeg.position.y = -0.26;
  const rightBoot = new THREE.Mesh(assets.bootGeo, assets.bootMat);
  rightBoot.position.set(0, -0.56, 0.03);
  rightLegPivot.add(rightLeg, rightBoot);
  bodyGroup.add(rightLegPivot);

  const torso = new THREE.Mesh(assets.torsoGeo, coatMat);
  torso.position.y = 1.02;
  bodyGroup.add(torso);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.37, 1.32, 0);
  const leftArm = new THREE.Mesh(assets.armGeo, coatMat);
  leftArm.position.y = -0.24;
  const leftHand = new THREE.Mesh(assets.handGeo, assets.skinMat);
  leftHand.position.y = -0.54;
  leftArmPivot.add(leftArm, leftHand);
  bodyGroup.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.37, 1.32, 0);
  const rightArm = new THREE.Mesh(assets.armGeo, coatMat);
  rightArm.position.y = -0.24;
  const rightHand = new THREE.Mesh(assets.handGeo, assets.skinMat);
  rightHand.position.y = -0.54;
  rightArmPivot.add(rightArm, rightHand);
  bodyGroup.add(rightArmPivot);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.44, 0);
  const head = new THREE.Mesh(assets.headGeo, assets.skinMat);
  head.position.y = 0.22;
  headGroup.add(head);

  const eyeL = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
  eyeL.position.set(-0.09, 0.24, 0.21);
  const eyeR = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
  eyeR.position.set(0.09, 0.24, 0.21);
  headGroup.add(eyeL, eyeR);
  bodyGroup.add(headGroup);

  if (agent.id === 'mayor_sterling') {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 14), assets.metalMat);
    chain.rotation.x = Math.PI / 2;
    chain.position.set(0, 1.34, 0.04);
    bodyGroup.add(chain);

    const hatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45 });
    ownedMaterials.push(hatMat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 14), hatMat);
    brim.position.y = 0.44;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.34, 14), hatMat);
    crown.position.y = 0.62;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 14), assets.metalMat);
    band.position.y = 0.48;
    headGroup.add(brim, crown, band);
  } else if (agent.id === 'commander_vance') {
    const pauldronMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.35 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
    ownedMaterials.push(pauldronMat, capMat);

    const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), pauldronMat);
    pauldronL.position.set(-0.37, 1.38, 0);
    const pauldronR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), pauldronMat);
    pauldronR.position.set(0.37, 1.38, 0);
    bodyGroup.add(pauldronL, pauldronR);

    const cap = new THREE.Mesh(assets.capGeo, capMat);
    cap.position.y = 0.47;
    const visor = new THREE.Mesh(assets.capVisorGeo, capMat);
    visor.position.set(0, 0.41, 0.22);
    headGroup.add(cap, visor);
  } else if (agent.id === 'architect_lyra') {
    const goggleMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.2, metalness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3f2e21, roughness: 0.75 });
    const bpMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.5 });
    ownedMaterials.push(goggleMat, hairMat, bpMat);

    const goggleL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), assets.metalMat);
    goggleL.rotation.x = Math.PI / 2;
    goggleL.position.set(-0.1, 0.38, 0.22);
    const goggleR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), goggleMat);
    goggleR.rotation.x = Math.PI / 2;
    goggleR.position.set(0.1, 0.38, 0.22);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.45), hairMat);
    hair.position.y = 0.42;
    headGroup.add(hair, goggleL, goggleR);

    const blueprint = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.48, 8), bpMat);
    blueprint.rotation.x = Math.PI / 2;
    blueprint.position.set(0, -0.5, 0.12);
    rightArmPivot.add(blueprint);
  } else if (agent.id === 'worker_kai') {
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.2 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 });
    ownedMaterials.push(helmetMat, packMat);

    const helmet = new THREE.Mesh(assets.helmetGeo, helmetMat);
    helmet.position.y = 0.39;
    headGroup.add(helmet);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.2), packMat);
    pack.position.set(0, 1.04, -0.24);
    bodyGroup.add(pack);
  } else if (agent.id === 'worker_pip') {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.82 });
    const malletMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    ownedMaterials.push(hatMat, malletMat);

    const brim = new THREE.Mesh(assets.strawBrimGeo, hatMat);
    brim.position.y = 0.42;
    const top = new THREE.Mesh(assets.strawTopGeo, hatMat);
    top.position.y = 0.5;
    headGroup.add(brim, top);

    const malletHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6), malletMat);
    malletHandle.rotation.x = Math.PI / 2;
    malletHandle.position.set(0, -0.52, 0.12);
    rightArmPivot.add(malletHandle);
  } else {
    // Dynamically Hired Rank 3 Specialist using shared low-poly geometries + custom palette
    const hatColor = agent.outfitColors?.hat || '#fde68a';
    const trimColor = agent.outfitColors?.trim || '#f59e0b';
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.65, metalness: 0.06 });
    const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.55, metalness: 0.12 });
    ownedMaterials.push(hatMat, trimMat);

    const style: HatStyle = agent.hatStyle || 'cap';
    if (style === 'straw') {
      const brim = new THREE.Mesh(assets.strawBrimGeo, hatMat);
      brim.position.y = 0.42;
      const top = new THREE.Mesh(assets.strawTopGeo, hatMat);
      top.position.y = 0.5;
      headGroup.add(brim, top);
    } else if (style === 'helmet') {
      const helmet = new THREE.Mesh(assets.helmetGeo, hatMat);
      helmet.position.y = 0.39;
      headGroup.add(helmet);
    } else if (style === 'beret') {
      const beret = new THREE.Mesh(assets.beretGeo, hatMat);
      beret.position.set(0.03, 0.45, 0);
      beret.rotation.z = -0.14;
      headGroup.add(beret);
    } else if (style === 'hood') {
      const hood = new THREE.Mesh(assets.hoodGeo, hatMat);
      hood.position.set(0, 0.25, -0.05);
      headGroup.add(hood);
    } else {
      const cap = new THREE.Mesh(assets.capGeo, hatMat);
      cap.position.y = 0.47;
      const visor = new THREE.Mesh(assets.capVisorGeo, trimMat);
      visor.position.set(0, 0.41, 0.22);
      headGroup.add(cap, visor);
    }

    const apron = new THREE.Mesh(assets.apronGeo, trimMat);
    apron.position.set(0, 0.9, 0.16);
    bodyGroup.add(apron);
  }

  bodyGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
    }
  });

  const slot = getAgentSlotOffset(agent.id, slotIndex, _slotOffset);
  let destBase = LANDMARKS[agent.location].gatherPoint;
  let slotScale = 0.7;
  if (agent.activePlotId && PLOT_META[agent.activePlotId]) {
    const pm = PLOT_META[agent.activePlotId];
    const len = Math.hypot(pm.x, pm.z) || 1;
    destBase = new THREE.Vector3(pm.x * (1 - 2.6 / len), 0, pm.z * (1 - 2.6 / len));
    slotScale = 0.65;
  }

  const finalPos = new THREE.Vector3(
    destBase.x + slot.x * slotScale,
    0,
    destBase.z + slot.z * slotScale,
  );

  const waypoints: THREE.Vector3[] = [];
  if (spawnAtPlaza) {
    const angle = (slotIndex * 1.45) % (Math.PI * 2);
    root.position.set(Math.cos(angle) * 1.4, 0, Math.sin(angle) * 1.4);
    waypoints.push(finalPos);
  } else {
    root.position.copy(finalPos);
  }

  return {
    id: agent.id,
    name: agent.name,
    slotIndex,
    root,
    bodyGroup,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    selectionRing,
    activeRing,
    ownedMaterials,
    waypoints,
    currentLocation: agent.location,
    currentPlotId: agent.activePlotId,
    walkPhase: Math.random() * Math.PI * 2,
    spawnTimer: spawnAtPlaza ? 0.85 : 0,
    isMoving: spawnAtPlaza,
    facingAngle: 0,
  };
}

export class TownSceneController {
  private container: HTMLElement;
  private callbacks: TownSceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  // Lighting & Atmosphere
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private warmLights: THREE.PointLight[] = [];
  private lanternMaterials: THREE.MeshStandardMaterial[] = [];
  private groundMat!: THREE.MeshStandardMaterial;
  private foliageMat!: THREE.MeshStandardMaterial;
  private hillMat!: THREE.MeshStandardMaterial;
  private timeOfDay: TimeOfDay = 'day';
  private graphicsQuality: GraphicsQuality = 'medium';

  // Animated Shader Uniforms & Instanced Environment Details
  private windUniforms: WindUniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 1.0 },
  };
  private waterUniforms: WaterUniforms = {
    uTime: { value: 0 },
  };
  private detailsHandle!: TownDetailsHandle;

  // Weather & Smoke Particles
  private weatherMode: WeatherMode = 'summer';
  private weatherPoints!: THREE.Points;
  private weatherPositions!: Float32Array;
  private weatherMat!: THREE.PointsMaterial;
  private smokePoints!: THREE.Points;
  private smokePositions!: Float32Array;
  private smokePhases!: Float32Array;
  private bakerySmokePoints!: THREE.Points;
  private bakerySmokePositions!: Float32Array;
  private bakerySmokePhases!: Float32Array;
  private bakerySmokeMat!: THREE.PointsMaterial;
  private bakeryChimneys: THREE.Vector3[] = [];

  // Communication Arc Beam
  private commArcLine!: THREE.Line;
  private commArcMat!: THREE.LineBasicMaterial;
  private commArcTimer = 0;
  private commSpeakerId: AgentId | null = null;
  private commTargetId: AgentId | null = null;

  // Dynamic Self-Building Plots
  private plotGroups = new Map<PlotId, THREE.Group>();
  private plotSignatures = new Map<PlotId, string>();
  private windmillRotors: THREE.Group[] = [];
  private sharedShadowTex!: THREE.CanvasTexture;

  // Agents & Interaction (shared low-poly meshes up to 15 villagers)
  private rigs = new Map<AgentId, CharacterRig>();
  private sharedRigAssets!: SharedRigAssets;
  private clickableObjects: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();
  private waterMesh: THREE.Mesh | null = null;
  private waterJet: THREE.Mesh | null = null;
  private selectedAgentId: AgentId | null = null;
  private activeAgentId: AgentId | null = null;
  private followActive = false;
  private cameraTargetGoal: THREE.Vector3 | null = null;
  private lastMinimapEmit = 0;
  private frameId = 0;
  private disposed = false;
  private pointerDownPos = { x: 0, y: 0 };
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(
    container: HTMLElement,
    initialAgents: AgentRecord[],
    callbacks: TownSceneCallbacks,
    initialQuality: GraphicsQuality = 'medium',
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.graphicsQuality = initialQuality;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(ATMOSPHERE_PRESETS.day.skyHex);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(ATMOSPHERE_PRESETS.day.skyHex, 0.015);

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 160);
    this.camera.position.set(16, 13.5, 19.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';

    container.appendChild(this.renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envTarget.texture;
    this.disposables.push(envTarget);
    pmremGenerator.dispose();

    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x5c7252, 0.92);
    this.hemiLight.position.set(0, 25, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3d6, 1.72);
    this.sunLight.position.set(18, 26, 14);
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 68;
    this.sunLight.shadow.camera.left = -22;
    this.sunLight.shadow.camera.right = 22;
    this.sunLight.shadow.camera.top = 22;
    this.sunLight.shadow.camera.bottom = -22;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0xc7d2fe, 0.6);
    this.rimLight.position.set(-16, 10, -18);
    this.scene.add(this.rimLight);

    // Warm street lantern & torchlight pools (castShadow = false for mobile speed)
    const warmCoords: Array<[number, number, number, number]> = [
      [0, 3.2, 0, 14], // Central Plaza
      [0, 2.8, -7.8, 12], // Town Hall steps
      [0, 2.6, 8.2, 12], // Park fountain
    ];
    for (const [lx, ly, lz, dist] of warmCoords) {
      const pt = new THREE.PointLight(0xfbbf24, 0, dist, 1.55);
      pt.position.set(lx, ly, lz);
      pt.castShadow = false;
      this.scene.add(pt);
      this.warmLights.push(pt);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 38;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.target.set(0, 0.8, 0);
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener('start', () => {
      this.cameraTargetGoal = null;
      if (this.followActive) {
        this.followActive = false;
        this.callbacks.onUserOrbitStart?.();
      }
    });

    this.buildEnvironment();
    this.buildLandmarks();
    this.syncStructures([], null);
    this.buildAgents(initialAgents);
    this.buildParticlesAndArc();
    this.setGraphicsQuality(initialQuality);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private buildEnvironment(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const cobbleTex = createCobbleTexture(maxAniso);
    this.disposables.push(cobbleTex);

    const groundGeo = new THREE.CircleGeometry(65, 48);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x739558,
      roughness: 0.94,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const plazaMat = new THREE.MeshStandardMaterial({
      map: cobbleTex,
      roughness: 0.88,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.8, 32), plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    const pathMat = new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const nsPath = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 18.5), pathMat);
    nsPath.rotation.x = -Math.PI / 2;
    nsPath.position.y = 0.018;
    nsPath.receiveShadow = true;
    const ewPath = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 2.3), pathMat);
    ewPath.rotation.x = -Math.PI / 2;
    ewPath.position.set(0, 0.018, -0.5);
    ewPath.receiveShadow = true;
    this.scene.add(nsPath, ewPath);

    const monumentMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.7, metalness: 0.1 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.25, 12), monumentMat);
    base.position.y = 0.125;
    base.castShadow = true;
    base.receiveShadow = true;
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 1.1, 8), monumentMat);
    obelisk.position.y = 0.78;
    obelisk.castShadow = true;
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 }),
    );
    orb.position.y = 1.5;
    orb.castShadow = true;
    this.scene.add(base, obelisk, orb);

    const treePositions: Array<[number, number]> = [];
    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2;
      const dist = 17.5 + (i % 3) * 3.8;
      treePositions.push([Math.cos(angle) * dist, Math.sin(angle) * dist]);
    }

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.4, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.88 });
    const foliageGeo = new THREE.ConeGeometry(1.15, 2.6, 7);
    this.foliageMat = createWindSwayMaterial(
      { color: 0xffffff, roughness: 0.85 },
      this.windUniforms,
      { swayScale: 0.15, heightMin: -1.3, heightRange: 2.6 },
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const foliage = new THREE.InstancedMesh(foliageGeo, this.foliageMat, treePositions.length);
    trunks.castShadow = true;
    foliage.castShadow = true;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    treePositions.forEach(([x, z], idx) => {
      const scale = 0.85 + ((idx * 37) % 30) / 100;
      dummy.position.set(x, 0.7 * scale, z);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(x, 2.35 * scale, z);
      dummy.updateMatrix();
      foliage.setMatrixAt(idx, dummy.matrix);

      const shade = idx % 3 === 0 ? 0x3f6e42 : idx % 3 === 1 ? 0x4d7c4a : 0x355e3b;
      tint.setHex(shade);
      foliage.setColorAt(idx, tint);
    });

    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    foliage.computeBoundingSphere();
    this.scene.add(trunks, foliage);

    this.hillMat = new THREE.MeshStandardMaterial({ color: 0x5c7c48, roughness: 0.95 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + 0.2;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(12 + (i % 3) * 4, 6 + (i % 2) * 3, 7), this.hillMat);
      hill.position.set(Math.cos(angle) * 44, 2.2, Math.sin(angle) * 44);
      hill.rotation.y = i;
      this.scene.add(hill);
    }

    this.detailsHandle = buildScatteredTownDetails(
      this.scene,
      this.lanternMaterials,
      this.windUniforms,
    );
    this.disposables.push(this.detailsHandle);
  }

  private buildLandmarks(): void {
    const shadowTex = createContactShadowTexture();
    this.sharedShadowTex = shadowTex;
    const awningTex = createAwningStripeTexture(this.renderer.capabilities.getMaxAnisotropy());
    this.disposables.push(shadowTex, awningTex);

    const townHall = buildTownHall(shadowTex, this.lanternMaterials);
    townHall.position.copy(LANDMARKS.town_hall.center);
    townHall.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.scene.add(townHall);
    this.clickableObjects.push(townHall);

    const workshop = buildWorkshop(shadowTex, this.lanternMaterials);
    workshop.position.copy(LANDMARKS.workshop.center);
    workshop.rotation.y = -Math.PI / 2;
    workshop.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.scene.add(workshop);
    this.clickableObjects.push(workshop);

    const market = buildMarket(shadowTex, awningTex, this.lanternMaterials);
    market.position.copy(LANDMARKS.market.center);
    market.rotation.y = Math.PI / 2;
    market.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.scene.add(market);
    this.clickableObjects.push(market);

    const parkBuilt = buildPark(shadowTex, this.lanternMaterials, this.waterUniforms);
    parkBuilt.group.position.copy(LANDMARKS.park.center);
    this.waterMesh = parkBuilt.waterMesh;
    this.waterJet = parkBuilt.waterJet;
    this.scene.add(parkBuilt.group);
    this.clickableObjects.push(parkBuilt.group);
  }

  private buildAgents(initialAgents: AgentRecord[]): void {
    const shadowTex = createContactShadowTexture();
    this.sharedRigAssets = createSharedRigAssets(shadowTex);
    this.disposables.push(shadowTex, this.sharedRigAssets);

    const capped = initialAgents.slice(0, MAX_TOWN_AGENTS);
    capped.forEach((agent, index) => {
      const rig = buildCharacter(agent, index, this.sharedRigAssets, false);
      this.scene.add(rig.root);
      this.rigs.set(agent.id, rig);
      this.clickableObjects.push(rig.root);
    });
  }

  private buildParticlesAndArc(): void {
    // 1. Weather Particle Cloud (160 particles reused for Rain, Snow, or Summer Fireflies)
    const count = 160;
    this.weatherPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.weatherPositions[i * 3] = (Math.random() - 0.5) * 34;
      this.weatherPositions[i * 3 + 1] = Math.random() * 14;
      this.weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    const weatherGeo = new THREE.BufferGeometry();
    weatherGeo.setAttribute('position', new THREE.BufferAttribute(this.weatherPositions, 3));
    this.weatherMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.16,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.weatherPoints = new THREE.Points(weatherGeo, this.weatherMat);
    this.weatherPoints.visible = false;
    this.weatherPoints.frustumCulled = false;
    this.scene.add(this.weatherPoints);

    // 2. Workshop Chimney Smoke Puffs (14 gentle motes)
    const smokeCount = 14;
    this.smokePositions = new Float32Array(smokeCount * 3);
    this.smokePhases = new Float32Array(smokeCount);
    for (let i = 0; i < smokeCount; i++) {
      this.smokePhases[i] = i / smokeCount;
      this.smokePositions[i * 3] = 11.2;
      this.smokePositions[i * 3 + 1] = 4.8 + (i / smokeCount) * 3.5;
      this.smokePositions[i * 3 + 2] = 0.7;
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      size: 0.42,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
    this.smokePoints.frustumCulled = false;
    this.scene.add(this.smokePoints);

    // 2b. Artisan Bakery Chimney Cozy Steam/Smoke Puffs (24 motes)
    const bSmokeCount = 24;
    this.bakerySmokePositions = new Float32Array(bSmokeCount * 3);
    this.bakerySmokePhases = new Float32Array(bSmokeCount);
    for (let i = 0; i < bSmokeCount; i++) {
      this.bakerySmokePhases[i] = i / bSmokeCount;
    }
    const bSmokeGeo = new THREE.BufferGeometry();
    bSmokeGeo.setAttribute('position', new THREE.BufferAttribute(this.bakerySmokePositions, 3));
    this.bakerySmokeMat = new THREE.PointsMaterial({
      color: 0xf8fafc,
      size: 0.46,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.bakerySmokePoints = new THREE.Points(bSmokeGeo, this.bakerySmokeMat);
    this.bakerySmokePoints.visible = false;
    this.bakerySmokePoints.frustumCulled = false;
    this.scene.add(this.bakerySmokePoints);

    // 3. Agent-to-Agent Communication Arc (24 segments)
    const arcSegs = 24;
    const arcPositions = new Float32Array((arcSegs + 1) * 3);
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
    this.commArcMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.commArcLine = new THREE.Line(arcGeo, this.commArcMat);
    this.commArcLine.visible = false;
    this.commArcLine.frustumCulled = false;
    this.scene.add(this.commArcLine);
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const nativeDpr = window.devicePixelRatio || 1;
    const targetDpr = this.isSoftwareGl
      ? 1
      : quality === 'low'
        ? 1
        : quality === 'medium'
          ? Math.min(nativeDpr, 1.35)
          : Math.min(nativeDpr, 1.75);

    this.renderer.setPixelRatio(targetDpr);
    this.renderer.setSize(width, height);

    const enableShadows = !this.isSoftwareGl && quality === 'high';
    this.renderer.shadowMap.enabled = enableShadows;
    this.sunLight.castShadow = enableShadows;
    this.renderer.shadowMap.needsUpdate = true;

    this.detailsHandle?.setDensityFactor(quality === 'low' ? 0.5 : 1.0);
    this.detailsHandle?.setLanternShadows(enableShadows);
    this.weatherPoints?.geometry.setDrawRange(0, quality === 'low' ? 80 : 160);
  }

  public setAtmosphere(timeOfDay: TimeOfDay, weather: WeatherMode): void {
    this.timeOfDay = timeOfDay;
    this.weatherMode = weather;

    if (weather === 'rain') {
      this.weatherPoints.visible = true;
      this.weatherMat.color.setHex(0xbae6fd);
      this.weatherMat.size = 0.14;
      this.weatherMat.opacity = 0.78;
    } else if (weather === 'winter') {
      this.weatherPoints.visible = true;
      this.weatherMat.color.setHex(0xf8fafc);
      this.weatherMat.size = 0.22;
      this.weatherMat.opacity = 0.88;
    } else {
      // Summer: crisp clear sky by day, gentle fireflies at dusk/night
      const evening = timeOfDay === 'twilight' || timeOfDay === 'night';
      this.weatherPoints.visible = evening;
      this.weatherMat.color.setHex(0xfde047);
      this.weatherMat.size = 0.22;
      this.weatherMat.opacity = 0.88;
    }
  }

  public setFollowActive(follow: boolean): void {
    this.followActive = follow;
    if (follow) {
      this.cameraTargetGoal = null;
    }
  }

  public triggerCommunicationArc(speakerId: AgentId, targetAgentName: string | null, accentHex: string): void {
    if (!targetAgentName) {
      this.commArcTimer = 0;
      this.commArcLine.visible = false;
      return;
    }
    let targetId: AgentId | null = null;
    this.rigs.forEach((rig) => {
      if (rig.name === targetAgentName) {
        targetId = rig.id;
      }
    });
    if (!targetId || targetId === speakerId) return;

    this.commSpeakerId = speakerId;
    this.commTargetId = targetId;
    this.commArcTimer = 4.5;
    this.commArcMat.color.set(accentHex);
    this.commArcLine.visible = true;
  }

  public syncStructures(
    structures: TownStructure[],
    selectedPlotId: PlotId | null,
  ): void {
    const byPlot = new Map<PlotId, TownStructure>();
    for (const s of structures) {
      byPlot.set(s.plotId, s);
    }

    let rebuiltAny = false;
    for (const plotId of ALL_PLOT_IDS) {
      const s = byPlot.get(plotId);
      const isSelected = selectedPlotId === plotId;
      const sig = s
        ? `${s.structureType}:${s.status}:${s.progress}:${s.tier}:${isSelected}`
        : `empty:${isSelected}`;

      if (this.plotSignatures.get(plotId) === sig) {
        continue;
      }

      rebuiltAny = true;
      this.plotSignatures.set(plotId, sig);

      const oldGroup = this.plotGroups.get(plotId);
      if (oldGroup) {
        this.scene.remove(oldGroup);
        const clickIdx = this.clickableObjects.indexOf(oldGroup);
        if (clickIdx !== -1) {
          this.clickableObjects.splice(clickIdx, 1);
        }
        disposeStructureGroup(oldGroup, this.lanternMaterials);
      }

      const meta = PLOT_META[plotId];
      let nextGroup: THREE.Group;
      if (!s) {
        nextGroup = buildEmptyPlotMesh(plotId, isSelected);
      } else if (s.status === 'building') {
        nextGroup = buildScaffoldingMesh(s, this.sharedShadowTex, isSelected);
      } else {
        nextGroup = buildCompletedStructureMesh(
          s,
          this.sharedShadowTex,
          this.lanternMaterials,
          isSelected,
          this.windUniforms,
        );
      }

      nextGroup.position.set(meta.x, 0, meta.z);
      // Orient building toward central Alderbrook Square
      nextGroup.rotation.y = Math.atan2(-meta.x, -meta.z);
      this.scene.add(nextGroup);
      this.plotGroups.set(plotId, nextGroup);
      this.clickableObjects.push(nextGroup);
    }

    if (rebuiltAny) {
      const rotors: THREE.Group[] = [];
      this.plotGroups.forEach((grp) => {
        if (grp.userData.windmillRotor) {
          rotors.push(grp.userData.windmillRotor as THREE.Group);
        }
      });
      this.windmillRotors = rotors;

      const chimneys: THREE.Vector3[] = [];
      for (const s of structures) {
        if (s.status === 'complete' && s.structureType === 'bakery') {
          const meta = PLOT_META[s.plotId];
          const rotY = Math.atan2(-meta.x, -meta.z);
          const pos = new THREE.Vector3(0.78, 3.05, -0.55)
            .applyAxisAngle(_yAxis, rotY)
            .add(new THREE.Vector3(meta.x, 0, meta.z));
          chimneys.push(pos);
        }
      }
      this.bakeryChimneys = chimneys;
    }
  }

  public syncAgents(
    agents: AgentRecord[],
    activeAgentId: AgentId | null,
    selectedAgentId: AgentId | null,
  ): void {
    this.activeAgentId = activeAgentId;
    this.selectedAgentId = selectedAgentId;

    const capped = agents.slice(0, MAX_TOWN_AGENTS);
    const activeIds = new Set(capped.map((a) => a.id));

    // Remove departed / reset agents cleanly without disposing shared geometries
    this.rigs.forEach((rig, id) => {
      if (!activeIds.has(id)) {
        this.scene.remove(rig.root);
        const clickIdx = this.clickableObjects.indexOf(rig.root);
        if (clickIdx !== -1) {
          this.clickableObjects.splice(clickIdx, 1);
        }
        for (const mat of rig.ownedMaterials) {
          mat.dispose();
        }
        this.rigs.delete(id);
      }
    });

    capped.forEach((agent, index) => {
      let rig = this.rigs.get(agent.id);
      if (!rig) {
        // Dynamically hired worker spawns right at Alderbrook Square and walks to post
        rig = buildCharacter(agent, index, this.sharedRigAssets, true);
        this.scene.add(rig.root);
        this.rigs.set(agent.id, rig);
        this.clickableObjects.push(rig.root);
      } else {
        rig.slotIndex = index;
      }

      rig.selectionRing.visible = agent.id === this.selectedAgentId;
      rig.activeRing.visible = agent.id === this.activeAgentId;

      if (rig.currentLocation !== agent.location || rig.currentPlotId !== agent.activePlotId) {
        const slot = getAgentSlotOffset(agent.id, rig.slotIndex, _slotOffset);
        let destBase = LANDMARKS[agent.location].gatherPoint;
        let slotScale = 1.0;

        if (agent.activePlotId && PLOT_META[agent.activePlotId]) {
          const pm = PLOT_META[agent.activePlotId];
          const len = Math.hypot(pm.x, pm.z) || 1;
          destBase = new THREE.Vector3(pm.x * (1 - 2.6 / len), 0, pm.z * (1 - 2.6 / len));
          slotScale = 0.65;
        }

        const finalPos = new THREE.Vector3(
          destBase.x + slot.x * slotScale,
          0,
          destBase.z + slot.z * slotScale,
        );
        const midPoint = new THREE.Vector3(
          PLAZA_CENTER.x + slot.x * 0.45,
          0,
          PLAZA_CENTER.z + slot.z * 0.45,
        );
        rig.waypoints = [midPoint, finalPos];
        rig.currentLocation = agent.location;
        rig.currentPlotId = agent.activePlotId;
      }
    });
  }

  public focusAgent(agentId: AgentId): void {
    const rig = this.rigs.get(agentId);
    if (rig) {
      this.cameraTargetGoal = new THREE.Vector3(
        rig.root.position.x,
        1.0,
        rig.root.position.z,
      );
    }
  }

  public focusLocation(locationId: LocationId): void {
    const cfg = LANDMARKS[locationId];
    if (cfg) {
      this.cameraTargetGoal = cfg.lookTarget.clone();
    }
  }

  public focusPlot(plotId: PlotId): void {
    const meta = PLOT_META[plotId];
    if (meta) {
      this.cameraTargetGoal = new THREE.Vector3(meta.x, 1.1, meta.z);
    }
  }

  public resetCamera(): void {
    this.cameraTargetGoal = new THREE.Vector3(0, 0.8, 0);
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    const onResize = () => {
      if (this.disposed) return;
      const w = Math.max(this.container.clientWidth, 1);
      const h = Math.max(this.container.clientHeight, 1);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.hypot(dx, dy) > 8) return;

      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const hits = this.raycaster.intersectObjects(this.clickableObjects, true);
      if (hits.length === 0) return;

      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (obj.userData?.agentId) {
          this.callbacks.onSelectAgent(obj.userData.agentId as AgentId);
          return;
        }
        if (obj.userData?.plotId) {
          this.callbacks.onSelectPlot(obj.userData.plotId as PlotId);
          return;
        }
        if (obj.userData?.locationId) {
          this.callbacks.onSelectLocation(obj.userData.locationId as LocationId);
          return;
        }
        obj = obj.parent;
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.();
    };

    const onContextRestored = () => {
      this.callbacks.onContextRestored?.();
    };

    window.addEventListener('resize', onResize);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    this.disposables.push({
      dispose: () => {
        window.removeEventListener('resize', onResize);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
      },
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.elapsedTime;

      // 1. Update Animated Shader Uniforms & Smooth Time-of-Day / Storm Lighting
      this.windUniforms.uTime.value = elapsed;
      this.waterUniforms.uTime.value = elapsed;
      const targetWind = this.weatherMode === 'summer' ? 1.0 : 1.65;
      this.windUniforms.uWindStrength.value = THREE.MathUtils.lerp(
        this.windUniforms.uWindStrength.value,
        targetWind,
        1 - Math.exp(-2.5 * delta),
      );

      const preset = ATMOSPHERE_PRESETS[this.timeOfDay];
      const atmoLerp = 1 - Math.exp(-2.8 * delta);

      _targetColor.setHex(preset.skyHex);
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.lerp(_targetColor, atmoLerp);
      }
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.lerp(_targetColor, atmoLerp);
      }

      _targetColor.setHex(preset.hemiSkyHex);
      this.hemiLight.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(preset.hemiGroundHex);
      this.hemiLight.groundColor.lerp(_targetColor, atmoLerp);
      this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, preset.hemiIntensity, atmoLerp);

      _targetColor.setHex(preset.sunHex);
      this.sunLight.color.lerp(_targetColor, atmoLerp);
      const sunStormDim = this.weatherMode === 'rain' ? 0.72 : 1.0;
      this.sunLight.intensity = THREE.MathUtils.lerp(
        this.sunLight.intensity,
        preset.sunIntensity * sunStormDim,
        atmoLerp,
      );
      this.sunLight.position.lerp(preset.sunPos, atmoLerp);

      _targetColor.setHex(preset.rimHex);
      this.rimLight.color.lerp(_targetColor, atmoLerp);
      this.rimLight.intensity = THREE.MathUtils.lerp(this.rimLight.intensity, preset.rimIntensity, atmoLerp);

      // Automatically brighten glowing windows, street lanterns & torches at dusk, night, or storms
      const stormEmissive = this.weatherMode === 'rain' ? 1.5 : this.weatherMode === 'winter' ? 1.3 : 0;
      const targetEmissive = Math.max(preset.lanternEmissive, stormEmissive);
      for (const mat of this.lanternMaterials) {
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targetEmissive, atmoLerp);
      }

      const isNightOrDusk = this.timeOfDay === 'twilight' || this.timeOfDay === 'night';
      const isStorm = this.weatherMode === 'rain' || this.weatherMode === 'winter';
      const baseWarmGoal =
        this.graphicsQuality === 'low'
          ? 0
          : isNightOrDusk
            ? 2.7
            : isStorm
              ? 1.9
              : this.timeOfDay === 'dawn'
                ? 0.65
                : 0;
      for (let i = 0; i < this.warmLights.length; i++) {
        const pt = this.warmLights[i];
        const allowedForQuality = this.graphicsQuality === 'high' || i < 2;
        const flicker = 1 + Math.sin(elapsed * 5.2 + i * 1.9) * 0.05;
        const goal = allowedForQuality ? baseWarmGoal * flicker : 0;
        pt.intensity = THREE.MathUtils.lerp(pt.intensity, goal, atmoLerp);
      }

      // 1b. Seasonal Ground & Foliage Palette Shift (Summer / Rain / Winter)
      const groundTarget =
        this.weatherMode === 'winter'
          ? 0xcbd5e1
          : this.weatherMode === 'rain'
            ? 0x557548
            : 0x739558;
      const foliageTarget =
        this.weatherMode === 'winter'
          ? 0xdbeafe
          : this.weatherMode === 'rain'
            ? 0xdbeee4
            : 0xffffff;
      const hillTarget =
        this.weatherMode === 'winter'
          ? 0xb4c6d9
          : this.weatherMode === 'rain'
            ? 0x476640
            : 0x5c7c48;

      _targetColor.setHex(groundTarget);
      this.groundMat.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(foliageTarget);
      this.foliageMat.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(hillTarget);
      this.hillMat.color.lerp(_targetColor, atmoLerp);

      // 2. Smooth camera tracking (Follow Mode or Focus Goal)
      if (this.followActive && this.activeAgentId) {
        const followRig = this.rigs.get(this.activeAgentId);
        if (followRig) {
          this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, followRig.root.position.x, 4.5, delta);
          this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, 1.1, 4.5, delta);
          this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, followRig.root.position.z, 4.5, delta);
        }
      } else if (this.cameraTargetGoal) {
        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.cameraTargetGoal.x, 6, delta);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.cameraTargetGoal.y, 6, delta);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.cameraTargetGoal.z, 6, delta);
        if (this.controls.target.distanceTo(this.cameraTargetGoal) < 0.04) {
          this.cameraTargetGoal = null;
        }
      }

      this.controls.update();

      // 3. Park Fountain Shimmering Ripples, Water Jet & Built Windmill Sails
      if (this.waterMesh) {
        this.waterMesh.position.y = 0.45 + Math.sin(elapsed * 2.2) * 0.006;
      }
      if (this.waterJet) {
        const jetPulse = 1 + Math.sin(elapsed * 6.4) * 0.12;
        this.waterJet.scale.set(1, jetPulse, 1);
        this.waterJet.rotation.y = elapsed * 1.4;
      }
      const rotorSpeed = this.weatherMode === 'summer' ? 1.65 : 1.15;
      for (const rotor of this.windmillRotors) {
        rotor.rotation.z -= delta * rotorSpeed;
      }

      // 4. Workshop Chimney Smoke
      const smokeAttr = this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < this.smokePhases.length; i++) {
        this.smokePhases[i] = (this.smokePhases[i] + delta * 0.22) % 1;
        const p = this.smokePhases[i];
        this.smokePositions[i * 3] = 11.2 + Math.sin(elapsed * 1.4 + i) * 0.25 + p * 0.8;
        this.smokePositions[i * 3 + 1] = 4.8 + p * 3.8;
        this.smokePositions[i * 3 + 2] = 0.7 + Math.cos(elapsed * 1.2 + i) * 0.2;
      }
      smokeAttr.needsUpdate = true;

      // 4b. Artisan Bakery Chimney Cozy Steam/Smoke (always active when Bakery built, richer in Rain & Winter)
      const showBakerySteam = this.bakeryChimneys.length > 0;
      this.bakerySmokePoints.visible = showBakerySteam;
      if (showBakerySteam) {
        this.bakerySmokeMat.opacity = this.weatherMode === 'summer' ? 0.36 : 0.6;
        const bAttr = this.bakerySmokePoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < this.bakerySmokePhases.length; i++) {
          this.bakerySmokePhases[i] = (this.bakerySmokePhases[i] + delta * 0.28) % 1;
          const p = this.bakerySmokePhases[i];
          const origin = this.bakeryChimneys[i % this.bakeryChimneys.length];
          this.bakerySmokePositions[i * 3] = origin.x + Math.sin(elapsed * 1.8 + i) * 0.18 + p * 0.45;
          this.bakerySmokePositions[i * 3 + 1] = origin.y + p * 2.8;
          this.bakerySmokePositions[i * 3 + 2] = origin.z + Math.cos(elapsed * 1.5 + i) * 0.16;
        }
        bAttr.needsUpdate = true;
      }

      // 5. Weather Particles (Rain / Winter Snow / Summer Evening Fireflies)
      if (this.weatherPoints.visible) {
        const wAttr = this.weatherPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        const count = this.weatherPositions.length / 3;
        if (this.weatherMode === 'rain') {
          for (let i = 0; i < count; i++) {
            this.weatherPositions[i * 3 + 1] -= delta * 14;
            this.weatherPositions[i * 3] -= delta * 1.6;
            if (this.weatherPositions[i * 3 + 1] < 0) {
              this.weatherPositions[i * 3 + 1] = 13 + (i % 3);
              this.weatherPositions[i * 3] = ((i * 73) % 34) - 17;
            }
          }
        } else if (this.weatherMode === 'winter') {
          for (let i = 0; i < count; i++) {
            this.weatherPositions[i * 3 + 1] -= delta * 2.4;
            this.weatherPositions[i * 3] += Math.sin(elapsed * 1.2 + i) * delta * 0.65;
            this.weatherPositions[i * 3 + 2] += Math.cos(elapsed * 0.9 + i) * delta * 0.35;
            if (this.weatherPositions[i * 3 + 1] < 0) {
              this.weatherPositions[i * 3 + 1] = 13 + (i % 3);
              this.weatherPositions[i * 3] = ((i * 73) % 34) - 17;
              this.weatherPositions[i * 3 + 2] = ((i * 41) % 34) - 17;
            }
          }
        } else {
          for (let i = 0; i < count; i++) {
            this.weatherPositions[i * 3] += Math.sin(elapsed * 0.9 + i) * delta * 0.5;
            this.weatherPositions[i * 3 + 1] = 0.6 + ((i * 19) % 40) / 10 + Math.sin(elapsed * 1.6 + i * 0.7) * 0.45;
            this.weatherPositions[i * 3 + 2] += Math.cos(elapsed * 0.8 + i) * delta * 0.5;
          }
        }
        wAttr.needsUpdate = true;
      }

      // 6. Agent Movement & Kinematics (lively Summer socializing speed, brisk Rain shelter walk)
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const labelPositions = {} as Record<AgentId, ProjectedLabel>;
      const worldCoords = {} as Record<AgentId, AgentWorldCoord>;
      const walkSpeed =
        this.weatherMode === 'summer' ? 4.1 : this.weatherMode === 'rain' ? 3.5 : 3.0;

      this.rigs.forEach((rig) => {
        if (rig.waypoints.length > 0) {
          const target = rig.waypoints[0];
          _moveVec.subVectors(target, rig.root.position);
          _moveVec.y = 0;
          const dist = _moveVec.length();

          if (dist < 0.12) {
            rig.root.position.x = target.x;
            rig.root.position.z = target.z;
            rig.waypoints.shift();
            rig.isMoving = rig.waypoints.length > 0;
          } else {
            rig.isMoving = true;
            _moveVec.normalize();
            const step = Math.min(dist, walkSpeed * delta);
            rig.root.position.addScaledVector(_moveVec, step);

            rig.facingAngle = Math.atan2(_moveVec.x, _moveVec.z);
            _targetQuat.setFromAxisAngle(_yAxis, rig.facingAngle);
            rig.root.quaternion.slerp(_targetQuat, 1 - Math.exp(-10 * delta));
          }
        } else {
          rig.isMoving = false;
          let targetX = LANDMARKS[rig.currentLocation].center.x;
          let targetZ = LANDMARKS[rig.currentLocation].center.z;
          if (rig.currentPlotId && PLOT_META[rig.currentPlotId]) {
            targetX = PLOT_META[rig.currentPlotId].x;
            targetZ = PLOT_META[rig.currentPlotId].z;
          }
          const desiredYaw = Math.atan2(
            targetX - rig.root.position.x,
            targetZ - rig.root.position.z,
          );
          _targetQuat.setFromAxisAngle(_yAxis, desiredYaw);
          rig.root.quaternion.slerp(_targetQuat, 1 - Math.exp(-4 * delta));
        }

        if (rig.isMoving) {
          rig.walkPhase += delta * (walkSpeed * 3.25);
          const swing = Math.sin(rig.walkPhase) * 0.55;
          rig.leftLegPivot.rotation.x = swing;
          rig.rightLegPivot.rotation.x = -swing;
          rig.leftArmPivot.rotation.x = -swing * 0.75;
          rig.rightArmPivot.rotation.x = swing * 0.75;
          rig.bodyGroup.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.06;
        } else {
          const settle = 1 - Math.exp(-8 * delta);
          rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0, settle);
          rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0, settle);
          rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, 0, settle);
          rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
            rig.rightArmPivot.rotation.x,
            rig.id === this.activeAgentId ? -0.35 + Math.sin(elapsed * 4.5) * 0.15 : 0,
            settle,
          );
          rig.bodyGroup.position.y = Math.sin(elapsed * 2 + rig.walkPhase) * 0.015;
          rig.headGroup.rotation.x =
            rig.id === this.activeAgentId ? Math.sin(elapsed * 5) * 0.08 : 0;
        }

        if (rig.spawnTimer > 0) {
          rig.spawnTimer = Math.max(0, rig.spawnTimer - delta);
          const s = 1 + Math.sin((1 - rig.spawnTimer / 0.85) * Math.PI) * 0.16;
          rig.root.scale.set(s, s, s);
        } else {
          rig.root.scale.set(1, 1, 1);
        }

        if (rig.activeRing.visible) {
          const s = 1 + Math.sin(elapsed * 4) * 0.08;
          rig.activeRing.scale.set(s, s, 1);
        }

        _projVec.set(rig.root.position.x, 2.38, rig.root.position.z);
        _projVec.project(this.camera);
        const visible = _projVec.z > -1 && _projVec.z < 1;
        labelPositions[rig.id] = {
          x: ((_projVec.x + 1) / 2) * width,
          y: ((-_projVec.y + 1) / 2) * height,
          visible,
        };
        worldCoords[rig.id] = {
          x: rig.root.position.x,
          z: rig.root.position.z,
        };
      });

      // 7. Communication Arc Beam Update
      if (this.commArcTimer > 0 && this.commSpeakerId && this.commTargetId) {
        this.commArcTimer = Math.max(0, this.commArcTimer - delta);
        const spk = this.rigs.get(this.commSpeakerId);
        const tgt = this.rigs.get(this.commTargetId);
        if (spk && tgt) {
          _arcStart.set(spk.root.position.x, 2.1, spk.root.position.z);
          _arcEnd.set(tgt.root.position.x, 2.1, tgt.root.position.z);
          _arcMid.addVectors(_arcStart, _arcEnd).multiplyScalar(0.5);
          _arcMid.y += 2.6;

          const attr = this.commArcLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          const segs = 24;
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const omt = 1 - t;
            const x = omt * omt * _arcStart.x + 2 * omt * t * _arcMid.x + t * t * _arcEnd.x;
            const y = omt * omt * _arcStart.y + 2 * omt * t * _arcMid.y + t * t * _arcEnd.y;
            const z = omt * omt * _arcStart.z + 2 * omt * t * _arcMid.z + t * t * _arcEnd.z;
            attr.setXYZ(i, x, y, z);
          }
          attr.needsUpdate = true;
          this.commArcMat.opacity = Math.min(0.85, this.commArcTimer / 1.5);
        }
        if (this.commArcTimer <= 0) {
          this.commArcLine.visible = false;
        }
      }

      this.callbacks.onLabelUpdate?.(labelPositions);
      if (elapsed - this.lastMinimapEmit > 0.12) {
        this.lastMinimapEmit = elapsed;
        this.callbacks.onMinimapUpdate?.(worldCoords);
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = window.requestAnimationFrame(tick);
      }
    };

    this.frameId = window.requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.controls.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints || (obj as THREE.Line).isLine) {
        const renderable = obj as THREE.Mesh | THREE.Points | THREE.Line;
        renderable.geometry?.dispose();
        if (Array.isArray(renderable.material)) {
          renderable.material.forEach((m) => m.dispose());
        } else {
          renderable.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
