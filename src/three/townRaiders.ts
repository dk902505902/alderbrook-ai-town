import * as THREE from 'three';
import type { EnemyCityState, GraphicsQuality, RaiderTactic } from '../types/town.ts';

/**
 * Permanent Rival Enemy Fortress Town ("Ironhold Bastion") across the southwest frontier,
 * clearly visible beyond Alderbrook's inner railway loop without overlapping any build plots.
 */
export const ENEMY_CITY_POS = new THREE.Vector3(-25.2, 0, 14.8);
export const RAIDER_CAMP_POS = ENEMY_CITY_POS;

/** Midpoint framing both Ironhold Bastion, forward battlefront, sky air-force lane & SW Alderbrook defenses */
export const BATTLE_FOCUS_TARGET = new THREE.Vector3(-16.8, 1.9, 10.2);

/** Direct focus target for inspecting the permanent Ironhold Bastion city, railway & airfield */
export const ENEMY_CITY_FOCUS_TARGET = new THREE.Vector3(-25.2, 2.2, 14.8);

export interface DefenseTowerAnchor {
  x: number;
  y: number;
  z: number;
  power: number;
  barrels?: 1 | 3;
}

export interface RaiderRadarDot {
  x: number;
  z: number;
  isCaptain: boolean;
}

export interface EnemyAircraftRadarDot {
  x: number;
  z: number;
  kind: 'helicopter' | 'jet';
}

export interface RaiderRadarSnapshot {
  campX: number;
  campZ: number;
  cityX: number;
  cityZ: number;
  railBuilt: boolean;
  buildingCount: number;
  squad: RaiderRadarDot[];
  aircraft: EnemyAircraftRadarDot[];
  counterSquad: Array<{ x: number; z: number }>;
  siegeBuiltCount: number;
  activeCannons: number;
  raidActive: boolean;
  counterRaidActive: boolean;
}

export interface RaiderUpdateParams {
  delta: number;
  elapsed: number;
  active: boolean;
  waveNumber: number;
  tactic: RaiderTactic;
  campHpRatio: number;
  enemyCity: EnemyCityState;
  villagerCoords: Array<{ id: string; x: number; z: number; injured: boolean }>;
  defenseTowers: DefenseTowerAnchor[];
  vanceDefending: boolean;
  vancePos: { x: number; z: number } | null;
  onRaiderImpact: (x: number, z: number, source: 'ground' | 'helicopter' | 'jet') => void;
  onDefenseHitCamp: (damage: number) => void;
  onEnemyAircraftDowned?: (kind: 'helicopter' | 'jet') => void;
}

export interface TownRaidersHandle {
  group: THREE.Group;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  update: (params: RaiderUpdateParams) => void;
  getRadarSnapshot: () => RaiderRadarSnapshot;
  triggerCampVictoryBurst: () => void;
  triggerCounterLootBurst: () => void;
  dispose: () => void;
}

type ProjectileKind =
  | 'cannonball'
  | 'raider_bolt'
  | 'air_rocket'
  | 'defense_volley'
  | 'aa_flak';

interface ActiveProjectile {
  alive: boolean;
  kind: ProjectileKind;
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  arcHeight: number;
  t: number;
  duration: number;
  damage: number;
  trailTimer: number;
  targetAircraftIdx: number; // >= 0 when AA flak targets a helicopter/jet
}

interface ActiveSpark {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  colorType: 0 | 1 | 2 | 3; // 0=orange-gold, 1=cyan defense, 2=crimson, 3=bright loot gold
}

interface ActiveTrail {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  scale: number;
  tone: 0 | 1 | 2; // 0=warm orange, 1=cyan defense, 2=jet thruster violet-amber
}

interface CannonRig {
  root: THREE.Group;
  barrelPivot: THREE.Group;
  muzzleFlash: THREE.Group;
  worldX: number;
  worldZ: number;
  yaw: number;
  recoil: number;
  flashTimer: number;
  fireCooldown: number;
  unlockTime: number;
  buildProgress: number;
  startedBuild: boolean;
  builtBurstDone: boolean;
}

interface SiegeStructureRig {
  root: THREE.Group;
  worldX: number;
  worldZ: number;
  unlockTime: number;
  buildProgress: number;
  startedBuild: boolean;
  builtBurstDone: boolean;
  beaconOrb?: THREE.Mesh;
  flagMesh?: THREE.Mesh;
}

interface MarchingRaiderRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  role: 'captain' | 'sapper' | 'vanguard';
  spawnX: number;
  spawnZ: number;
  coverX: number;
  coverZ: number;
  x: number;
  z: number;
  facingYaw: number;
  walkPhase: number;
  fireCooldown: number;
  strafePhase: number;
  buildSparkTimer: number;
  targetSiegeIndex: number;
}

interface EnemyAircraftRig {
  kind: 'helicopter' | 'jet';
  index: number;
  root: THREE.Group;
  mainRotor?: THREE.Group;
  tailRotor?: THREE.Group;
  parkedX: number;
  parkedY: number;
  parkedZ: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  phase: number;
  fireCooldown: number;
  trailTimer: number;
  respawnCooldown: number;
  airborne: boolean;
}

interface CounterRangerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  rightArm: THREE.Group;
  startX: number;
  startZ: number;
  assaultX: number;
  assaultZ: number;
  x: number;
  z: number;
  walkPhase: number;
  fireCooldown: number;
}

interface BastionTurretRig {
  root: THREE.Group;
  head: THREE.Group;
  flash: THREE.Mesh;
  worldX: number;
  worldZ: number;
  fireCooldown: number;
  flashTimer: number;
}

interface BastionWorkerRig {
  root: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  rightArm: THREE.Group;
  waypoints: Array<[number, number]>;
  wpIdx: number;
  x: number;
  z: number;
  phase: number;
}

const MAX_PROJECTILES = 64;
const MAX_SPARKS = 180;
const MAX_TRAILS = 156;

// Pre-allocated scratch transforms (zero GC inside animation loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _vPos = new THREE.Vector3();
const _vTan = new THREE.Vector3();
const _vSide = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _vLook = new THREE.Vector3();
const _cannonBallColor = new THREE.Color(0xff7a18);
const _raiderBoltColor = new THREE.Color(0xff3b30);
const _airRocketColor = new THREE.Color(0xfb923c);
const _defenseBallColor = new THREE.Color(0x38bdf8);
const _aaFlakColor = new THREE.Color(0xfef08a);
const _warmSparkColor = new THREE.Color(0xfbbf24);
const _crimsonSparkColor = new THREE.Color(0xfb7185);
const _coolSparkColor = new THREE.Color(0x7dd3fc);
const _lootGoldSparkColor = new THREE.Color(0xfde047);
const _warmTrailColor = new THREE.Color(0xf97316);
const _coolTrailColor = new THREE.Color(0x38bdf8);
const _jetTrailColor = new THREE.Color(0xfb7185);
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

