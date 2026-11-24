import * as THREE from 'three';
import {
  MAX_DUMMY_CITIZENS,
  PLOT_META,
  type GraphicsQuality,
  type TownStructure,
} from '../types/town.ts';

/**
 * 100+ Instanced Zero-AI "Dummy Crowd Citizens"
 * ---------------------------------------------
 * - Strictly 5 shared THREE.InstancedMesh draw calls total (torso, head, left leg, right leg, hat)
 *   for up to 140 ambient citizens walking along roads, sidewalks, plaza, and apartment entrances.
 * - Zero LLM/API calls, zero DOM nameplates, zero per-frame allocations (4 GB RAM Android safe).
 * - Scales rendered density automatically across Low / Medium / High graphics quality.
 */

export interface TownCrowdHandle {
  group: THREE.Group;
  setTargetPopulation: (count: number) => void;
  setApartmentAnchors: (structures: TownStructure[]) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setVisible: (visible: boolean) => void;
  getRenderedCount: () => number;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

interface CrowdCitizenState {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  yaw: number;
  speed: number;
  stridePhase: number;
  pauseTimer: number;
  scaleY: number;
  routeKind: 'plaza' | 'road_ns' | 'road_ew' | 'sidewalk' | 'apartment';
  apartmentIdx: number;
  dirSign: 1 | -1;
}

// Pre-allocated scratch math objects (zero GC inside requestAnimationFrame)
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _color = new THREE.Color();

const SHIRT_PALETTE = [
  0x2563eb, 0xdc2626, 0x059669, 0xd97706, 0x7c3aed, 0x0891b2,
  0xdb2777, 0x4f46e5, 0xea580c, 0x0d9488, 0x65a30d, 0x334155,
  0x0284c7, 0xb45309, 0x9333ea, 0xbe123c,
];

const SKIN_PALETTE = [0xf5d0b5, 0xe8b996, 0xd39c73, 0xb87b52, 0x8d5534, 0xfde2cc];

const HAT_PALETTE = [
  0x1e293b, 0x78350f, 0x92400e, 0x334155, 0x0f766e, 0x7f1d1d, 0x3f3f46, 0x1e3a8a,
];

const LEG_PALETTE = [0x1e293b, 0x334155, 0x292524, 0x1e3a5f, 0x3f3f46];

function deterministicRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function buildTownCrowdSystem(scene: THREE.Scene): TownCrowdHandle {
  const group = new THREE.Group();
  group.name = 'dummy_crowd_citizens';

  // Shared ultra-low-poly geometries (only 5 draw calls for up to 140 citizens!)
  const torsoGeo = new THREE.BoxGeometry(0.28, 0.42, 0.18);
  const headGeo = new THREE.BoxGeometry(0.21, 0.21, 0.21);
  const legGeo = new THREE.BoxGeometry(0.1, 0.34, 0.11);
  const hatGeo = new THREE.CylinderGeometry(0.135, 0.145, 0.08, 6);

  // Shift leg geometry pivot to hip so X-rotation swings cleanly like a stride
  legGeo.translate(0, -0.17, 0);

  const torsoMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.05,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.02,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.04,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.08,
  });

  const torsoMesh = new THREE.InstancedMesh(torsoGeo, torsoMat, MAX_DUMMY_CITIZENS);
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, MAX_DUMMY_CITIZENS);
  const leftLegMesh = new THREE.InstancedMesh(legGeo, legMat, MAX_DUMMY_CITIZENS);
  const rightLegMesh = new THREE.InstancedMesh(legGeo, legMat, MAX_DUMMY_CITIZENS);
  const hatMesh = new THREE.InstancedMesh(hatGeo, hatMat, MAX_DUMMY_CITIZENS);

  const allMeshes = [torsoMesh, headMesh, leftLegMesh, rightLegMesh, hatMesh];
  for (const m of allMeshes) {
    m.frustumCulled = false;
    m.castShadow = false; // Zero shadow map overhead on 4 GB RAM Android phones
    m.receiveShadow = true;
    m.count = 0;
    group.add(m);
  }

  // Initialize citizen states & per-instance colors once
  const citizens: CrowdCitizenState[] = [];
  for (let i = 0; i < MAX_DUMMY_CITIZENS; i++) {
    const r1 = deterministicRand(i * 3 + 1);
    const r2 = deterministicRand(i * 3 + 2);
    const r3 = deterministicRand(i * 3 + 3);

    const routeRoll = i % 5;
    const routeKind: CrowdCitizenState['routeKind'] =
      routeRoll === 0
        ? 'plaza'
        : routeRoll === 1
          ? 'road_ns'
          : routeRoll === 2
            ? 'road_ew'
            : routeRoll === 3
              ? 'sidewalk'
              : 'apartment';

    let x = 0;
    let z = 0;
    if (routeKind === 'plaza') {
      const ang = r1 * Math.PI * 2;
      const rad = 2.4 + r2 * 2.2;
      x = Math.cos(ang) * rad;
      z = Math.sin(ang) * rad;
    } else if (routeKind === 'road_ns') {
      x = (r1 > 0.5 ? 1 : -1) * (0.75 + r2 * 0.45);
      z = (r3 - 0.5) * 16.5;
    } else if (routeKind === 'road_ew') {
      x = (r3 - 0.5) * 16.5;
      z = -0.5 + (r1 > 0.5 ? 1 : -1) * (0.75 + r2 * 0.45);
    } else {
      const ang = r1 * Math.PI * 2;
      const rad = 5.4 + r2 * 6.5;
      x = Math.cos(ang) * rad;
      z = Math.sin(ang) * rad;
    }

    citizens.push({
      x,
      z,
      targetX: x,
      targetZ: z,
      yaw: r1 * Math.PI * 2,
      speed: 0.95 + r2 * 0.72,
      stridePhase: r3 * Math.PI * 2,
      pauseTimer: r2 * 1.4,
      scaleY: 0.9 + r1 * 0.18,
      routeKind,
      apartmentIdx: i % 12,
      dirSign: i % 2 === 0 ? 1 : -1,
    });

    _color.setHex(SHIRT_PALETTE[i % SHIRT_PALETTE.length]);
    torsoMesh.setColorAt(i, _color);

    _color.setHex(SKIN_PALETTE[(i * 7) % SKIN_PALETTE.length]);
    headMesh.setColorAt(i, _color);

    _color.setHex(LEG_PALETTE[(i * 5) % LEG_PALETTE.length]);
    leftLegMesh.setColorAt(i, _color);
    rightLegMesh.setColorAt(i, _color);

    _color.setHex(HAT_PALETTE[(i * 3) % HAT_PALETTE.length]);
    hatMesh.setColorAt(i, _color);
  }

  for (const m of allMeshes) {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  let apartmentAnchors: Array<{ x: number; z: number; entranceX: number; entranceZ: number }> = [];
  let targetPopulation = 16;
  let graphicsQuality: GraphicsQuality = 'medium';
  let activeCount = 0;

  function computeEffectiveCount(): number {
    const cap =
      graphicsQuality === 'low'
        ? 48
        : graphicsQuality === 'medium'
          ? 96
          : MAX_DUMMY_CITIZENS;
    const scale =
      graphicsQuality === 'low' ? 0.5 : graphicsQuality === 'medium' ? 0.8 : 1.0;
    const desired = Math.round(targetPopulation * scale);
    return Math.max(0, Math.min(cap, Math.min(MAX_DUMMY_CITIZENS, Math.max(targetPopulation > 0 ? 8 : 0, desired))));
  }

  function applyCounts(): void {
    activeCount = computeEffectiveCount();
    for (const m of allMeshes) {
      m.count = activeCount;
    }
  }

  function pickNextWaypoint(c: CrowdCitizenState, idx: number, elapsed: number): void {
    const rA = deterministicRand(idx * 17.13 + elapsed * 1.7 + c.x);
    const rB = deterministicRand(idx * 29.71 + elapsed * 2.3 + c.z);

    // If apartments exist, steer apartment-route & a slice of sidewalk citizens between apartment doors & plaza
    if (
      apartmentAnchors.length > 0 &&
      (c.routeKind === 'apartment' || (c.routeKind === 'sidewalk' && rA < 0.55))
    ) {
      const goingHome = rB < 0.5;
      if (goingHome) {
        const anchor = apartmentAnchors[(c.apartmentIdx + Math.floor(rA * 7)) % apartmentAnchors.length];
        c.targetX = anchor.entranceX + (rA - 0.5) * 1.4;
        c.targetZ = anchor.entranceZ + (rB - 0.5) * 1.4;
      } else {
        // Stroll toward Town Square plaza ring
        const ang = rA * Math.PI * 2;
        const rad = 2.6 + rB * 2.2;
        c.targetX = Math.cos(ang) * rad;
        c.targetZ = Math.sin(ang) * rad;
      }
      return;
    }

    if (c.routeKind === 'plaza') {
      const ang = Math.atan2(c.z, c.x) + c.dirSign * (0.65 + rA * 0.9);
      const rad = 2.3 + rB * 2.3;
      c.targetX = Math.cos(ang) * rad;
      c.targetZ = Math.sin(ang) * rad;
      return;
    }

    if (c.routeKind === 'road_ns') {
      const side = c.x >= 0 ? 1 : -1;
      const nextZ = c.z > 0 ? -(4.5 + rA * 6.5) : 4.5 + rA * 6.5;
      c.targetX = side * (0.75 + rB * 0.45);
      c.targetZ = nextZ;
      return;
    }

    if (c.routeKind === 'road_ew') {
      const side = c.z >= -0.5 ? 1 : -1;
      const nextX = c.x > 0 ? -(4.5 + rA * 6.5) : 4.5 + rA * 6.5;
      c.targetX = nextX;
      c.targetZ = -0.5 + side * (0.75 + rB * 0.45);
      return;
    }

    // Sidewalk perimeter patrol around inner square
    const ang = Math.atan2(c.z, c.x) + c.dirSign * (0.5 + rA * 0.8);
    const rad = 5.2 + rB * 5.6;
    c.targetX = Math.cos(ang) * rad;
    c.targetZ = Math.sin(ang) * rad;
  }

  // Seed initial waypoints
  for (let i = 0; i < citizens.length; i++) {
    pickNextWaypoint(citizens[i], i, i * 0.37);
  }

  applyCounts();
  scene.add(group);

  let lastUpdateAccum = 0;

  return {
    group,

    setTargetPopulation(count: number) {
      targetPopulation = Math.max(0, Math.min(MAX_DUMMY_CITIZENS, Math.round(count)));
      applyCounts();
    },

    setApartmentAnchors(structures: TownStructure[]) {
      const next: Array<{ x: number; z: number; entranceX: number; entranceZ: number }> = [];
      for (const s of structures) {
        if (s.status !== 'complete') continue;
        const meta = PLOT_META[s.plotId];
        if (!meta) continue;
        const isResidential =
          s.structureType === 'apartment' || (s.blueprint?.apartmentCapacity ?? 0) >= 8;
        if (!isResidential && next.length >= 8) continue;
        // Front door faces center plaza (0, 0)
        const dist = Math.hypot(meta.x, meta.z) || 1;
        const ux = -meta.x / dist;
        const uz = -meta.z / dist;
        const entranceOffset = 2.05;
        next.push({
          x: meta.x,
          z: meta.z,
          entranceX: meta.x + ux * entranceOffset,
          entranceZ: meta.z + uz * entranceOffset,
        });
      }
      apartmentAnchors = next;
    },

    setGraphicsQuality(quality: GraphicsQuality) {
      graphicsQuality = quality;
      applyCounts();
    },

    setVisible(visible: boolean) {
      group.visible = visible;
    },

    getRenderedCount() {
      return activeCount;
    },

    update(delta: number, elapsed: number) {
      if (!group.visible || activeCount === 0) return;

      // On Low quality, throttle crowd matrix uploads to ~24 Hz to keep 4 GB phones buttery smooth
      if (graphicsQuality === 'low') {
        lastUpdateAccum += delta;
        if (lastUpdateAccum < 0.042) return;
        delta = lastUpdateAccum;
        lastUpdateAccum = 0;
      }

      const clampedDelta = Math.min(delta, 0.12);

      for (let i = 0; i < activeCount; i++) {
        const c = citizens[i];
        let isWalking = false;

        if (c.pauseTimer > 0) {
          c.pauseTimer -= clampedDelta;
        } else {
          const dx = c.targetX - c.x;
          const dz = c.targetZ - c.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < 0.14) {
            c.pauseTimer = 0.6 + deterministicRand(i + elapsed) * 1.8;
            pickNextWaypoint(c, i, elapsed);
          } else {
            const dist = Math.sqrt(distSq);
            const step = Math.min(dist, c.speed * clampedDelta);
            c.x += (dx / dist) * step;
            c.z += (dz / dist) * step;
            const desiredYaw = Math.atan2(dx, dz);
            // Smooth shortest-angle turn
            let diff = desiredYaw - c.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            c.yaw += diff * Math.min(1, clampedDelta * 7.5);
            c.stridePhase += clampedDelta * c.speed * 7.2;
            isWalking = true;
          }
        }

        const sy = c.scaleY;
        const bob = isWalking ? Math.abs(Math.sin(c.stridePhase)) * 0.045 * sy : 0;
        const legSwing = isWalking ? Math.sin(c.stridePhase) * 0.58 : 0;
        const cosY = Math.cos(c.yaw);
        const sinY = Math.sin(c.yaw);

        // Torso
        _pos.set(c.x, 0.54 * sy + bob, c.z);
        _euler.set(0, c.yaw, 0);
        _quat.setFromEuler(_euler);
        _scale.set(1, sy, 1);
        _mat.compose(_pos, _quat, _scale);
        torsoMesh.setMatrixAt(i, _mat);

        // Head
        _pos.set(c.x, 0.87 * sy + bob, c.z);
        _scale.set(1, 1, 1);
        _mat.compose(_pos, _quat, _scale);
        headMesh.setMatrixAt(i, _mat);

        // Hat / Hair cap
        _pos.set(c.x, 1.01 * sy + bob, c.z);
        _scale.set(1, 1, 1);
        _mat.compose(_pos, _quat, _scale);
        hatMesh.setMatrixAt(i, _mat);

        // Left leg (offset -0.075 local X)
        const hipY = 0.34 * sy + bob;
        const lx = c.x - cosY * 0.075;
        const lz = c.z + sinY * 0.075;
        _pos.set(lx, hipY, lz);
        _euler.set(legSwing, c.yaw, 0);
        _quat.setFromEuler(_euler);
        _scale.set(1, sy, 1);
        _mat.compose(_pos, _quat, _scale);
        leftLegMesh.setMatrixAt(i, _mat);

        // Right leg (offset +0.075 local X)
        const rx = c.x + cosY * 0.075;
        const rz = c.z - sinY * 0.075;
        _pos.set(rx, hipY, rz);
        _euler.set(-legSwing, c.yaw, 0);
        _quat.setFromEuler(_euler);
        _mat.compose(_pos, _quat, _scale);
        rightLegMesh.setMatrixAt(i, _mat);
      }

      torsoMesh.instanceMatrix.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      hatMesh.instanceMatrix.needsUpdate = true;
      leftLegMesh.instanceMatrix.needsUpdate = true;
      rightLegMesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      scene.remove(group);
      torsoGeo.dispose();
      headGeo.dispose();
      legGeo.dispose();
      hatGeo.dispose();
      torsoMat.dispose();
      headMat.dispose();
      legMat.dispose();
      hatMat.dispose();
    },
  };
}
