import * as THREE from 'three';
import type { DecorPackId, TimeOfDay, WeatherMode } from '../types/town.ts';

export interface TownLifeHandle {
  group: THREE.Group;
  setDecorPacks: (packs: DecorPackId[]) => void;
  triggerCelebration: () => void;
  update: (
    delta: number,
    elapsed: number,
    timeOfDay: TimeOfDay,
    weather: WeatherMode,
    villagerPositions: Array<{ x: number; z: number }>,
  ) => void;
  dispose: () => void;
}

// Module-scoped reusable helpers (zero GC allocations in animation loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

const BIRD_COUNT = 10;
const BUTTERFLY_COUNT = 12;
const LANTERN_COUNT = 24;
const FIREWORK_PARTICLE_COUNT = 48;

interface FireworkParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/**
 * Builds ultra-lightweight 3D Town Wildlife (Friendly Town Dog, Songbirds, Butterflies),
 * Triggerable Plaza Celebrations (Rising Sky Lanterns & Firework Bursts),
 * and Toggleable Street Decor Packs (Lantern Boulevards, Flower Gardens, Bunting, Statues).
 * Strictly instanced and optimized for 4 GB RAM Android phones.
 */
export function buildTownLifeAndDecor(shadowTex: THREE.CanvasTexture): TownLifeHandle {
  const group = new THREE.Group();
  group.name = 'town:life_and_decor';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // ==========================================================================
  // 1. Friendly Town Dog ("Barnaby") — 9-Part Composite Procedural Model
  // ==========================================================================
  const dogRoot = new THREE.Group();
  dogRoot.name = 'wildlife:town_dog';
  dogRoot.position.set(2.4, 0, 2.2);

  const furMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xc28547, roughness: 0.78, metalness: 0.02 }),
  );
  const creamFurMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfde8c8, roughness: 0.72, metalness: 0.02 }),
  );
  const darkFurMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c361a, roughness: 0.8, metalness: 0.04 }),
  );
  const collarMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.48, metalness: 0.1 }),
  );
  const goldTagMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.88 }),
  );
  const dogShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );

  const dogShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.92, 0.92)), dogShadowMat);
  dogShadow.rotation.x = -Math.PI / 2;
  dogShadow.position.y = 0.025;
  dogRoot.add(dogShadow);

  const dogBodyGroup = new THREE.Group();
  dogRoot.add(dogBodyGroup);

  const torso = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.26, 0.56)), furMat);
  torso.position.set(0, 0.34, 0);
  torso.castShadow = true;
  dogBodyGroup.add(torso);

  const chest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.26, 0.22, 0.16)), creamFurMat);
  chest.position.set(0, 0.33, 0.24);
  dogBodyGroup.add(chest);

  const head = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.26, 0.24, 0.26)), furMat);
  head.position.set(0, 0.52, 0.32);
  head.castShadow = true;
  dogBodyGroup.add(head);

  const snout = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.11, 0.15)), creamFurMat);
  snout.position.set(0, 0.47, 0.48);
  dogBodyGroup.add(snout);

  const nose = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.05, 0.05)), darkFurMat);
  nose.position.set(0, 0.5, 0.55);
  dogBodyGroup.add(nose);

  const earGeo = trackGeo(new THREE.BoxGeometry(0.07, 0.16, 0.1));
  const earL = new THREE.Mesh(earGeo, darkFurMat);
  earL.position.set(-0.14, 0.53, 0.3);
  earL.rotation.z = 0.22;
  const earR = new THREE.Mesh(earGeo, darkFurMat);
  earR.position.set(0.14, 0.53, 0.3);
  earR.rotation.z = -0.22;
  dogBodyGroup.add(earL, earR);

  const collar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.06, 0.22)), collarMat);
  collar.position.set(0, 0.43, 0.24);
  dogBodyGroup.add(collar);

  const tag = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.035, 6, 6)), goldTagMat);
  tag.position.set(0, 0.39, 0.36);
  dogBodyGroup.add(tag);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.44, -0.28);
  const tail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.07, 0.07, 0.26)), furMat);
  tail.position.set(0, 0.06, -0.1);
  tail.rotation.x = 0.55;
  tailPivot.add(tail);
  dogBodyGroup.add(tailPivot);

  const dogLegGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.24, 0.09));
  const dogLegs: THREE.Mesh[] = [];
  const legCoords: Array<[number, number]> = [
    [-0.1, 0.18],
    [0.1, 0.18],
    [-0.1, -0.18],
    [0.1, -0.18],
  ];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.Mesh(dogLegGeo, creamFurMat);
    leg.position.set(lx, 0.12, lz);
    dogBodyGroup.add(leg);
    dogLegs.push(leg);
  }

  group.add(dogRoot);

  // Dog wandering state
  let dogTargetX = -2.2;
  let dogTargetZ = 3.6;
  let dogWaitTimer = 0;
  let dogWalkPhase = 0;
  let dogYaw = 0;

  // ==========================================================================
  // 2. Instanced Songbirds & Butterflies (Zero-Allocation Dynamic Loops)
  // ==========================================================================
  const birdGeo = trackGeo(new THREE.ConeGeometry(0.12, 0.42, 4));
  birdGeo.rotateX(Math.PI / 2);
  const birdMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6, metalness: 0.05 }),
  );
  const birdMesh = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_COUNT);
  birdMesh.frustumCulled = false;
  const birdParams = Array.from({ length: BIRD_COUNT }, (_, i) => ({
    radius: 8 + (i % 5) * 4.2,
    height: 7.5 + (i % 4) * 2.1,
    speed: 0.26 + (i % 3) * 0.07,
    phase: (i / BIRD_COUNT) * Math.PI * 2,
    centerX: Math.cos(i * 1.9) * 5,
    centerZ: Math.sin(i * 1.9) * 5,
  }));
  group.add(birdMesh);

  const butterflyGeo = trackGeo(new THREE.PlaneGeometry(0.24, 0.16));
  const butterflyMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    }),
  );
  const butterflyMesh = new THREE.InstancedMesh(butterflyGeo, butterflyMat, BUTTERFLY_COUNT);
  butterflyMesh.frustumCulled = false;
  const butterflyColors = [0xfde047, 0xf472b6, 0x38bdf8, 0xfb923c, 0xc084fc];
  const butterflyParams = Array.from({ length: BUTTERFLY_COUNT }, (_, i) => {
    _color.setHex(butterflyColors[i % butterflyColors.length]);
    butterflyMesh.setColorAt(i, _color);
    return {
      cx: (i % 2 === 0 ? 0 : (i % 4 === 1 ? -5 : 5)) + Math.cos(i * 2.1) * 3.5,
      cz: (i % 2 === 0 ? 8.8 : 2.2) + Math.sin(i * 2.1) * 3.2,
      phase: i * 1.4,
      speed: 0.9 + (i % 3) * 0.35,
    };
  });
  if (butterflyMesh.instanceColor) butterflyMesh.instanceColor.needsUpdate = true;
  group.add(butterflyMesh);

  // ==========================================================================
  // 3. 3D Plaza Celebrations: Rising Sky Lanterns + Pooled Firework Bursts
  // ==========================================================================
  const celebrationGroup = new THREE.Group();
  celebrationGroup.visible = false;
  group.add(celebrationGroup);

  const lanternGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.13, 0.34, 6));
  const lanternMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.92,
    }),
  );
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, LANTERN_COUNT);
  lanternMesh.frustumCulled = false;
  const lanternPalette = [0xfef08a, 0xfbbf24, 0xfb923c, 0xfda4af];
  const lanternSeeds = Array.from({ length: LANTERN_COUNT }, (_, i) => {
    _color.setHex(lanternPalette[i % lanternPalette.length]);
    lanternMesh.setColorAt(i, _color);
    const angle = (i / LANTERN_COUNT) * Math.PI * 2;
    const rad = 1.6 + (i % 5) * 1.5;
    return {
      x: Math.cos(angle) * rad,
      z: Math.sin(angle) * rad - 2.0,
      speed: 1.05 + (i % 4) * 0.25,
      delay: (i % 6) * 0.45,
      sway: i * 1.3,
    };
  });
  if (lanternMesh.instanceColor) lanternMesh.instanceColor.needsUpdate = true;
  celebrationGroup.add(lanternMesh);

  const fwGeo = trackGeo(new THREE.OctahedronGeometry(0.16, 0));
  const fwMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    }),
  );
  const fwMesh = new THREE.InstancedMesh(fwGeo, fwMat, FIREWORK_PARTICLE_COUNT);
  fwMesh.frustumCulled = false;
  const fwPalette = [0xfde047, 0x38bdf8, 0xf472b6, 0x34d399, 0xfb923c, 0xc084fc];
  const fwParticles: FireworkParticle[] = Array.from({ length: FIREWORK_PARTICLE_COUNT }, (_, i) => {
    _color.setHex(fwPalette[i % fwPalette.length]);
    fwMesh.setColorAt(i, _color);
    return { x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 };
  });
  if (fwMesh.instanceColor) fwMesh.instanceColor.needsUpdate = true;
  celebrationGroup.add(fwMesh);

  let celebrationTimer = 0;
  let nextVolleyTimer = 0;
  let volleyCursor = 0;

  const spawnFireworkBurst = (burstIdx: number) => {
    const origins: Array<[number, number, number]> = [
      [0, 9.8, -8.2],
      [-5.5, 9.2, -3.5],
      [5.5, 9.4, -3.5],
      [0, 8.8, 4.2],
    ];
    const [ox, oy, oz] = origins[burstIdx % origins.length];
    const burstSize = 16;
    const startIdx = (volleyCursor * burstSize) % FIREWORK_PARTICLE_COUNT;
    volleyCursor++;

    for (let j = 0; j < burstSize; j++) {
      const p = fwParticles[(startIdx + j) % FIREWORK_PARTICLE_COUNT];
      const theta = (j / burstSize) * Math.PI * 2 + burstIdx * 0.4;
      const phi = ((j % 4) / 4) * Math.PI * 0.72 + 0.15;
      const spd = 3.2 + (j % 3) * 1.1;
      p.x = ox;
      p.y = oy;
      p.z = oz;
      p.vx = Math.cos(theta) * Math.sin(phi) * spd;
      p.vy = Math.cos(phi) * spd + 1.4;
      p.vz = Math.sin(theta) * Math.sin(phi) * spd;
      p.maxLife = 1.65 + (j % 3) * 0.25;
      p.life = p.maxLife;
    }
  };

  // ==========================================================================
  // 4. Custom Street Props & Decor Packs (4 Toggleable Instanced/Grouped Packs)
  // ==========================================================================
  const decorRoot = new THREE.Group();
  decorRoot.name = 'town:decor_packs';
  group.add(decorRoot);

  // 4a. Lantern Boulevards (12 wrought-iron streetlamps)
  const lampGroup = new THREE.Group();
  lampGroup.visible = false;
  const lampPostGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.085, 2.35, 7));
  const lampPostMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.34, metalness: 0.82 }),
  );
  const lampGlobeGeo = trackGeo(new THREE.OctahedronGeometry(0.2, 0));
  const lampGlobeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.24,
      metalness: 0.15,
    }),
  );
  const lampCoords: Array<[number, number]> = [
    [-2.4, -4.4],
    [2.4, -4.4],
    [-2.4, -7.2],
    [2.4, -7.2],
    [-2.4, 4.4],
    [2.4, 4.4],
    [-4.6, -2.4],
    [-4.6, 2.4],
    [4.6, -2.4],
    [4.6, 2.4],
    [-7.6, -2.4],
    [7.6, -2.4],
  ];
  const lampPosts = new THREE.InstancedMesh(lampPostGeo, lampPostMat, lampCoords.length);
  const lampGlobes = new THREE.InstancedMesh(lampGlobeGeo, lampGlobeMat, lampCoords.length);
  lampCoords.forEach(([x, z], idx) => {
    _dummy.position.set(x, 1.175, z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    lampPosts.setMatrixAt(idx, _dummy.matrix);

    _dummy.position.set(x, 2.48, z);
    _dummy.updateMatrix();
    lampGlobes.setMatrixAt(idx, _dummy.matrix);
  });
  lampPosts.instanceMatrix.needsUpdate = true;
  lampGlobes.instanceMatrix.needsUpdate = true;
  lampPosts.computeBoundingSphere();
  lampGlobes.computeBoundingSphere();
  lampGroup.add(lampPosts, lampGlobes);
  decorRoot.add(lampGroup);

  // 4b. Flower Gardens (24 instanced planters + vibrant blossom clusters)
  const flowerGroup = new THREE.Group();
  flowerGroup.visible = false;
  const planterGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.26, 0.76));
  const planterMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.82, metalness: 0.04 }),
  );
  const bloomGeo = trackGeo(new THREE.DodecahedronGeometry(0.28, 0));
  const bloomMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.02 }),
  );
  const flowerCoords: Array<[number, number]> = [];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + 0.18;
    const rad = i % 2 === 0 ? 4.35 : 5.15;
    flowerCoords.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
  }
  const extraFlowers: Array<[number, number]> = [
    [-3.6, -8.8],
    [3.6, -8.8],
    [-3.6, 8.2],
    [3.6, 8.2],
    [-8.6, 3.2],
    [8.6, 3.2],
    [-8.6, -3.2],
    [8.6, -3.2],
  ];
  flowerCoords.push(...extraFlowers);

  const planterInst = new THREE.InstancedMesh(planterGeo, planterMat, flowerCoords.length);
  const bloomInst = new THREE.InstancedMesh(bloomGeo, bloomMat, flowerCoords.length);
  const bloomPalette = [0xf43f5e, 0xfbbf24, 0xa855f7, 0x38bdf8, 0xfb7185, 0x34d399];
  flowerCoords.forEach(([x, z], idx) => {
    _dummy.position.set(x, 0.13, z);
    _dummy.rotation.set(0, idx * 0.4, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    planterInst.setMatrixAt(idx, _dummy.matrix);

    _dummy.position.set(x, 0.42, z);
    _dummy.scale.set(1.15, 0.78, 1.15);
    _dummy.updateMatrix();
    bloomInst.setMatrixAt(idx, _dummy.matrix);
    _color.setHex(bloomPalette[idx % bloomPalette.length]);
    bloomInst.setColorAt(idx, _color);
  });
  planterInst.instanceMatrix.needsUpdate = true;
  bloomInst.instanceMatrix.needsUpdate = true;
  if (bloomInst.instanceColor) bloomInst.instanceColor.needsUpdate = true;
  planterInst.computeBoundingSphere();
  bloomInst.computeBoundingSphere();
  flowerGroup.add(planterInst, bloomInst);
  decorRoot.add(flowerGroup);

  // 4c. Market Bunting Banners (instanced colorful triangular flags along overhead cords)
  const buntingGroup = new THREE.Group();
  buntingGroup.visible = false;
  const flagGeo = trackGeo(new THREE.ConeGeometry(0.18, 0.34, 3));
  flagGeo.rotateX(Math.PI);
  const flagMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.04 }),
  );
  const buntingSpans: Array<[[number, number, number], [number, number, number]]> = [
    [
      [-7.2, 3.3, -1.8],
      [-2.6, 3.3, -4.6],
    ],
    [
      [7.2, 3.3, -1.8],
      [2.6, 3.3, -4.6],
    ],
    [
      [-7.2, 3.3, 1.4],
      [-2.6, 3.3, 4.6],
    ],
    [
      [7.2, 3.3, 1.4],
      [2.6, 3.3, 4.6],
    ],
  ];
  const flagsPerSpan = 9;
  const flagInst = new THREE.InstancedMesh(flagGeo, flagMat, buntingSpans.length * flagsPerSpan);
  const flagColors = [0xf59e0b, 0xef4444, 0x0ea5e9, 0x10b981, 0xa855f7];
  let flagIdx = 0;
  for (const [p0, p1] of buntingSpans) {
    const yaw = Math.atan2(p1[2] - p0[2], p1[0] - p0[0]);
    for (let k = 0; k < flagsPerSpan; k++) {
      const t = (k + 0.5) / flagsPerSpan;
      const sag = Math.sin(t * Math.PI) * 0.55;
      _dummy.position.set(
        p0[0] + (p1[0] - p0[0]) * t,
        p0[1] - sag,
        p0[2] + (p1[2] - p0[2]) * t,
      );
      _dummy.rotation.set(0, -yaw, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      flagInst.setMatrixAt(flagIdx, _dummy.matrix);
      _color.setHex(flagColors[flagIdx % flagColors.length]);
      flagInst.setColorAt(flagIdx, _color);
      flagIdx++;
    }
  }
  flagInst.instanceMatrix.needsUpdate = true;
  if (flagInst.instanceColor) flagInst.instanceColor.needsUpdate = true;
  flagInst.computeBoundingSphere();
  buntingGroup.add(flagInst);
  decorRoot.add(buntingGroup);

  // 4d. Fountain Statues (4 bronze-on-limestone civic corner monuments)
  const statueGroup = new THREE.Group();
  statueGroup.visible = false;
  const plinthGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.9, 0.92));
  const plinthMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.76, metalness: 0.08 }),
  );
  const bronzeGeo = trackGeo(new THREE.OctahedronGeometry(0.42, 1));
  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.82 }),
  );
  const statueCorners: Array<[number, number]> = [
    [-4.8, -4.8],
    [4.8, -4.8],
    [-4.8, 4.8],
    [4.8, 4.8],
  ];
  const plinthInst = new THREE.InstancedMesh(plinthGeo, plinthMat, statueCorners.length);
  const bronzeInst = new THREE.InstancedMesh(bronzeGeo, bronzeMat, statueCorners.length);
  statueCorners.forEach(([x, z], idx) => {
    _dummy.position.set(x, 0.45, z);
    _dummy.rotation.set(0, Math.PI / 4, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    plinthInst.setMatrixAt(idx, _dummy.matrix);

    _dummy.position.set(x, 1.38, z);
    _dummy.scale.set(0.85, 1.35, 0.85);
    _dummy.updateMatrix();
    bronzeInst.setMatrixAt(idx, _dummy.matrix);
  });
  plinthInst.instanceMatrix.needsUpdate = true;
  bronzeInst.instanceMatrix.needsUpdate = true;
  plinthInst.computeBoundingSphere();
  bronzeInst.computeBoundingSphere();
  statueGroup.add(plinthInst, bronzeInst);
  decorRoot.add(statueGroup);

  const setDecorPacks = (packs: DecorPackId[]) => {
    const set = new Set(packs);
    lampGroup.visible = set.has('lantern_boulevard');
    flowerGroup.visible = set.has('flower_gardens');
    buntingGroup.visible = set.has('market_bunting');
    statueGroup.visible = set.has('fountain_statues');
  };

  const triggerCelebration = () => {
    celebrationTimer = 14.0;
    nextVolleyTimer = 0.05;
    celebrationGroup.visible = true;
  };

  const update = (
    delta: number,
    elapsed: number,
    timeOfDay: TimeOfDay,
    weather: WeatherMode,
    villagerPositions: Array<{ x: number; z: number }>,
  ) => {
    // 1. Friendly Town Dog Patrol & Villager Greeting
    const dx = dogTargetX - dogRoot.position.x;
    const dz = dogTargetZ - dogRoot.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.35) {
      dogWaitTimer -= delta;
      tailPivot.rotation.y = Math.sin(elapsed * 14) * 0.52;
      dogBodyGroup.position.y = Math.sin(elapsed * 4) * 0.012;
      for (let i = 0; i < dogLegs.length; i++) {
        dogLegs[i].rotation.x = THREE.MathUtils.lerp(dogLegs[i].rotation.x, 0, Math.min(1, delta * 8));
      }
      if (dogWaitTimer <= 0) {
        dogWaitTimer = 2.2 + ((elapsed * 1.7) % 3.4);
        if (villagerPositions.length > 0 && Math.floor(elapsed) % 2 === 0) {
          const pick = villagerPositions[Math.floor(elapsed * 3) % villagerPositions.length];
          const clampedX = THREE.MathUtils.clamp(pick.x + 1.1, -13, 13);
          const clampedZ = THREE.MathUtils.clamp(pick.z + 1.1, -12, 12);
          dogTargetX = clampedX;
          dogTargetZ = clampedZ;
        } else {
          const ang = (elapsed * 1.37) % (Math.PI * 2);
          const r = 2.6 + (Math.sin(elapsed * 0.7) * 0.5 + 0.5) * 4.5;
          dogTargetX = Math.cos(ang) * r;
          dogTargetZ = Math.sin(ang) * r;
        }
      }
    } else {
      const speed = weather === 'rain' ? 2.8 : 2.35;
      const step = Math.min(dist, speed * delta);
      dogRoot.position.x += (dx / dist) * step;
      dogRoot.position.z += (dz / dist) * step;
      dogYaw = Math.atan2(dx, dz);
      _targetQuat.setFromAxisAngle(_yAxis, dogYaw);
      dogRoot.quaternion.slerp(_targetQuat, 1 - Math.exp(-9 * delta));

      dogWalkPhase += delta * 14;
      const trot = Math.sin(dogWalkPhase) * 0.55;
      dogLegs[0].rotation.x = trot;
      dogLegs[1].rotation.x = -trot;
      dogLegs[2].rotation.x = -trot;
      dogLegs[3].rotation.x = trot;
      dogBodyGroup.position.y = Math.abs(Math.sin(dogWalkPhase)) * 0.045;
      tailPivot.rotation.y = Math.sin(elapsed * 10) * 0.35;
    }

    // 2. Songbirds (Dawn / Day in non-storm weather)
    const showBirds = (timeOfDay === 'dawn' || timeOfDay === 'day') && weather !== 'rain';
    birdMesh.visible = showBirds;
    if (showBirds) {
      for (let i = 0; i < BIRD_COUNT; i++) {
        const bp = birdParams[i];
        const a = elapsed * bp.speed + bp.phase;
        const x = bp.centerX + Math.cos(a) * bp.radius;
        const z = bp.centerZ + Math.sin(a) * bp.radius;
        const y = bp.height + Math.sin(elapsed * 1.8 + i) * 0.55;
        const heading = Math.atan2(-Math.sin(a), Math.cos(a));
        const flap = 0.85 + Math.sin(elapsed * 11 + i * 1.7) * 0.35;
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, heading, Math.sin(elapsed * 3 + i) * 0.14);
        _dummy.scale.set(1.6 * flap, 0.45, 1.0);
        _dummy.updateMatrix();
        birdMesh.setMatrixAt(i, _dummy.matrix);
      }
      birdMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Butterflies (Sunny Day / Dawn)
    const showButterflies =
      (timeOfDay === 'day' || timeOfDay === 'dawn') && weather === 'summer';
    butterflyMesh.visible = showButterflies;
    if (showButterflies) {
      for (let i = 0; i < BUTTERFLY_COUNT; i++) {
        const bf = butterflyParams[i];
        const t = elapsed * bf.speed + bf.phase;
        const x = bf.cx + Math.sin(t) * 1.8;
        const z = bf.cz + Math.cos(t * 0.8) * 1.8;
        const y = 0.95 + Math.sin(t * 2.2) * 0.35;
        const wingScale = 0.35 + Math.abs(Math.sin(elapsed * 16 + i)) * 0.85;
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0.3, t, 0);
        _dummy.scale.set(wingScale, 1, 1);
        _dummy.updateMatrix();
        butterflyMesh.setMatrixAt(i, _dummy.matrix);
      }
      butterflyMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Streetlamp Night Glow
    if (lampGroup.visible) {
      lampGlobeMat.emissiveIntensity =
        timeOfDay === 'night' ? 1.85 : timeOfDay === 'twilight' ? 1.25 : 0.35;
    }

    // 5. Triggerable 3D Celebration (Sky Lanterns & Firework Bursts)
    if (celebrationTimer > 0) {
      celebrationTimer = Math.max(0, celebrationTimer - delta);
      const progress = 14.0 - celebrationTimer;

      // Update rising sky lanterns
      const fadeAlpha = celebrationTimer < 2.0 ? celebrationTimer / 2.0 : 1.0;
      lanternMat.opacity = 0.92 * fadeAlpha;
      for (let i = 0; i < LANTERN_COUNT; i++) {
        const s = lanternSeeds[i];
        const lt = Math.max(0, progress - s.delay);
        const y = 0.8 + ((lt * s.speed) % 14.5);
        const x = s.x + Math.sin(elapsed * 1.2 + s.sway) * 0.65;
        const z = s.z + Math.cos(elapsed * 1.0 + s.sway) * 0.65;
        const sc = lt > 0 ? Math.min(1, lt * 1.5) * (0.9 + Math.sin(elapsed * 4 + i) * 0.08) : 0.001;
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, elapsed * 0.6 + i, Math.sin(elapsed * 1.5 + i) * 0.08);
        _dummy.scale.setScalar(sc);
        _dummy.updateMatrix();
        lanternMesh.setMatrixAt(i, _dummy.matrix);
      }
      lanternMesh.instanceMatrix.needsUpdate = true;

      // Spawn staggered firework volleys
      nextVolleyTimer -= delta;
      if (nextVolleyTimer <= 0 && celebrationTimer > 1.8) {
        spawnFireworkBurst(volleyCursor);
        nextVolleyTimer = 1.45;
      }

      // Advance firework spark particles
      for (let i = 0; i < FIREWORK_PARTICLE_COUNT; i++) {
        const p = fwParticles[i];
        if (p.life > 0) {
          p.life -= delta;
          p.x += p.vx * delta;
          p.y += p.vy * delta;
          p.z += p.vz * delta;
          p.vy -= 4.2 * delta;
          const ratio = Math.max(0, p.life / p.maxLife);
          _dummy.position.set(p.x, p.y, p.z);
          _dummy.rotation.set(elapsed * 3 + i, elapsed * 2, 0);
          _dummy.scale.setScalar(ratio * 1.25);
        } else {
          _dummy.position.set(0, -50, 0);
          _dummy.scale.setScalar(0.001);
        }
        _dummy.updateMatrix();
        fwMesh.setMatrixAt(i, _dummy.matrix);
      }
      fwMesh.instanceMatrix.needsUpdate = true;

      if (celebrationTimer <= 0) {
        celebrationGroup.visible = false;
      }
    }
  };

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  return {
    group,
    setDecorPacks,
    triggerCelebration,
    update,
    dispose,
  };
}