function createSignBadgeTexture(
  label: string,
  bgHex: string,
  borderHex: string,
  textHex = '#fff1f2',
  width = 160,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, width, 40);
    ctx.fillStyle = bgHex;
    ctx.beginPath();
    ctx.roundRect(4, 4, width - 8, 32, 10);
    ctx.fill();
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = borderHex;
    ctx.beginPath();
    ctx.moveTo(18, 13);
    ctx.lineTo(24, 20);
    ctx.lineTo(18, 27);
    ctx.lineTo(12, 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = textHex;
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width * 0.56, 20);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildEnemyRailRibbon(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  halfGauge: number,
  railHalfWidth: number,
): THREE.BufferGeometry {
  const positions = new Float32Array((segments + 1) * 4 * 3);
  const normals = new Float32Array((segments + 1) * 4 * 3);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) % 1;
    curve.getPointAt(u, _vPos);
    curve.getTangentAt(u, _vTan).normalize();
    _vSide.crossVectors(_vUp, _vTan).normalize();

    const base = i * 4;
    const offsets = [
      -halfGauge - railHalfWidth,
      -halfGauge + railHalfWidth,
      halfGauge - railHalfWidth,
      halfGauge + railHalfWidth,
    ];
    for (let k = 0; k < 4; k++) {
      const idx = (base + k) * 3;
      positions[idx] = _vPos.x + _vSide.x * offsets[k];
      positions[idx + 1] = 0.16;
      positions[idx + 2] = _vPos.z + _vSide.z * offsets[k];
      normals[idx + 1] = 1;
    }

    if (i < segments) {
      const next = (i + 1) * 4;
      // Left rail quad
      indices.push(base, next, base + 1, base + 1, next, next + 1);
      // Right rail quad
      indices.push(base + 2, next + 2, base + 3, base + 3, next + 2, next + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds the permanent 100% Autonomous Rival Enemy Fortress Town ("Ironhold Bastion")
 * on the southwest frontier, complete with:
 * - Permanent Warlord Citadel, Munitions Foundry, War Loot Depot, Airfield Helipad/Runway,
 *   and North/South Bastion Defense Turrets (dynamically synced to EnemyCityState!)
 * - Permanent Enemy Supply Railway Loop (InstancedMesh sleepers + Armored Ore Train)
 * - Low-poly Attack Helicopters (spinning rotors) & Swept-Wing Fighter Jets (thruster trails)
 * - Anti-air flak/tracer bursts from Alderbrook's Triple-Gun Towers, Watchtowers & Commander Vance
 * - Active Ground Raider Squad + Alderbrook Counter-Raid Strike Squad for two-way Gold & Food looting
 */
export function buildTownRaidersSystem(shadowTex: THREE.Texture): TownRaidersHandle {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'ironhold_bastion_system';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  // Shared stylized low-poly PBR materials (varied roughness/metalness for crisp readability)
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const basaltMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.92 }));
  const citadelWallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78, metalness: 0.25 }),
  );
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.36, metalness: 0.72 }),
  );
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x263244, roughness: 0.32, metalness: 0.8 }),
  );
  const crimsonMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.62, metalness: 0.12 }),
  );
  const tentDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78 }));
  const woodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x6b3a19, roughness: 0.86 }));
  const darkWoodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x45240e, roughness: 0.9 }));
  const brassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.24, metalness: 0.88 }),
  );
  const goldLootMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.22, metalness: 0.9 }),
  );
  const foodSackMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd6b37a, roughness: 0.94 }));
  const tarmacMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.94 }));
  const runwayMarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.65 }));
  const canopyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.16,
      metalness: 0.5,
    }),
  );
  const jetBodyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.78 }),
  );
  const heliBodyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.44, metalness: 0.55 }),
  );
  const fireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf97316,
      emissiveIntensity: 1.8,
      roughness: 0.25,
    }),
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xef4444,
      emissiveIntensity: 2.1,
      roughness: 0.2,
    }),
  );
  const muzzleFlashMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  const muzzleCoreMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  const rangerBlueMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.52, metalness: 0.25 }),
  );
  const rangerGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    }),
  );

  // ── 1. PERMANENT RIVAL FORTRESS CITY ("IRONHOLD BASTION") ────────────────
  const cityGroup = new THREE.Group();
  cityGroup.name = 'landmark:ironhold_bastion';
  cityGroup.position.copy(ENEMY_CITY_POS);
  const cityFacingYaw = Math.atan2(-ENEMY_CITY_POS.x, -ENEMY_CITY_POS.z);
  cityGroup.rotation.y = cityFacingYaw;
  rootGroup.add(cityGroup);

  const cityShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(16.2, 14.8)), shadowMat);
  cityShadow.rotation.x = -Math.PI / 2;
  cityShadow.position.y = 0.02;
  cityGroup.add(cityShadow);

  const plateauPad = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(6.9, 7.6, 0.14, 16)),
    basaltMat,
  );
  plateauPad.position.y = 0.07;
  plateauPad.receiveShadow = true;
  cityGroup.add(plateauPad);

  // Instanced Perimeter Iron Palisade Stakes (18 instances -> 1 draw call!)
  const stakeGeo = trackGeo(new THREE.ConeGeometry(0.12, 1.18, 5));
  const PERIM_STAKES = 18;
  const stakeInstanced = new THREE.InstancedMesh(stakeGeo, darkWoodMat, PERIM_STAKES);
  for (let i = 0; i < PERIM_STAKES; i++) {
    const a = (i / PERIM_STAKES) * Math.PI * 2;
    _dummy.position.set(Math.cos(a) * 6.45, 0.56, Math.sin(a) * 5.85);
    _dummy.rotation.set(Math.sin(a) * 0.22, -a, -Math.cos(a) * 0.22);
    _dummy.scale.set(1, 0.9 + (i % 3) * 0.12, 1);
    _dummy.updateMatrix();
    stakeInstanced.setMatrixAt(i, _dummy.matrix);
  }
  stakeInstanced.instanceMatrix.needsUpdate = true;
  stakeInstanced.computeBoundingSphere();
  cityGroup.add(stakeInstanced);

  // Permanent Floating City Title Sign above Ironhold Citadel
  const cityBannerTex = trackTex(
    createSignBadgeTexture('IRONHOLD BASTION', '#450a0a', '#f87171', '#fef2f2', 196),
  );
  const cityBannerMat = trackMat(
    new THREE.SpriteMaterial({ map: cityBannerTex, transparent: true, depthTest: false }),
  );
  const cityBannerSprite = new THREE.Sprite(cityBannerMat);
  cityBannerSprite.position.set(0, 6.2, -0.5);
  cityBannerSprite.scale.set(3.8, 0.78, 1);
  cityBannerSprite.renderOrder = 22;
  cityGroup.add(cityBannerSprite);

  // Floating 3D Integrity Bar (shown during raids or counter-raids)
  const hpBgMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  const hpFillMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.set(0, 5.45, -0.5);
  hpBarGroup.visible = false;
  const hpBarBg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 0.28, 0.1)), hpBgMat);
  const hpBarFill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.04, 0.18, 0.12)), hpFillMat);
  hpBarFill.position.z = 0.02;
  hpBarGroup.add(hpBarBg, hpBarFill);
  cityGroup.add(hpBarGroup);

  // ── 1A. Warlord Citadel (Permanent Core Keep, upgrades L1 -> L3) ──
  const citadelGroup = new THREE.Group();
  citadelGroup.position.set(0, 0.12, -0.5);
  cityGroup.add(citadelGroup);

  const citadelBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(3.4, 2.3, 3.1)),
    citadelWallMat,
  );
  citadelBase.position.y = 1.15;
  citadelBase.castShadow = true;
  citadelBase.receiveShadow = true;
  const citadelUpper = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.15, 1.55, 2.0)),
    steelMat,
  );
  citadelUpper.position.y = 2.95;
  citadelUpper.castShadow = true;
  const citadelCrown = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(1.55, 1.05, 4)),
    crimsonMat,
  );
  citadelCrown.rotation.y = Math.PI / 4;
  citadelCrown.position.y = 4.22;
  const warVisor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.45, 0.24, 0.12)), beaconMat);
  warVisor.position.set(0, 2.98, 1.01);
  const citadelGate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 1.32, 0.14)), ironMat);
  citadelGate.position.set(0, 0.66, 1.54);
  const citadelArchTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 0.18, 0.18)), brassMat);
  citadelArchTrim.position.set(0, 1.38, 1.55);
  citadelGroup.add(citadelBase, citadelUpper, citadelCrown, warVisor, citadelGate, citadelArchTrim);

  // 4 Corner Bastion Spires
  const cornerSpireGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.42, 3.1, 6));
  const spireCapGeo = trackGeo(new THREE.ConeGeometry(0.4, 0.65, 6));
  for (const [cx, cz] of [
    [-1.65, -1.48],
    [1.65, -1.48],
    [-1.65, 1.48],
    [1.65, 1.48],
  ] as Array<[number, number]>) {
    const sp = new THREE.Mesh(cornerSpireGeo, citadelWallMat);
    sp.position.set(cx, 1.55, cz);
    const cap = new THREE.Mesh(spireCapGeo, ironMat);
    cap.position.set(cx, 3.4, cz);
    citadelGroup.add(sp, cap);
  }
  const citadelPennant = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 0.48, 0.05)), crimsonMat);
  citadelPennant.position.set(0.65, 4.78, 0);
  const citadelPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6)), brassMat);
  citadelPole.position.set(0, 4.75, 0);
  citadelGroup.add(citadelPole, citadelPennant);

  // ── 1B. Munitions Foundry (Autonomous Building) ──
  const foundryGroup = new THREE.Group();
  foundryGroup.position.set(-3.7, 0.12, -2.1);
  foundryGroup.visible = false;
  cityGroup.add(foundryGroup);

  const fHall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.55, 1.75, 2.2)), citadelWallMat);
  fHall.position.y = 0.88;
  fHall.castShadow = true;
  const fRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.75, 0.24, 2.38)), ironMat);
  fRoof.position.y = 1.84;
  const fFurnaceGlow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.2, 0.68, 0.12)), fireMat);
  fFurnaceGlow.position.set(0, 0.68, 1.1);
  const stackGeo = trackGeo(new THREE.CylinderGeometry(0.2, 0.28, 2.4, 7));
  const collarGeo = trackGeo(new THREE.TorusGeometry(0.22, 0.055, 6, 8));
  const stackA = new THREE.Mesh(stackGeo, ironMat);
  stackA.position.set(-0.72, 2.6, -0.45);
  const stackB = new THREE.Mesh(stackGeo, ironMat);
  stackB.position.set(0.55, 2.35, -0.45);
  const collarA = new THREE.Mesh(collarGeo, brassMat);
  collarA.rotation.x = Math.PI / 2;
  collarA.position.set(-0.72, 3.62, -0.45);
  const fForgeFlame = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.28, 0)), fireMat);
  fForgeFlame.position.set(-0.72, 3.92, -0.45);
  foundryGroup.add(fHall, fRoof, fFurnaceGlow, stackA, stackB, collarA, fForgeFlame);

  // ── 1C. War Loot Depot (Holds Visible Gold Bullion & Food Sacks!) ──
  const depotGroup = new THREE.Group();
  depotGroup.position.set(-3.3, 0.12, 2.35);
  depotGroup.visible = false;
  cityGroup.add(depotGroup);

  const dVault = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.45, 1.5, 1.95)), steelMat);
  dVault.position.y = 0.75;
  dVault.castShadow = true;
  const dRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.68, 0.22, 2.15)), crimsonMat);
  dRoof.position.y = 1.6;
  // Visible loot piles in front awning bay (Gold Bars + Grain/Food Sacks)
  const goldBarGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.2, 0.24));
  const sackGeo = trackGeo(new THREE.DodecahedronGeometry(0.26, 0));
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(goldBarGeo, goldLootMat);
    bar.position.set(-0.65 + i * 0.42, 0.14 + (i === 1 ? 0.18 : 0), 1.24);
    depotGroup.add(bar);
  }
  for (let i = 0; i < 3; i++) {
    const sack = new THREE.Mesh(sackGeo, foodSackMat);
    sack.position.set(0.55 + (i % 2) * 0.34, 0.22 + (i === 2 ? 0.26 : 0), 1.18 + (i === 1 ? 0.2 : 0));
    depotGroup.add(sack);
  }
  depotGroup.add(dVault, dRoof);

  // ── 1D. Airfield Helipad & Runway (Unlocks Helicopters & Fighter Jets!) ──
  const airfieldGroup = new THREE.Group();
  airfieldGroup.position.set(2.85, 0.12, 2.75);
  airfieldGroup.visible = false;
  cityGroup.add(airfieldGroup);

  const runwayPad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.2, 0.08, 4.9)), tarmacMat);
  runwayPad.position.set(0.7, 0.04, 0);
  runwayPad.receiveShadow = true;
  airfieldGroup.add(runwayPad);
  // Runway center dashes
  const dashGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.02, 0.52));
  for (let i = -2; i <= 2; i++) {
    const dash = new THREE.Mesh(dashGeo, runwayMarkMat);
    dash.position.set(0.7, 0.09, i * 0.92);
    airfieldGroup.add(dash);
  }
  // Circular Helipad with painted "H"
  const heliPadDisc = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.38, 1.45, 0.09, 14)), tarmacMat);
  heliPadDisc.position.set(-1.35, 0.045, 0.35);
  const heliRing = new THREE.Mesh(trackGeo(new THREE.RingGeometry(1.05, 1.22, 16)), runwayMarkMat);
  heliRing.rotation.x = -Math.PI / 2;
  heliRing.position.set(-1.35, 0.095, 0.35);
  const hBarGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.02, 0.92));
  const hLeft = new THREE.Mesh(hBarGeo, runwayMarkMat);
  hLeft.position.set(-1.62, 0.098, 0.35);
  const hRight = new THREE.Mesh(hBarGeo, runwayMarkMat);
  hRight.position.set(-1.08, 0.098, 0.35);
  const hCross = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 0.02, 0.16)), runwayMarkMat);
  hCross.position.set(-1.35, 0.098, 0.35);

  // Airfield Control Tower + Spinning Radar Dish
  const atcBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 1.9, 0.92)), citadelWallMat);
  atcBase.position.set(-1.35, 0.95, -1.55);
  const atcCab = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.66, 0.56, 0.65, 6)), canopyMat);
  atcCab.position.set(-1.35, 2.22, -1.55);
  const radarDishGroup = new THREE.Group();
  radarDishGroup.position.set(-1.35, 2.75, -1.55);
  const dishMesh = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.42, 0.24, 8)), steelMat);
  dishMesh.rotation.x = Math.PI / 2;
  const dishTip = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.08, 6, 5)), beaconMat);
  dishTip.position.z = 0.24;
  radarDishGroup.add(dishMesh, dishTip);
  airfieldGroup.add(heliPadDisc, heliRing, hLeft, hRight, hCross, atcBase, atcCab, radarDishGroup);

  // ── 1E. North & South Enemy Defense Turrets ──
  const turretBaseGeo = trackGeo(new THREE.CylinderGeometry(0.95, 1.15, 1.1, 8));
  const turretHeadGeo = trackGeo(new THREE.BoxGeometry(1.05, 0.56, 1.08));
  const turretBarrelGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.12, 1.25, 6));
  const flashCoreGeo = trackGeo(new THREE.OctahedronGeometry(0.28, 0));

  const createBastionTurret = (localX: number, localZ: number): BastionTurretRig => {
    const tRoot = new THREE.Group();
    tRoot.position.set(localX, 0.12, localZ);
    tRoot.visible = false;
    cityGroup.add(tRoot);

    const base = new THREE.Mesh(turretBaseGeo, citadelWallMat);
    base.position.y = 0.55;
    base.castShadow = true;
    const collar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.86, 0.92, 0.16, 8)), crimsonMat);
    collar.position.y = 1.12;
    const head = new THREE.Group();
    head.position.y = 1.44;
    const housing = new THREE.Mesh(turretHeadGeo, ironMat);
    const bL = new THREE.Mesh(turretBarrelGeo, brassMat);
    bL.rotation.x = Math.PI / 2;
    bL.position.set(-0.24, 0.05, 0.84);
    const bR = new THREE.Mesh(turretBarrelGeo, brassMat);
    bR.rotation.x = Math.PI / 2;
    bR.position.set(0.24, 0.05, 0.84);
    const flash = new THREE.Mesh(flashCoreGeo, muzzleFlashMat);
    flash.position.set(0, 0.05, 1.56);
    flash.visible = false;
    head.add(housing, bL, bR, flash);
    tRoot.add(base, collar, head);

    // Precompute world coords for projectiles
    const cosY = Math.cos(cityFacingYaw);
    const sinY = Math.sin(cityFacingYaw);
    const wx = ENEMY_CITY_POS.x + localX * cosY + localZ * sinY;
    const wz = ENEMY_CITY_POS.z - localX * sinY + localZ * cosY;

    return {
      root: tRoot,
      head,
      flash,
      worldX: wx,
      worldZ: wz,
      fireCooldown: 2.2 + Math.random() * 1.4,
      flashTimer: 0,
    };
  };

  const northTurret = createBastionTurret(3.35, -2.55);
  const southTurret = createBastionTurret(0.35, 3.85);

  // ── 1F. Enemy Supply Railway Loop & Armored Ore Train (Autonomous!) ──
  const enemyRailGroup = new THREE.Group();
  enemyRailGroup.visible = false;
  cityGroup.add(enemyRailGroup);

  const railLoopPts: THREE.Vector3[] = [];
  const RAIL_CTRL_PTS = 14;
  for (let i = 0; i < RAIL_CTRL_PTS; i++) {
    const a = (i / RAIL_CTRL_PTS) * Math.PI * 2;
    railLoopPts.push(new THREE.Vector3(Math.cos(a) * 6.95, 0.14, Math.sin(a) * 6.25));
  }
  const enemyRailCurve = new THREE.CatmullRomCurve3(railLoopPts, true, 'catmullrom', 0.45);
  const railGeo = trackGeo(buildEnemyRailRibbon(enemyRailCurve, 76, 0.34, 0.065));
  const railMesh = new THREE.Mesh(railGeo, steelMat);
  enemyRailGroup.add(railMesh);

  // Instanced Iron Sleepers (44 instances -> 1 draw call!)
  const SLEEPER_COUNT = 44;
  const sleeperGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.06, 0.16));
  const sleeperInstanced = new THREE.InstancedMesh(sleeperGeo, darkWoodMat, SLEEPER_COUNT);
  for (let i = 0; i < SLEEPER_COUNT; i++) {
    const u = i / SLEEPER_COUNT;
    enemyRailCurve.getPointAt(u, _vPos);
    enemyRailCurve.getTangentAt(u, _vTan).normalize();
    _dummy.position.set(_vPos.x, 0.13, _vPos.z);
    _dummy.rotation.set(0, Math.atan2(_vTan.x, _vTan.z), 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    sleeperInstanced.setMatrixAt(i, _dummy.matrix);
  }
  sleeperInstanced.instanceMatrix.needsUpdate = true;
  sleeperInstanced.computeBoundingSphere();
  enemyRailGroup.add(sleeperInstanced);

  // Armored Ore Train (Locomotive + Ore Hopper Car)
  const oreLoco = new THREE.Group();
  const locoChassis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 0.28, 1.95)), ironMat);
  locoChassis.position.y = 0.36;
  const locoBoiler = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.38, 1.18, 8)), citadelWallMat);
  locoBoiler.rotation.x = Math.PI / 2;
  locoBoiler.position.set(0, 0.72, 0.28);
  const locoCab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.94, 0.76, 0.72)), crimsonMat);
  locoCab.position.set(0, 0.86, -0.58);
  const locoStack = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.1, 0.44, 6)), brassMat);
  locoStack.position.set(0, 1.14, 0.65);
  const locoLight = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.12, 6, 6)), fireMat);
  locoLight.position.set(0, 0.72, 0.94);
  oreLoco.add(locoChassis, locoBoiler, locoCab, locoStack, locoLight);
  enemyRailGroup.add(oreLoco);

  const oreCar = new THREE.Group();
  const carBin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.88, 0.56, 1.52)), steelMat);
  carBin.position.y = 0.56;
  const carStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 0.14, 1.54)), crimsonMat);
  carStripe.position.y = 0.64;
  const orePile = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.42, 0)), goldLootMat);
  orePile.scale.set(0.88, 0.45, 1.45);
  orePile.position.y = 0.86;
  oreCar.add(carBin, carStripe, orePile);
  enemyRailGroup.add(oreCar);

  // ── 1G. Permanent Autonomous Ironhold Workers (3 Miners/Builders) ──
  const wTorsoGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.48, 0.24));
  const wHeadGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.28, 0.28));
  const wLegGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.36, 0.13));
  const wArmGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.34, 0.11));
  const rSkinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfde2c8, roughness: 0.65 }));
  const rCoatMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 }));
  const rPantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));

  const bastionWorkerRoutes: Array<Array<[number, number]>> = [
    [
      [-2.1, -1.6],
      [-0.2, 1.6],
      [-2.6, 1.4],
    ],
    [
      [1.8, -1.2],
      [2.1, 1.5],
      [0.4, 2.2],
    ],
    [
      [-1.5, 2.5],
      [-3.1, 0.1],
      [-1.8, -2.5],
    ],
  ];

  const bastionWorkers: BastionWorkerRig[] = bastionWorkerRoutes.map((waypoints, idx) => {
    const wr = new THREE.Group();
    wr.position.set(waypoints[0][0], 0.12, waypoints[0][1]);
    const torso = new THREE.Mesh(wTorsoGeo, idx === 0 ? crimsonMat : woodMat);
    torso.position.y = 0.62;
    const head = new THREE.Mesh(wHeadGeo, rSkinMat);
    head.position.y = 1.02;
    const helm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.2, 0.18, 0.14, 6)), brassMat);
    helm.position.y = 1.2;
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.09, 0.38, 0);
    const lM = new THREE.Mesh(wLegGeo, rPantsMat);
    lM.position.y = -0.18;
    leftLeg.add(lM);
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.09, 0.38, 0);
    const rM = new THREE.Mesh(wLegGeo, rPantsMat);
    rM.position.y = -0.18;
    rightLeg.add(rM);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.24, 0.8, 0);
    const aM = new THREE.Mesh(wArmGeo, rCoatMat);
    aM.position.y = -0.15;
    rightArm.add(aM);
    wr.add(torso, head, helm, leftLeg, rightLeg, rightArm);
    cityGroup.add(wr);

    return {
      root: wr,
      leftLeg,
      rightLeg,
      rightArm,
      waypoints,
      wpIdx: 1,
      x: waypoints[0][0],
      z: waypoints[0][1],
      phase: idx * 2.1,
    };
  });

  // ── 2. ENEMY AIR FORCE: 2 LOW-POLY ATTACK HELICOPTERS + 2 SWEPT-WING FIGHTER JETS ──
  const heliBodyGeo = trackGeo(new THREE.BoxGeometry(1.05, 0.72, 2.05));
  const heliNoseGeo = trackGeo(new THREE.ConeGeometry(0.56, 0.88, 6));
  const heliTailGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.26, 1.85));
  const heliBladeGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.05, 0.22));
  const heliTailBladeGeo = trackGeo(new THREE.BoxGeometry(0.05, 0.82, 0.12));
  const heliSkidGeo = trackGeo(new THREE.BoxGeometry(0.1, 0.08, 1.9));
  const podGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.72, 6));

  const jetFuselageGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.38, 2.95, 7));
  const jetNoseGeo = trackGeo(new THREE.ConeGeometry(0.24, 0.95, 7));
  const jetWingGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.08, 1.15));
  const jetFinGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.72, 0.65));
  const jetNozzleGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 6));

  const createAttackHelicopter = (index: number): EnemyAircraftRig => {
    const hRoot = new THREE.Group();
    hRoot.visible = false;
    rootGroup.add(hRoot);

    const fuselage = new THREE.Mesh(heliBodyGeo, heliBodyMat);
    const nose = new THREE.Mesh(heliNoseGeo, canopyMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.04, 1.44);
    const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.08, 0.18, 1.65)), crimsonMat);
    stripe.position.set(0, 0.14, -0.05);
    const tailBoom = new THREE.Mesh(heliTailGeo, heliBodyMat);
    tailBoom.position.set(0, 0.14, -1.85);
    const tailFin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.68, 0.45)), crimsonMat);
    tailFin.position.set(0, 0.36, -2.65);

    const skidL = new THREE.Mesh(heliSkidGeo, steelMat);
    skidL.position.set(-0.56, -0.58, 0.1);
    const skidR = new THREE.Mesh(heliSkidGeo, steelMat);
    skidR.position.set(0.56, -0.58, 0.1);

    // Side Rocket Pods
    const podL = new THREE.Mesh(podGeo, brassMat);
    podL.rotation.x = Math.PI / 2;
    podL.position.set(-0.74, -0.1, 0.25);
    const podR = new THREE.Mesh(podGeo, brassMat);
    podR.rotation.x = Math.PI / 2;
    podR.position.set(0.74, -0.1, 0.25);

    // Spinning Main Rotor
    const mainRotor = new THREE.Group();
    mainRotor.position.set(0, 0.56, 0.05);
    const blade1 = new THREE.Mesh(heliBladeGeo, steelMat);
    const blade2 = new THREE.Mesh(heliBladeGeo, steelMat);
    blade2.rotation.y = Math.PI / 2;
    const rotorHub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 6)), brassMat);
    mainRotor.add(blade1, blade2, rotorHub);

    // Spinning Tail Rotor
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.14, 0.42, -2.68);
    const tBlade = new THREE.Mesh(heliTailBladeGeo, brassMat);
    tailRotor.add(tBlade);

    hRoot.add(fuselage, nose, stripe, tailBoom, tailFin, skidL, skidR, podL, podR, mainRotor, tailRotor);

    // Parked coordinates at Ironhold Airfield Helipad
    const localX = 1.5 - index * 0.6;
    const localZ = 3.1 + index * 1.15;
    const cosY = Math.cos(cityFacingYaw);
    const sinY = Math.sin(cityFacingYaw);
    const px = ENEMY_CITY_POS.x + localX * cosY + localZ * sinY;
    const pz = ENEMY_CITY_POS.z - localX * sinY + localZ * cosY;

    return {
      kind: 'helicopter',
      index,
      root: hRoot,
      mainRotor,
      tailRotor,
      parkedX: px,
      parkedY: 0.78,
      parkedZ: pz,
      x: px,
      y: 0.78,
      z: pz,
      yaw: cityFacingYaw,
      hp: 45,
      maxHp: 45,
      phase: index * Math.PI,
      fireCooldown: 2.0 + index * 1.3,
      trailTimer: 0,
      respawnCooldown: 0,
      airborne: false,
    };
  };

  const createFighterJet = (index: number): EnemyAircraftRig => {
    const jRoot = new THREE.Group();
    jRoot.visible = false;
    rootGroup.add(jRoot);

    const fuselage = new THREE.Mesh(jetFuselageGeo, jetBodyMat);
    fuselage.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(jetNoseGeo, crimsonMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 1.94);
    const canopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.28, 0.92)), canopyMat);
    canopy.position.set(0, 0.28, 0.62);

    // Swept Delta Wings
    const wingMain = new THREE.Mesh(jetWingGeo, jetBodyMat);
    wingMain.position.set(0, -0.02, -0.25);
    const wingTipL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.09, 0.55)), crimsonMat);
    wingTipL.position.set(-1.62, -0.02, -0.52);
    const wingTipR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.09, 0.55)), crimsonMat);
    wingTipR.position.set(1.62, -0.02, -0.52);

    // Twin Canted Vertical Stabilizers
    const finL = new THREE.Mesh(jetFinGeo, crimsonMat);
    finL.position.set(-0.46, 0.36, -1.12);
    finL.rotation.z = 0.26;
    const finR = new THREE.Mesh(jetFinGeo, crimsonMat);
    finR.position.set(0.46, 0.36, -1.12);
    finR.rotation.z = -0.26;

    // Glowing Twin Afterburners
    const nozL = new THREE.Mesh(jetNozzleGeo, fireMat);
    nozL.rotation.x = Math.PI / 2;
    nozL.position.set(-0.18, 0, -1.56);
    const nozR = new THREE.Mesh(jetNozzleGeo, fireMat);
    nozR.rotation.x = Math.PI / 2;
    nozR.position.set(0.18, 0, -1.56);

    jRoot.add(fuselage, nose, canopy, wingMain, wingTipL, wingTipR, finL, finR, nozL, nozR);

    const localX = 3.55;
    const localZ = 1.65 + index * 2.15;
    const cosY = Math.cos(cityFacingYaw);
    const sinY = Math.sin(cityFacingYaw);
    const px = ENEMY_CITY_POS.x + localX * cosY + localZ * sinY;
    const pz = ENEMY_CITY_POS.z - localX * sinY + localZ * cosY;

    return {
      kind: 'jet',
      index,
      root: jRoot,
      parkedX: px,
      parkedY: 0.62,
      parkedZ: pz,
      x: px,
      y: 0.62,
      z: pz,
      yaw: cityFacingYaw,
      hp: 36,
      maxHp: 36,
      phase: index * Math.PI + 0.8,
      fireCooldown: 1.6 + index * 1.1,
      trailTimer: 0,
      respawnCooldown: 0,
      airborne: false,
    };
  };

  const aircraftList: EnemyAircraftRig[] = [
    createAttackHelicopter(0),
    createAttackHelicopter(1),
    createFighterJet(0),
    createFighterJet(1),
  ];

  // ── 3. ACTIVE RAID FORWARD BATTLEFRONT (Barricades, Siege Cannons, Marching Squad) ──
  const battleGroup = new THREE.Group();
  battleGroup.visible = false;
  rootGroup.add(battleGroup);

  const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10));
  const carriageGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.3, 1.18));
  const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 1.52, 10));
  const muzzleRingGeo = trackGeo(new THREE.TorusGeometry(0.22, 0.055, 6, 10));
  const breechKnobGeo = trackGeo(new THREE.SphereGeometry(0.22, 8, 6));
  const flashConeGeo = trackGeo(new THREE.ConeGeometry(0.44, 1.05, 6));
  const smallShadowGeo = trackGeo(new THREE.PlaneGeometry(2.8, 2.8));

  const createSiegeCannon = (
    worldX: number,
    worldZ: number,
    unlockTime: number,
    initialCooldown: number,
  ): CannonRig => {
    const yaw = Math.atan2(-8.2 - worldX, 4.2 - worldZ);
    const cRoot = new THREE.Group();
    cRoot.position.set(worldX, 0, worldZ);
    cRoot.rotation.y = yaw;
    battleGroup.add(cRoot);

    const cShadow = new THREE.Mesh(smallShadowGeo, shadowMat);
    cShadow.rotation.x = -Math.PI / 2;
    cShadow.position.y = 0.025;
    cRoot.add(cShadow);

    const leftWheel = new THREE.Mesh(wheelGeo, woodMat);
    leftWheel.rotation.z = Math.PI / 2;
    leftWheel.position.set(-0.46, 0.42, 0);
    const rightWheel = new THREE.Mesh(wheelGeo, woodMat);
    rightWheel.rotation.z = Math.PI / 2;
    rightWheel.position.set(0.46, 0.42, 0);
    const carriage = new THREE.Mesh(carriageGeo, darkWoodMat);
    carriage.position.set(0, 0.46, -0.08);
    cRoot.add(leftWheel, rightWheel, carriage);

    const barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0.72, 0.05);
    cRoot.add(barrelPivot);

    const barrelMesh = new THREE.Mesh(barrelGeo, ironMat);
    barrelMesh.rotation.x = Math.PI / 2 - 0.32;
    barrelMesh.position.set(0, 0.16, 0.34);
    barrelMesh.castShadow = true;
    const muzzleRing = new THREE.Mesh(muzzleRingGeo, brassMat);
    muzzleRing.position.set(0, 0.41, 1.02);
    const breechKnob = new THREE.Mesh(breechKnobGeo, brassMat);
    breechKnob.position.set(0, -0.04, -0.35);

    const muzzleFlash = new THREE.Group();
    muzzleFlash.position.set(0, 0.45, 1.24);
    muzzleFlash.rotation.x = Math.PI / 2 - 0.32;
    muzzleFlash.visible = false;
    const flashCone = new THREE.Mesh(flashConeGeo, muzzleFlashMat);
    flashCone.position.y = 0.42;
    const flashCore = new THREE.Mesh(flashCoreGeo, muzzleCoreMat);
    muzzleFlash.add(flashCone, flashCore);

    barrelPivot.add(barrelMesh, muzzleRing, breechKnob, muzzleFlash);

    const startsBuilt = unlockTime <= 0;
    cRoot.visible = startsBuilt;
    cRoot.scale.set(1, startsBuilt ? 1 : 0.01, 1);

    return {
      root: cRoot,
      barrelPivot,
      muzzleFlash,
      worldX,
      worldZ,
      yaw,
      recoil: 0,
      flashTimer: 0,
      fireCooldown: initialCooldown,
      unlockTime,
      buildProgress: startsBuilt ? 1 : 0,
      startedBuild: startsBuilt,
      builtBurstDone: startsBuilt,
    };
  };

  const cannons: CannonRig[] = [
    createSiegeCannon(-18.6, 11.4, 0, 1.4),
    createSiegeCannon(-15.4, 9.6, 4.8, 2.5),
    createSiegeCannon(-16.2, 6.4, 8.2, 3.1),
  ];

  // Forward Siege Barricades & Signal Tower
  const barricadeBeamGeo = trackGeo(new THREE.BoxGeometry(2.35, 0.32, 0.34));
  const barricadePostGeo = trackGeo(new THREE.BoxGeometry(0.24, 1.28, 0.24));
  const ironStrapGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.96, 0.38));

  const createSiegeBarricade = (
    worldX: number,
    worldZ: number,
    unlockTime: number,
  ): SiegeStructureRig => {
    const yaw = Math.atan2(-6.0 - worldX, 3.5 - worldZ);
    const bRoot = new THREE.Group();
    bRoot.position.set(worldX, 0, worldZ);
    bRoot.rotation.y = yaw;
    bRoot.visible = false;
    bRoot.scale.set(1, 0.01, 1);
    battleGroup.add(bRoot);

    for (let row = 0; row < 3; row++) {
      const log = new THREE.Mesh(barricadeBeamGeo, row === 1 ? darkWoodMat : woodMat);
      log.position.set(0, 0.22 + row * 0.34, 0);
      bRoot.add(log);
    }
    for (const px of [-0.92, 0.92]) {
      const post = new THREE.Mesh(barricadePostGeo, darkWoodMat);
      post.position.set(px, 0.64, -0.05);
      const strap = new THREE.Mesh(ironStrapGeo, ironMat);
      strap.position.set(px * 0.62, 0.56, 0.01);
      bRoot.add(post, strap);
    }
    const warStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.16, 0.06)), crimsonMat);
    warStripe.position.set(0, 0.92, 0.19);
    bRoot.add(warStripe);

    return {
      root: bRoot,
      worldX,
      worldZ,
      unlockTime,
      buildProgress: 0,
      startedBuild: false,
      builtBurstDone: false,
    };
  };

  const createSignalTower = (worldX: number, worldZ: number, unlockTime: number): SiegeStructureRig => {
    const tRoot = new THREE.Group();
    tRoot.position.set(worldX, 0, worldZ);
    tRoot.rotation.y = Math.atan2(-worldX, -worldZ);
    tRoot.visible = false;
    tRoot.scale.set(1, 0.01, 1);
    battleGroup.add(tRoot);

    const legGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 4.1, 6));
    for (const [lx, lz] of [
      [-0.7, -0.7],
      [0.7, -0.7],
      [-0.7, 0.7],
      [0.7, 0.7],
    ] as Array<[number, number]>) {
      const leg = new THREE.Mesh(legGeo, darkWoodMat);
      leg.position.set(lx * 0.88, 2.05, lz * 0.88);
      tRoot.add(leg);
    }
    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.22, 1.8)), woodMat);
    deck.position.y = 4.0;
    const beaconOrb = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.42, 0)), beaconMat);
    beaconOrb.position.set(0, 4.9, 0);
    const flagMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.44, 0.05)), crimsonMat);
    flagMesh.position.set(1.15, 5.4, -0.6);
    tRoot.add(deck, beaconOrb, flagMesh);

    return {
      root: tRoot,
      worldX,
      worldZ,
      unlockTime,
      buildProgress: 0,
      startedBuild: false,
      builtBurstDone: false,
      beaconOrb,
      flagMesh,
    };
  };

  const siegeStructures: SiegeStructureRig[] = [
    createSiegeBarricade(-14.3, 7.6, 1.2),
    createSignalTower(-19.5, 9.2, 2.5),
    createSiegeBarricade(-13.6, 9.6, 3.6),
    createSiegeBarricade(-15.2, 5.5, 5.4),
  ];

  // ── 4. MARCHING SQUAD OF 6 ARTICULATED RAIDERS WITH FLOATING RED TAGS ──
  const rTorsoGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.56, 0.28));
  const rTrimGeo = trackGeo(new THREE.BoxGeometry(0.49, 0.14, 0.31));
  const rHeadGeo = trackGeo(new THREE.BoxGeometry(0.35, 0.35, 0.35));
  const rHelmGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.22, 0.18, 6));
  const rPlumeGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.28, 5));
  const rLegGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.44, 0.16));
  const rArmGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.42, 0.14));
  const rBlasterGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.07, 0.54, 6));
  const rHammerHeadGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.14, 0.14));

  const captainTagTex = trackTex(createSignBadgeTexture('IRONJAW', '#991b1b', '#fca5a5'));
  const sapperTagTex = trackTex(createSignBadgeTexture('SAPPER', '#9a3412', '#fdba74'));
  const raiderTagTex = trackTex(createSignBadgeTexture('RAIDER', '#7f1d1d', '#f87171'));
  const rangerTagTex = trackTex(createSignBadgeTexture('ALDERBROOK', '#0c4a6e', '#7dd3fc', '#e0f2fe'));

  const captainTagMat = trackMat(
    new THREE.SpriteMaterial({ map: captainTagTex, transparent: true, depthTest: false }),
  );
  const sapperTagMat = trackMat(
    new THREE.SpriteMaterial({ map: sapperTagTex, transparent: true, depthTest: false }),
  );
  const raiderTagMat = trackMat(
    new THREE.SpriteMaterial({ map: raiderTagTex, transparent: true, depthTest: false }),
  );
  const rangerTagMat = trackMat(
    new THREE.SpriteMaterial({ map: rangerTagTex, transparent: true, depthTest: false }),
  );

  const squadConfigs: Array<{
    role: 'captain' | 'sapper' | 'vanguard';
    spawnX: number;
    spawnZ: number;
    coverX: number;
    coverZ: number;
    targetSiegeIndex: number;
  }> = [
    { role: 'captain', spawnX: -21.2, spawnZ: 12.2, coverX: -15.0, coverZ: 7.9, targetSiegeIndex: 0 },
    { role: 'sapper', spawnX: -20.6, spawnZ: 13.4, coverX: -14.4, coverZ: 9.9, targetSiegeIndex: 2 },
    { role: 'sapper', spawnX: -22.2, spawnZ: 11.4, coverX: -16.0, coverZ: 6.0, targetSiegeIndex: 3 },
    { role: 'vanguard', spawnX: -20.4, spawnZ: 11.8, coverX: -14.9, coverZ: 6.9, targetSiegeIndex: 0 },
    { role: 'vanguard', spawnX: -20.2, spawnZ: 13.8, coverX: -14.2, coverZ: 10.6, targetSiegeIndex: 2 },
    { role: 'vanguard', spawnX: -21.4, spawnZ: 10.8, coverX: -15.7, coverZ: 5.0, targetSiegeIndex: 3 },
  ];

  const squad: MarchingRaiderRig[] = squadConfigs.map((cfg, idx) => {
    const rRoot = new THREE.Group();
    rRoot.position.set(cfg.spawnX, 0, cfg.spawnZ);

    const rShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.95, 0.95)), shadowMat);
    rShadow.rotation.x = -Math.PI / 2;
    rShadow.position.y = 0.025;
    rRoot.add(rShadow);

    const bodyGroup = new THREE.Group();
    rRoot.add(bodyGroup);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.12, 0.46, 0);
    const leftLeg = new THREE.Mesh(rLegGeo, rPantsMat);
    leftLeg.position.y = -0.22;
    leftLegPivot.add(leftLeg);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.12, 0.46, 0);
    const rightLeg = new THREE.Mesh(rLegGeo, rPantsMat);
    rightLeg.position.y = -0.22;
    rightLegPivot.add(rightLeg);

    const torso = new THREE.Mesh(
      rTorsoGeo,
      cfg.role === 'captain' ? crimsonMat : cfg.role === 'sapper' ? woodMat : rCoatMat,
    );
    torso.position.y = 0.74;
    const belt = new THREE.Mesh(rTrimGeo, cfg.role === 'captain' ? brassMat : ironMat);
    belt.position.y = 0.56;
    const head = new THREE.Mesh(rHeadGeo, rSkinMat);
    head.position.y = 1.22;
    const helm = new THREE.Mesh(
      rHelmGeo,
      cfg.role === 'captain' ? tentDarkMat : cfg.role === 'sapper' ? brassMat : crimsonMat,
    );
    helm.position.y = 1.44;
    bodyGroup.add(leftLegPivot, rightLegPivot, torso, belt, head, helm);

    if (cfg.role === 'captain') {
      const plume = new THREE.Mesh(rPlumeGeo, crimsonMat);
      plume.position.set(0, 1.62, -0.05);
      plume.rotation.x = -0.3;
      bodyGroup.add(plume);
    }

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.31, 0.96, 0);
    const leftArm = new THREE.Mesh(rArmGeo, rCoatMat);
    leftArm.position.y = -0.18;
    leftArmPivot.add(leftArm);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.31, 0.96, 0);
    const rightArm = new THREE.Mesh(rArmGeo, cfg.role === 'captain' ? crimsonMat : rCoatMat);
    rightArm.position.y = -0.18;
    rightArmPivot.add(rightArm);

    if (cfg.role === 'sapper') {
      const handle = new THREE.Mesh(rBlasterGeo, woodMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, -0.34, 0.2);
      const headBox = new THREE.Mesh(rHammerHeadGeo, ironMat);
      headBox.position.set(0, -0.34, 0.44);
      rightArmPivot.add(handle, headBox);
    } else {
      const blaster = new THREE.Mesh(rBlasterGeo, brassMat);
      blaster.rotation.x = Math.PI / 2;
      blaster.position.set(0, -0.32, 0.24);
      const tip = new THREE.Mesh(flashCoreGeo, beaconMat);
      tip.scale.setScalar(0.32);
      tip.position.set(0, -0.32, 0.52);
      rightArmPivot.add(blaster, tip);
    }
    bodyGroup.add(leftArmPivot, rightArmPivot);

    const tagSprite = new THREE.Sprite(
      cfg.role === 'captain'
        ? captainTagMat
        : cfg.role === 'sapper'
          ? sapperTagMat
          : raiderTagMat,
    );
    tagSprite.position.set(0, 2.08, 0);
    tagSprite.scale.set(1.42, 0.38, 1);
    tagSprite.renderOrder = 20;
    rRoot.add(tagSprite);
    battleGroup.add(rRoot);

    return {
      root: rRoot,
      bodyGroup,
      leftLegPivot,
      rightLegPivot,
      leftArmPivot,
      rightArmPivot,
      role: cfg.role,
      spawnX: cfg.spawnX,
      spawnZ: cfg.spawnZ,
      coverX: cfg.coverX,
      coverZ: cfg.coverZ,
      x: cfg.spawnX,
      z: cfg.spawnZ,
      facingYaw: cityFacingYaw,
      walkPhase: idx * 1.15,
      fireCooldown: 1.5 + idx * 0.55,
      strafePhase: idx * 1.7,
      buildSparkTimer: 0.2,
      targetSiegeIndex: cfg.targetSiegeIndex,
    };
  });

  // ── 4B. ALDERBROOK COUNTER-RAID STRIKE SQUAD (4 Blue & Gold Rangers) ──
  const counterGroup = new THREE.Group();
  counterGroup.visible = false;
  rootGroup.add(counterGroup);

  const counterConfigs = [
    { startX: -11.8, startZ: 6.2, assaultX: -20.5, assaultZ: 12.6 },
    { startX: -12.6, startZ: 8.4, assaultX: -21.8, assaultZ: 15.2 },
    { startX: -10.8, startZ: 7.4, assaultX: -22.5, assaultZ: 11.8 },
    { startX: -13.2, startZ: 5.8, assaultX: -23.0, assaultZ: 16.5 },
  ];

  const counterSquad: CounterRangerRig[] = counterConfigs.map((cfg, idx) => {
    const cRoot = new THREE.Group();
    cRoot.position.set(cfg.startX, 0, cfg.startZ);
    const bodyGroup = new THREE.Group();
    cRoot.add(bodyGroup);

    const torso = new THREE.Mesh(rTorsoGeo, rangerBlueMat);
    torso.position.y = 0.74;
    const belt = new THREE.Mesh(rTrimGeo, brassMat);
    belt.position.y = 0.56;
    const head = new THREE.Mesh(rHeadGeo, rSkinMat);
    head.position.y = 1.22;
    const helm = new THREE.Mesh(rHelmGeo, brassMat);
    helm.position.y = 1.44;
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.12, 0.46, 0);
    const ll = new THREE.Mesh(rLegGeo, rPantsMat);
    ll.position.y = -0.22;
    leftLeg.add(ll);
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.12, 0.46, 0);
    const rl = new THREE.Mesh(rLegGeo, rPantsMat);
    rl.position.y = -0.22;
    rightLeg.add(rl);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.3, 0.96, 0);
    const ra = new THREE.Mesh(rArmGeo, rangerBlueMat);
    ra.position.y = -0.18;
    const blaster = new THREE.Mesh(rBlasterGeo, rangerGlowMat);
    blaster.rotation.x = Math.PI / 2;
    blaster.position.set(0, -0.32, 0.25);
    rightArm.add(ra, blaster);

    bodyGroup.add(torso, belt, head, helm, leftLeg, rightLeg, rightArm);
    if (idx === 0) {
      const badge = new THREE.Sprite(rangerTagMat);
      badge.position.set(0, 2.08, 0);
      badge.scale.set(1.6, 0.4, 1);
      badge.renderOrder = 21;
      cRoot.add(badge);
    }
    counterGroup.add(cRoot);

    return {
      root: cRoot,
      bodyGroup,
      leftLeg,
      rightLeg,
      rightArm,
      startX: cfg.startX,
      startZ: cfg.startZ,
      assaultX: cfg.assaultX,
      assaultZ: cfg.assaultZ,
      x: cfg.startX,
      z: cfg.startZ,
      walkPhase: idx * 1.4,
      fireCooldown: 0.7 + idx * 0.4,
    };
  });

  // Pre-allocated radar snapshot (zero GC)
  const radarSnapshot: RaiderRadarSnapshot = {
    campX: ENEMY_CITY_POS.x,
    campZ: ENEMY_CITY_POS.z,
    cityX: ENEMY_CITY_POS.x,
    cityZ: ENEMY_CITY_POS.z,
    railBuilt: false,
    buildingCount: 1,
    squad: squad.map((r) => ({ x: r.x, z: r.z, isCaptain: r.role === 'captain' })),
    aircraft: [],
    counterSquad: counterSquad.map((c) => ({ x: c.x, z: c.z })),
    siegeBuiltCount: 0,
    activeCannons: 1,
    raidActive: false,
    counterRaidActive: false,
  };

  // ── 5. POOLED INSTANCED PROJECTILES, TRAILS & SPARKS (4 GB RAM SAFE) ──
  const ballGeo = trackGeo(new THREE.IcosahedronGeometry(0.28, 1));
  const ballMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const cannonballInstanced = new THREE.InstancedMesh(ballGeo, ballMat, MAX_PROJECTILES);
  cannonballInstanced.frustumCulled = false;
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    cannonballInstanced.setMatrixAt(i, _zeroMatrix);
    cannonballInstanced.setColorAt(i, _cannonBallColor);
  }
  cannonballInstanced.instanceMatrix.needsUpdate = true;
  if (cannonballInstanced.instanceColor) cannonballInstanced.instanceColor.needsUpdate = true;
  rootGroup.add(cannonballInstanced);

  const trailGeo = trackGeo(new THREE.OctahedronGeometry(0.16, 0));
  const trailMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  const trailInstanced = new THREE.InstancedMesh(trailGeo, trailMat, MAX_TRAILS);
  trailInstanced.frustumCulled = false;
  for (let i = 0; i < MAX_TRAILS; i++) {
    trailInstanced.setMatrixAt(i, _zeroMatrix);
    trailInstanced.setColorAt(i, _warmTrailColor);
  }
  trailInstanced.instanceMatrix.needsUpdate = true;
  if (trailInstanced.instanceColor) trailInstanced.instanceColor.needsUpdate = true;
  rootGroup.add(trailInstanced);

  const sparkGeo = trackGeo(new THREE.OctahedronGeometry(0.13, 0));
  const sparkMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const sparkInstanced = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
  sparkInstanced.frustumCulled = false;
  for (let i = 0; i < MAX_SPARKS; i++) {
    sparkInstanced.setMatrixAt(i, _zeroMatrix);
    sparkInstanced.setColorAt(i, _warmSparkColor);
  }
  sparkInstanced.instanceMatrix.needsUpdate = true;
  if (sparkInstanced.instanceColor) sparkInstanced.instanceColor.needsUpdate = true;
  rootGroup.add(sparkInstanced);

  // ── 6. POOLS & INTERNAL STATE ──
  const projectiles: ActiveProjectile[] = Array.from({ length: MAX_PROJECTILES }, () => ({
    alive: false,
    kind: 'cannonball',
    startX: 0,
    startY: 0,
    startZ: 0,
    endX: 0,
    endY: 0,
    endZ: 0,
    arcHeight: 5,
    t: 0,
    duration: 1.5,
    damage: 0,
    trailTimer: 0,
    targetAircraftIdx: -1,
  }));

  const trails: ActiveTrail[] = Array.from({ length: MAX_TRAILS }, () => ({
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    life: 0,
    maxLife: 0.32,
    scale: 1,
    tone: 0,
  }));

  const sparks: ActiveSpark[] = Array.from({ length: MAX_SPARKS }, () => ({
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 0.65,
    scale: 1,
    colorType: 0,
  }));

  let graphicsQuality: GraphicsQuality = 'medium';
  let defenseFireCooldown = 1.0;
  let vanceFireCooldown = 1.6;
  let raidActiveSeconds = 0;
  let wasActive = false;
  let wasCounterActive = false;
  let lastWaveNumber = 0;
  let oreTrainU = 0;

  const spawnSparks = (
    x: number,
    y: number,
    z: number,
    count: number,
    colorType: 0 | 1 | 2 | 3,
  ) => {
    const cap = graphicsQuality === 'low' ? Math.min(count, 4) : count;
    let spawned = 0;
    for (let i = 0; i < MAX_SPARKS && spawned < cap; i++) {
      const s = sparks[i];
      if (s.alive) continue;
      const angle = (spawned / Math.max(1, cap)) * Math.PI * 2 + Math.random() * 0.55;
      const spd = 2.0 + Math.random() * 3.6;
      s.alive = true;
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.cos(angle) * spd;
      s.vy = 2.6 + Math.random() * 4.0;
      s.vz = Math.sin(angle) * spd;
      s.maxLife = 0.42 + Math.random() * 0.38;
      s.life = s.maxLife;
      s.scale = 0.8 + Math.random() * 0.72;
      s.colorType = colorType;
      spawned++;
    }
  };

  const spawnTrailOrb = (x: number, y: number, z: number, scale: number, tone: 0 | 1 | 2) => {
    if (graphicsQuality === 'low') return;
    for (let i = 0; i < MAX_TRAILS; i++) {
      const tr = trails[i];
      if (tr.alive) continue;
      tr.alive = true;
      tr.x = x;
      tr.y = y;
      tr.z = z;
      tr.maxLife = tone === 2 ? 0.46 : 0.28;
      tr.life = tr.maxLife;
      tr.scale = scale;
      tr.tone = tone;
      return;
    }
  };

  const spawnProjectile = (
    kind: ProjectileKind,
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    arcHeight: number,
    duration: number,
    damage: number,
    targetAircraftIdx = -1,
  ) => {
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = projectiles[i];
      if (p.alive) continue;
      p.alive = true;
      p.kind = kind;
      p.startX = sx;
      p.startY = sy;
      p.startZ = sz;
      p.endX = ex;
      p.endY = ey;
      p.endZ = ez;
      p.arcHeight = arcHeight;
      p.t = 0;
      p.duration = duration;
      p.damage = damage;
      p.trailTimer = 0;
      p.targetAircraftIdx = targetAircraftIdx;
      const sparkTone: 0 | 1 | 2 | 3 =
        kind === 'defense_volley' || kind === 'aa_flak' ? 1 : kind === 'air_rocket' ? 2 : 0;
      spawnSparks(sx, sy, sz, kind === 'cannonball' ? 7 : 4, sparkTone);
      return;
    }
  };

  const resetRaidStage = () => {
    raidActiveSeconds = 0;
    defenseFireCooldown = 0.85;
    vanceFireCooldown = 1.4;

    for (let i = 0; i < cannons.length; i++) {
      const c = cannons[i];
      const startsBuilt = c.unlockTime <= 0;
      c.buildProgress = startsBuilt ? 1 : 0;
      c.startedBuild = startsBuilt;
      c.builtBurstDone = startsBuilt;
      c.root.visible = startsBuilt;
      c.root.scale.set(1, startsBuilt ? 1 : 0.01, 1);
      c.recoil = 0;
      c.flashTimer = 0;
      c.muzzleFlash.visible = false;
      c.fireCooldown = 1.2 + i * 0.9;
    }

    for (let i = 0; i < siegeStructures.length; i++) {
      const st = siegeStructures[i];
      st.buildProgress = 0;
      st.startedBuild = false;
      st.builtBurstDone = false;
      st.root.visible = false;
      st.root.scale.set(1, 0.01, 1);
    }

    for (let i = 0; i < squad.length; i++) {
      const r = squad[i];
      r.x = r.spawnX;
      r.z = r.spawnZ;
      r.root.position.set(r.x, 0, r.z);
      r.fireCooldown = 1.5 + i * 0.55;
      radarSnapshot.squad[i].x = r.x;
      radarSnapshot.squad[i].z = r.z;
    }

    for (const ac of aircraftList) {
      ac.hp = ac.maxHp;
      ac.respawnCooldown = 0;
    }
  };

  const triggerCampVictoryBurst = () => {
    spawnSparks(ENEMY_CITY_POS.x, 2.5, ENEMY_CITY_POS.z, 24, 1);
    spawnSparks(ENEMY_CITY_POS.x, 3.0, ENEMY_CITY_POS.z, 18, 0);
    spawnSparks(-15.5, 1.5, 8.6, 14, 1);
  };

  const triggerCounterLootBurst = () => {
    spawnSparks(ENEMY_CITY_POS.x - 1.5, 2.2, ENEMY_CITY_POS.z + 2.2, 26, 3);
    spawnSparks(ENEMY_CITY_POS.x, 3.2, ENEMY_CITY_POS.z, 20, 1);
  };

  const update = (params: RaiderUpdateParams) => {
    const {
      delta,
      elapsed,
      active,
      waveNumber,
      tactic,
      campHpRatio,
      enemyCity,
      villagerCoords,
      defenseTowers,
      vanceDefending,
      vancePos,
      onRaiderImpact,
      onDefenseHitCamp,
      onEnemyAircraftDowned,
    } = params;

    // ── A. Sync Permanent Ironhold Bastion Buildings & Railway Visibility ──
    const bldMap = new Map(enemyCity.buildings.map((b) => [b.id, b]));
    const citadelBld = bldMap.get('warlord_citadel');
    const foundryBld = bldMap.get('munitions_foundry');
    const depotBld = bldMap.get('war_depot');
    const airfieldBld = bldMap.get('airfield');
    const nTurretBld = bldMap.get('enemy_turret_north');
    const sTurretBld = bldMap.get('enemy_turret_south');

    const citScale = 1 + Math.max(0, (citadelBld?.level ?? 1) - 1) * 0.12;
    citadelGroup.scale.set(citScale, citScale, citScale);
    foundryGroup.visible = Boolean(foundryBld?.built);
    depotGroup.visible = Boolean(depotBld?.built);
    airfieldGroup.visible = Boolean(airfieldBld?.built);
    northTurret.root.visible = Boolean(nTurretBld?.built);
    southTurret.root.visible = Boolean(sTurretBld?.built);
    enemyRailGroup.visible = Boolean(enemyCity.railBuilt);

    citadelPennant.rotation.y = Math.sin(elapsed * 4.5) * 0.25;
    if (foundryGroup.visible) {
      fForgeFlame.scale.setScalar(0.85 + Math.sin(elapsed * 11.5) * 0.22);
    }
    if (airfieldGroup.visible) {
      radarDishGroup.rotation.y = elapsed * 1.85;
    }

    // Animate Enemy Armored Ore Train along Ironhold Supply Railway (even between raids!)
    if (enemyRailGroup.visible) {
      oreTrainU = (oreTrainU + delta * 0.085) % 1;
      enemyRailCurve.getPointAt(oreTrainU, _vPos);
      enemyRailCurve.getTangentAt(oreTrainU, _vTan).normalize();
      oreLoco.position.set(_vPos.x, 0.04, _vPos.z);
      _vLook.copy(_vPos).add(_vTan);
      _vLook.y = 0.04;
      oreLoco.lookAt(_vLook);

      const carU = (oreTrainU - 0.068 + 1) % 1;
      enemyRailCurve.getPointAt(carU, _vPos);
      enemyRailCurve.getTangentAt(carU, _vTan).normalize();
      oreCar.position.set(_vPos.x, 0.04, _vPos.z);
      _vLook.copy(_vPos).add(_vTan);
      _vLook.y = 0.04;
      oreCar.lookAt(_vLook);
    }

    // Animate permanent Ironhold workers patrolling inside the fortress
    for (let i = 0; i < bastionWorkers.length; i++) {
      const w = bastionWorkers[i];
      const [gx, gz] = w.waypoints[w.wpIdx];
      const dx = gx - w.x;
      const dz = gz - w.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.25) {
        w.wpIdx = (w.wpIdx + 1) % w.waypoints.length;
      } else {
        const step = Math.min(dist, 1.35 * delta);
        w.x += (dx / dist) * step;
        w.z += (dz / dist) * step;
        w.root.position.set(w.x, 0.12, w.z);
        w.root.rotation.y = Math.atan2(dx, dz);
        w.phase += delta * 9.5;
        const sw = Math.sin(w.phase) * 0.6;
        w.leftLeg.rotation.x = sw;
        w.rightLeg.rotation.x = -sw;
        w.rightArm.rotation.x = -sw * 0.7;
      }
    }

    // Helper: pick Alderbrook target for ground/air attacks
    const pickRaiderTarget = (preferDefenses: boolean): { x: number; y: number; z: number } => {
      if (preferDefenses && defenseTowers.length > 0 && Math.random() < 0.58) {
        const d = defenseTowers[Math.floor(Math.random() * defenseTowers.length)];
        return {
          x: d.x + (Math.random() - 0.5) * 1.4,
          y: 1.2,
          z: d.z + (Math.random() - 0.5) * 1.4,
        };
      }
      const healthyTargets = villagerCoords.filter((v) => !v.injured);
      if (tactic === 'target_workers' && healthyTargets.length > 0) {
        const picked = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
        return {
          x: picked.x + (Math.random() - 0.5) * 1.5,
          y: 0.45,
          z: picked.z + (Math.random() - 0.5) * 1.5,
        };
      }
      if (tactic === 'siege_plaza' || tactic === 'loot_raid') {
        return {
          x: -3.2 + (Math.random() - 0.5) * 8.0,
          y: 0.4,
          z: 2.2 + (Math.random() - 0.5) * 7.5,
        };
      }
      if (healthyTargets.length > 0 && Math.random() < 0.42) {
        const picked = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
        return {
          x: picked.x + (Math.random() - 0.5) * 2.2,
          y: 0.4,
          z: picked.z + (Math.random() - 0.5) * 2.2,
        };
      }
      return {
        x: -7.8 + (Math.random() - 0.5) * 5.8,
        y: 0.4,
        z: 5.2 + (Math.random() - 0.5) * 6.2,
      };
    };

    // ── B. Enemy Air Force (Attack Helicopters & Swept-Wing Fighter Jets) ──
    radarSnapshot.aircraft.length = 0;
    const airfieldBuilt = Boolean(airfieldBld?.built);

    for (let i = 0; i < aircraftList.length; i++) {
      const ac = aircraftList[i];
      const unlocked =
        airfieldBuilt &&
        (ac.kind === 'helicopter'
          ? ac.index < enemyCity.helicoptersReady
          : ac.index < enemyCity.jetsReady);

      if (!unlocked) {
        ac.root.visible = false;
        ac.airborne = false;
        continue;
      }

      ac.root.visible = true;

      if (ac.respawnCooldown > 0) {
        ac.respawnCooldown = Math.max(0, ac.respawnCooldown - delta);
        ac.airborne = false;
        // Parked & repairing on Ironhold Airfield
        ac.x = THREE.MathUtils.damp(ac.x, ac.parkedX, 3, delta);
        ac.y = THREE.MathUtils.damp(ac.y, ac.parkedY, 3, delta);
        ac.z = THREE.MathUtils.damp(ac.z, ac.parkedZ, 3, delta);
        ac.root.position.set(ac.x, ac.y, ac.z);
        ac.root.rotation.set(0, cityFacingYaw, 0);
        if (ac.mainRotor) ac.mainRotor.rotation.y += delta * 4.5;
        if (ac.respawnCooldown <= 0) {
          ac.hp = ac.maxHp;
        }
        continue;
      }

      if (!active) {
        // Peaceful standby: helicopters idle gently on helipad, jets parked on runway
        ac.airborne = false;
        ac.x = THREE.MathUtils.damp(ac.x, ac.parkedX, 2.5, delta);
        ac.y = THREE.MathUtils.damp(ac.y, ac.parkedY, 2.5, delta);
        ac.z = THREE.MathUtils.damp(ac.z, ac.parkedZ, 2.5, delta);
        ac.root.position.set(ac.x, ac.y, ac.z);
        ac.root.rotation.set(0, cityFacingYaw, 0);
        if (ac.mainRotor) ac.mainRotor.rotation.y += delta * 5.0;
        if (ac.tailRotor) ac.tailRotor.rotation.x += delta * 7.5;
        continue;
      }

      // Active Air Raid Sortie!
      ac.airborne = true;
      if (ac.kind === 'helicopter') {
        ac.phase += delta * (tactic === 'air_strike' ? 0.62 : 0.48);
        const orbitCenterX = -8.5 + ac.index * 5.2;
        const orbitCenterZ = 4.2 - ac.index * 4.6;
        const rx = 9.5 + ac.index * 2.2;
        const rz = 7.4 + ac.index * 1.8;
        const targetX = orbitCenterX + Math.cos(ac.phase) * rx;
        const targetZ = orbitCenterZ + Math.sin(ac.phase) * rz;
        const targetY = 6.4 + ac.index * 1.15 + Math.sin(elapsed * 2.4 + ac.index) * 0.45;

        const vx = targetX - ac.x;
        const vz = targetZ - ac.z;
        ac.x = THREE.MathUtils.damp(ac.x, targetX, 2.6, delta);
        ac.y = THREE.MathUtils.damp(ac.y, targetY, 2.2, delta);
        ac.z = THREE.MathUtils.damp(ac.z, targetZ, 2.6, delta);
        ac.root.position.set(ac.x, ac.y, ac.z);

        const desiredYaw = Math.atan2(vx, vz);
        const diff = Math.atan2(Math.sin(desiredYaw - ac.yaw), Math.cos(desiredYaw - ac.yaw));
        ac.yaw += diff * Math.min(1, delta * 5.5);
        ac.root.rotation.set(0.18, ac.yaw, -diff * 0.45);

        // Fast spinning rotors
        if (ac.mainRotor) ac.mainRotor.rotation.y += delta * 24.0;
        if (ac.tailRotor) ac.tailRotor.rotation.x += delta * 28.0;

        ac.fireCooldown -= delta;
        if (ac.fireCooldown <= 0 && ac.y > 4.5) {
          ac.fireCooldown = (tactic === 'air_strike' ? 2.4 : 3.2) + Math.random() * 0.9;
          const tgt = pickRaiderTarget(true);
          spawnProjectile('air_rocket', ac.x, ac.y - 0.35, ac.z, tgt.x, tgt.y, tgt.z, 0.7, 0.78, 0);
        }
      } else {
        // Swept-Wing Fighter Jet: high-speed sweeping figure-8 attack runs with glowing thruster trails!
        ac.phase += delta * (tactic === 'air_strike' ? 1.02 : 0.85);
        const targetX = -9.5 + Math.sin(ac.phase) * 20.5;
        const targetZ = 5.5 + Math.sin(ac.phase * 2) * 12.0;
        const targetY = 9.4 + ac.index * 1.45 + Math.cos(ac.phase * 2) * 0.9;

        const prevX = ac.x;
        const prevZ = ac.z;
        ac.x = THREE.MathUtils.damp(ac.x, targetX, 3.8, delta);
        ac.y = THREE.MathUtils.damp(ac.y, targetY, 2.8, delta);
        ac.z = THREE.MathUtils.damp(ac.z, targetZ, 3.8, delta);
        ac.root.position.set(ac.x, ac.y, ac.z);

        const dx = ac.x - prevX;
        const dz = ac.z - prevZ;
        if (Math.hypot(dx, dz) > 0.002) {
          const desiredYaw = Math.atan2(dx, dz);
          const diff = Math.atan2(Math.sin(desiredYaw - ac.yaw), Math.cos(desiredYaw - ac.yaw));
          ac.yaw += diff * Math.min(1, delta * 9);
          const bank = Math.max(-0.68, Math.min(0.68, -diff * 2.2));
          ac.root.rotation.set(0.08, ac.yaw, bank);
        }

        // Glowing Jet Afterburner Thruster Trail
        ac.trailTimer -= delta;
        if (ac.trailTimer <= 0) {
          ac.trailTimer = 0.048;
          const bx = ac.x - Math.sin(ac.yaw) * 1.65;
          const bz = ac.z - Math.cos(ac.yaw) * 1.65;
          spawnTrailOrb(bx, ac.y, bz, 0.95, 2);
        }

        // Fire downward fighter tracer volley when swooping near Alderbrook
        ac.fireCooldown -= delta;
        if (ac.fireCooldown <= 0 && Math.hypot(ac.x, ac.z) < 18.5 && ac.y > 6.5) {
          ac.fireCooldown = (tactic === 'air_strike' ? 2.1 : 2.9) + Math.random() * 0.8;
          const tgt = pickRaiderTarget(true);
          spawnProjectile('air_rocket', ac.x, ac.y - 0.3, ac.z, tgt.x, tgt.y, tgt.z, 0.35, 0.62, 0);
        }
      }

      radarSnapshot.aircraft.push({ x: ac.x, z: ac.z, kind: ac.kind });
    }

    // ── C. Active Ground Raid Wave & Siege Construction ──
    const waveChanged = active && waveNumber > 0 && waveNumber !== lastWaveNumber;
    if (active !== wasActive || waveChanged) {
      wasActive = active;
      battleGroup.visible = active;
      if (active) {
        lastWaveNumber = waveNumber;
        resetRaidStage();
        spawnSparks(ENEMY_CITY_POS.x, 2.0, ENEMY_CITY_POS.z, 18, 2);
      }
    }

    hpBarGroup.visible = active || enemyCity.counterRaidActive;
    if (hpBarGroup.visible) {
      const clampedHp = Math.max(0.04, Math.min(1, campHpRatio));
      hpBarFill.scale.x = clampedHp;
      hpBarFill.position.x = -1.52 * (1 - clampedHp);
    }

    // Bastion Fixed Defense Turrets fire during raids OR counter-raids
    for (const turret of [northTurret, southTurret]) {
      if (!turret.root.visible) continue;
      if (turret.flashTimer > 0) {
        turret.flashTimer = Math.max(0, turret.flashTimer - delta);
        turret.flash.visible = turret.flashTimer > 0;
      }
      if (active || enemyCity.counterRaidActive) {
        turret.fireCooldown -= delta;
        if (turret.fireCooldown <= 0) {
          turret.fireCooldown = 3.2 + Math.random() * 1.4;
          const tgt = enemyCity.counterRaidActive
            ? { x: -20.5 + (Math.random() - 0.5) * 4, y: 0.9, z: 13.0 + (Math.random() - 0.5) * 4 }
            : pickRaiderTarget(true);
          const yawWorld = Math.atan2(tgt.x - turret.worldX, tgt.z - turret.worldZ);
          turret.head.rotation.y = yawWorld - cityFacingYaw;
          turret.flashTimer = 0.2;
          turret.flash.visible = true;
          spawnProjectile(
            'cannonball',
            turret.worldX,
            1.75,
            turret.worldZ,
            tgt.x,
            tgt.y,
            tgt.z,
            5.8,
            1.5,
            0,
          );
        }
      }
    }

    if (active) {
      raidActiveSeconds += delta;
      const waveBuildBoost = 1 + Math.min(0.9, Math.max(0, waveNumber - 1) * 0.35);
      const effectiveSiegeTime = raidActiveSeconds * waveBuildBoost;

      let siegeBuiltCount = 0;
      for (let i = 0; i < siegeStructures.length; i++) {
        const st = siegeStructures[i];
        if (effectiveSiegeTime >= st.unlockTime) {
          if (!st.startedBuild) {
            st.startedBuild = true;
            st.root.visible = true;
            spawnSparks(st.worldX, 0.7, st.worldZ, 10, 0);
          }
          if (st.buildProgress < 1) {
            st.buildProgress = Math.min(1, st.buildProgress + delta * 0.68);
            const eased = 1 - Math.pow(1 - st.buildProgress, 3);
            st.root.scale.set(0.85 + eased * 0.15, Math.max(0.02, eased), 0.85 + eased * 0.15);
            if (st.buildProgress >= 1 && !st.builtBurstDone) {
              st.builtBurstDone = true;
              spawnSparks(st.worldX, 1.3, st.worldZ, 12, 2);
            }
          } else {
            siegeBuiltCount++;
          }
        }
        if (st.beaconOrb && st.root.visible) {
          st.beaconOrb.scale.setScalar(0.88 + Math.sin(elapsed * 7.5) * 0.24);
          st.beaconOrb.rotation.y = elapsed * 2.2;
        }
        if (st.flagMesh && st.root.visible) {
          st.flagMesh.rotation.y = Math.sin(elapsed * 5.6 + i) * 0.24;
        }
      }

      let activeCannons = 0;
      for (let i = 0; i < cannons.length; i++) {
        const c = cannons[i];
        if (effectiveSiegeTime >= c.unlockTime) {
          if (!c.startedBuild) {
            c.startedBuild = true;
            c.root.visible = true;
            spawnSparks(c.worldX, 0.8, c.worldZ, 10, 0);
          }
          if (c.buildProgress < 1) {
            c.buildProgress = Math.min(1, c.buildProgress + delta * 0.65);
            const eased = 1 - Math.pow(1 - c.buildProgress, 3);
            c.root.scale.set(0.85 + eased * 0.15, Math.max(0.02, eased), 0.85 + eased * 0.15);
            if (c.buildProgress >= 1 && !c.builtBurstDone) {
              c.builtBurstDone = true;
              spawnSparks(c.worldX, 1.25, c.worldZ, 12, 0);
            }
          }
        }
        if (c.buildProgress >= 1) {
          activeCannons++;
          if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - delta * 2.8);
          c.barrelPivot.position.z = 0.05 - c.recoil * 0.38;
          if (c.flashTimer > 0) {
            c.flashTimer = Math.max(0, c.flashTimer - delta);
            c.muzzleFlash.visible = c.flashTimer > 0;
            c.muzzleFlash.scale.setScalar(0.65 + (c.flashTimer / 0.22) * 0.9);
            c.muzzleFlash.rotation.z = elapsed * 24 + i;
          } else {
            c.muzzleFlash.visible = false;
          }
          c.fireCooldown -= delta;
          if (c.fireCooldown <= 0) {
            const baseRate = tactic === 'siege_plaza' || tactic === 'loot_raid' ? 2.9 : 3.6;
            c.fireCooldown = baseRate + (i > 0 ? 0.9 : 0) + Math.random() * 0.65;
            c.recoil = 1.0;
            c.flashTimer = 0.22;
            const tgt = pickRaiderTarget(i > 0);
            c.yaw = Math.atan2(tgt.x - c.worldX, tgt.z - c.worldZ);
            c.root.rotation.y = c.yaw;
            const muzzleX = c.worldX + Math.sin(c.yaw) * 1.15;
            const muzzleZ = c.worldZ + Math.cos(c.yaw) * 1.15;
            spawnProjectile(
              'cannonball',
              muzzleX,
              1.3,
              muzzleZ,
              tgt.x,
              tgt.y,
              tgt.z,
              5.4 + Math.random() * 1.4,
              1.45,
              0,
            );
          }
        }
      }

      const marchSpeed = 2.7;
      for (let i = 0; i < squad.length; i++) {
        const r = squad[i];
        let goalX = r.coverX;
        let goalZ = r.coverZ;
        let isHammering = false;

        if (r.role === 'sapper') {
          const site = siegeStructures[r.targetSiegeIndex];
          const cannonSite = i === 1 ? cannons[1] : cannons[2];
          if (site && site.startedBuild && site.buildProgress < 1) {
            goalX = site.worldX - 0.9;
            goalZ = site.worldZ + 0.45;
            isHammering = true;
          } else if (cannonSite && cannonSite.startedBuild && cannonSite.buildProgress < 1) {
            goalX = cannonSite.worldX - 0.8;
            goalZ = cannonSite.worldZ + 0.5;
            isHammering = true;
          }
        }
        if (!isHammering && Math.hypot(goalX - r.x, goalZ - r.z) < 0.75) {
          goalX += Math.sin(elapsed * 1.35 + r.strafePhase) * 0.45;
          goalZ += Math.cos(elapsed * 1.15 + r.strafePhase) * 0.45;
        }
        const dx = goalX - r.x;
        const dz = goalZ - r.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.18) {
          const step = Math.min(dist, marchSpeed * delta);
          r.x += (dx / dist) * step;
          r.z += (dz / dist) * step;
          r.root.position.set(r.x, 0, r.z);
          const moveYaw = Math.atan2(dx, dz);
          const diff = Math.atan2(Math.sin(moveYaw - r.facingYaw), Math.cos(moveYaw - r.facingYaw));
          r.facingYaw += diff * Math.min(1, delta * 9);
          r.root.rotation.y = r.facingYaw;
          r.walkPhase += delta * 11.5;
          const swing = Math.sin(r.walkPhase) * 0.72;
          r.leftLegPivot.rotation.x = swing;
          r.rightLegPivot.rotation.x = -swing;
          r.leftArmPivot.rotation.x = -swing * 0.8;
          r.rightArmPivot.rotation.x = r.role === 'sapper' ? swing * 0.8 : -0.75 + swing * 0.22;
          r.bodyGroup.position.y = Math.abs(Math.sin(r.walkPhase)) * 0.08;
        } else {
          const townYaw = Math.atan2(-7.5 - r.x, 4.5 - r.z);
          const diff = Math.atan2(Math.sin(townYaw - r.facingYaw), Math.cos(townYaw - r.facingYaw));
          r.facingYaw += diff * Math.min(1, delta * 7);
          r.root.rotation.y = r.facingYaw;
          r.leftLegPivot.rotation.x = THREE.MathUtils.damp(r.leftLegPivot.rotation.x, 0, 8, delta);
          r.rightLegPivot.rotation.x = THREE.MathUtils.damp(r.rightLegPivot.rotation.x, 0, 8, delta);
          if (isHammering) {
            r.rightArmPivot.rotation.x = -0.8 + Math.sin(elapsed * 14 + i) * 0.75;
            r.buildSparkTimer -= delta;
            if (r.buildSparkTimer <= 0) {
              r.buildSparkTimer = 0.34;
              spawnSparks(r.x + Math.sin(r.facingYaw) * 0.55, 0.85, r.z + Math.cos(r.facingYaw) * 0.55, 4, 0);
            }
          } else {
            r.rightArmPivot.rotation.x = -1.22 + Math.sin(elapsed * 3.5 + i) * 0.08;
            r.fireCooldown -= delta;
            if (r.fireCooldown <= 0) {
              r.fireCooldown = (r.role === 'captain' ? 2.1 : 2.9) + Math.random() * 1.4;
              const tgt = pickRaiderTarget(true);
              const bx = r.x + Math.sin(r.facingYaw) * 0.55;
              const bz = r.z + Math.cos(r.facingYaw) * 0.55;
              spawnProjectile('raider_bolt', bx, 1.15, bz, tgt.x, tgt.y + 0.25, tgt.z, 1.6, 0.86, 0);
            }
          }
        }
        radarSnapshot.squad[i].x = r.x;
        radarSnapshot.squad[i].z = r.z;
      }

      radarSnapshot.siegeBuiltCount = siegeBuiltCount + Math.max(0, activeCannons - 1);
      radarSnapshot.activeCannons = activeCannons;

      // ── D. Town Defense Counter-Fire & Anti-Air Flak (Triple-Gun Towers, Watchtowers, Vance) ──
      const airborneIndices: number[] = [];
      for (let i = 0; i < aircraftList.length; i++) {
        if (aircraftList[i].airborne && aircraftList[i].respawnCooldown <= 0) {
          airborneIndices.push(i);
        }
      }

      const pickEnemyGroundTarget = (): { x: number; y: number; z: number } => {
        const builtForward = cannons.filter((c, idx) => idx > 0 && c.buildProgress >= 1);
        if (builtForward.length > 0 && Math.random() < 0.35) {
          const fc = builtForward[Math.floor(Math.random() * builtForward.length)];
          return { x: fc.worldX, y: 0.9, z: fc.worldZ };
        }
        if (Math.random() < 0.3) {
          const picked = squad[Math.floor(Math.random() * squad.length)];
          return { x: picked.x, y: 0.95, z: picked.z };
        }
        return {
          x: ENEMY_CITY_POS.x + (Math.random() - 0.5) * 3.4,
          y: 1.4,
          z: ENEMY_CITY_POS.z + (Math.random() - 0.5) * 3.4,
        };
      };

      if (defenseTowers.length > 0) {
        defenseFireCooldown -= delta;
        if (defenseFireCooldown <= 0) {
          defenseFireCooldown = Math.max(0.7, 2.0 - defenseTowers.length * 0.3);
          const tower = defenseTowers[Math.floor(Math.random() * defenseTowers.length)];
          const shootAir = airborneIndices.length > 0 && (tower.barrels === 3 ? Math.random() < 0.72 : Math.random() < 0.52);

          if (shootAir) {
            const acIdx = airborneIndices[Math.floor(Math.random() * airborneIndices.length)];
            const ac = aircraftList[acIdx];
            const shotCount = tower.barrels === 3 ? 3 : 1;
            spawnSparks(tower.x, tower.y + 0.15, tower.z, shotCount === 3 ? 7 : 4, 1);
            for (let s = 0; s < shotCount; s++) {
              const offset = (s - (shotCount - 1) * 0.5) * 0.45;
              spawnProjectile(
                'aa_flak',
                tower.x + offset * 0.4,
                tower.y + 0.2,
                tower.z + offset * 0.3,
                ac.x + offset,
                ac.y + (Math.random() - 0.5) * 0.6,
                ac.z + offset,
                0.8,
                0.56 + s * 0.08,
                shotCount === 3 ? 9 : 11,
                acIdx,
              );
            }
          } else if (tower.barrels === 3) {
            spawnSparks(tower.x, tower.y + 0.1, tower.z, 7, 1);
            for (let b = -1; b <= 1; b++) {
              const et = pickEnemyGroundTarget();
              spawnProjectile(
                'defense_volley',
                tower.x + b * 0.32,
                tower.y + (b === 0 ? 0.14 : 0),
                tower.z + b * 0.22,
                et.x + b * 0.65,
                et.y,
                et.z + b * 0.65,
                3.8 + Math.abs(b) * 0.5,
                0.98 + (b + 1) * 0.11,
                Math.max(4, Math.round(tower.power * 0.62)),
              );
            }
          } else {
            const et = pickEnemyGroundTarget();
            spawnProjectile(
              'defense_volley',
              tower.x,
              tower.y,
              tower.z,
              et.x,
              et.y,
              et.z,
              4.4,
              1.15,
              tower.power,
            );
          }
        }
      }

      if (vanceDefending) {
        vanceFireCooldown -= delta;
        if (vanceFireCooldown <= 0) {
          vanceFireCooldown = defenseTowers.length > 0 ? 2.2 : 1.65;
          const vx = vancePos ? vancePos.x : -6.5;
          const vz = vancePos ? vancePos.z : 1.8;
          if (airborneIndices.length > 0 && Math.random() < 0.5) {
            const acIdx = airborneIndices[Math.floor(Math.random() * airborneIndices.length)];
            const ac = aircraftList[acIdx];
            spawnProjectile('aa_flak', vx, 1.5, vz, ac.x, ac.y, ac.z, 0.7, 0.62, 9, acIdx);
          } else {
            const et = pickEnemyGroundTarget();
            spawnProjectile(
              'defense_volley',
              vx,
              1.45,
              vz,
              et.x,
              et.y,
              et.z,
              3.5,
              1.1,
              defenseTowers.length > 0 ? 5 : 9,
            );
          }
        }
      }
    }

    // ── D2. Our Team Counter-Raid Assault on Ironhold Bastion ──
    const counterActive = Boolean(enemyCity.counterRaidActive);
    if (counterActive !== wasCounterActive) {
      wasCounterActive = counterActive;
      counterGroup.visible = counterActive;
      if (counterActive) {
        for (const c of counterSquad) {
          c.x = c.startX;
          c.z = c.startZ;
          c.root.position.set(c.x, 0, c.z);
        }
        spawnSparks(-12.2, 1.3, 7.2, 14, 1);
      }
    }
    if (counterActive) {
      for (let i = 0; i < counterSquad.length; i++) {
        const c = counterSquad[i];
        const dx = c.assaultX - c.x;
        const dz = c.assaultZ - c.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.35) {
          const step = Math.min(dist, 4.2 * delta);
          c.x += (dx / dist) * step;
          c.z += (dz / dist) * step;
          c.root.position.set(c.x, 0, c.z);
          c.root.rotation.y = Math.atan2(dx, dz);
          c.walkPhase += delta * 12;
          const sw = Math.sin(c.walkPhase) * 0.7;
          c.leftLeg.rotation.x = sw;
          c.rightLeg.rotation.x = -sw;
          c.rightArm.rotation.x = -0.85;
          c.bodyGroup.position.y = Math.abs(Math.sin(c.walkPhase)) * 0.08;
        } else {
          c.root.rotation.y = Math.atan2(ENEMY_CITY_POS.x - c.x, ENEMY_CITY_POS.z - c.z);
          c.rightArm.rotation.x = -1.25;
          c.fireCooldown -= delta;
          if (c.fireCooldown <= 0) {
            c.fireCooldown = 1.15 + Math.random() * 0.6;
            spawnProjectile(
              'defense_volley',
              c.x,
              1.15,
              c.z,
              ENEMY_CITY_POS.x + (Math.random() - 0.5) * 3.0,
              1.2,
              ENEMY_CITY_POS.z + (Math.random() - 0.5) * 3.0,
              1.2,
              0.55,
              4,
            );
            // Golden loot sparks flying up from Ironhold War Depot!
            spawnSparks(ENEMY_CITY_POS.x - 1.2, 1.5, ENEMY_CITY_POS.z + 1.8, 5, 3);
          }
        }
        radarSnapshot.counterSquad[i].x = c.x;
        radarSnapshot.counterSquad[i].z = c.z;
      }
    }

    // Update Radar Metadata
    radarSnapshot.railBuilt = Boolean(enemyCity.railBuilt);
    radarSnapshot.buildingCount = enemyCity.buildings.filter((b) => b.built).length;
    radarSnapshot.raidActive = active;
    radarSnapshot.counterRaidActive = counterActive;

    // ── E. Advance & Render Instanced Projectiles (Ground + Air + AA Flak) ──
    let anyProjDirty = false;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = projectiles[i];
      if (!p.alive) continue;
      anyProjDirty = true;
      p.t += delta / p.duration;
      if (p.t >= 1) {
        p.alive = false;
        cannonballInstanced.setMatrixAt(i, _zeroMatrix);
        const isDef = p.kind === 'defense_volley' || p.kind === 'aa_flak';
        spawnSparks(
          p.endX,
          Math.max(0.45, p.endY),
          p.endZ,
          p.kind === 'aa_flak' ? 14 : p.kind === 'cannonball' ? 11 : 8,
          isDef ? 1 : p.kind === 'air_rocket' || p.kind === 'raider_bolt' ? 2 : 0,
        );
        if (p.kind === 'aa_flak' && p.targetAircraftIdx >= 0) {
          const ac = aircraftList[p.targetAircraftIdx];
          if (ac && ac.airborne && ac.respawnCooldown <= 0) {
            ac.hp -= p.damage;
            if (ac.hp <= 0) {
              ac.respawnCooldown = 14.0;
              ac.airborne = false;
              spawnSparks(ac.x, ac.y, ac.z, 22, 0);
              spawnSparks(ac.x, ac.y, ac.z, 16, 1);
              onEnemyAircraftDowned?.(ac.kind);
              if (active) onDefenseHitCamp(10);
            }
          }
        } else if (active) {
          if (isDef) {
            onDefenseHitCamp(p.damage);
          } else if (p.kind === 'air_rocket') {
            onRaiderImpact(p.endX, p.endZ, p.startY > 8.2 ? 'jet' : 'helicopter');
          } else if (p.kind === 'cannonball' || Math.random() < 0.25) {
            onRaiderImpact(p.endX, p.endZ, 'ground');
          }
        }
      } else {
        const u = p.t;
        const x = p.startX + (p.endX - p.startX) * u;
        const z = p.startZ + (p.endZ - p.startZ) * u;
        const baseY = p.startY + (p.endY - p.startY) * u;
        const y = baseY + 4 * p.arcHeight * u * (1 - u);

        p.trailTimer -= delta;
        if (p.trailTimer <= 0) {
          p.trailTimer = p.kind === 'cannonball' ? 0.055 : 0.068;
          spawnTrailOrb(
            x,
            y,
            z,
            p.kind === 'cannonball' ? 1.0 : 0.72,
            p.kind === 'defense_volley' || p.kind === 'aa_flak' ? 1 : 0,
          );
        }

        _dummy.position.set(x, y, z);
        _dummy.rotation.set(elapsed * 8 + i, elapsed * 6, 0);
        const projScale =
          p.kind === 'cannonball'
            ? 1.25
            : p.kind === 'aa_flak'
              ? 0.92
              : p.kind === 'defense_volley'
                ? 1.02
                : 0.8;
        _dummy.scale.setScalar(projScale);
        _dummy.updateMatrix();
        cannonballInstanced.setMatrixAt(i, _dummy.matrix);
        cannonballInstanced.setColorAt(
          i,
          p.kind === 'aa_flak'
            ? _aaFlakColor
            : p.kind === 'defense_volley'
              ? _defenseBallColor
              : p.kind === 'air_rocket'
                ? _airRocketColor
                : p.kind === 'raider_bolt'
                  ? _raiderBoltColor
                  : _cannonBallColor,
        );
      }
    }
    if (anyProjDirty) {
      cannonballInstanced.instanceMatrix.needsUpdate = true;
      if (cannonballInstanced.instanceColor) cannonballInstanced.instanceColor.needsUpdate = true;
    }

    // ── F. Advance & Render Instanced Glowing Tracer & Jet Thruster Trails ──
    let anyTrailDirty = false;
    for (let i = 0; i < MAX_TRAILS; i++) {
      const tr = trails[i];
      if (!tr.alive) continue;
      anyTrailDirty = true;
      tr.life -= delta;
      if (tr.life <= 0) {
        tr.alive = false;
        trailInstanced.setMatrixAt(i, _zeroMatrix);
      } else {
        const ratio = tr.life / tr.maxLife;
        _dummy.position.set(tr.x, tr.y, tr.z);
        _dummy.rotation.set(elapsed * 4 + i, elapsed * 3, 0);
        _dummy.scale.setScalar(tr.scale * ratio);
        _dummy.updateMatrix();
        trailInstanced.setMatrixAt(i, _dummy.matrix);
        trailInstanced.setColorAt(
          i,
          tr.tone === 1 ? _coolTrailColor : tr.tone === 2 ? _jetTrailColor : _warmTrailColor,
        );
      }
    }
    if (anyTrailDirty) {
      trailInstanced.instanceMatrix.needsUpdate = true;
      if (trailInstanced.instanceColor) trailInstanced.instanceColor.needsUpdate = true;
    }

    // ── G. Advance & Render Instanced Cartoon Sparks & Gold Loot Bursts ──
    let anySparkDirty = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = sparks[i];
      if (!s.alive) continue;
      anySparkDirty = true;
      s.life -= delta;
      if (s.life <= 0) {
        s.alive = false;
        sparkInstanced.setMatrixAt(i, _zeroMatrix);
      } else {
        s.vy -= 9.8 * delta;
        s.x += s.vx * delta;
        s.y = Math.max(0.08, s.y + s.vy * delta);
        s.z += s.vz * delta;
        const ratio = s.life / s.maxLife;
        _dummy.position.set(s.x, s.y, s.z);
        _dummy.rotation.set(elapsed * 9 + i, elapsed * 7, 0);
        _dummy.scale.setScalar(s.scale * ratio);
        _dummy.updateMatrix();
        sparkInstanced.setMatrixAt(i, _dummy.matrix);
        _color.copy(
          s.colorType === 1
            ? _coolSparkColor
            : s.colorType === 2
              ? _crimsonSparkColor
              : s.colorType === 3
                ? _lootGoldSparkColor
                : _warmSparkColor,
        );
        sparkInstanced.setColorAt(i, _color);
      }
    }
    if (anySparkDirty) {
      sparkInstanced.instanceMatrix.needsUpdate = true;
      if (sparkInstanced.instanceColor) sparkInstanced.instanceColor.needsUpdate = true;
    }
  };

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  };

  return {
    group: rootGroup,
    setGraphicsQuality: (q) => {
      graphicsQuality = q;
    },
    update,
    getRadarSnapshot: () => radarSnapshot,
    triggerCampVictoryBurst,
    triggerCounterLootBurst,
    dispose,
  };
}
