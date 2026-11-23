import * as THREE from 'three';
import type { GraphicsQuality, RaiderTactic } from '../types/town.ts';

/**
 * Forward southwest/west perimeter Raider Siege Camp — positioned right outside the
 * inner railway loop (r ≈ 19.2) so it is clearly visible from Town Square & Street Walk Mode
 * without overlapping the railway track or inner plots.
 */
export const RAIDER_CAMP_POS = new THREE.Vector3(-20.2, 0, 11.2);

/** Midpoint framing the Raider Siege Camp, forward barricades/cannons, marching squad & SW town defenses */
export const BATTLE_FOCUS_TARGET = new THREE.Vector3(-13.8, 1.35, 7.6);

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

export interface RaiderRadarSnapshot {
  campX: number;
  campZ: number;
  squad: RaiderRadarDot[];
  siegeBuiltCount: number;
  activeCannons: number;
}

export interface RaiderUpdateParams {
  delta: number;
  elapsed: number;
  active: boolean;
  waveNumber: number;
  tactic: RaiderTactic;
  campHpRatio: number;
  villagerCoords: Array<{ id: string; x: number; z: number; injured: boolean }>;
  defenseTowers: DefenseTowerAnchor[];
  vanceDefending: boolean;
  vancePos: { x: number; z: number } | null;
  onRaiderImpact: (x: number, z: number) => void;
  onDefenseHitCamp: (damage: number) => void;
}

export interface TownRaidersHandle {
  group: THREE.Group;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  update: (params: RaiderUpdateParams) => void;
  getRadarSnapshot: () => RaiderRadarSnapshot;
  triggerCampVictoryBurst: () => void;
  dispose: () => void;
}

type ProjectileKind = 'cannonball' | 'raider_bolt' | 'defense_volley';

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
  colorType: 0 | 1 | 2; // 0 = warm orange-gold, 1 = cyan-blue defense, 2 = bright red-amber
}

interface ActiveTrail {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  scale: number;
  isDefense: boolean;
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
  buildProgress: number; // 0 -> 1
  startedBuild: boolean;
  builtBurstDone: boolean;
}

interface SiegeStructureRig {
  root: THREE.Group;
  worldX: number;
  worldZ: number;
  unlockTime: number;
  buildProgress: number; // 0 -> 1
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
  targetSiegeIndex: number; // for sappers assisting construction
}

const MAX_PROJECTILES = 48;
const MAX_SPARKS = 148;
const MAX_TRAILS = 112;

// Pre-allocated scratch transforms (zero GC inside render loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _cannonBallColor = new THREE.Color(0xff7a18);
const _raiderBoltColor = new THREE.Color(0xff3b30);
const _defenseBallColor = new THREE.Color(0x38bdf8);
const _warmSparkColor = new THREE.Color(0xfbbf24);
const _crimsonSparkColor = new THREE.Color(0xfb7185);
const _coolSparkColor = new THREE.Color(0x7dd3fc);
const _warmTrailColor = new THREE.Color(0xf97316);
const _coolTrailColor = new THREE.Color(0x38bdf8);
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/** Creates a crisp, lightweight procedural badge texture for floating 3D red raider tags */
function createRaiderTagTexture(label: string, bgHex: string, borderHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 36);
    // Pill background
    ctx.fillStyle = bgHex;
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 28, 10);
    ctx.fill();

    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Small red diamond emblem
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.moveTo(18, 12);
    ctx.lineTo(24, 18);
    ctx.lineTo(18, 24);
    ctx.lineTo(12, 18);
    ctx.closePath();
    ctx.fill();

    // Crisp bold uppercase label
    ctx.fillStyle = '#fff1f2';
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 72, 19);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the stylized, non-graphic Forward Raider Siege System:
 * - Closer visible Raider Siege Camp right outside the SW/W inner railway loop
 * - Enemy-constructed forward Siege Barricades, Raider Signal Tower (with glowing beacon),
 *   and 3 wheeled Brass/Iron Siege Cannons with recoil + bright muzzle flashes
 * - Animated marching squad of 6 articulated low-poly Raiders with floating red tags
 * - High-visibility pooled InstancedMesh cannonballs, blaster volleys, glowing tracer trails,
 *   impact sparks, and active two-way Defense Turret / Watchtower / Commander Vance counter-fire.
 * Strictly optimized for 4 GB RAM Android phones via shared geometries and InstancedMesh pools.
 */
