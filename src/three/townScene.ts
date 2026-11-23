import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ALL_PLOT_IDS,
  BIOME_META,
  createDefaultEnemyRaidState,
  getAvailablePlotIds,
  isDefenseStructure,
  isHospitalStructure,
  MAX_TOWN_AGENTS,
  PLOT_META,
  type AgentId,
  type AgentRecord,
  type BiomeId,
  type CameraMode,
  type DecorPackId,
  type EnemyRaidState,
  type GraphicsQuality,
  type HatStyle,
  type LocationId,
  type PlotId,
  type TimeOfDay,
  type TownStructure,
  type TownTheme,
  type WeatherMode,
} from '../types/town.ts';
import {
  buildExpandableBiomesAndRoads,
  buildScatteredTownDetails,
  createClothWaveMaterial,
  createRipplingWaterMaterial,
  createWindSwayMaterial,
  type TownDetailsHandle,
  type TownExpansionHandle,
  type WaterUniforms,
  type WindUniforms,
} from './townEnvironment.ts';
import { buildTownLifeAndDecor, type TownLifeHandle } from './townLife.ts';
import {
  buildTownRaidersSystem,
  RAIDER_CAMP_POS,
  type DefenseTowerAnchor,
  type TownRaidersHandle,
} from './townRaiders.ts';
import { buildTownRailway, type TownRailwayHandle } from './townRailway.ts';
import {
  buildCompletedStructureMesh,
  buildEmptyPlotMesh,
  buildScaffoldingMesh,
  buildSignalRelayLandmark,
  disposeStructureGroup,
  type SignalRelayHandle,
} from './townStructures.ts';
import {
  applyThemeToMaterial,
  applyThemeToObjectTree,
  createThemedAwningTexture,
  getThemeAtmosphere,
  tagThemeMaterial,
  TREE_CANOPY_PALETTES,
} from './townThemes.ts';

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
  onToggleAgentPov?: (agentId: AgentId) => void;
  onToggleTrainPov?: (seat: 'cab' | 'passenger') => void;
  onSelectLocation: (locationId: LocationId) => void;
  onSelectPlot: (plotId: PlotId) => void;
  onSelectSignalRelay?: () => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onLabelUpdate?: (positions: Record<AgentId, ProjectedLabel>) => void;
  onMinimapUpdate?: (coords: Record<AgentId, AgentWorldCoord>) => void;
  onUserOrbitStart?: () => void;
  onRaiderImpact?: (x: number, z: number) => void;
  onDefenseHitCamp?: (damage: number) => void;
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

// Atmosphere presets are resolved dynamically via getThemeAtmosphere(theme, timeOfDay, weather)

interface CutawayEntry {
  id: string;
  center: THREE.Vector3;
  triggerRadius: number;
  roofMaterials: THREE.MeshStandardMaterial[];
  fireMaterials: THREE.MeshStandardMaterial[];
  currentOpacity: number;
}

const RESIDENTIAL_HOUSES: Array<{ id: string; x: number; z: number }> = [
  { id: 'house:west_cottage', x: -13.8, z: 6.2 },
  { id: 'house:east_cottage', x: 13.8, z: 6.2 },
];

const SIGNAL_RELAY_POS = new THREE.Vector3(10.6, 0, 12.6);

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
  injuredBadgeGroup: THREE.Group;
  isInjured: boolean;
  ownedMaterials: THREE.Material[];
  waypoints: THREE.Vector3[];
  homeAnchor: THREE.Vector3;
  currentLocation: LocationId;
  currentPlotId: PlotId | null;
  walkPhase: number;
  idleStrollTimer: number;
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
  crossBadgeBgGeo: THREE.CylinderGeometry;
  crossBarHGeo: THREE.BoxGeometry;
  crossBarVGeo: THREE.BoxGeometry;
  skinMat: THREE.MeshStandardMaterial;
  bootMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshStandardMaterial;
  metalMat: THREE.MeshStandardMaterial;
  defaultPantsMat: THREE.MeshStandardMaterial;
  crossWhiteMat: THREE.MeshBasicMaterial;
  crossRedMat: THREE.MeshBasicMaterial;
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
  const crossBadgeBgGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10);
  const crossBarHGeo = new THREE.BoxGeometry(0.26, 0.08, 0.07);
  const crossBarVGeo = new THREE.BoxGeometry(0.08, 0.26, 0.07);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xfde2c8, roughness: 0.62, metalness: 0.02 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.55, metalness: 0.1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.24, metalness: 0.88 });
  const defaultPantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75, metalness: 0.05 });
  const crossWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const crossRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

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
    crossBadgeBgGeo,
    crossBarHGeo,
    crossBarVGeo,
  ];
  const materials = [
    shadowMat,
    selectionMat,
    skinMat,
    bootMat,
    eyeMat,
    metalMat,
    defaultPantsMat,
    crossWhiteMat,
    crossRedMat,
  ];

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
    crossBadgeBgGeo,
    crossBarHGeo,
    crossBarVGeo,
    skinMat,
    bootMat,
    eyeMat,
    metalMat,
    defaultPantsMat,
    crossWhiteMat,
    crossRedMat,
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
const _povForward = new THREE.Vector3();
const _povEye = new THREE.Vector3();
const _povLookTarget = new THREE.Vector3();
const _turretWorldPos = new THREE.Vector3();

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

function createFireflyTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(254, 240, 138, 0.85)');
    grad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Themed market awning textures are generated via createThemedAwningTexture() in townThemes.ts

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

function addHollowLandmarkWalls(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  baseY: number,
  thick: number,
  wallMat: THREE.Material,
  floorMat: THREE.Material,
): void {
  const cy = baseY + h / 2;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - thick * 0.4, 0.06, d - thick * 0.4), floorMat);
  floor.position.set(0, baseY + 0.03, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), wallMat);
  back.position.set(0, cy, -d / 2 + thick / 2);
  const front = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), wallMat);
  front.position.set(0, cy, d / 2 - thick / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(thick, h, d - thick * 2), wallMat);
  left.position.set(-w / 2 + thick / 2, cy, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(thick, h, d - thick * 2), wallMat);
  right.position.set(w / 2 - thick / 2, cy, 0);
  group.add(floor, back, front, left, right);
}

function addInteriorTableAndChairs(
  group: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  w: number,
  d: number,
  woodMat: THREE.Material,
  chairCount = 2,
): void {
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), woodMat);
  top.position.set(x, baseY + 0.46, z);
  group.add(top);
  const legGeo = new THREE.BoxGeometry(0.08, 0.44, 0.08);
  for (const [lx, lz] of [
    [-w * 0.4, -d * 0.36],
    [w * 0.4, -d * 0.36],
    [-w * 0.4, d * 0.36],
    [w * 0.4, d * 0.36],
  ] as Array<[number, number]>) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(x + lx, baseY + 0.22, z + lz);
    group.add(leg);
  }
  const seatGeo = new THREE.BoxGeometry(0.32, 0.26, 0.32);
  for (let i = 0; i < chairCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const offset = chairCount > 2 ? (i < 2 ? -w * 0.22 : w * 0.22) : 0;
    const chair = new THREE.Mesh(seatGeo, woodMat);
    chair.position.set(x + offset, baseY + 0.13, z + side * (d * 0.5 + 0.24));
    group.add(chair);
  }
}

function addInteriorShelf(
  group: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  rotY: number,
  woodMat: THREE.Material,
  itemMat: THREE.Material,
): void {
  const sg = new THREE.Group();
  sg.position.set(x, baseY, z);
  sg.rotation.y = rotY;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 0.06), woodMat);
  back.position.set(0, 0.625, -0.1);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.24), woodMat);
  s1.position.set(0, 0.42, 0);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.24), woodMat);
  s2.position.set(0, 0.84, 0);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.16), itemMat);
  b1.position.set(-0.26, 0.57, 0.01);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.16), itemMat);
  b2.position.set(0.18, 0.55, 0.01);
  const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.15), itemMat);
  b3.position.set(-0.18, 1.0, 0.01);
  const b4 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.15), itemMat);
  b4.position.set(0.24, 0.97, 0.01);
  sg.add(back, s1, s2, b1, b2, b3, b4);
  group.add(sg);
}

function addInteriorBed(
  group: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  rotY: number,
  woodMat: THREE.Material,
  blanketMat: THREE.Material,
  linenMat: THREE.Material,
): void {
  const bg = new THREE.Group();
  bg.position.set(x, baseY, z);
  bg.rotation.y = rotY;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.22, 1.28), woodMat);
  frame.position.set(0, 0.14, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.52, 0.09), woodMat);
  head.position.set(0, 0.3, -0.6);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 1.14), linenMat);
  mattress.position.set(0, 0.3, 0.02);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.17, 0.78), blanketMat);
  blanket.position.set(0, 0.32, 0.2);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.26), linenMat);
  pillow.position.set(0, 0.42, -0.38);
  bg.add(frame, head, mattress, blanket, pillow);
  group.add(bg);
}

function createTownHallSignTexture(townName: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 112);

    const display = (townName.trim() || 'ALDERBROOK').toUpperCase().slice(0, 22);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(display, 256, 54);

    ctx.fillStyle = '#fcd34d';
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('TOWN HALL', 256, 94);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildStarterResourcesCluster(shadowTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  group.name = 'starter:resources';
  group.position.set(-4.6, 0, -7.8);

  addContactShadow(group, shadowTex, 2.1, 1.8);

  const logMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.86, metalness: 0.04 }),
    'wood',
  );
  const stoneMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88, metalness: 0.05 }),
    'stone',
  );
  const crateMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.78, metalness: 0.06 }),
    'wood',
  );
  const strapMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 }),
    'darkWood',
  );

  // Stacked starter timber logs (shared CylinderGeometry)
  const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.35, 7);
  const logCoords: Array<[number, number, number]> = [
    [-0.45, 0.14, -0.35],
    [-0.14, 0.14, -0.35],
    [0.17, 0.14, -0.35],
    [-0.3, 0.36, -0.35],
    [0.01, 0.36, -0.35],
    [-0.14, 0.58, -0.35],
  ];
  for (const [lx, ly, lz] of logCoords) {
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.x = Math.PI / 2;
    log.position.set(lx, ly, lz);
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);
  }

  // Quarry stone starter blocks (shared BoxGeometry)
  const stoneGeo = new THREE.BoxGeometry(0.46, 0.32, 0.44);
  const stoneCoords: Array<[number, number, number, number]> = [
    [0.68, 0.16, -0.15, 0.18],
    [0.98, 0.16, 0.25, -0.25],
    [0.82, 0.48, 0.05, 0.42],
  ];
  for (const [sx, sy, sz, ry] of stoneCoords) {
    const block = new THREE.Mesh(stoneGeo, stoneMat);
    block.position.set(sx, sy, sz);
    block.rotation.y = ry;
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  }

  // Two starter supply crates with iron straps
  const crateGeo = new THREE.BoxGeometry(0.54, 0.54, 0.54);
  const strapGeo = new THREE.BoxGeometry(0.56, 0.08, 0.56);
  const crateCoords: Array<[number, number, number, number]> = [
    [-0.35, 0.27, 0.58, 0.2],
    [0.24, 0.27, 0.62, -0.14],
  ];
  for (const [cx, cy, cz, ry] of crateCoords) {
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(cx, cy, cz);
    crate.rotation.y = ry;
    crate.castShadow = true;
    crate.receiveShadow = true;
    const strap = new THREE.Mesh(strapGeo, strapMat);
    strap.position.set(cx, cy, cz);
    strap.rotation.y = ry;
    group.add(crate, strap);
  }

  return group;
}

