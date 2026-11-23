import * as THREE from 'three';
import type { GraphicsQuality, RaiderTactic } from '../types/town.ts';

/** Outer West/South-West frontier clearing for the stylized low-poly Raider Camp */
export const RAIDER_CAMP_POS = new THREE.Vector3(-21.5, 0, 14.5);

export interface DefenseTowerAnchor {
  x: number;
  y: number;
  z: number;
  power: number;
}

export interface RaiderUpdateParams {
  delta: number;
  elapsed: number;
  active: boolean;
  tactic: RaiderTactic;
  campHpRatio: number;
  villagerCoords: Array<{ id: string; x: number; z: number; injured: boolean }>;
  defenseTowers: DefenseTowerAnchor[];
  vanceDefending: boolean;
  onRaiderImpact: (x: number, z: number) => void;
  onDefenseHitCamp: (damage: number) => void;
}

export interface TownRaidersHandle {
  group: THREE.Group;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  update: (params: RaiderUpdateParams) => void;
  triggerCampVictoryBurst: () => void;
  dispose: () => void;
}

interface ActiveProjectile {
  alive: boolean;
  isCounterFire: boolean;
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
  isBlue: boolean;
}

interface MiniRaiderRig {
  root: THREE.Group;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  baseX: number;
  baseZ: number;
  phase: number;
}

const MAX_PROJECTILES = 16;
const MAX_SPARKS = 64;

// Pre-allocated scratch transforms (zero GC inside render loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _raiderBallColor = new THREE.Color(0xf97316);
const _defenseBallColor = new THREE.Color(0x38bdf8);
const _warmSparkColor = new THREE.Color(0xfbbf24);
const _coolSparkColor = new THREE.Color(0x7dd3fc);
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Builds the stylized, non-graphic Low-Poly Raider Camp, Cartoon Brass/Iron Cannon,
 * 3 animated raiders, and pooled InstancedMesh parabolic cannonball & spark VFX.
 * Strictly optimized for 4 GB RAM Android phones (shared geometries + InstancedMesh).
 */