export function buildTownRaidersSystem(shadowTex: THREE.Texture): TownRaidersHandle {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'raider_defense_system';

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

  // Shared materials (varied roughness/metalness for crisp stylized PBR readability)
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const dirtMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x785a3a, roughness: 0.95 }));
  const tentRedMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.68 }));
  const tentDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.76 }));
  const woodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x6b3a19, roughness: 0.86 }));
  const darkWoodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x45240e, roughness: 0.9 }));
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x263244, roughness: 0.34, metalness: 0.78 }),
  );
  const brassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.25, metalness: 0.86 }),
  );
  const sandbagMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xb6976c, roughness: 0.94 }));
  const fireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf97316,
      emissiveIntensity: 1.75,
      roughness: 0.25,
    }),
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xef4444,
      emissiveIntensity: 2.2,
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

  // Active battle root (toggled visible only during active raids)
  const battleGroup = new THREE.Group();
  battleGroup.visible = false;
  rootGroup.add(battleGroup);

  // ── 1. Forward Raider Siege Camp (just outside SW/W inner railway loop) ──
  const campGroup = new THREE.Group();
  campGroup.position.copy(RAIDER_CAMP_POS);
  const campFacingYaw = Math.atan2(-RAIDER_CAMP_POS.x, -RAIDER_CAMP_POS.z);
  campGroup.rotation.y = campFacingYaw;
  battleGroup.add(campGroup);

  const campShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(8.4, 8.4)), shadowMat);
  campShadow.rotation.x = -Math.PI / 2;
  campShadow.position.y = 0.02;
  campGroup.add(campShadow);

  const pad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.4, 3.8, 0.08, 12)), dirtMat);
  pad.position.y = 0.04;
  pad.receiveShadow = true;
  campGroup.add(pad);

  // 2 Stylized Raider Tents (shared cone geometry)
  const tentGeo = trackGeo(new THREE.ConeGeometry(1.32, 1.9, 5));
  const mainTent = new THREE.Mesh(tentGeo, tentRedMat);
  mainTent.position.set(-1.45, 0.98, -1.25);
  mainTent.castShadow = true;
  campGroup.add(mainTent);

  const sideTent = new THREE.Mesh(tentGeo, tentDarkMat);
  sideTent.position.set(1.55, 0.82, -1.35);
  sideTent.scale.set(0.84, 0.84, 0.84);
  sideTent.castShadow = true;
  campGroup.add(sideTent);

  // Supply crates + perimeter stakes
  const crateGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.5, 0.54));
  for (const [cx, cz] of [
    [-2.1, 0.45],
    [-1.55, 0.65],
    [2.0, 0.3],
    [1.65, -0.25],
  ] as Array<[number, number]>) {
    const crate = new THREE.Mesh(crateGeo, woodMat);
    crate.position.set(cx, 0.28, cz);
    crate.castShadow = true;
    campGroup.add(crate);
  }

  const stakeGeo = trackGeo(new THREE.ConeGeometry(0.11, 1.15, 5));
  for (let i = 0; i < 6; i++) {
    const a = -0.95 + (i / 5) * 1.9;
    const stake = new THREE.Mesh(stakeGeo, darkWoodMat);
    stake.position.set(Math.sin(a) * 3.15, 0.52, Math.cos(a) * 2.35 + 0.25);
    stake.rotation.x = 0.28;
    stake.castShadow = true;
    campGroup.add(stake);
  }

  // Campfire + War Banner
  const campfire = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.32, 0)), fireMat);
  campfire.position.set(0.95, 0.34, 0.2);
  campGroup.add(campfire);

  const flagPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.065, 3.6, 6)), woodMat);
  flagPole.position.set(-2.35, 1.8, -0.4);
  campGroup.add(flagPole);

  const pennant = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.48, 0.05)), tentRedMat);
  pennant.position.set(-1.78, 3.25, -0.4);
  campGroup.add(pennant);

  // Floating 3D Camp Integrity Bar
  const hpBgMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  const hpFillMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  const hpBarBg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.26, 0.08)), hpBgMat);
  hpBarBg.position.set(0, 4.15, 0);
  const hpBarFill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.64, 0.16, 0.1)), hpFillMat);
  hpBarFill.position.set(0, 4.15, 0.02);
  campGroup.add(hpBarBg, hpBarFill);

  // ── 2. Shared Siege Cannon Builder (3 Brass/Iron Cannons with Muzzle Flashes) ──
  const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10));
  const carriageGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.3, 1.18));
  const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 1.52, 10));
  const muzzleRingGeo = trackGeo(new THREE.TorusGeometry(0.22, 0.055, 6, 10));
  const breechKnobGeo = trackGeo(new THREE.SphereGeometry(0.22, 8, 6));
  const flashConeGeo = trackGeo(new THREE.ConeGeometry(0.44, 1.05, 6));
  const flashCoreGeo = trackGeo(new THREE.OctahedronGeometry(0.28, 0));
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

    // Glowing muzzle flash cone + bright core orb
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

  // Cannon #1 right at the front of Raider Camp, Cannon #2 & #3 built forward behind the Siege Barricades
  const campCannonX = RAIDER_CAMP_POS.x + Math.sin(campFacingYaw) * 1.45;
  const campCannonZ = RAIDER_CAMP_POS.z + Math.cos(campFacingYaw) * 1.45;
  const cannons: CannonRig[] = [
    createSiegeCannon(campCannonX, campCannonZ, 0, 1.3),
    createSiegeCannon(-15.4, 9.6, 5.2, 2.4),
    createSiegeCannon(-16.2, 6.2, 8.8, 3.0),
  ];

  // ── 3. Enemy-Constructed Siege Barricades (3) & Raider Signal Tower (1) ──
  const barricadeBeamGeo = trackGeo(new THREE.BoxGeometry(2.35, 0.32, 0.34));
  const barricadePostGeo = trackGeo(new THREE.BoxGeometry(0.24, 1.28, 0.24));
  const ironStrapGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.96, 0.38));
  const sandbagGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.28, 0.42));

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

    const bShadow = new THREE.Mesh(smallShadowGeo, shadowMat);
    bShadow.rotation.x = -Math.PI / 2;
    bShadow.scale.set(1.1, 0.75, 1);
    bShadow.position.y = 0.025;
    bRoot.add(bShadow);

    // 3 stacked heavy logs + 2 vertical posts + 2 iron reinforcement straps
    for (let row = 0; row < 3; row++) {
      const log = new THREE.Mesh(barricadeBeamGeo, row === 1 ? darkWoodMat : woodMat);
      log.position.set(0, 0.22 + row * 0.34, 0);
      log.castShadow = true;
      bRoot.add(log);
    }
    for (const px of [-0.92, 0.92]) {
      const post = new THREE.Mesh(barricadePostGeo, darkWoodMat);
      post.position.set(px, 0.64, -0.05);
      const strap = new THREE.Mesh(ironStrapGeo, ironMat);
      strap.position.set(px * 0.62, 0.56, 0.01);
      bRoot.add(post, strap);
    }
    // Angled outward stakes + red cloth warning strip + sandbag cover behind
    for (const sx of [-0.75, 0, 0.75]) {
      const spike = new THREE.Mesh(stakeGeo, darkWoodMat);
      spike.position.set(sx, 0.72, 0.36);
      spike.rotation.x = 0.65;
      bRoot.add(spike);
    }
    const bagLeft = new THREE.Mesh(sandbagGeo, sandbagMat);
    bagLeft.position.set(-0.46, 0.16, -0.36);
    const bagRight = new THREE.Mesh(sandbagGeo, sandbagMat);
    bagRight.position.set(0.46, 0.16, -0.36);
    const warStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.16, 0.06)), tentRedMat);
    warStripe.position.set(0, 0.92, 0.19);
    bRoot.add(bagLeft, bagRight, warStripe);

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

  // Raider Signal Tower (tall timber scaffold + pulsing crimson beacon visible from Town Square)
  const createSignalTower = (worldX: number, worldZ: number, unlockTime: number): SiegeStructureRig => {
    const tRoot = new THREE.Group();
    tRoot.position.set(worldX, 0, worldZ);
    tRoot.rotation.y = Math.atan2(-worldX, -worldZ);
    tRoot.visible = false;
    tRoot.scale.set(1, 0.01, 1);
    battleGroup.add(tRoot);

    const tShadow = new THREE.Mesh(smallShadowGeo, shadowMat);
    tShadow.rotation.x = -Math.PI / 2;
    tShadow.scale.set(1.25, 1.25, 1);
    tShadow.position.y = 0.025;
    tRoot.add(tShadow);

    const legGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 4.3, 6));
    for (const [lx, lz] of [
      [-0.75, -0.75],
      [0.75, -0.75],
      [-0.75, 0.75],
      [0.75, 0.75],
    ] as Array<[number, number]>) {
      const leg = new THREE.Mesh(legGeo, darkWoodMat);
      leg.position.set(lx * 0.88, 2.15, lz * 0.88);
      leg.rotation.z = lx > 0 ? 0.06 : -0.06;
      leg.rotation.x = lz > 0 ? -0.06 : 0.06;
      leg.castShadow = true;
      tRoot.add(leg);
    }

    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.85, 0.22, 1.85)), woodMat);
    deck.position.y = 4.15;
    deck.castShadow = true;
    tRoot.add(deck);

    // Parapet rails
    const railGeo = trackGeo(new THREE.BoxGeometry(1.85, 0.34, 0.14));
    const railFront = new THREE.Mesh(railGeo, tentRedMat);
    railFront.position.set(0, 4.44, 0.86);
    const railBack = new THREE.Mesh(railGeo, darkWoodMat);
    railBack.position.set(0, 4.44, -0.86);
    tRoot.add(railFront, railBack);

    // Brazier tripod & pulsing crimson/amber signal beacon
    const brazierBowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.44, 0.26, 0.36, 7)), ironMat);
    brazierBowl.position.set(0, 4.52, 0);
    const beaconOrb = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.42, 0)), beaconMat);
    beaconOrb.position.set(0, 5.12, 0);
    const towerPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6)), ironMat);
    towerPole.position.set(0.74, 5.2, -0.68);
    const flagMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 0.46, 0.05)), tentRedMat);
    flagMesh.position.set(1.28, 5.95, -0.68);
    tRoot.add(brazierBowl, beaconOrb, towerPole, flagMesh);

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

  // Forward Siege Line positioned cleanly along SW perimeter inside railway (r ≈ 15.6–16.6)
  // plus Signal Tower flanking the main Raider Camp
  const siegeStructures: SiegeStructureRig[] = [
    createSiegeBarricade(-14.3, 7.6, 1.2), // Center forward barricade
    createSignalTower(-21.2, 8.4, 2.6), // Tall Signal Tower with glowing red beacon
    createSiegeBarricade(-13.6, 9.6, 3.8), // South forward barricade
    createSiegeBarricade(-15.2, 5.5, 5.8), // North forward barricade
  ];

  // ── 4. Marching Squad of 6 Articulated Low-Poly Raiders with Floating Red Tags ──
  const rTorsoGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.56, 0.28));
  const rTrimGeo = trackGeo(new THREE.BoxGeometry(0.49, 0.14, 0.31));
  const rHeadGeo = trackGeo(new THREE.BoxGeometry(0.35, 0.35, 0.35));
  const rHelmGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.22, 0.18, 6));
  const rPlumeGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.28, 5));
  const rLegGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.44, 0.16));
  const rArmGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.42, 0.14));
  const rBlasterGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.07, 0.54, 6));
  const rHammerHeadGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.14, 0.14));

  const rSkinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfde2c8, roughness: 0.65 }));
  const rCoatMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 }));
  const rPantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));

  const captainTagTex = trackTex(createRaiderTagTexture('IRONJAW', '#991b1b', '#fca5a5'));
  const sapperTagTex = trackTex(createRaiderTagTexture('SAPPER', '#9a3412', '#fdba74'));
  const raiderTagTex = trackTex(createRaiderTagTexture('RAIDER', '#7f1d1d', '#f87171'));

  const captainTagMat = trackMat(
    new THREE.SpriteMaterial({ map: captainTagTex, transparent: true, depthTest: false }),
  );
  const sapperTagMat = trackMat(
    new THREE.SpriteMaterial({ map: sapperTagTex, transparent: true, depthTest: false }),
  );
  const raiderTagMat = trackMat(
    new THREE.SpriteMaterial({ map: raiderTagTex, transparent: true, depthTest: false }),
  );

  const squadConfigs: Array<{
    role: 'captain' | 'sapper' | 'vanguard';
    spawnX: number;
    spawnZ: number;
    coverX: number;
    coverZ: number;
    targetSiegeIndex: number;
  }> = [
    // Captain Ironjaw — leads center advance behind Center Barricade
    { role: 'captain', spawnX: -19.6, spawnZ: 10.6, coverX: -15.0, coverZ: 7.9, targetSiegeIndex: 0 },
    // Sapper Engineer 1 — builds Center/South Barricades & Cannon #2
    { role: 'sapper', spawnX: -19.0, spawnZ: 11.8, coverX: -14.4, coverZ: 9.9, targetSiegeIndex: 2 },
    // Sapper Engineer 2 — builds Signal Tower, North Barricade & Cannon #3
    { role: 'sapper', spawnX: -20.8, spawnZ: 9.8, coverX: -16.0, coverZ: 6.0, targetSiegeIndex: 3 },
    // Vanguard Raider 1 — marches to Center-North forward line
    { role: 'vanguard', spawnX: -18.8, spawnZ: 10.2, coverX: -14.9, coverZ: 6.9, targetSiegeIndex: 0 },
    // Vanguard Raider 2 — marches to South forward line
    { role: 'vanguard', spawnX: -18.6, spawnZ: 12.1, coverX: -14.2, coverZ: 10.6, targetSiegeIndex: 2 },
    // Vanguard Raider 3 — marches to North flank barricade
    { role: 'vanguard', spawnX: -19.9, spawnZ: 9.2, coverX: -15.7, coverZ: 5.0, targetSiegeIndex: 3 },
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

    // Articulated Legs (hip-pivoted at y=0.46)
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

    // Torso & Iron Belt Trim
    const torso = new THREE.Mesh(
      rTorsoGeo,
      cfg.role === 'captain' ? tentRedMat : cfg.role === 'sapper' ? woodMat : rCoatMat,
    );
    torso.position.y = 0.74;
    torso.castShadow = true;

    const belt = new THREE.Mesh(rTrimGeo, cfg.role === 'captain' ? brassMat : ironMat);
    belt.position.y = 0.56;

    // Head + Helm
    const head = new THREE.Mesh(rHeadGeo, rSkinMat);
    head.position.y = 1.22;
    const helm = new THREE.Mesh(
      rHelmGeo,
      cfg.role === 'captain' ? tentDarkMat : cfg.role === 'sapper' ? brassMat : tentRedMat,
    );
    helm.position.y = 1.44;
    bodyGroup.add(leftLegPivot, rightLegPivot, torso, belt, head, helm);

    if (cfg.role === 'captain') {
      const plume = new THREE.Mesh(rPlumeGeo, tentRedMat);
      plume.position.set(0, 1.62, -0.05);
      plume.rotation.x = -0.3;
      bodyGroup.add(plume);
    }

    // Articulated Arms (shoulder-pivoted at y=0.96) + Brass Spark-Blaster or Sapper Mallet
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.31, 0.96, 0);
    const leftArm = new THREE.Mesh(rArmGeo, rCoatMat);
    leftArm.position.y = -0.18;
    leftArmPivot.add(leftArm);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.31, 0.96, 0);
    const rightArm = new THREE.Mesh(rArmGeo, cfg.role === 'captain' ? tentRedMat : rCoatMat);
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

    // Floating bright Red Raider Tag above head
    const tagSprite = new THREE.Sprite(
      cfg.role === 'captain'
        ? captainTagMat
        : cfg.role === 'sapper'
          ? sapperTagMat
          : raiderTagMat,
    );
    tagSprite.position.set(0, 2.08, 0);
    tagSprite.scale.set(1.45, 0.42, 1);
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
      facingYaw: campFacingYaw,
      walkPhase: idx * 1.15,
      fireCooldown: 1.5 + idx * 0.55,
      strafePhase: idx * 1.7,
      buildSparkTimer: 0.2,
      targetSiegeIndex: cfg.targetSiegeIndex,
    };
  });

  // Pre-allocated radar snapshot (zero GC when emitting to TownMinimap)
  const radarSnapshot: RaiderRadarSnapshot = {
    campX: RAIDER_CAMP_POS.x,
    campZ: RAIDER_CAMP_POS.z,
    squad: squad.map((r) => ({ x: r.x, z: r.z, isCaptain: r.role === 'captain' })),
    siegeBuiltCount: 0,
    activeCannons: 1,
  };

  // ── 5. Pooled InstancedMesh Projectiles, Glowing Tracer Trails & Cartoon Sparks ──
  const ballGeo = trackGeo(new THREE.IcosahedronGeometry(0.29, 1));
  const ballMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    }),
  );
  const cannonballInstanced = new THREE.InstancedMesh(ballGeo, ballMat, MAX_PROJECTILES);
  cannonballInstanced.frustumCulled = false;
  cannonballInstanced.castShadow = false;
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
  const sparkMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    }),
  );
  const sparkInstanced = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
  sparkInstanced.frustumCulled = false;
  for (let i = 0; i < MAX_SPARKS; i++) {
    sparkInstanced.setMatrixAt(i, _zeroMatrix);
    sparkInstanced.setColorAt(i, _warmSparkColor);
  }
  sparkInstanced.instanceMatrix.needsUpdate = true;
  if (sparkInstanced.instanceColor) sparkInstanced.instanceColor.needsUpdate = true;
  rootGroup.add(sparkInstanced);

  // ── 6. Internal Pools & Timers ──
  const projectiles: ActiveProjectile[] = Array.from({ length: MAX_PROJECTILES }, () => ({
    alive: false,
    kind: 'cannonball',
    startX: 0,
    startY: 0,
    startZ: 0,
    endX: 0,
    endY: 0,
    endZ: 0,
    arcHeight: 6,
    t: 0,
    duration: 1.6,
    damage: 0,
    trailTimer: 0,
  }));

  const trails: ActiveTrail[] = Array.from({ length: MAX_TRAILS }, () => ({
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    life: 0,
    maxLife: 0.35,
    scale: 1,
    isDefense: false,
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
  let defenseFireCooldown = 1.1;
  let vanceFireCooldown = 1.8;
  let raidActiveSeconds = 0;
  let wasActive = false;
  let lastWaveNumber = 0;

  const spawnSparks = (
    x: number,
    y: number,
    z: number,
    count: number,
    colorType: 0 | 1 | 2,
  ) => {
    const cap = graphicsQuality === 'low' ? Math.min(count, 4) : count;
    let spawned = 0;
    for (let i = 0; i < MAX_SPARKS && spawned < cap; i++) {
      const s = sparks[i];
      if (s.alive) continue;
      const angle = (spawned / Math.max(1, cap)) * Math.PI * 2 + Math.random() * 0.55;
      const spd = 2.0 + Math.random() * 3.4;
      s.alive = true;
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.cos(angle) * spd;
      s.vy = 2.8 + Math.random() * 3.8;
      s.vz = Math.sin(angle) * spd;
      s.maxLife = 0.42 + Math.random() * 0.38;
      s.life = s.maxLife;
      s.scale = 0.8 + Math.random() * 0.7;
      s.colorType = colorType;
      spawned++;
    }
  };

  const spawnTrailOrb = (x: number, y: number, z: number, scale: number, isDefense: boolean) => {
    if (graphicsQuality === 'low') return;
    for (let i = 0; i < MAX_TRAILS; i++) {
      const tr = trails[i];
      if (tr.alive) continue;
      tr.alive = true;
      tr.x = x;
      tr.y = y;
      tr.z = z;
      tr.maxLife = 0.28;
      tr.life = 0.28;
      tr.scale = scale;
      tr.isDefense = isDefense;
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
      spawnSparks(sx, sy, sz, kind === 'cannonball' ? 8 : 5, kind === 'defense_volley' ? 1 : 0);
      return;
    }
  };

  const resetRaidStage = () => {
    raidActiveSeconds = 0;
    defenseFireCooldown = 0.9;
    vanceFireCooldown = 1.5;

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
      c.fireCooldown = 1.1 + i * 0.9;
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
  };

  const triggerCampVictoryBurst = () => {
    spawnSparks(RAIDER_CAMP_POS.x, 1.5, RAIDER_CAMP_POS.z, 22, 1);
    spawnSparks(RAIDER_CAMP_POS.x, 2.0, RAIDER_CAMP_POS.z, 18, 0);
    spawnSparks(-14.5, 1.4, 8.0, 14, 1);
  };

  const update = (params: RaiderUpdateParams) => {
    const {
      delta,
      elapsed,
      active,
      waveNumber,
      tactic,
      campHpRatio,
      villagerCoords,
      defenseTowers,
      vanceDefending,
      vancePos,
      onRaiderImpact,
      onDefenseHitCamp,
    } = params;

    const waveChanged = active && waveNumber > 0 && waveNumber !== lastWaveNumber;
    if (active !== wasActive || waveChanged) {
      wasActive = active;
      battleGroup.visible = active;
      if (active) {
        lastWaveNumber = waveNumber;
        resetRaidStage();
        spawnSparks(RAIDER_CAMP_POS.x, 1.4, RAIDER_CAMP_POS.z, 16, 2);
      }
    }

    if (active) {
      raidActiveSeconds += delta;
      // Higher waves accelerate enemy siege construction slightly
      const waveBuildBoost = 1 + Math.min(0.9, Math.max(0, waveNumber - 1) * 0.35);
      const effectiveSiegeTime = raidActiveSeconds * waveBuildBoost;

      const clampedHp = Math.max(0.04, Math.min(1, campHpRatio));
      hpBarFill.scale.x = clampedHp;
      hpBarFill.position.x = -1.32 * (1 - clampedHp);

      campfire.scale.setScalar(0.9 + Math.sin(elapsed * 12) * 0.18);
      pennant.rotation.y = Math.sin(elapsed * 5.2) * 0.25;

      // ── A. Enemy Siege Construction (Barricades & Signal Tower) ──
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
          const pulse = 0.88 + Math.sin(elapsed * 7.5) * 0.26;
          st.beaconOrb.scale.setScalar(pulse);
          st.beaconOrb.rotation.y = elapsed * 2.2;
        }
        if (st.flagMesh && st.root.visible) {
          st.flagMesh.rotation.y = Math.sin(elapsed * 5.6 + i) * 0.24;
        }
      }

      // Helper to pick a dramatic town target (Defense Walls/Watchtowers, workers, or SW plaza)
      const pickRaiderTarget = (preferDefenses: boolean): { x: number; y: number; z: number } => {
        if (preferDefenses && defenseTowers.length > 0 && Math.random() < 0.62) {
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
        if (tactic === 'siege_plaza') {
          return {
            x: -3.5 + (Math.random() - 0.5) * 7.0,
            y: 0.35,
            z: 2.5 + (Math.random() - 0.5) * 7.0,
          };
        }
        if (healthyTargets.length > 0 && Math.random() < 0.45) {
          const picked = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
          return {
            x: picked.x + (Math.random() - 0.5) * 2.4,
            y: 0.4,
            z: picked.z + (Math.random() - 0.5) * 2.4,
          };
        }
        return {
          x: -8.2 + (Math.random() - 0.5) * 5.6,
          y: 0.35,
          z: 5.5 + (Math.random() - 0.5) * 6.2,
        };
      };

      // ── B. 3 Wheeled Brass/Iron Siege Cannons (Constructed + Firing with Muzzle Flash) ──
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
          if (c.recoil > 0) {
            c.recoil = Math.max(0, c.recoil - delta * 2.8);
          }
          c.barrelPivot.position.z = 0.05 - c.recoil * 0.38;

          if (c.flashTimer > 0) {
            c.flashTimer = Math.max(0, c.flashTimer - delta);
            c.muzzleFlash.visible = c.flashTimer > 0;
            const fScale = 0.65 + (c.flashTimer / 0.22) * 0.9;
            c.muzzleFlash.scale.setScalar(fScale);
            c.muzzleFlash.rotation.z = elapsed * 24 + i;
          } else {
            c.muzzleFlash.visible = false;
          }

          c.fireCooldown -= delta;
          if (c.fireCooldown <= 0) {
            const baseRate =
              tactic === 'siege_plaza'
                ? 2.8
                : tactic === 'target_workers'
                  ? 3.2
                  : tactic === 'regroup'
                    ? 4.4
                    : 3.5;
            // Stagger multi-cannon volleys so shots constantly arc across the battlefront
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
              5.4 + Math.random() * 1.6,
              1.45,
              0,
            );
          }
        }
      }

      // ── C. Marching Squad of 6 Animated Low-Poly Raiders ──
      const marchSpeed = 2.65;
      for (let i = 0; i < squad.length; i++) {
        const r = squad[i];

        // Determine destination: Sappers head to active construction sites first; others march to cover barricades
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

        // Gentle tactical strafing once behind forward barricade
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

          // Brisk limb-swing marching animation
          r.walkPhase += delta * 11.5;
          const swing = Math.sin(r.walkPhase) * 0.72;
          r.leftLegPivot.rotation.x = swing;
          r.rightLegPivot.rotation.x = -swing;
          r.leftArmPivot.rotation.x = -swing * 0.8;
          r.rightArmPivot.rotation.x = r.role === 'sapper' ? swing * 0.8 : -0.75 + swing * 0.22;
          r.bodyGroup.position.y = Math.abs(Math.sin(r.walkPhase)) * 0.08;
        } else {
          // Face toward Town Square / SW Defense line when in cover or hammering
          const townYaw = Math.atan2(-7.5 - r.x, 4.5 - r.z);
          const diff = Math.atan2(Math.sin(townYaw - r.facingYaw), Math.cos(townYaw - r.facingYaw));
          r.facingYaw += diff * Math.min(1, delta * 7);
          r.root.rotation.y = r.facingYaw;

          r.leftLegPivot.rotation.x = THREE.MathUtils.damp(r.leftLegPivot.rotation.x, 0, 8, delta);
          r.rightLegPivot.rotation.x = THREE.MathUtils.damp(r.rightLegPivot.rotation.x, 0, 8, delta);

          if (isHammering) {
            r.rightArmPivot.rotation.x = -0.8 + Math.sin(elapsed * 14 + i) * 0.75;
            r.leftArmPivot.rotation.x = -0.35;
            r.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 7 + i)) * 0.04;
            r.buildSparkTimer -= delta;
            if (r.buildSparkTimer <= 0) {
              r.buildSparkTimer = 0.32;
              spawnSparks(r.x + Math.sin(r.facingYaw) * 0.55, 0.85, r.z + Math.cos(r.facingYaw) * 0.55, 4, 0);
            }
          } else {
            // Aiming spark-blaster behind forward barricade cover
            r.rightArmPivot.rotation.x = -1.22 + Math.sin(elapsed * 3.5 + i) * 0.08;
            r.leftArmPivot.rotation.x = -0.55;
            r.bodyGroup.position.y = Math.sin(elapsed * 3.2 + i) * 0.025;

            r.fireCooldown -= delta;
            if (r.fireCooldown <= 0) {
              r.fireCooldown = (r.role === 'captain' ? 2.1 : 2.9) + Math.random() * 1.4;
              const tgt = pickRaiderTarget(true);
              const bx = r.x + Math.sin(r.facingYaw) * 0.55;
              const bz = r.z + Math.cos(r.facingYaw) * 0.55;
              spawnProjectile('raider_bolt', bx, 1.15, bz, tgt.x, tgt.y + 0.25, tgt.z, 1.65, 0.88, 0);
            }
          }
        }

        // Update pre-allocated radar dot
        radarSnapshot.squad[i].x = r.x;
        radarSnapshot.squad[i].z = r.z;
      }

      radarSnapshot.siegeBuiltCount = siegeBuiltCount + Math.max(0, activeCannons - 1);
      radarSnapshot.activeCannons = activeCannons;

      // ── D. Two-Way Town Defense Counter-Fire (Turrets, Watchtowers & Commander Vance) ──
      const pickEnemyCounterTarget = (): { x: number; y: number; z: number } => {
        // Alternate hitting the main Raider Camp, forward cannons, and barricades so battle sparks light up the whole front
        const builtForwardCannons = cannons.filter((c, idx) => idx > 0 && c.buildProgress >= 1);
        if (builtForwardCannons.length > 0 && Math.random() < 0.42) {
          const fc = builtForwardCannons[Math.floor(Math.random() * builtForwardCannons.length)];
          return {
            x: fc.worldX + (Math.random() - 0.5) * 1.0,
            y: 0.9,
            z: fc.worldZ + (Math.random() - 0.5) * 1.0,
          };
        }
        if (Math.random() < 0.32) {
          const picked = squad[Math.floor(Math.random() * squad.length)];
          return {
            x: picked.x + (Math.random() - 0.5) * 1.2,
            y: 0.95,
            z: picked.z + (Math.random() - 0.5) * 1.2,
          };
        }
        return {
          x: RAIDER_CAMP_POS.x + (Math.random() - 0.5) * 2.2,
          y: 0.95,
          z: RAIDER_CAMP_POS.z + (Math.random() - 0.5) * 2.2,
        };
      };

      if (defenseTowers.length > 0) {
        defenseFireCooldown -= delta;
        if (defenseFireCooldown <= 0) {
          const shotInterval = Math.max(0.75, 2.1 - defenseTowers.length * 0.32);
          defenseFireCooldown = shotInterval;
          const tower = defenseTowers[Math.floor(Math.random() * defenseTowers.length)];
          if (tower.barrels === 3) {
            // Triple-Gun Defense Tower fires a rapid 3-shot counter-volley!
            spawnSparks(tower.x, tower.y + 0.1, tower.z, 7, 1);
            for (let b = -1; b <= 1; b++) {
              const et = pickEnemyCounterTarget();
              spawnProjectile(
                'defense_volley',
                tower.x + b * 0.32,
                tower.y + (b === 0 ? 0.14 : 0),
                tower.z + b * 0.22,
                et.x + b * 0.65,
                et.y,
                et.z + b * 0.65,
                3.6 + Math.abs(b) * 0.55,
                0.96 + (b + 1) * 0.12,
                Math.max(4, Math.round(tower.power * 0.62)),
              );
            }
          } else {
            const et = pickEnemyCounterTarget();
            spawnProjectile(
              'defense_volley',
              tower.x,
              tower.y,
              tower.z,
              et.x,
              et.y,
              et.z,
              4.2,
              1.15,
              tower.power,
            );
          }
        }
      }

      // Commander Vance visibly returns bright cyan-gold counter-fire from his live position
      if (vanceDefending) {
        vanceFireCooldown -= delta;
        if (vanceFireCooldown <= 0) {
          vanceFireCooldown = defenseTowers.length > 0 ? 2.4 : 1.75;
          const vx = vancePos ? vancePos.x : -6.5;
          const vz = vancePos ? vancePos.z : 1.8;
          const et = pickEnemyCounterTarget();
          spawnProjectile(
            'defense_volley',
            vx,
            1.45,
            vz,
            et.x,
            et.y,
            et.z,
            3.4,
            1.1,
            defenseTowers.length > 0 ? 5 : 9,
          );
        }
      }
    }

    // ── E. Advance & Render Instanced Projectiles (with Glowing Tracer Trails) ──
    let anyProjDirty = false;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = projectiles[i];
      if (!p.alive) continue;
      anyProjDirty = true;
      p.t += delta / p.duration;
      if (p.t >= 1) {
        p.alive = false;
        cannonballInstanced.setMatrixAt(i, _zeroMatrix);
        const isDef = p.kind === 'defense_volley';
        spawnSparks(
          p.endX,
          Math.max(0.45, p.endY),
          p.endZ,
          p.kind === 'cannonball' ? 12 : 8,
          isDef ? 1 : p.kind === 'raider_bolt' ? 2 : 0,
        );
        if (active) {
          if (isDef) {
            onDefenseHitCamp(p.damage);
          } else if (p.kind === 'cannonball' || Math.random() < 0.25) {
            onRaiderImpact(p.endX, p.endZ);
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
          p.trailTimer = p.kind === 'cannonball' ? 0.055 : 0.075;
          spawnTrailOrb(
            x,
            y,
            z,
            p.kind === 'cannonball' ? 1.05 : 0.72,
            p.kind === 'defense_volley',
          );
        }

        _dummy.position.set(x, y, z);
        _dummy.rotation.set(elapsed * 8 + i, elapsed * 6, 0);
        const projScale =
          p.kind === 'cannonball' ? 1.28 : p.kind === 'defense_volley' ? 1.04 : 0.78;
        _dummy.scale.setScalar(projScale);
        _dummy.updateMatrix();
        cannonballInstanced.setMatrixAt(i, _dummy.matrix);
        cannonballInstanced.setColorAt(
          i,
          p.kind === 'defense_volley'
            ? _defenseBallColor
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

    // ── F. Advance & Render Instanced Glowing Tracer Trails ──
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
        trailInstanced.setColorAt(i, tr.isDefense ? _coolTrailColor : _warmTrailColor);
      }
    }
    if (anyTrailDirty) {
      trailInstanced.instanceMatrix.needsUpdate = true;
      if (trailInstanced.instanceColor) trailInstanced.instanceColor.needsUpdate = true;
    }

    // ── G. Advance & Render Instanced Cartoon Sparks ──
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
    dispose,
  };
}