function buildTownHall(
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
  windUniforms: WindUniforms,
  initialTownName = 'Alderbrook',
): {
  group: THREE.Group;
  roofMaterials: THREE.MeshStandardMaterial[];
  fireMaterials: THREE.MeshStandardMaterial[];
  signMat: THREE.MeshStandardMaterial;
  signTex: THREE.CanvasTexture;
} {
  const group = new THREE.Group();
  group.name = 'landmark:town_hall';
  group.userData = { locationId: 'town_hall' };

  const stoneMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xe2dcd0, roughness: 0.85, metalness: 0.05 }),
    'wall',
  );
  const trimMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.65, metalness: 0.1 }),
    'trim',
  );
  // Dedicated cutaway roof/tower materials so Town Hall roof fades independently to opacity 0.15
  const roofMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.55, metalness: 0.18 }),
    'roofPrimary',
  );
  const towerStoneMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xe2dcd0, roughness: 0.85, metalness: 0.05 }),
    'wall',
  );
  const finialGoldMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 }),
    'gold',
  );
  const goldMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 }),
    'gold',
  );
  const doorMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.72, metalness: 0.05 }),
    'wood',
  );
  const floorMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.84, metalness: 0.04 }),
    'wood',
  );
  const hearthStoneMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }),
    'stone',
  );
  const furnitureWoodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x6b3510, roughness: 0.76 }),
    'darkWood',
  );
  const scrollMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.78 });
  const bookAccentMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.62 }),
    'banner',
  );
  const fireGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf97316,
    emissiveIntensity: 1.65,
    roughness: 0.22,
  });
  const clockMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    }),
    'window',
  );
  lanternMats.push(clockMat);

  addContactShadow(group, shadowTex, 3.8, 3.0);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.35, 4.4), trimMat);
  plinth.position.y = 0.175;
  group.add(plinth);

  // Hollow 4 exterior walls + wooden council chamber floor
  addHollowLandmarkWalls(group, 5.2, 2.8, 3.6, 0.35, 0.22, stoneMat, floorMat);

  // --- Detailed Low-Poly Town Hall Interior ---
  // 1. Warm Stone Council Fireplace centered on back wall
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.35, 0.62), hearthStoneMat);
  hearth.position.set(0, 1.05, -1.28);
  const mantle = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.14, 0.72), furnitureWoodMat);
  mantle.position.set(0, 1.78, -1.26);
  const fireLogs = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.22), fireGlowMat);
  fireLogs.position.set(0, 0.72, -0.98);
  group.add(hearth, mantle, fireLogs);

  // 2. Grand Oak Council Table, Parchment Map & 4 Chairs
  addInteriorTableAndChairs(group, 0, 0.38, 0.22, 2.1, 0.96, furnitureWoodMat, 4);
  const scroll = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.42), scrollMat);
  scroll.position.set(-0.2, 0.9, 0.22);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 6), goldMat);
  candle.position.set(0.45, 0.99, 0.22);
  group.add(scroll, candle);

  // 3. Bookshelves along left & right council walls
  addInteriorShelf(group, -2.26, 0.38, -0.1, Math.PI / 2, furnitureWoodMat, bookAccentMat);
  addInteriorShelf(group, 2.26, 0.38, -0.1, -Math.PI / 2, furnitureWoodMat, bookAccentMat);

  // Front Portico Columns & Grand Door
  const colGeo = new THREE.CylinderGeometry(0.14, 0.17, 2.6, 10);
  [-1.6, -0.65, 0.65, 1.6].forEach((x) => {
    const col = new THREE.Mesh(colGeo, trimMat);
    col.position.set(x, 1.65, 1.95);
    group.add(col);
  });

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.15), doorMat);
  door.position.set(0, 1.2, 1.82);
  group.add(door);

  // Cloth-Wave Town Hall Ceremonial Banners flanking the portico
  const bannerGeo = new THREE.PlaneGeometry(0.56, 1.42, 4, 10);
  [-2.18, 2.18].forEach((bx, idx) => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 6), goldMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(bx, 2.74, 1.94);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.28), goldMat);
    bracket.position.set(bx, 2.74, 1.82);
    const bannerMat = tagThemeMaterial(
      createClothWaveMaterial(
        { color: 0xb91c1c, roughness: 0.56, metalness: 0.08 },
        windUniforms,
        { waveAmp: 0.09, waveFreq: 5.8, phaseOffset: idx * 1.9 },
      ),
      'banner',
    );
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(bx, 2.02, 1.96);
    group.add(rod, bracket, banner);
  });

  // Cutaway Roof & Clock Tower Spire
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 1.6, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.15 + 0.8;
  group.add(roof);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), towerStoneMat);
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

  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), finialGoldMat);
  finial.position.set(0, 6.75, 0.2);
  group.add(finial);

  // Dynamic Town Nameplate Plaque above Portico
  const signTex = createTownHallSignTexture(initialTownName);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    roughness: 0.45,
    metalness: 0.12,
  });
  const signBacking = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.68, 0.1), goldMat);
  signBacking.position.set(0, 2.98, 1.98);
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.56), signMat);
  signFace.position.set(0, 2.98, 2.04);
  group.add(signBacking, signFace);

  return {
    group,
    roofMaterials: [roofMat, towerStoneMat, clockMat, finialGoldMat],
    fireMaterials: [fireGlowMat],
    signMat,
    signTex,
  };
}

function buildWorkshop(
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
): {
  group: THREE.Group;
  roofMaterials: THREE.MeshStandardMaterial[];
  fireMaterials: THREE.MeshStandardMaterial[];
} {
  const group = new THREE.Group();
  group.name = 'landmark:workshop';
  group.userData = { locationId: 'workshop' };

  const brickMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.88, metalness: 0.04 }),
    'brick',
  );
  const chimneyBrickMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.88, metalness: 0.04 }),
    'brick',
  );
  const timberMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78, metalness: 0.05 }),
    'wood',
  );
  const stoneFloorMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 }),
    'stone',
  );
  const roofMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.58, metalness: 0.15 }),
    'roofSecondary',
  );
  const ironMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.85 }),
    'metal',
  );
  const blanketMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.74 }),
    'crate',
  );
  const linenMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.82 });
  const forgeFireMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf97316,
    emissiveIntensity: 1.7,
    roughness: 0.22,
  });
  const glowMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.3,
    }),
    'window',
  );
  lanternMats.push(glowMat);

  addContactShadow(group, shadowTex, 3.2, 2.8);

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 3.6), stoneFloorMat);
  base.position.y = 0.15;
  group.add(base);

  // Hollow 4 brick exterior walls + stone floor
  addHollowLandmarkWalls(group, 4.2, 2.2, 3.2, 0.3, 0.18, brickMat, stoneFloorMat);

  // --- Detailed Low-Poly Workshop Interior ---
  // 1. Glowing Blacksmith Forge Hearth beneath the chimney
  const forgeBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.88, 0.86), stoneFloorMat);
  forgeBase.position.set(1.15, 0.76, -0.78);
  const forgeCoals = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.52), forgeFireMat);
  forgeCoals.position.set(1.15, 1.24, -0.76);
  group.add(forgeBase, forgeCoals);

  // 2. Sturdy Wooden Workbench Table & Tool Shelf
  addInteriorTableAndChairs(group, -0.1, 0.33, 0.52, 1.35, 0.62, timberMat, 1);
  addInteriorShelf(group, 0.0, 0.33, -1.28, 0, timberMat, ironMat);

  // 3. Rest Cot / Bed in the quiet corner
  addInteriorBed(group, -1.35, 0.33, -0.68, 0, timberMat, blanketMat, linenMat);

  // Timber corner corner-beams (hollow-safe corner posts)
  for (const [bx, bz] of [
    [-2.02, -1.52],
    [2.02, -1.52],
    [-2.02, 1.52],
    [2.02, 1.52],
  ] as Array<[number, number]>) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.25, 0.22), timberMat);
    beam.position.set(bx, 1.4, bz);
    group.add(beam);
  }

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.8, 1.5, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.92);
  roof.position.y = 3.25;
  group.add(roof);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.0, 0.65), chimneyBrickMat);
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

  return {
    group,
    roofMaterials: [roofMat, chimneyBrickMat],
    fireMaterials: [forgeFireMat],
  };
}

function buildResidentialHouse(
  id: string,
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
  quiltHex: number,
): {
  group: THREE.Group;
  roofMaterials: THREE.MeshStandardMaterial[];
  fireMaterials: THREE.MeshStandardMaterial[];
} {
  const group = new THREE.Group();
  group.name = id;
  group.userData = { houseId: id };

  const plinthMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 }), 'stone');
  const wallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.82 }), 'wall');
  const floorMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.84 }), 'wood');
  const woodMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78 }), 'darkWood');
  const roofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.62 }), 'roofPrimary');
  const chimneyMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.88 }), 'stone');
  const quiltMat = new THREE.MeshStandardMaterial({ color: quiltHex, roughness: 0.76 });
  const linenMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.82 });
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf97316,
    emissiveIntensity: 1.6,
    roughness: 0.24,
  });
  const winMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
      roughness: 0.28,
    }),
    'window',
  );
  lanternMats.push(winMat);

  addContactShadow(group, shadowTex, 2.9, 2.5);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 2.8), plinthMat);
  plinth.position.y = 0.14;
  group.add(plinth);

  // Hollow 4 cottage walls + wooden floor
  addHollowLandmarkWalls(group, 3.1, 1.75, 2.5, 0.28, 0.15, wallMat, floorMat);

  // --- Cozy Residential Interior ---
  // 1. Warm Stone Fireplace on back wall
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.15, 0.48), plinthMat);
  hearth.position.set(0.75, 0.88, -0.88);
  const embers = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.16), fireMat);
  embers.position.set(0.75, 0.62, -0.64);
  group.add(hearth, embers);

  // 2. Cozy Wooden Bed with Quilt & Pillow
  addInteriorBed(group, -0.92, 0.31, -0.45, 0, woodMat, quiltMat, linenMat);

  // 3. Wooden Dining Table & Chairs
  addInteriorTableAndChairs(group, 0.45, 0.31, 0.38, 0.88, 0.56, woodMat, 2);

  // 4. Wall Shelf with jars & books
  addInteriorShelf(group, 1.32, 0.31, 0.05, -Math.PI / 2, woodMat, quiltMat);

  // Front Door, Porch Step & Glowing Windows
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.05, 0.1), woodMat);
  door.position.set(-0.48, 0.8, 1.26);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.36), plinthMat);
  step.position.set(-0.48, 0.07, 1.54);
  const winFront = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.48, 0.1), winMat);
  winFront.position.set(0.58, 1.12, 1.26);
  const winSide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.58), winMat);
  winSide.position.set(-1.56, 1.12, 0.1);
  group.add(door, step, winFront, winSide);

  // Cutaway Pitched Roof & Chimney
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.42, 1.22, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.12, 1, 0.92);
  roof.position.set(0, 2.62, 0);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.25, 0.42), chimneyMat);
  chimney.position.set(0.75, 2.75, -0.82);
  group.add(roof, chimney);

  return {
    group,
    roofMaterials: [roofMat, chimneyMat],
    fireMaterials: [fireMat],
  };
}

function buildMarket(
  shadowTex: THREE.CanvasTexture,
  awningTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
): { group: THREE.Group; awningMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  group.name = 'landmark:market';
  group.userData = { locationId: 'market' };

  const woodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78, metalness: 0.04 }),
    'wood',
  );
  const darkWoodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x5c2b0c, roughness: 0.84, metalness: 0.04 }),
    'darkWood',
  );
  const awningMat = new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.65, metalness: 0.02 });
  const crateMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72, metalness: 0.05 }),
    'crate',
  );
  const lanternMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.35,
    }),
    'lantern',
  );
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

  return { group, awningMat };
}