export function buildTownRaidersSystem(shadowTex: THREE.Texture): TownRaidersHandle {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'raider_defense_system';

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

  // ── 1. Raider Camp Group (shown only while raids are active) ──
  const campGroup = new THREE.Group();
  campGroup.position.copy(RAIDER_CAMP_POS);
  // Face toward Alderbrook Square (0, 0, 0)
  campGroup.rotation.y = Math.atan2(-RAIDER_CAMP_POS.x, -RAIDER_CAMP_POS.z);
  campGroup.visible = false;
  rootGroup.add(campGroup);

  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  const campShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(8.2, 8.2)), shadowMat);
  campShadow.rotation.x = -Math.PI / 2;
  campShadow.position.y = 0.02;
  campGroup.add(campShadow);

  const dirtMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x785a3a, roughness: 0.96 }));
  const tentRedMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.72 }));
  const tentDarkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.76 }));
  const woodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x6b3a19, roughness: 0.84 }));
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.34, metalness: 0.74 }),
  );
  const brassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.84 }),
  );
  const fireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf97316,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    }),
  );

  // Cleared dirt encampment pad
  const pad = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.5, 3.8, 0.08, 10)), dirtMat);
  pad.position.y = 0.04;
  pad.receiveShadow = true;
  campGroup.add(pad);

  // 2 Stylized Raider Tents (shared cone geometry)
  const tentGeo = trackGeo(new THREE.ConeGeometry(1.32, 1.85, 5));
  const mainTent = new THREE.Mesh(tentGeo, tentRedMat);
  mainTent.position.set(-1.35, 0.95, -1.15);
  mainTent.castShadow = true;
  campGroup.add(mainTent);

  const sideTent = new THREE.Mesh(tentGeo, tentDarkMat);
  sideTent.position.set(1.55, 0.78, -1.35);
  sideTent.scale.set(0.82, 0.82, 0.82);
  sideTent.castShadow = true;
  campGroup.add(sideTent);

  // Supply crates + perimeter wooden stakes (shared geometries)
  const crateGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.5, 0.54));
  for (const [cx, cz] of [
    [-2.1, 0.55],
    [-1.55, 0.75],
    [2.05, 0.35],
  ] as Array<[number, number]>) {
    const crate = new THREE.Mesh(crateGeo, woodMat);
    crate.position.set(cx, 0.28, cz);
    crate.castShadow = true;
    campGroup.add(crate);
  }

  const stakeGeo = trackGeo(new THREE.ConeGeometry(0.12, 1.15, 5));
  for (let i = 0; i < 6; i++) {
    const a = -0.95 + (i / 5) * 1.9;
    const stake = new THREE.Mesh(stakeGeo, woodMat);
    stake.position.set(Math.sin(a) * 3.1, 0.55, Math.cos(a) * 2.4 + 0.3);
    stake.rotation.x = 0.26;
    stake.castShadow = true;
    campGroup.add(stake);
  }

  // Campfire + waving raider pennant banner
  const campfire = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.28, 0)), fireMat);
  campfire.position.set(0.95, 0.32, 0.2);
  campGroup.add(campfire);

  const flagPole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6)), woodMat);
  flagPole.position.set(-2.35, 1.6, -0.5);
  campGroup.add(flagPole);

  const pennant = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.44, 0.05)), tentRedMat);
  pennant.position.set(-1.86, 2.88, -0.5);
  campGroup.add(pennant);

  // Cartoon Brass & Iron Cannon on spoked wheels (with recoil animation)
  const cannonGroup = new THREE.Group();
  cannonGroup.position.set(0, 0.08, 1.35);
  campGroup.add(cannonGroup);

  const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10));
  const leftWheel = new THREE.Mesh(wheelGeo, woodMat);
  leftWheel.rotation.z = Math.PI / 2;
  leftWheel.position.set(-0.46, 0.42, 0);
  const rightWheel = new THREE.Mesh(wheelGeo, woodMat);
  rightWheel.rotation.z = Math.PI / 2;
  rightWheel.position.set(0.46, 0.42, 0);
  const carriage = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.76, 0.3, 1.15)), woodMat);
  carriage.position.set(0, 0.46, -0.08);
  cannonGroup.add(leftWheel, rightWheel, carriage);

  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.72, 0.05);
  cannonGroup.add(barrelPivot);

  const barrelMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.27, 1.48, 10)),
    ironMat,
  );
  barrelMesh.rotation.x = Math.PI / 2 - 0.34;
  barrelMesh.position.set(0, 0.16, 0.32);
  barrelMesh.castShadow = true;
  const muzzleRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.21, 0.055, 6, 10)), brassMat);
  muzzleRing.position.set(0, 0.41, 1.0);
  const breechKnob = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.22, 8, 6)), brassMat);
  breechKnob.position.set(0, -0.04, -0.35);
  barrelPivot.add(barrelMesh, muzzleRing, breechKnob);

  // 3 Stylized Low-Poly Raiders (shared body/head/limb geometries)
  const rBodyGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.58, 0.28));
  const rHeadGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.36, 0.36));
  const rArmGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.44, 0.14));
  const rHatGeo = trackGeo(new THREE.CylinderGeometry(0.26, 0.22, 0.18, 6));
  const rSkinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfde2c8, roughness: 0.65 }));
  const rCoatMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 }));

  const raiders: MiniRaiderRig[] = [];
  const raiderSpots: Array<[number, number, boolean]> = [
    [-0.92, 0.85, true], // Captain Ironjaw
    [0.95, 1.02, false], // Cannon Loader
    [0.25, -0.35, false], // Lookout Scout
  ];

  raiderSpots.forEach(([rx, rz, isCaptain], idx) => {
    const rRoot = new THREE.Group();
    rRoot.position.set(rx, 0.08, rz);

    const torso = new THREE.Mesh(rBodyGeo, isCaptain ? tentRedMat : rCoatMat);
    torso.position.y = 0.62;
    torso.castShadow = true;
    const head = new THREE.Mesh(rHeadGeo, rSkinMat);
    head.position.y = 1.12;
    const hat = new THREE.Mesh(rHatGeo, isCaptain ? tentDarkMat : tentRedMat);
    hat.position.y = 1.38;
    const leftArm = new THREE.Mesh(rArmGeo, rCoatMat);
    leftArm.position.set(-0.32, 0.68, 0);
    const rightArm = new THREE.Mesh(rArmGeo, rCoatMat);
    rightArm.position.set(0.32, 0.68, 0);

    rRoot.add(torso, head, hat, leftArm, rightArm);
    campGroup.add(rRoot);
    raiders.push({
      root: rRoot,
      leftArm,
      rightArm,
      baseX: rx,
      baseZ: rz,
      phase: idx * 2.1,
    });
  });

  // Floating 3D Camp Integrity Bar
  const hpBgMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  const hpFillMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  const hpBarBg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.24, 0.08)), hpBgMat);
  hpBarBg.position.set(0, 3.55, 0);
  const hpBarFill = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.44, 0.14, 0.1)), hpFillMat);
  hpBarFill.position.set(0, 3.55, 0.02);
  campGroup.add(hpBarBg, hpBarFill);

  // ── 2. Pooled InstancedMesh Cannonballs & Cartoon Sparks ──
  const ballGeo = trackGeo(new THREE.IcosahedronGeometry(0.24, 1));
  const ballMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf97316,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.3,
    }),
  );
  const cannonballInstanced = new THREE.InstancedMesh(ballGeo, ballMat, MAX_PROJECTILES);
  cannonballInstanced.frustumCulled = false;
  cannonballInstanced.castShadow = false;
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    cannonballInstanced.setMatrixAt(i, _zeroMatrix);
    cannonballInstanced.setColorAt(i, _raiderBallColor);
  }
  cannonballInstanced.instanceMatrix.needsUpdate = true;
  if (cannonballInstanced.instanceColor) cannonballInstanced.instanceColor.needsUpdate = true;
  rootGroup.add(cannonballInstanced);

  const sparkGeo = trackGeo(new THREE.OctahedronGeometry(0.11, 0));
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

  // ── 3. Internal Pools & Timers ──
  const projectiles: ActiveProjectile[] = Array.from({ length: MAX_PROJECTILES }, () => ({
    alive: false,
    isCounterFire: false,
    startX: 0,
    startY: 0,
    startZ: 0,
    endX: 0,
    endY: 0,
    endZ: 0,
    arcHeight: 6,
    t: 0,
    duration: 1.8,
    damage: 0,
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
    maxLife: 0.7,
    scale: 1,
    isBlue: false,
  }));

  let graphicsQuality: GraphicsQuality = 'medium';
  let raiderFireCooldown = 2.1;
  let defenseFireCooldown = 1.6;
  let cannonRecoil = 0;
  let wasActive = false;

  const spawnSparks = (x: number, y: number, z: number, count: number, isBlue: boolean) => {
    const cap = graphicsQuality === 'low' ? Math.min(count, 4) : count;
    let spawned = 0;
    for (let i = 0; i < MAX_SPARKS && spawned < cap; i++) {
      const s = sparks[i];
      if (s.alive) continue;
      const angle = (spawned / Math.max(1, cap)) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 1.8 + Math.random() * 3.1;
      s.alive = true;
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.cos(angle) * spd;
      s.vy = 2.6 + Math.random() * 3.4;
      s.vz = Math.sin(angle) * spd;
      s.maxLife = 0.45 + Math.random() * 0.4;
      s.life = s.maxLife;
      s.scale = 0.75 + Math.random() * 0.65;
      s.isBlue = isBlue;
      spawned++;
    }
  };

  const spawnProjectile = (
    isCounterFire: boolean,
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
      p.isCounterFire = isCounterFire;
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
      spawnSparks(sx, sy, sz, 6, isCounterFire);
      return;
    }
  };

  const triggerCampVictoryBurst = () => {
    spawnSparks(RAIDER_CAMP_POS.x, 1.4, RAIDER_CAMP_POS.z, 18, true);
    spawnSparks(RAIDER_CAMP_POS.x, 1.8, RAIDER_CAMP_POS.z, 14, false);
  };

  const update = (params: RaiderUpdateParams) => {
    const {
      delta,
      elapsed,
      active,
      tactic,
      campHpRatio,
      villagerCoords,
      defenseTowers,
      vanceDefending,
      onRaiderImpact,
      onDefenseHitCamp,
    } = params;

    if (active !== wasActive) {
      wasActive = active;
      campGroup.visible = active;
      if (active) {
        raiderFireCooldown = 1.6;
        defenseFireCooldown = 1.4;
        spawnSparks(RAIDER_CAMP_POS.x, 1.2, RAIDER_CAMP_POS.z, 12, false);
      }
    }

    // Animate camp props & raiders while active
    if (active) {
      const clampedHp = Math.max(0.04, Math.min(1, campHpRatio));
      hpBarFill.scale.x = clampedHp;
      hpBarFill.position.x = -1.22 * (1 - clampedHp);

      campfire.scale.setScalar(0.88 + Math.sin(elapsed * 12) * 0.16);
      pennant.rotation.y = Math.sin(elapsed * 4.8) * 0.22;

      if (cannonRecoil > 0) {
        cannonRecoil = Math.max(0, cannonRecoil - delta * 2.8);
      }
      barrelPivot.position.z = 0.05 - cannonRecoil * 0.36;

      for (let i = 0; i < raiders.length; i++) {
        const r = raiders[i];
        const bob = Math.sin(elapsed * 4.5 + r.phase);
        r.root.position.y = 0.08 + Math.abs(bob) * 0.07;
        r.root.position.x = r.baseX + Math.sin(elapsed * 1.4 + r.phase) * 0.22;
        r.leftArm.rotation.x = bob * 0.55;
        r.rightArm.rotation.x = -bob * 0.55 - (i === 0 ? 0.45 : 0);
      }

      // 1) Raider Cannon Firing Schedule
      raiderFireCooldown -= delta;
      if (raiderFireCooldown <= 0) {
        const fireRate =
          tactic === 'siege_plaza'
            ? 3.1
            : tactic === 'target_workers'
              ? 3.5
              : tactic === 'regroup'
                ? 5.2
                : 4.1;
        raiderFireCooldown = fireRate;
        cannonRecoil = 1.0;

        // Pick stylized target coordinate based on Commander AI tactic
        let tx = -7.5 + (Math.random() - 0.5) * 8;
        let tz = 4.5 + (Math.random() - 0.5) * 8;
        const healthyTargets = villagerCoords.filter((v) => !v.injured);
        if (tactic === 'target_workers' && healthyTargets.length > 0) {
          const picked = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
          tx = picked.x + (Math.random() - 0.5) * 1.8;
          tz = picked.z + (Math.random() - 0.5) * 1.8;
        } else if (tactic === 'siege_plaza') {
          tx = (Math.random() - 0.5) * 6.5;
          tz = (Math.random() - 0.5) * 6.5;
        } else if (healthyTargets.length > 0 && Math.random() < 0.58) {
          const picked = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
          tx = picked.x + (Math.random() - 0.5) * 3.2;
          tz = picked.z + (Math.random() - 0.5) * 3.2;
        }

        const muzzleX = RAIDER_CAMP_POS.x + Math.sin(campGroup.rotation.y) * 2.1;
        const muzzleZ = RAIDER_CAMP_POS.z + Math.cos(campGroup.rotation.y) * 2.1;
        spawnProjectile(false, muzzleX, 1.35, muzzleZ, tx, 0.25, tz, 7.2, 1.85, 0);
      }

      // 2) Town Watchtowers, Defense Wall Turrets & Commander Vance Counter-Fire
      const hasDefenses = defenseTowers.length > 0 || vanceDefending;
      if (hasDefenses) {
        defenseFireCooldown -= delta;
        if (defenseFireCooldown <= 0) {
          const shotInterval = Math.max(
            1.45,
            3.3 - defenseTowers.length * 0.48 - (vanceDefending ? 0.35 : 0),
          );
          defenseFireCooldown = shotInterval;

          if (defenseTowers.length > 0) {
            const tower = defenseTowers[Math.floor(Math.random() * defenseTowers.length)];
            spawnProjectile(
              true,
              tower.x,
              tower.y,
              tower.z,
              RAIDER_CAMP_POS.x + (Math.random() - 0.5) * 2.2,
              0.7,
              RAIDER_CAMP_POS.z + (Math.random() - 0.5) * 2.2,
              6.6,
              1.45,
              tower.power,
            );
          } else {
            // Commander Vance's Town Hall Perimeter Signal Flare / Counter-Volley
            spawnProjectile(
              true,
              -6.5,
              1.5,
              1.5,
              RAIDER_CAMP_POS.x + (Math.random() - 0.5) * 1.8,
              0.7,
              RAIDER_CAMP_POS.z + (Math.random() - 0.5) * 1.8,
              6.2,
              1.55,
              9,
            );
          }
        }
      }
    }

    // 3) Advance & Render Instanced Projectiles
    let anyProjDirty = false;
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const p = projectiles[i];
      if (!p.alive) continue;
      anyProjDirty = true;
      p.t += delta / p.duration;
      if (p.t >= 1) {
        p.alive = false;
        cannonballInstanced.setMatrixAt(i, _zeroMatrix);
        spawnSparks(p.endX, Math.max(0.4, p.endY), p.endZ, 10, p.isCounterFire);
        if (active) {
          if (p.isCounterFire) {
            onDefenseHitCamp(p.damage);
          } else {
            onRaiderImpact(p.endX, p.endZ);
          }
        }
      } else {
        const u = p.t;
        const x = p.startX + (p.endX - p.startX) * u;
        const z = p.startZ + (p.endZ - p.startZ) * u;
        const baseY = p.startY + (p.endY - p.startY) * u;
        const y = baseY + 4 * p.arcHeight * u * (1 - u);

        _dummy.position.set(x, y, z);
        _dummy.rotation.set(elapsed * 6 + i, elapsed * 5, 0);
        const pulseScale = p.isCounterFire ? 0.92 : 1.08;
        _dummy.scale.setScalar(pulseScale);
        _dummy.updateMatrix();
        cannonballInstanced.setMatrixAt(i, _dummy.matrix);
        cannonballInstanced.setColorAt(i, p.isCounterFire ? _defenseBallColor : _raiderBallColor);
      }
    }
    if (anyProjDirty) {
      cannonballInstanced.instanceMatrix.needsUpdate = true;
      if (cannonballInstanced.instanceColor) cannonballInstanced.instanceColor.needsUpdate = true;
    }

    // 4) Advance & Render Instanced Cartoon Sparks
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
        s.vy -= 9.5 * delta;
        s.x += s.vx * delta;
        s.y = Math.max(0.08, s.y + s.vy * delta);
        s.z += s.vz * delta;
        const ratio = s.life / s.maxLife;
        _dummy.position.set(s.x, s.y, s.z);
        _dummy.rotation.set(elapsed * 8 + i, elapsed * 6, 0);
        _dummy.scale.setScalar(s.scale * ratio);
        _dummy.updateMatrix();
        sparkInstanced.setMatrixAt(i, _dummy.matrix);
        _color.copy(s.isBlue ? _coolSparkColor : _warmSparkColor);
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
  };

  return {
    group: rootGroup,
    setGraphicsQuality: (q) => {
      graphicsQuality = q;
    },
    update,
    triggerCampVictoryBurst,
    dispose,
  };
}