function buildPark(
  shadowTex: THREE.CanvasTexture,
  lanternMats: THREE.MeshStandardMaterial[],
  waterUniforms: WaterUniforms,
): {
  group: THREE.Group;
  waterMesh: THREE.Mesh;
  waterMat: THREE.MeshPhysicalMaterial;
  waterJet: THREE.Mesh;
  waterJetMat: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  group.name = 'landmark:park';
  group.userData = { locationId: 'park' };

  const stoneMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.78, metalness: 0.08 }),
    'stone',
  );
  const waterMat = createRipplingWaterMaterial(waterUniforms);
  const woodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.76 }),
    'wood',
  );
  const ironMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 }),
    'metal',
  );
  const lampGlowMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.35,
      roughness: 0.25,
    }),
    'lantern',
  );
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

  const waterJetMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.68,
  });
  const waterJet = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.58, 10),
    waterJetMat,
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

  return { group, waterMesh, waterMat, waterJet, waterJetMat };
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
  // Place key villagers inside Town Hall & Workshop so roof cutaway reveals them working indoors
  if (!agent.activePlotId && agent.location === 'town_hall' && (agent.id === 'mayor_sterling' || slotIndex % 3 === 0)) {
    destBase = new THREE.Vector3(0, 0, -9.85);
    slotScale = 0.55;
  } else if (!agent.activePlotId && agent.location === 'workshop' && (agent.id === 'architect_lyra' || agent.id === 'worker_kai' || slotIndex % 2 === 0)) {
    destBase = new THREE.Vector3(10.35, 0, -0.25);
    slotScale = 0.45;
  } else if (agent.activePlotId && PLOT_META[agent.activePlotId]) {
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

  // Floating cartoon Red-Cross / Bandage badge (hidden unless injured)
  const injuredBadgeGroup = new THREE.Group();
  injuredBadgeGroup.position.set(0, 2.08, 0);
  const badgeDisc = new THREE.Mesh(assets.crossBadgeBgGeo, assets.crossWhiteMat);
  badgeDisc.rotation.x = Math.PI / 2;
  const crossH = new THREE.Mesh(assets.crossBarHGeo, assets.crossRedMat);
  const crossV = new THREE.Mesh(assets.crossBarVGeo, assets.crossRedMat);
  injuredBadgeGroup.add(badgeDisc, crossH, crossV);
  injuredBadgeGroup.visible = agent.healthStatus === 'injured';
  root.add(injuredBadgeGroup);

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
    injuredBadgeGroup,
    isInjured: agent.healthStatus === 'injured',
    ownedMaterials,
    waypoints,
    homeAnchor: finalPos.clone(),
    currentLocation: agent.location,
    currentPlotId: agent.activePlotId,
    walkPhase: Math.random() * Math.PI * 2,
    idleStrollTimer: 4 + (slotIndex * 2.3) % 7,
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
  private plazaMat!: THREE.MeshStandardMaterial;
  private pathMat!: THREE.MeshStandardMaterial;
  private envThemeMaterials: THREE.MeshStandardMaterial[] = [];
  private treeFoliageMesh!: THREE.InstancedMesh;
  private treeCount = 0;
  private landmarkGroups: THREE.Group[] = [];
  private marketAwningMat: THREE.MeshStandardMaterial | null = null;
  private awningTextures = new Map<TownTheme, THREE.CanvasTexture>();
  private townTheme: TownTheme = 'meadow';
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
  private expansionHandle!: TownExpansionHandle;
  private railwayHandle!: TownRailwayHandle;
  private lifeHandle: TownLifeHandle | null = null;
  private dogVillagerCoords: Array<{ x: number; z: number }> = [];
  private raiderHandle: TownRaidersHandle | null = null;
  private raidState: EnemyRaidState = createDefaultEnemyRaidState(false);
  private defenseTurrets: THREE.Group[] = [];
  private defenseTowers: DefenseTowerAnchor[] = [];
  private raiderVillagerCoords: Array<{ id: string; x: number; z: number; injured: boolean }> = [];
  private completedHospitalPlotId: PlotId | null = null;
  private signalRelayHandle: SignalRelayHandle | null = null;
  private unlockedBiomes: BiomeId[] = [];
  private lastStructures: TownStructure[] = [];
  private lastSelectedPlotId: PlotId | null = null;

  // Multi-Town State (Main Alderbrook vs Clean Empty Frontier Towns)
  private isCleanFrontier = false;
  private currentTownId = '';
  private currentTownName = 'Alderbrook';
  private townHallSignMat: THREE.MeshStandardMaterial | null = null;
  private townHallSignTex: THREE.CanvasTexture | null = null;
  private mainTownOnlyObjects: THREE.Object3D[] = [];
  private starterResourcesGroup: THREE.Group | null = null;

  // See-Inside Building Interiors (Roof Cutaway)
  private staticCutaways: CutawayEntry[] = [];
  private plotCutaways = new Map<PlotId, CutawayEntry>();
  private completedPlots = new Set<PlotId>();
  private focusedCutawayId: string | null = null;

  // Weather, Night Fireflies & Smoke Particles
  private weatherMode: WeatherMode = 'summer';
  private weatherPoints!: THREE.Points;
  private weatherPositions!: Float32Array;
  private weatherMat!: THREE.PointsMaterial;
  private fireflyPoints!: THREE.Points;
  private fireflyPositions!: Float32Array;
  private fireflyBases!: Float32Array;
  private fireflyMat!: THREE.PointsMaterial;
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
  private waterMat: THREE.MeshPhysicalMaterial | null = null;
  private waterJet: THREE.Mesh | null = null;
  private waterJetMat: THREE.MeshBasicMaterial | null = null;
  private selectedAgentId: AgentId | null = null;
  private activeAgentId: AgentId | null = null;
  private followActive = false;
  private cameraTargetGoal: THREE.Vector3 | null = null;

  // Unified Camera Modes (Orbit, Villager POV, Train Cab/Passenger POV, Free-Roam Walk, Scenic Tour)
  private cameraMode: CameraMode = 'orbit';
  private povAgentId: AgentId | null = null;
  private savedOrbitPos = new THREE.Vector3(16, 13.5, 19.5);
  private savedOrbitTarget = new THREE.Vector3(0, 0.8, 0);
  private povHasSavedOrbit = false;
  private povReturnActive = false;
  private povCurrentLook = new THREE.Vector3();
  private freeRoamPos = new THREE.Vector3(0, 1.65, 8.2);
  private freeRoamYaw = Math.PI;
  private freeRoamPitch = -0.05;
  private freeRoamJoyX = 0;
  private freeRoamJoyZ = 0;
  private freeRoamBobPhase = 0;
  private freeRoamKeys = new Set<string>();
  private freeRoamDragActive = false;
  private freeRoamLastPointer = { x: 0, y: 0 };
  private tourProgress = 0;
  private tourWaypoints: Array<{ eye: THREE.Vector3; look: THREE.Vector3 }> = [];

  // Dynamic Terrain & Camera Bounds Expansion
  private groundMesh!: THREE.Mesh;
  private perimeterHills: Array<{ mesh: THREE.Mesh; angle: number }> = [];
  private railSpurBuilt = false;
  private maxPanRadius = 34;
  private expandedFogFactor = 1.0;

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
    initialTheme: TownTheme = 'meadow',
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.graphicsQuality = initialQuality;
    this.townTheme = initialTheme;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    const initialAtmo = getThemeAtmosphere(initialTheme, 'day', 'summer');
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(initialAtmo.skyHex);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(initialAtmo.skyHex, initialAtmo.fogDensity);

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.5, 220);
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
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 74;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.target.set(0, 0.8, 0);
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener('start', () => {
      this.cameraTargetGoal = null;
      this.povReturnActive = false;
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
    this.lifeHandle = buildTownLifeAndDecor(this.sharedShadowTex);
    this.scene.add(this.lifeHandle.group);
    this.disposables.push(this.lifeHandle);
    this.raiderHandle = buildTownRaidersSystem(this.sharedShadowTex);
    this.scene.add(this.raiderHandle.group);
    this.disposables.push(this.raiderHandle);
    this.setGraphicsQuality(initialQuality);
    this.setTheme(initialTheme);

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

    const groundGeo = new THREE.CircleGeometry(88, 48);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x739558,
      roughness: 0.94,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.groundMesh = ground;
    this.scene.add(ground);

    this.plazaMat = new THREE.MeshStandardMaterial({
      map: cobbleTex,
      roughness: 0.88,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.8, 32), this.plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    this.pathMat = new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const nsPath = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 18.5), this.pathMat);
    nsPath.rotation.x = -Math.PI / 2;
    nsPath.position.y = 0.018;
    nsPath.receiveShadow = true;
    const ewPath = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 2.3), this.pathMat);
    ewPath.rotation.x = -Math.PI / 2;
    ewPath.position.set(0, 0.018, -0.5);
    ewPath.receiveShadow = true;
    this.scene.add(nsPath, ewPath);
    this.mainTownOnlyObjects.push(nsPath, ewPath);

    const monumentMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.7, metalness: 0.1 }),
      'trim',
    );
    const orbMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 }),
      'gold',
    );
    this.envThemeMaterials.push(monumentMat, orbMat);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.25, 12), monumentMat);
    base.position.y = 0.125;
    base.castShadow = true;
    base.receiveShadow = true;
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 1.1, 8), monumentMat);
    obelisk.position.y = 0.78;
    obelisk.castShadow = true;
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), orbMat);
    orb.position.y = 1.5;
    orb.castShadow = true;
    this.scene.add(base, obelisk, orb);

    // Build Scenic Perimeter Railway & Wooden Station first so outer trees stay clear of the rails
    this.railwayHandle = buildTownRailway(this.scene, this.lanternMaterials, this.townTheme);
    this.clickableObjects.push(
      this.railwayHandle.stationGroup,
      this.railwayHandle.outerStationGroup,
      this.railwayHandle.trainGroup,
    );
    this.disposables.push(this.railwayHandle);

    const treePositions: Array<[number, number]> = [];
    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2;
      let dist = 17.5 + (i % 3) * 3.8;
      let tx = Math.cos(angle) * dist;
      let tz = Math.sin(angle) * dist;
      if (
        this.railwayHandle.isNearTrackOrStation(tx, tz, 2.9) ||
        Math.hypot(tx - SIGNAL_RELAY_POS.x, tz - SIGNAL_RELAY_POS.z) < 4.2
      ) {
        dist = 24.4 + (i % 3) * 2.2;
        tx = Math.cos(angle) * dist;
        tz = Math.sin(angle) * dist;
      }
      treePositions.push([tx, tz]);
    }
    this.treeCount = treePositions.length;

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.4, 7);
    const trunkMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.88 }),
      'darkWood',
    );
    this.envThemeMaterials.push(trunkMat);
    const foliageGeo = new THREE.ConeGeometry(1.15, 2.6, 7);
    this.foliageMat = createWindSwayMaterial(
      { color: 0xffffff, roughness: 0.85 },
      this.windUniforms,
      { swayScale: 0.15, heightMin: -1.3, heightRange: 2.6 },
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const foliage = new THREE.InstancedMesh(foliageGeo, this.foliageMat, treePositions.length);
    this.treeFoliageMesh = foliage;
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

      const pal = TREE_CANOPY_PALETTES.meadow;
      tint.setHex(pal[idx % pal.length]);
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
      const hx = Math.cos(angle) * 58;
      const hz = Math.sin(angle) * 58;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(13 + (i % 3) * 4, 7 + (i % 2) * 3, 7), this.hillMat);
      hill.position.set(hx, 2.4, hz);
      hill.rotation.y = i;
      this.perimeterHills.push({ mesh: hill, angle });
      this.scene.add(hill);
    }

    this.detailsHandle = buildScatteredTownDetails(
      this.scene,
      this.lanternMaterials,
      this.windUniforms,
    );
    this.mainTownOnlyObjects.push(this.detailsHandle.group);
    this.disposables.push(this.detailsHandle);

    // Expandable Outer Biomes (Dense Forest, Desert Dunes, Crystal Cave) + Instanced Roads
    this.expansionHandle = buildExpandableBiomesAndRoads(
      this.scene,
      this.lanternMaterials,
      this.townTheme,
    );
    this.clickableObjects.push(this.expansionHandle.caveGroup);
    this.staticCutaways.push({
      id: 'biome:cave',
      center: new THREE.Vector3(27.6, 2.2, -24.6),
      triggerRadius: 16.5,
      roofMaterials: this.expansionHandle.caveRoofMaterials,
      fireMaterials: [],
      currentOpacity: 1,
    });
    this.disposables.push(this.expansionHandle);
  }

  private getOrCreateAwningTexture(theme: TownTheme): THREE.CanvasTexture {
    const existing = this.awningTextures.get(theme);
    if (existing) return existing;
    const tex = createThemedAwningTexture(theme, this.renderer.capabilities.getMaxAnisotropy());
    this.awningTextures.set(theme, tex);
    this.disposables.push(tex);
    return tex;
  }

  private buildLandmarks(): void {
    const shadowTex = createContactShadowTexture();
    this.sharedShadowTex = shadowTex;
    const awningTex = this.getOrCreateAwningTexture(this.townTheme);
    this.disposables.push(shadowTex);

    const townHallBuilt = buildTownHall(
      shadowTex,
      this.lanternMaterials,
      this.windUniforms,
      this.currentTownName,
    );
    this.townHallSignMat = townHallBuilt.signMat;
    this.townHallSignTex = townHallBuilt.signTex;
    const townHall = townHallBuilt.group;
    townHall.position.copy(LANDMARKS.town_hall.center);
    townHall.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.scene.add(townHall);
    this.landmarkGroups.push(townHall);
    this.clickableObjects.push(townHall);
    this.staticCutaways.push({
      id: 'landmark:town_hall',
      center: LANDMARKS.town_hall.center.clone().setY(1.6),
      triggerRadius: 13.8,
      roofMaterials: townHallBuilt.roofMaterials,
      fireMaterials: townHallBuilt.fireMaterials,
      currentOpacity: 1,
    });

    // Starter Resources Cluster (visible only in newly founded clean frontier towns)
    this.starterResourcesGroup = buildStarterResourcesCluster(shadowTex);
    this.starterResourcesGroup.visible = this.isCleanFrontier;
    this.scene.add(this.starterResourcesGroup);
    this.landmarkGroups.push(this.starterResourcesGroup);

    const workshopBuilt = buildWorkshop(shadowTex, this.lanternMaterials);
    const workshop = workshopBuilt.group;
    workshop.position.copy(LANDMARKS.workshop.center);
    workshop.rotation.y = -Math.PI / 2;
    workshop.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.scene.add(workshop);
    this.landmarkGroups.push(workshop);
    this.mainTownOnlyObjects.push(workshop);
    this.clickableObjects.push(workshop);
    this.staticCutaways.push({
      id: 'landmark:workshop',
      center: LANDMARKS.workshop.center.clone().setY(1.4),
      triggerRadius: 12.2,
      roofMaterials: workshopBuilt.roofMaterials,
      fireMaterials: workshopBuilt.fireMaterials,
      currentOpacity: 1,
    });

    // Two Cozy Residential Houses with See-Inside Interiors (Fireplace, Bed, Table, Shelves)
    const quiltColors = [0xdc2626, 0x2563eb];
    RESIDENTIAL_HOUSES.forEach((h, idx) => {
      const built = buildResidentialHouse(h.id, shadowTex, this.lanternMaterials, quiltColors[idx % quiltColors.length]);
      built.group.position.set(h.x, 0, h.z);
      built.group.rotation.y = Math.atan2(-h.x, -h.z);
      built.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      this.scene.add(built.group);
      this.landmarkGroups.push(built.group);
      this.mainTownOnlyObjects.push(built.group);
      this.clickableObjects.push(built.group);
      this.staticCutaways.push({
        id: h.id,
        center: new THREE.Vector3(h.x, 1.2, h.z),
        triggerRadius: 11.4,
        roofMaterials: built.roofMaterials,
        fireMaterials: built.fireMaterials,
        currentOpacity: 1,
      });
    });

    const marketBuilt = buildMarket(shadowTex, awningTex, this.lanternMaterials);
    this.marketAwningMat = marketBuilt.awningMat;
    marketBuilt.group.position.copy(LANDMARKS.market.center);
    marketBuilt.group.rotation.y = Math.PI / 2;
    marketBuilt.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.scene.add(marketBuilt.group);
    this.landmarkGroups.push(marketBuilt.group);
    this.mainTownOnlyObjects.push(marketBuilt.group);
    this.clickableObjects.push(marketBuilt.group);

    const parkBuilt = buildPark(shadowTex, this.lanternMaterials, this.waterUniforms);
    parkBuilt.group.position.copy(LANDMARKS.park.center);
    this.waterMesh = parkBuilt.waterMesh;
    this.waterMat = parkBuilt.waterMat;
    this.waterJet = parkBuilt.waterJet;
    this.waterJetMat = parkBuilt.waterJetMat;
    this.scene.add(parkBuilt.group);
    this.landmarkGroups.push(parkBuilt.group);
    this.mainTownOnlyObjects.push(parkBuilt.group);
    this.clickableObjects.push(parkBuilt.group);

    // "The Signal Relay" (CLI Agent Hub) near the outer edge & Train Station
    const signalRelay = buildSignalRelayLandmark(shadowTex, this.lanternMaterials, this.townTheme);
    signalRelay.group.position.copy(SIGNAL_RELAY_POS);
    signalRelay.group.rotation.y = Math.atan2(-SIGNAL_RELAY_POS.x, -SIGNAL_RELAY_POS.z);
    signalRelay.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.signalRelayHandle = signalRelay;
    this.scene.add(signalRelay.group);
    this.landmarkGroups.push(signalRelay.group);
    this.mainTownOnlyObjects.push(signalRelay.group);
    this.clickableObjects.push(signalRelay.group);
    this.disposables.push(signalRelay);
    this.staticCutaways.push({
      id: 'landmark:signal_relay',
      center: SIGNAL_RELAY_POS.clone().setY(1.4),
      triggerRadius: 11.8,
      roofMaterials: signalRelay.roofMaterials,
      fireMaterials: signalRelay.fireMaterials,
      currentOpacity: 1,
    });
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
    this.mainTownOnlyObjects.push(this.smokePoints);

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

    // 4. Dedicated Subtle Glowing Night Fireflies (disabled on Low quality for 4 GB RAM phones)
    const fireflyCount = 56;
    this.fireflyPositions = new Float32Array(fireflyCount * 3);
    this.fireflyBases = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount; i++) {
      const angle = (i / fireflyCount) * Math.PI * 2 + (i % 5) * 0.41;
      const radius = 3.2 + ((i * 73) % 150) / 10;
      const bx = Math.cos(angle) * radius;
      const by = 0.75 + ((i * 29) % 28) / 10;
      const bz = Math.sin(angle) * radius;
      this.fireflyBases[i * 3] = bx;
      this.fireflyBases[i * 3 + 1] = by;
      this.fireflyBases[i * 3 + 2] = bz;
      this.fireflyPositions[i * 3] = bx;
      this.fireflyPositions[i * 3 + 1] = by;
      this.fireflyPositions[i * 3 + 2] = bz;
    }
    const fireflyTex = createFireflyTexture();
    this.disposables.push(fireflyTex);
    const fireflyGeo = new THREE.BufferGeometry();
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(this.fireflyPositions, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      map: fireflyTex,
      color: 0xfde047,
      size: 0.36,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.fireflyPoints = new THREE.Points(fireflyGeo, this.fireflyMat);
    this.fireflyPoints.visible = false;
    this.fireflyPoints.frustumCulled = false;
    this.scene.add(this.fireflyPoints);
  }

  private updateFireflyState(): void {
    if (!this.fireflyPoints) return;
    const isNightLike =
      this.townTheme === 'fantasy_night' ||
      this.timeOfDay === 'night' ||
      this.timeOfDay === 'twilight';
    // Strictly disabled on Low graphics quality to protect 4 GB RAM mobile devices
    this.fireflyPoints.visible = isNightLike && this.graphicsQuality !== 'low';
    this.fireflyMat.color.setHex(
      this.townTheme === 'fantasy_night'
        ? 0xd8b4fe
        : this.townTheme === 'solarpunk_oasis'
          ? 0x67e8f9
          : 0xfde047,
    );
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
    this.expansionHandle?.setGraphicsQuality(quality);
    this.railwayHandle?.setGraphicsQuality(quality);
    this.signalRelayHandle?.setGraphicsQuality(quality);
    this.raiderHandle?.setGraphicsQuality(quality);
    this.weatherPoints?.geometry.setDrawRange(0, quality === 'low' ? 80 : 160);
    this.updateFireflyState();
  }

  public setTheme(theme: TownTheme): void {
    this.townTheme = theme;

    for (const mat of this.envThemeMaterials) {
      applyThemeToMaterial(mat, theme);
    }
    for (const grp of this.landmarkGroups) {
      applyThemeToObjectTree(grp, theme);
    }
    this.plotGroups.forEach((grp) => {
      applyThemeToObjectTree(grp, theme);
    });
    this.detailsHandle?.applyTheme(theme);
    this.expansionHandle?.applyTheme(theme);
    this.railwayHandle?.applyTheme(theme);
    this.signalRelayHandle?.applyTheme(theme);

    if (this.treeFoliageMesh) {
      const pal = TREE_CANOPY_PALETTES[theme];
      for (let i = 0; i < this.treeCount; i++) {
        _targetColor.setHex(pal[i % pal.length]);
        this.treeFoliageMesh.setColorAt(i, _targetColor);
      }
      if (this.treeFoliageMesh.instanceColor) {
        this.treeFoliageMesh.instanceColor.needsUpdate = true;
      }
    }

    if (this.marketAwningMat) {
      this.marketAwningMat.map = this.getOrCreateAwningTexture(theme);
      this.marketAwningMat.needsUpdate = true;
    }

    this.setAtmosphere(this.timeOfDay, this.weatherMode);
  }

  public setAtmosphere(timeOfDay: TimeOfDay, weather: WeatherMode): void {
    this.timeOfDay = timeOfDay;
    this.weatherMode = weather;

    if (weather === 'rain') {
      this.weatherPoints.visible = true;
      this.weatherMat.color.setHex(
        this.townTheme === 'fantasy_night' ? 0xc4b5fd : 0xbae6fd,
      );
      this.weatherMat.size = 0.14;
      this.weatherMat.opacity = 0.78;
    } else if (weather === 'winter') {
      this.weatherPoints.visible = true;
      this.weatherMat.color.setHex(
        this.townTheme === 'fantasy_night' ? 0xe0e7ff : 0xf8fafc,
      );
      this.weatherMat.size = 0.22;
      this.weatherMat.opacity = 0.88;
    } else {
      this.weatherPoints.visible = false;
    }

    this.updateFireflyState();
  }

  public setFollowActive(follow: boolean): void {
    this.followActive = follow;
    if (follow) {
      this.cameraTargetGoal = null;
    }
  }

  private buildTourWaypoints(): void {
    const pts: Array<{ eye: THREE.Vector3; look: THREE.Vector3 }> = [
      { eye: new THREE.Vector3(14.5, 9.5, 15.5), look: new THREE.Vector3(0, 1.2, 0) },
      { eye: new THREE.Vector3(0.5, 6.2, -1.8), look: new THREE.Vector3(0, 2.2, -10.5) },
      { eye: new THREE.Vector3(-14.5, 7.8, -5.5), look: new THREE.Vector3(-9.5, 1.2, -0.5) },
      { eye: new THREE.Vector3(0, 6.8, 17.8), look: new THREE.Vector3(0, 1.2, 9.5) },
      { eye: new THREE.Vector3(17.5, 8.2, 7.5), look: new THREE.Vector3(10.5, 1.4, -0.5) },
    ];
    for (const s of this.lastStructures) {
      if (s.status !== 'complete') continue;
      const pm = PLOT_META[s.plotId];
      if (!pm) continue;
      const len = Math.hypot(pm.x, pm.z) || 1;
      pts.push({
        eye: new THREE.Vector3(pm.x + (pm.x / len) * 9.5, 7.4, pm.z + (pm.z / len) * 9.5),
        look: new THREE.Vector3(pm.x, 1.4, pm.z),
      });
      if (pts.length >= 9) break;
    }
    if (this.railSpurBuilt && this.railwayHandle) {
      const f = this.railwayHandle.frontierDepotFocusTarget;
      pts.push({
        eye: new THREE.Vector3(f.x + 9.5, 8.5, f.z + 9.5),
        look: f.clone(),
      });
    }
    for (const b of this.unlockedBiomes) {
      const bm = BIOME_META[b];
      if (bm) {
        pts.push({
          eye: new THREE.Vector3(bm.center.x * 0.72, 11.5, bm.center.z * 0.72),
          look: new THREE.Vector3(bm.center.x, 1.5, bm.center.z),
        });
      }
    }
    this.tourWaypoints = pts;
  }

  public setCameraMode(mode: CameraMode, povAgentId?: AgentId | null): void {
    const resolvedAgentId = mode === 'villager_pov' ? (povAgentId ?? null) : null;
    if (mode === this.cameraMode && resolvedAgentId === this.povAgentId) return;

    // Restore previously hidden POV head mesh if any
    if (this.povAgentId) {
      const prevRig = this.rigs.get(this.povAgentId);
      if (prevRig) {
        prevRig.headGroup.visible = true;
      }
    }

    // Save exact orbit pose before leaving orbit mode
    if (this.cameraMode === 'orbit' && mode !== 'orbit' && !this.povReturnActive) {
      this.savedOrbitPos.copy(this.camera.position);
      this.savedOrbitTarget.copy(this.controls.target);
      this.povHasSavedOrbit = true;
    }

    this.freeRoamJoyX = 0;
    this.freeRoamJoyZ = 0;
    this.freeRoamKeys.clear();
    this.freeRoamDragActive = false;

    if (mode === 'villager_pov') {
      const targetRig = resolvedAgentId ? this.rigs.get(resolvedAgentId) : null;
      if (!targetRig || !resolvedAgentId) {
        this.cameraMode = 'orbit';
        this.povAgentId = null;
        this.controls.enabled = true;
        return;
      }
      this.cameraMode = 'villager_pov';
      this.povAgentId = resolvedAgentId;
      this.povReturnActive = false;
      this.followActive = false;
      this.cameraTargetGoal = null;
      this.controls.enabled = false;
      targetRig.headGroup.visible = false;
      if (this.camera.near !== 0.15) {
        this.camera.near = 0.15;
        this.camera.updateProjectionMatrix();
      }
      this.povCurrentLook.copy(this.controls.target);
      return;
    }

    if (mode === 'train_cab' || mode === 'train_passenger') {
      if (this.railwayHandle && !this.railwayHandle.group.visible) {
        this.railwayHandle.group.visible = true;
      }
      this.cameraMode = mode;
      this.povAgentId = null;
      this.povReturnActive = false;
      this.followActive = false;
      this.cameraTargetGoal = null;
      this.controls.enabled = false;
      if (this.camera.near !== 0.15) {
        this.camera.near = 0.15;
        this.camera.updateProjectionMatrix();
      }
      this.railwayHandle?.getTrainCameraPose(
        mode === 'train_passenger' ? 'passenger' : 'cab',
        _povEye,
        _povLookTarget,
      );
      this.povCurrentLook.copy(_povLookTarget);
      return;
    }

    if (mode === 'free_roam') {
      this.cameraMode = 'free_roam';
      this.povAgentId = null;
      this.povReturnActive = false;
      this.followActive = false;
      this.cameraTargetGoal = null;
      this.controls.enabled = false;
      if (this.camera.near !== 0.15) {
        this.camera.near = 0.15;
        this.camera.updateProjectionMatrix();
      }
      // Spawn walker near plaza facing Town Hall (or near current orbit target clamped safely)
      const startX = THREE.MathUtils.clamp(this.controls.target.x, -this.maxPanRadius * 0.75, this.maxPanRadius * 0.75);
      const startZ = THREE.MathUtils.clamp(this.controls.target.z + 5.5, -this.maxPanRadius * 0.75, this.maxPanRadius * 0.75);
      this.freeRoamPos.set(startX, 1.65, startZ);
      this.freeRoamYaw = Math.atan2(-startX, -10.5 - startZ);
      this.freeRoamPitch = -0.04;
      this.freeRoamBobPhase = 0;
      this.camera.position.copy(this.freeRoamPos);
      return;
    }

    if (mode === 'tour') {
      this.cameraMode = 'tour';
      this.povAgentId = null;
      this.povReturnActive = false;
      this.followActive = false;
      this.cameraTargetGoal = null;
      this.controls.enabled = false;
      this.tourProgress = 0;
      this.buildTourWaypoints();
      if (this.camera.near !== 0.5) {
        this.camera.near = 0.5;
        this.camera.updateProjectionMatrix();
      }
      this.povCurrentLook.copy(this.controls.target);
      return;
    }

    // Returning to standard Orbit overview -> smoothly restore exact previous position and target
    this.cameraMode = 'orbit';
    this.povAgentId = null;
    if (this.camera.near !== 0.5) {
      this.camera.near = 0.5;
      this.camera.updateProjectionMatrix();
    }
    this.controls.enabled = true;
    if (this.povHasSavedOrbit) {
      this.povReturnActive = true;
      this.cameraTargetGoal = null;
    }
  }

  public setPovAgent(agentId: AgentId | null): void {
    this.setCameraMode(agentId ? 'villager_pov' : 'orbit', agentId);
  }

  public setFreeRoamInput(moveX: number, moveZ: number): void {
    this.freeRoamJoyX = THREE.MathUtils.clamp(moveX, -1, 1);
    this.freeRoamJoyZ = THREE.MathUtils.clamp(moveZ, -1, 1);
  }

  public captureSnapshotDataUrl(townName: string, subtitle?: string): string | null {
    if (this.disposed) return null;
    try {
      // Render right before capturing so WebGL drawing buffer is always fresh
      this.renderer.render(this.scene, this.camera);
      const srcCanvas = this.renderer.domElement;
      const w = Math.max(640, Math.min(1440, srcCanvas.width || 960));
      const h = Math.round((w * (srcCanvas.height || 540)) / Math.max(1, srcCanvas.width || 960));

      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx) {
        return srcCanvas.toDataURL('image/png');
      }
      ctx.drawImage(srcCanvas, 0, 0, w, h);

      // Subtle postcard vignette & warm archival caption bar at bottom
      const barH = Math.max(54, Math.round(h * 0.11));
      const grad = ctx.createLinearGradient(0, h - barH * 1.5, 0, h);
      grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
      grad.addColorStop(0.45, 'rgba(15, 23, 42, 0.72)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - barH * 1.5, w, barH * 1.5);

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
      ctx.lineWidth = Math.max(2, Math.round(w * 0.0025));
      ctx.strokeRect(12, 12, w - 24, h - 24);

      const titleSize = Math.max(18, Math.round(w * 0.025));
      const subSize = Math.max(12, Math.round(w * 0.014));
      ctx.fillStyle = '#fef3c7';
      ctx.font = `700 ${titleSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Postcard from ${townName || 'Alderbrook'}`, 26, h - Math.round(barH * 0.44));

      ctx.fillStyle = '#cbd5e1';
      ctx.font = `500 ${subSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(
        subtitle || `${this.weatherMode} · ${this.timeOfDay} · AI Town Chronicle`,
        26,
        h - Math.round(barH * 0.16),
      );

      return out.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  public refreshDailyRoutines(agents: AgentRecord[]): void {
    const capped = agents.slice(0, MAX_TOWN_AGENTS);
    capped.forEach((agent, index) => {
      const rig = this.rigs.get(agent.id);
      if (!rig) return;
      const dest = this.computeAgentDestination(agent, index);
      if (rig.homeAnchor.distanceTo(dest) > 1.2) {
        const slot = getAgentSlotOffset(agent.id, index, _slotOffset);
        const mid = new THREE.Vector3(
          PLAZA_CENTER.x + slot.x * 0.45,
          0,
          PLAZA_CENTER.z + slot.z * 0.45,
        );
        rig.waypoints = [mid, dest];
        rig.homeAnchor.copy(dest);
      }
    });
  }

  private applyMapExpansionBounds(): void {
    const biomeCount = this.unlockedBiomes.length;
    const expanded = biomeCount > 0 || this.railSpurBuilt;
    const tier = Math.min(3, biomeCount + (this.railSpurBuilt ? 1 : 0));

    // Scale ground disk, push perimeter hills outward, expand orbit pan/zoom bounds & camera far plane
    const groundScale = expanded ? 1.25 + tier * 0.12 : 1.0;
    const hillRadius = expanded ? 72 + tier * 7.5 : 58;
    const maxDist = expanded ? 96 + tier * 11 : 74;
    const camFar = expanded ? 280 + tier * 30 : 220;

    if (this.groundMesh) {
      this.groundMesh.scale.setScalar(groundScale);
    }
    for (let i = 0; i < this.perimeterHills.length; i++) {
      const h = this.perimeterHills[i];
      h.mesh.position.x = Math.cos(h.angle) * hillRadius;
      h.mesh.position.z = Math.sin(h.angle) * hillRadius;
    }

    this.controls.maxDistance = maxDist;
    this.maxPanRadius = expanded ? 48 + tier * 5 : 34;
    this.expandedFogFactor = expanded ? Math.max(0.68, 0.9 - tier * 0.06) : 1.0;

    if (this.camera.far !== camFar) {
      this.camera.far = camFar;
      this.camera.updateProjectionMatrix();
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

  private updateTownHallSign(townName: string): void {
    if (!this.townHallSignMat) return;
    const nextTex = createTownHallSignTexture(townName);
    const oldTex = this.townHallSignTex;
    this.townHallSignMat.map = nextTex;
    this.townHallSignMat.needsUpdate = true;
    this.townHallSignTex = nextTex;
    oldTex?.dispose();
  }

  private computeAgentDestination(agent: AgentRecord, slotIndex: number): THREE.Vector3 {
    const slot = getAgentSlotOffset(agent.id, slotIndex, _slotOffset);
    const isGuard =
      agent.id === 'commander_vance' || /(guard|patrol|watch|commander)/i.test(agent.role);

    // Nighttime routine: non-guard villagers rest near cozy residential cottages or Town Hall hearth
    if (this.timeOfDay === 'night' && !isGuard) {
      if (this.isCleanFrontier || agent.id === 'mayor_sterling' || slotIndex % 3 === 0) {
        return new THREE.Vector3(slot.x * 0.52, 0, -9.85 + slot.z * 0.45);
      }
      const house = RESIDENTIAL_HOUSES[slotIndex % RESIDENTIAL_HOUSES.length];
      return new THREE.Vector3(house.x + slot.x * 0.34, 0, house.z + slot.z * 0.34);
    }

    // Twilight / Evening social hour: villagers not actively building gather around Park & Plaza
    if (
      this.timeOfDay === 'twilight' &&
      !isGuard &&
      (!agent.activePlotId || this.completedPlots.has(agent.activePlotId))
    ) {
      if (!this.isCleanFrontier) {
        const socialAngle = slotIndex * 1.15 + 0.35;
        const r = 2.6 + (slotIndex % 3) * 0.75;
        return new THREE.Vector3(Math.cos(socialAngle) * r, 0, 5.2 + Math.sin(socialAngle) * r * 0.65);
      }
    }

    if (agent.activePlotId && PLOT_META[agent.activePlotId]) {
      const pm = PLOT_META[agent.activePlotId];
      if (this.completedPlots.has(agent.activePlotId)) {
        return new THREE.Vector3(pm.x + slot.x * 0.28, 0, pm.z + slot.z * 0.28);
      }
      const len = Math.hypot(pm.x, pm.z) || 1;
      return new THREE.Vector3(
        pm.x * (1 - 2.6 / len) + slot.x * 0.65,
        0,
        pm.z * (1 - 2.6 / len) + slot.z * 0.65,
      );
    }

    // In clean newly created frontier towns, gather starter villagers visibly around Town Hall & Plaza
    if (this.isCleanFrontier) {
      const frontierSlots: Array<[number, number]> = [
        [0, -6.55],     // Mayor Sterling center front of Town Hall steps
        [-2.05, -7.1],  // Architect Lyra near Town Hall & starter supplies
        [2.05, -7.1],   // Commander Vance on east Town Hall flank
        [-3.15, -6.1],  // Worker Pip beside starter timber/crates
        [3.15, -6.1],   // Worker Kai surveying open build plots
      ];
      if (slotIndex < frontierSlots.length) {
        const [fx, fz] = frontierSlots[slotIndex];
        return new THREE.Vector3(fx, 0, fz);
      }
      const angle = ((slotIndex - frontierSlots.length) * 0.85) + 0.4;
      return new THREE.Vector3(Math.cos(angle) * 3.4, 0, -5.2 + Math.sin(angle) * 1.4);
    }

    let destBase = LANDMARKS[agent.location].gatherPoint;
    let slotScale = 1.0;

    if (agent.location === 'town_hall' && (agent.id === 'mayor_sterling' || slotIndex % 3 === 0)) {
      destBase = new THREE.Vector3(0, 0, -9.85);
      slotScale = 0.55;
    } else if (agent.location === 'workshop' && (agent.id === 'architect_lyra' || agent.id === 'worker_kai' || slotIndex % 2 === 0)) {
      destBase = new THREE.Vector3(10.35, 0, -0.25);
      slotScale = 0.45;
    }

    return new THREE.Vector3(
      destBase.x + slot.x * slotScale,
      0,
      destBase.z + slot.z * slotScale,
    );
  }

  public loadTown(params: {
    townId: string;
    townName: string;
    isMainTown: boolean;
    agents: AgentRecord[];
    structures: TownStructure[];
    unlockedBiomes: BiomeId[];
    roads: string[];
    railSpurBuilt: boolean;
    activeAgentId: AgentId | null;
    selectedAgentId: AgentId | null;
    selectedPlotId: PlotId | null;
    timeOfDay: TimeOfDay;
    weather: WeatherMode;
    theme: TownTheme;
  }): void {
    this.currentTownId = params.townId;
    this.currentTownName = params.townName || (params.isMainTown ? 'Alderbrook' : 'New Town');
    this.isCleanFrontier = !params.isMainTown;

    // 1. Update Town Hall facade banner
    this.updateTownHallSign(this.currentTownName);

    // 2. Toggle Alderbrook-only landmarks vs clean empty frontier starter resources
    for (const obj of this.mainTownOnlyObjects) {
      obj.visible = params.isMainTown;
    }
    if (this.starterResourcesGroup) {
      this.starterResourcesGroup.visible = this.isCleanFrontier;
    }
    if (this.railwayHandle) {
      this.railwayHandle.group.visible = params.isMainTown || params.railSpurBuilt;
    }

    // 3. Clear transient visual effects, camera mode & cached cutaway/plot state
    if (this.povAgentId) {
      const prevPovRig = this.rigs.get(this.povAgentId);
      if (prevPovRig) prevPovRig.headGroup.visible = true;
    }
    this.cameraMode = 'orbit';
    this.povAgentId = null;
    this.povReturnActive = false;
    this.povHasSavedOrbit = false;
    this.freeRoamJoyX = 0;
    this.freeRoamJoyZ = 0;
    this.freeRoamKeys.clear();
    this.freeRoamDragActive = false;
    this.controls.enabled = true;
    if (this.camera.near !== 0.5) {
      this.camera.near = 0.5;
      this.camera.updateProjectionMatrix();
    }
    this.commArcTimer = 0;
    this.commSpeakerId = null;
    this.commTargetId = null;
    if (this.commArcLine) this.commArcLine.visible = false;
    this.focusedCutawayId = null;
    this.followActive = false;
    this.bakeryChimneys = [];
    if (this.bakerySmokePoints) this.bakerySmokePoints.visible = false;
    this.windmillRotors = [];
    this.defenseTurrets = [];
    this.defenseTowers = [];
    this.completedHospitalPlotId = null;
    this.plotCutaways.clear();
    this.completedPlots.clear();

    // 4. Force-remove & dispose all existing plot meshes so zero buildings carry over
    this.plotGroups.forEach((grp) => {
      this.scene.remove(grp);
      const clickIdx = this.clickableObjects.indexOf(grp);
      if (clickIdx !== -1) this.clickableObjects.splice(clickIdx, 1);
      disposeStructureGroup(grp, this.lanternMaterials);
    });
    this.plotGroups.clear();
    this.plotSignatures.clear();

    // 5. Apply outer biomes, instanced cobblestone roads, railway spur & active town's structures
    this.unlockedBiomes = [...params.unlockedBiomes];
    this.railSpurBuilt = params.railSpurBuilt;
    this.applyMapExpansionBounds();
    this.expansionHandle?.setUnlockedBiomes(params.unlockedBiomes);
    this.expansionHandle?.setRoads(params.roads);
    this.railwayHandle?.setRailSpurBuilt(params.railSpurBuilt);
    this.syncStructures(params.structures, params.selectedPlotId);

    // 6. Force-rebuild all villager rigs cleanly at their exact active town positions
    this.rigs.forEach((rig) => {
      this.scene.remove(rig.root);
      const clickIdx = this.clickableObjects.indexOf(rig.root);
      if (clickIdx !== -1) this.clickableObjects.splice(clickIdx, 1);
      for (const mat of rig.ownedMaterials) {
        mat.dispose();
      }
    });
    this.rigs.clear();

    this.activeAgentId = params.activeAgentId;
    this.selectedAgentId = params.selectedAgentId;
    const capped = params.agents.slice(0, MAX_TOWN_AGENTS);
    capped.forEach((agent, index) => {
      const rig = buildCharacter(agent, index, this.sharedRigAssets, false);
      const startPos = this.computeAgentDestination(agent, index);
      rig.root.position.copy(startPos);
      rig.homeAnchor.copy(startPos);
      rig.waypoints = [];
      rig.isMoving = false;
      rig.currentLocation = agent.location;
      rig.currentPlotId = agent.activePlotId;
      rig.selectionRing.visible = agent.id === this.selectedAgentId;
      rig.activeRing.visible = agent.id === this.activeAgentId;
      this.scene.add(rig.root);
      this.rigs.set(agent.id, rig);
      this.clickableObjects.push(rig.root);
    });

    // 7. Apply theme, atmosphere & frame the town immediately
    this.setTheme(params.theme);
    this.setAtmosphere(params.timeOfDay, params.weather);
    this.cameraTargetGoal = null;
    if (this.isCleanFrontier) {
      this.camera.position.set(13.5, 11.5, 14.5);
      this.controls.target.set(0, 0.9, -4.2);
    } else {
      this.camera.position.set(16, 13.5, 19.5);
      this.controls.target.set(0, 0.8, 0);
    }
    this.controls.update();
    if (!this.disposed) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public syncExpansion(
    unlockedBiomes: BiomeId[],
    roads: string[],
    railSpurBuilt: boolean,
  ): void {
    const prevKey = this.unlockedBiomes.join(',');
    const nextKey = unlockedBiomes.join(',');
    this.unlockedBiomes = [...unlockedBiomes];
    this.railSpurBuilt = railSpurBuilt;
    this.applyMapExpansionBounds();
    this.expansionHandle?.setUnlockedBiomes(unlockedBiomes);
    this.expansionHandle?.setRoads(roads);
    this.railwayHandle?.setRailSpurBuilt(railSpurBuilt);
    if (this.railwayHandle) {
      this.railwayHandle.group.visible = !this.isCleanFrontier || railSpurBuilt;
    }
    if (prevKey !== nextKey) {
      this.syncStructures(this.lastStructures, this.lastSelectedPlotId);
    }
  }

  public syncStructures(
    structures: TownStructure[],
    selectedPlotId: PlotId | null,
  ): void {
    this.lastStructures = structures;
    this.lastSelectedPlotId = selectedPlotId;

    const byPlot = new Map<PlotId, TownStructure>();
    for (const s of structures) {
      byPlot.set(s.plotId, s);
    }

    const availablePlots = new Set<PlotId>(getAvailablePlotIds(this.unlockedBiomes));

    let rebuiltAny = false;
    for (const plotId of ALL_PLOT_IDS) {
      const s = byPlot.get(plotId);
      const isVisiblePlot = availablePlots.has(plotId) || Boolean(s);

      if (!isVisiblePlot) {
        const oldLocked = this.plotGroups.get(plotId);
        if (oldLocked) {
          this.scene.remove(oldLocked);
          const clickIdx = this.clickableObjects.indexOf(oldLocked);
          if (clickIdx !== -1) this.clickableObjects.splice(clickIdx, 1);
          disposeStructureGroup(oldLocked, this.lanternMaterials);
          this.plotGroups.delete(plotId);
          this.plotSignatures.delete(plotId);
          rebuiltAny = true;
        }
        continue;
      }

      const isSelected = selectedPlotId === plotId;
      const sig = s
        ? `${s.structureType}:${s.customLabel ?? ''}:${s.customStyle ?? ''}:${s.status}:${s.progress}:${s.tier}:${isSelected}`
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
        nextGroup = buildEmptyPlotMesh(plotId, isSelected, this.townTheme);
      } else if (s.status === 'building') {
        nextGroup = buildScaffoldingMesh(s, this.sharedShadowTex, isSelected, this.townTheme);
      } else {
        nextGroup = buildCompletedStructureMesh(
          s,
          this.sharedShadowTex,
          this.lanternMaterials,
          isSelected,
          this.windUniforms,
          this.townTheme,
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
      const turrets: THREE.Group[] = [];
      const prevOpacities = new Map<PlotId, number>();
      this.plotCutaways.forEach((entry, pid) => {
        prevOpacities.set(pid, entry.currentOpacity);
      });
      this.plotCutaways.clear();
      this.completedPlots.clear();

      this.plotGroups.forEach((grp, plotId) => {
        if (grp.userData.windmillRotor) {
          rotors.push(grp.userData.windmillRotor as THREE.Group);
        }
        if (grp.userData.defenseTurret) {
          turrets.push(grp.userData.defenseTurret as THREE.Group);
        }
        const roofMats = grp.userData.cutawayRoofMaterials as THREE.MeshStandardMaterial[] | undefined;
        if (roofMats && roofMats.length > 0) {
          const meta = PLOT_META[plotId];
          this.completedPlots.add(plotId);
          this.plotCutaways.set(plotId, {
            id: `plot:${plotId}`,
            center: new THREE.Vector3(meta.x, 1.3, meta.z),
            triggerRadius: 11.4,
            roofMaterials: roofMats,
            fireMaterials: (grp.userData.interiorFireMats as THREE.MeshStandardMaterial[]) || [],
            currentOpacity: prevOpacities.get(plotId) ?? 1,
          });
        }
      });
      this.windmillRotors = rotors;
      this.defenseTurrets = turrets;

      const towers: DefenseTowerAnchor[] = [];
      let foundHospital: PlotId | null = null;
      const chimneys: THREE.Vector3[] = [];
      for (const s of structures) {
        if (s.status !== 'complete') continue;
        const meta = PLOT_META[s.plotId];
        if (!meta) continue;
        if (s.structureType === 'bakery') {
          const rotY = Math.atan2(-meta.x, -meta.z);
          const pos = new THREE.Vector3(0.78, 3.05, -0.55)
            .applyAxisAngle(_yAxis, rotY)
            .add(new THREE.Vector3(meta.x, 0, meta.z));
          chimneys.push(pos);
        }
        if (isHospitalStructure(s) && !foundHospital) {
          foundHospital = s.plotId;
        }
        if (isDefenseStructure(s)) {
          towers.push({
            x: meta.x,
            y: s.structureType === 'watchtower' ? 3.5 : 2.9,
            z: meta.z,
            power: s.structureType === 'defense_wall' ? 15 + s.tier * 4 : 10 + s.tier * 3,
          });
        }
      }
      this.bakeryChimneys = chimneys;
      this.defenseTowers = towers;
      this.completedHospitalPlotId = foundHospital;

      // Guide any villager already stationed at a newly completed plot into its interior
      this.rigs.forEach((rig) => {
        if (rig.currentPlotId && this.completedPlots.has(rig.currentPlotId)) {
          const pm = PLOT_META[rig.currentPlotId];
          if (Math.hypot(rig.homeAnchor.x - pm.x, rig.homeAnchor.z - pm.z) > 1.05) {
            const slot = getAgentSlotOffset(rig.id, rig.slotIndex, _slotOffset);
            const indoorPos = new THREE.Vector3(pm.x + slot.x * 0.28, 0, pm.z + slot.z * 0.28);
            rig.homeAnchor.copy(indoorPos);
            rig.waypoints = [indoorPos];
          }
        }
      });
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
        if (this.povAgentId === id) {
          this.setPovAgent(null);
        }
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
      const nowInjured = agent.healthStatus === 'injured';
      const injuryChanged = rig.isInjured !== nowInjured;
      rig.isInjured = nowInjured;
      rig.injuredBadgeGroup.visible = nowInjured;

      if (
        rig.currentLocation !== agent.location ||
        rig.currentPlotId !== agent.activePlotId ||
        injuryChanged
      ) {
        const slot = getAgentSlotOffset(agent.id, rig.slotIndex, _slotOffset);
        let finalPos: THREE.Vector3;
        if (nowInjured) {
          if (this.completedHospitalPlotId && PLOT_META[this.completedHospitalPlotId]) {
            const hm = PLOT_META[this.completedHospitalPlotId];
            finalPos = new THREE.Vector3(hm.x + slot.x * 0.28, 0, hm.z + slot.z * 0.28);
          } else {
            finalPos = new THREE.Vector3(slot.x * 0.55, 0, -6.2 + slot.z * 0.55);
          }
        } else {
          finalPos = this.computeAgentDestination(agent, rig.slotIndex);
        }
        const midPoint = new THREE.Vector3(
          PLAZA_CENTER.x + slot.x * 0.45,
          0,
          PLAZA_CENTER.z + slot.z * 0.45,
        );
        rig.waypoints = nowInjured ? [finalPos] : [midPoint, finalPos];
        rig.homeAnchor.copy(finalPos);
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
      if (rig.currentPlotId && this.completedPlots.has(rig.currentPlotId)) {
        this.focusedCutawayId = `plot:${rig.currentPlotId}`;
      } else if (rig.currentLocation === 'town_hall' || rig.currentLocation === 'workshop') {
        this.focusedCutawayId = `landmark:${rig.currentLocation}`;
      } else {
        this.focusedCutawayId = null;
      }
    }
  }

  public focusLocation(locationId: LocationId): void {
    const cfg = LANDMARKS[locationId];
    if (cfg) {
      this.cameraTargetGoal = cfg.lookTarget.clone();
      this.focusedCutawayId =
        locationId === 'town_hall' || locationId === 'workshop'
          ? `landmark:${locationId}`
          : null;
    }
  }

  public focusPlot(plotId: PlotId): void {
    const meta = PLOT_META[plotId];
    if (meta) {
      this.cameraTargetGoal = new THREE.Vector3(meta.x, 1.1, meta.z);
      this.focusedCutawayId = `plot:${plotId}`;
    }
  }

  public focusSignalRelay(): void {
    this.followActive = false;
    this.focusedCutawayId = 'landmark:signal_relay';
    this.cameraTargetGoal = SIGNAL_RELAY_POS.clone().setY(1.4);
  }

  public focusRaiderCamp(): void {
    this.followActive = false;
    this.focusedCutawayId = null;
    this.cameraTargetGoal = RAIDER_CAMP_POS.clone().setY(1.2);
  }

  public focusBiome(biomeId: BiomeId): void {
    const meta = BIOME_META[biomeId];
    if (!meta) return;
    this.followActive = false;
    this.focusedCutawayId = biomeId === 'cave' ? 'biome:cave' : null;
    this.cameraTargetGoal = new THREE.Vector3(meta.center.x, 1.4, meta.center.z);
  }

  public focusRailSpur(): void {
    this.followActive = false;
    this.focusedCutawayId = null;
    if (this.railwayHandle) {
      this.cameraTargetGoal = this.railwayHandle.frontierDepotFocusTarget.clone();
    }
  }

  public pulseSignalRelay(durationSec = 8): void {
    this.signalRelayHandle?.pulse(durationSec);
  }

  public triggerTrain(): void {
    this.railwayHandle?.triggerTrainNow();
  }

  public resetCamera(): void {
    this.focusedCutawayId = null;
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
      if (this.cameraMode === 'free_roam') {
        this.freeRoamDragActive = true;
        this.freeRoamLastPointer = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.cameraMode !== 'free_roam' || !this.freeRoamDragActive) return;
      const dx = e.clientX - this.freeRoamLastPointer.x;
      const dy = e.clientY - this.freeRoamLastPointer.y;
      this.freeRoamLastPointer = { x: e.clientX, y: e.clientY };
      this.freeRoamYaw -= dx * 0.0048;
      this.freeRoamPitch = THREE.MathUtils.clamp(this.freeRoamPitch - dy * 0.0038, -0.58, 0.55);
    };

    const onPointerUp = (e: PointerEvent) => {
      this.freeRoamDragActive = false;
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.hypot(dx, dy) > 8) return;

      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const hits = this.raycaster.intersectObjects(this.clickableObjects, true);
      const visibleHit = hits.find((hit) => {
        let cur: THREE.Object3D | null = hit.object;
        while (cur) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      });
      if (!visibleHit) {
        this.focusedCutawayId = null;
        return;
      }

      let obj: THREE.Object3D | null = visibleHit.object;
      while (obj) {
        if (obj.userData?.agentId) {
          const aid = obj.userData.agentId as AgentId;
          if (this.callbacks.onToggleAgentPov) {
            this.callbacks.onToggleAgentPov(aid);
          } else {
            this.callbacks.onSelectAgent(aid);
          }
          return;
        }
        if (obj.userData?.trainCar) {
          const seat = obj.userData.trainCar === 'passenger' ? 'passenger' : 'cab';
          this.callbacks.onToggleTrainPov?.(seat);
          return;
        }
        if (obj.userData?.plotId) {
          const pid = obj.userData.plotId as PlotId;
          this.focusedCutawayId = `plot:${pid}`;
          this.callbacks.onSelectPlot(pid);
          return;
        }
        if (obj.userData?.houseId) {
          const hid = obj.userData.houseId as string;
          const house = RESIDENTIAL_HOUSES.find((h) => h.id === hid);
          if (house) {
            this.focusedCutawayId = hid;
            this.followActive = false;
            this.cameraTargetGoal = new THREE.Vector3(house.x, 1.1, house.z);
          }
          return;
        }
        if (obj.userData?.signalRelay) {
          this.focusSignalRelay();
          this.callbacks.onSelectSignalRelay?.();
          return;
        }
        if (obj.userData?.biomeCave) {
          this.focusBiome('cave');
          return;
        }
        if (obj.userData?.stationId) {
          const sid = obj.userData.stationId as string;
          this.focusedCutawayId = null;
          this.followActive = false;
          this.cameraTargetGoal =
            sid === 'outer_frontier_station'
              ? this.railwayHandle.frontierDepotFocusTarget.clone()
              : this.railwayHandle.stationFocusTarget.clone();
          return;
        }
        if (obj.userData?.locationId) {
          const lid = obj.userData.locationId as LocationId;
          this.focusedCutawayId =
            lid === 'town_hall' || lid === 'workshop' ? `landmark:${lid}` : null;
          this.callbacks.onSelectLocation(lid);
          return;
        }
        obj = obj.parent;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.cameraMode !== 'free_roam') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.freeRoamKeys.add(k);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.freeRoamKeys.delete(e.key.toLowerCase());
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.();
    };

    const onContextRestored = () => {
      this.callbacks.onContextRestored?.();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    this.disposables.push({
      dispose: () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
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

      const spec = getThemeAtmosphere(this.townTheme, this.timeOfDay, this.weatherMode);
      const atmoLerp = 1 - Math.exp(-3.2 * delta);

      _targetColor.setHex(spec.skyHex);
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background.lerp(_targetColor, atmoLerp);
      }
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.lerp(_targetColor, atmoLerp);
        this.scene.fog.density = THREE.MathUtils.lerp(
          this.scene.fog.density,
          spec.fogDensity * this.expandedFogFactor,
          atmoLerp,
        );
      }

      _targetColor.setHex(spec.hemiSkyHex);
      this.hemiLight.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(spec.hemiGroundHex);
      this.hemiLight.groundColor.lerp(_targetColor, atmoLerp);
      this.hemiLight.intensity = THREE.MathUtils.lerp(
        this.hemiLight.intensity,
        spec.hemiIntensity,
        atmoLerp,
      );

      _targetColor.setHex(spec.sunHex);
      this.sunLight.color.lerp(_targetColor, atmoLerp);
      this.sunLight.intensity = THREE.MathUtils.lerp(
        this.sunLight.intensity,
        spec.sunIntensity,
        atmoLerp,
      );
      this.sunLight.position.lerp(spec.sunPos, atmoLerp);

      _targetColor.setHex(spec.rimHex);
      this.rimLight.color.lerp(_targetColor, atmoLerp);
      this.rimLight.intensity = THREE.MathUtils.lerp(
        this.rimLight.intensity,
        spec.rimIntensity,
        atmoLerp,
      );

      // Smoothly modulate glowing windows, street lanterns & torches for active theme & lighting
      for (const mat of this.lanternMaterials) {
        const isWindow = mat.userData.themeRole === 'window';
        const goalEmissive = isWindow ? spec.windowEmissive : spec.lanternEmissive;
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, goalEmissive, atmoLerp);
      }

      const baseWarmGoal =
        this.graphicsQuality === 'low' ? 0 : spec.pointLightBaseIntensity;
      for (let i = 0; i < this.warmLights.length; i++) {
        const pt = this.warmLights[i];
        const allowedForQuality = this.graphicsQuality === 'high' || i < 2;
        const flicker = 1 + Math.sin(elapsed * 5.2 + i * 1.9) * 0.05;
        const goal = allowedForQuality ? baseWarmGoal * flicker : 0;
        pt.intensity = THREE.MathUtils.lerp(pt.intensity, goal, atmoLerp);
        _targetColor.setHex(spec.pointLightColors[i % spec.pointLightColors.length]);
        pt.color.lerp(_targetColor, atmoLerp);
      }

      // 1b. Theme & Seasonal Ground, Foliage, Hills, Plaza, Paths, and Fountain Water
      _targetColor.setHex(spec.groundHex);
      this.groundMat.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(spec.foliageTintHex);
      this.foliageMat.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(spec.hillHex);
      this.hillMat.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(spec.plazaTintHex);
      this.plazaMat.color.lerp(_targetColor, atmoLerp);
      _targetColor.setHex(spec.pathHex);
      this.pathMat.color.lerp(_targetColor, atmoLerp);

      if (this.waterMat) {
        _targetColor.setHex(spec.waterColorHex);
        this.waterMat.color.lerp(_targetColor, atmoLerp);
        _targetColor.setHex(spec.waterEmissiveHex);
        this.waterMat.emissive.lerp(_targetColor, atmoLerp);
        this.waterMat.emissiveIntensity = THREE.MathUtils.lerp(
          this.waterMat.emissiveIntensity,
          spec.waterEmissiveIntensity,
          atmoLerp,
        );
      }
      if (this.waterJetMat) {
        _targetColor.setHex(spec.waterJetHex);
        this.waterJetMat.color.lerp(_targetColor, atmoLerp);
      }

      // 2. Smooth camera tracking (Villager POV, Train Ride POV, Free-Roam Walk, Scenic Tour, or Orbit)
      const povRig =
        this.cameraMode === 'villager_pov' && this.povAgentId
          ? this.rigs.get(this.povAgentId) ?? null
          : null;
      if (povRig) {
        // Dynamically track the villager's walking direction, head height & bob at eye level
        _povForward.set(0, 0, 1).applyQuaternion(povRig.root.quaternion).normalize();
        const eyeY = povRig.root.position.y + 1.56 + povRig.bodyGroup.position.y;
        _povEye.set(
          povRig.root.position.x + _povForward.x * 0.24,
          eyeY,
          povRig.root.position.z + _povForward.z * 0.24,
        );
        _povLookTarget.set(
          _povEye.x + _povForward.x * 8.5,
          eyeY - 0.32,
          _povEye.z + _povForward.z * 8.5,
        );
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _povEye.x, 9, delta);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _povEye.y, 9, delta);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _povEye.z, 9, delta);
        this.povCurrentLook.x = THREE.MathUtils.damp(this.povCurrentLook.x, _povLookTarget.x, 8, delta);
        this.povCurrentLook.y = THREE.MathUtils.damp(this.povCurrentLook.y, _povLookTarget.y, 8, delta);
        this.povCurrentLook.z = THREE.MathUtils.damp(this.povCurrentLook.z, _povLookTarget.z, 8, delta);
        this.camera.lookAt(this.povCurrentLook);
      } else if (
        (this.cameraMode === 'train_cab' || this.cameraMode === 'train_passenger') &&
        this.railwayHandle
      ) {
        const seat = this.cameraMode === 'train_passenger' ? 'passenger' : 'cab';
        this.railwayHandle.getTrainCameraPose(seat, _povEye, _povLookTarget);
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _povEye.x, 12, delta);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _povEye.y, 12, delta);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _povEye.z, 12, delta);
        this.povCurrentLook.x = THREE.MathUtils.damp(this.povCurrentLook.x, _povLookTarget.x, 10, delta);
        this.povCurrentLook.y = THREE.MathUtils.damp(this.povCurrentLook.y, _povLookTarget.y, 10, delta);
        this.povCurrentLook.z = THREE.MathUtils.damp(this.povCurrentLook.z, _povLookTarget.z, 10, delta);
        this.camera.lookAt(this.povCurrentLook);
      } else if (this.cameraMode === 'free_roam') {
        const keyFwd =
          (this.freeRoamKeys.has('w') || this.freeRoamKeys.has('arrowup') ? 1 : 0) -
          (this.freeRoamKeys.has('s') || this.freeRoamKeys.has('arrowdown') ? 1 : 0);
        const keyStrafe =
          (this.freeRoamKeys.has('d') || this.freeRoamKeys.has('arrowright') ? 1 : 0) -
          (this.freeRoamKeys.has('a') || this.freeRoamKeys.has('arrowleft') ? 1 : 0);
        const moveFwd = THREE.MathUtils.clamp(keyFwd - this.freeRoamJoyZ, -1, 1);
        const moveRight = THREE.MathUtils.clamp(keyStrafe + this.freeRoamJoyX, -1, 1);
        const moveMag = Math.hypot(moveFwd, moveRight);
        if (moveMag > 0.02) {
          const normFwd = moveFwd / Math.max(1, moveMag);
          const normRight = moveRight / Math.max(1, moveMag);
          const fwdX = Math.sin(this.freeRoamYaw);
          const fwdZ = Math.cos(this.freeRoamYaw);
          const rightX = -fwdZ;
          const rightZ = fwdX;
          const roamSpeed = 6.2;
          this.freeRoamPos.x += (fwdX * normFwd + rightX * normRight) * roamSpeed * delta;
          this.freeRoamPos.z += (fwdZ * normFwd + rightZ * normRight) * roamSpeed * delta;
          const roamDist = Math.hypot(this.freeRoamPos.x, this.freeRoamPos.z);
          if (roamDist > this.maxPanRadius) {
            const sc = this.maxPanRadius / roamDist;
            this.freeRoamPos.x *= sc;
            this.freeRoamPos.z *= sc;
          }
          this.freeRoamBobPhase += delta * 8.5;
        }
        const bobY = moveMag > 0.02 ? Math.sin(this.freeRoamBobPhase) * 0.045 : 0;
        const eyeY = 1.65 + bobY;
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.freeRoamPos.x, 12, delta);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, eyeY, 12, delta);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.freeRoamPos.z, 12, delta);
        const cosP = Math.cos(this.freeRoamPitch);
        _povLookTarget.set(
          this.camera.position.x + Math.sin(this.freeRoamYaw) * cosP * 8,
          this.camera.position.y + Math.sin(this.freeRoamPitch) * 8,
          this.camera.position.z + Math.cos(this.freeRoamYaw) * cosP * 8,
        );
        this.camera.lookAt(_povLookTarget);
      } else if (this.cameraMode === 'tour' && this.tourWaypoints.length >= 2) {
        const count = this.tourWaypoints.length;
        this.tourProgress = (this.tourProgress + delta * 0.14) % count;
        const idxA = Math.floor(this.tourProgress) % count;
        const idxB = (idxA + 1) % count;
        const frac = this.tourProgress - Math.floor(this.tourProgress);
        const smooth = 0.5 - 0.5 * Math.cos(frac * Math.PI);
        const wpA = this.tourWaypoints[idxA];
        const wpB = this.tourWaypoints[idxB];
        _povEye.lerpVectors(wpA.eye, wpB.eye, smooth);
        _povLookTarget.lerpVectors(wpA.look, wpB.look, smooth);
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _povEye.x, 3.2, delta);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _povEye.y, 3.2, delta);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _povEye.z, 3.2, delta);
        this.povCurrentLook.x = THREE.MathUtils.damp(this.povCurrentLook.x, _povLookTarget.x, 3.2, delta);
        this.povCurrentLook.y = THREE.MathUtils.damp(this.povCurrentLook.y, _povLookTarget.y, 3.2, delta);
        this.povCurrentLook.z = THREE.MathUtils.damp(this.povCurrentLook.z, _povLookTarget.z, 3.2, delta);
        this.camera.lookAt(this.povCurrentLook);
      } else if (this.povReturnActive) {
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.savedOrbitPos.x, 7.5, delta);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.savedOrbitPos.y, 7.5, delta);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.savedOrbitPos.z, 7.5, delta);
        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.savedOrbitTarget.x, 7.5, delta);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.savedOrbitTarget.y, 7.5, delta);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.savedOrbitTarget.z, 7.5, delta);
        this.controls.update();
        if (
          this.camera.position.distanceTo(this.savedOrbitPos) < 0.08 &&
          this.controls.target.distanceTo(this.savedOrbitTarget) < 0.08
        ) {
          this.camera.position.copy(this.savedOrbitPos);
          this.controls.target.copy(this.savedOrbitTarget);
          this.controls.update();
          this.povReturnActive = false;
        }
      } else {
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

        // Keep orbit pan target within active map expansion bounds
        const panDist = Math.hypot(this.controls.target.x, this.controls.target.z);
        if (panDist > this.maxPanRadius) {
          const clampScale = this.maxPanRadius / panDist;
          this.controls.target.x *= clampScale;
          this.controls.target.z *= clampScale;
        }

        this.controls.update();
      }

      // 3. Park Fountain Shimmering Ripples, Water Jet, Windmill Sails & 1-Minute Scenic Railway
      if (this.waterMesh) {
        this.waterMesh.position.y = 0.45 + Math.sin(elapsed * 2.2) * 0.006;
      }
      if (this.waterJet) {
        const jetPulse = 1 + Math.sin(elapsed * 6.4) * 0.12;
        this.waterJet.scale.set(1, jetPulse, 1);
        this.waterJet.rotation.y = elapsed * 1.4;
      }
      const rotorSpeed =
        (this.weatherMode === 'summer' ? 1.65 : 1.25) + Math.sin(elapsed * 0.7) * 0.18;
      for (const rotor of this.windmillRotors) {
        rotor.rotation.z -= delta * rotorSpeed;
      }
      if (this.defenseTurrets.length > 0 && this.raidState.active) {
        for (let t = 0; t < this.defenseTurrets.length; t++) {
          const turret = this.defenseTurrets[t];
          const parentRot = turret.parent ? turret.parent.rotation.y : 0;
          turret.getWorldPosition(_turretWorldPos);
          const worldAngle = Math.atan2(
            RAIDER_CAMP_POS.x - _turretWorldPos.x,
            RAIDER_CAMP_POS.z - _turretWorldPos.z,
          );
          const localDesired = worldAngle - parentRot;
          const diff = Math.atan2(
            Math.sin(localDesired - turret.rotation.y),
            Math.cos(localDesired - turret.rotation.y),
          );
          turret.rotation.y += diff * Math.min(1, delta * 4.5);
        }
      }
      if (this.railwayHandle?.group.visible) {
        this.railwayHandle.update(delta, elapsed);
      }
      if (this.signalRelayHandle?.group.visible) {
        this.signalRelayHandle.update(delta, elapsed);
      }
      this.expansionHandle?.update(elapsed);

      // 3b. See-Inside Building Interiors (Smooth Roof Cutaway on Click/Focus or Close Zoom; solid roofs in eye-level modes)
      const isEyeLevelMode =
        this.cameraMode === 'villager_pov' ||
        this.cameraMode === 'train_cab' ||
        this.cameraMode === 'train_passenger' ||
        this.cameraMode === 'free_roam';
      const updateCutaway = (entry: CutawayEntry, idx: number) => {
        const isFocused = this.focusedCutawayId === entry.id;
        const camDist = this.camera.position.distanceTo(entry.center);
        const isCloseZoom = camDist < entry.triggerRadius;
        const targetOpacity = isEyeLevelMode ? 1.0 : isFocused || isCloseZoom ? 0.15 : 1.0;

        entry.currentOpacity = THREE.MathUtils.damp(entry.currentOpacity, targetOpacity, 7.5, delta);
        const openCutaway = entry.currentOpacity < 0.985;

        for (let m = 0; m < entry.roofMaterials.length; m++) {
          const mat = entry.roofMaterials[m];
          const isGlass = mat.userData.themeRole === 'glass';
          const desiredOpacity = isGlass
            ? Math.min(0.62, entry.currentOpacity)
            : openCutaway
              ? entry.currentOpacity
              : 1.0;
          const desiredTransparent = isGlass || openCutaway;

          if (mat.transparent !== desiredTransparent) {
            mat.transparent = desiredTransparent;
            mat.needsUpdate = true;
          }
          mat.depthWrite = !desiredTransparent;
          mat.opacity = desiredOpacity;
        }

        // Cozy subtle flicker on interior fireplaces, ovens & forges
        for (let f = 0; f < entry.fireMaterials.length; f++) {
          entry.fireMaterials[f].emissiveIntensity =
            1.55 + Math.sin(elapsed * 7.4 + idx * 1.9 + f) * 0.28 + Math.sin(elapsed * 13.8 + f) * 0.12;
        }
      };

      for (let i = 0; i < this.staticCutaways.length; i++) {
        updateCutaway(this.staticCutaways[i], i);
      }
      let plotCutIdx = 10;
      this.plotCutaways.forEach((entry) => {
        updateCutaway(entry, plotCutIdx++);
      });

      // 4. Workshop Chimney Smoke (Main town only)
      if (this.smokePoints.visible) {
        const smokeAttr = this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < this.smokePhases.length; i++) {
          this.smokePhases[i] = (this.smokePhases[i] + delta * 0.22) % 1;
          const p = this.smokePhases[i];
          this.smokePositions[i * 3] = 11.2 + Math.sin(elapsed * 1.4 + i) * 0.25 + p * 0.8;
          this.smokePositions[i * 3 + 1] = 4.8 + p * 3.8;
          this.smokePositions[i * 3 + 2] = 0.7 + Math.cos(elapsed * 1.2 + i) * 0.2;
        }
        smokeAttr.needsUpdate = true;
      }

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

      // 5. Weather Particles (Rain / Winter Snow)
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
        }
        wAttr.needsUpdate = true;
      }

      // 5b. Dedicated Night Fireflies (strictly skipped on Low graphics quality)
      if (this.fireflyPoints && this.fireflyPoints.visible) {
        const fAttr = this.fireflyPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        const fCount = this.fireflyPositions.length / 3;
        for (let i = 0; i < fCount; i++) {
          const bx = this.fireflyBases[i * 3];
          const by = this.fireflyBases[i * 3 + 1];
          const bz = this.fireflyBases[i * 3 + 2];
          const t = elapsed * 0.85 + i * 1.37;
          this.fireflyPositions[i * 3] = bx + Math.sin(t) * 0.95;
          this.fireflyPositions[i * 3 + 1] = by + Math.sin(t * 1.7 + i) * 0.42;
          this.fireflyPositions[i * 3 + 2] = bz + Math.cos(t * 0.9 + i * 0.5) * 0.95;
        }
        this.fireflyMat.opacity = 0.68 + Math.sin(elapsed * 3.1) * 0.2;
        fAttr.needsUpdate = true;
      }

      // 6. Agent Movement, Indoor Elevation & Enhanced Limb-Swing Kinematics
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const labelPositions = {} as Record<AgentId, ProjectedLabel>;
      const worldCoords = {} as Record<AgentId, AgentWorldCoord>;
      const walkSpeed =
        this.weatherMode === 'summer' ? 4.1 : this.weatherMode === 'rain' ? 3.5 : 3.0;

      this.rigs.forEach((rig) => {
        // Gentle local stroll around home post when idle so villagers naturally swing limbs
        if (rig.waypoints.length === 0) {
          rig.idleStrollTimer -= delta;
          if (rig.idleStrollTimer <= 0) {
            rig.idleStrollTimer = 7.5 + ((rig.slotIndex * 3.7 + elapsed) % 6.5);
            const strollAngle = (elapsed * 1.7 + rig.slotIndex * 2.1) % (Math.PI * 2);
            const isIndoorPost =
              (rig.currentPlotId !== null && this.completedPlots.has(rig.currentPlotId)) ||
              (Math.abs(rig.homeAnchor.x) < 2.2 && rig.homeAnchor.z < -8.8 && rig.homeAnchor.z > -12.0) ||
              (rig.homeAnchor.x > 8.9 && rig.homeAnchor.x < 12.1 && Math.abs(rig.homeAnchor.z + 0.5) < 1.5);
            const strollR = isIndoorPost ? 0.55 : 1.05;
            rig.waypoints.push(
              new THREE.Vector3(
                rig.homeAnchor.x + Math.cos(strollAngle) * strollR,
                0,
                rig.homeAnchor.z + Math.sin(strollAngle) * strollR,
              ),
            );
          }
        }

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
            const agentSpeed = rig.isInjured ? walkSpeed * 0.45 : walkSpeed;
            const step = Math.min(dist, agentSpeed * delta);
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

        // Smoothly elevate villagers when stepping onto indoor floors (Town Hall, Workshop, Completed Plots)
        let targetFloorY = 0;
        const rx = rig.root.position.x;
        const rz = rig.root.position.z;
        if (Math.abs(rx) < 2.4 && rz > -12.2 && rz < -8.8) {
          targetFloorY = 0.38;
        } else if (!this.isCleanFrontier && rx > 8.7 && rx < 12.2 && rz > -2.3 && rz < 1.3) {
          targetFloorY = 0.33;
        } else if (rig.currentPlotId && this.completedPlots.has(rig.currentPlotId)) {
          const pm = PLOT_META[rig.currentPlotId];
          if (Math.hypot(rx - pm.x, rz - pm.z) < 1.25) {
            targetFloorY = 0.28;
          }
        }
        rig.root.position.y = THREE.MathUtils.damp(rig.root.position.y, targetFloorY, 10, delta);

        if (rig.isMoving) {
          rig.walkPhase += delta * (walkSpeed * 3.4);
          const swing = Math.sin(rig.walkPhase) * 0.68;
          rig.leftLegPivot.rotation.x = swing;
          rig.rightLegPivot.rotation.x = -swing;
          rig.leftArmPivot.rotation.x = -swing * 0.85;
          rig.rightArmPivot.rotation.x = swing * 0.85;
          rig.bodyGroup.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.08;
          rig.bodyGroup.rotation.z = Math.sin(rig.walkPhase) * 0.055;
          rig.bodyGroup.rotation.y = Math.cos(rig.walkPhase) * 0.08;
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
          rig.bodyGroup.rotation.z = THREE.MathUtils.lerp(rig.bodyGroup.rotation.z, 0, settle);
          rig.bodyGroup.rotation.y = THREE.MathUtils.lerp(rig.bodyGroup.rotation.y, 0, settle);
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
        if (rig.injuredBadgeGroup.visible) {
          rig.injuredBadgeGroup.position.y = 2.08 + Math.sin(elapsed * 4.5 + rig.slotIndex) * 0.07;
          rig.injuredBadgeGroup.rotation.y = elapsed * 1.6;
        }

        _projVec.set(rig.root.position.x, 2.38, rig.root.position.z);
        _projVec.project(this.camera);
        const visible = rig.id !== this.povAgentId && _projVec.z > -1 && _projVec.z < 1;
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

      if (this.lifeHandle) {
        let idx = 0;
        this.rigs.forEach((rig) => {
          if (idx >= this.dogVillagerCoords.length) {
            this.dogVillagerCoords.push({ x: rig.root.position.x, z: rig.root.position.z });
          } else {
            this.dogVillagerCoords[idx].x = rig.root.position.x;
            this.dogVillagerCoords[idx].z = rig.root.position.z;
          }
          idx++;
        });
        this.dogVillagerCoords.length = idx;
        this.lifeHandle.update(delta, elapsed, this.timeOfDay, this.weatherMode, this.dogVillagerCoords);
      }

      if (this.raiderHandle) {
        let rIdx = 0;
        this.rigs.forEach((rig) => {
          if (rIdx >= this.raiderVillagerCoords.length) {
            this.raiderVillagerCoords.push({
              id: rig.id,
              x: rig.root.position.x,
              z: rig.root.position.z,
              injured: rig.isInjured,
            });
          } else {
            const slot = this.raiderVillagerCoords[rIdx];
            slot.id = rig.id;
            slot.x = rig.root.position.x;
            slot.z = rig.root.position.z;
            slot.injured = rig.isInjured;
          }
          rIdx++;
        });
        this.raiderVillagerCoords.length = rIdx;
        const vanceRig = this.rigs.get('commander_vance');
        const vanceDefending = Boolean(vanceRig && !vanceRig.isInjured);
        this.raiderHandle.update({
          delta,
          elapsed,
          active: this.raidState.active,
          tactic: this.raidState.tactic,
          campHpRatio: this.raidState.campHp / Math.max(1, this.raidState.campMaxHp),
          villagerCoords: this.raiderVillagerCoords,
          defenseTowers: this.defenseTowers,
          vanceDefending,
          onRaiderImpact: (x, z) => this.callbacks.onRaiderImpact?.(x, z),
          onDefenseHitCamp: (dmg) => this.callbacks.onDefenseHitCamp?.(dmg),
        });
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

  public syncRaidState(next: EnemyRaidState): void {
    const wasActive = this.raidState.active;
    this.raidState = next;
    if (wasActive && !next.active && next.campHp <= 0) {
      this.raiderHandle?.triggerCampVictoryBurst();
    }
  }

  public triggerRaidVictoryBurst(): void {
    this.raiderHandle?.triggerCampVictoryBurst();
  }

  public setDecorPacks(packs: DecorPackId[]): void {
    this.lifeHandle?.setDecorPacks(packs);
  }

  public triggerCelebration(): void {
    this.lifeHandle?.triggerCelebration();
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.controls.dispose();
    this.townHallSignTex?.dispose();
    this.townHallSignTex = null;
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
