import * as THREE from 'three';
import {
  BIOME_META,
  type BiomeId,
  type GraphicsQuality,
} from '../types/town.ts';

/**
 * Procedural Vehicle & Traffic Variety (4 GB RAM Android Safe)
 * ------------------------------------------------------------
 * - Instanced Street Tram + Biome Resource Delivery Vans rendered via 4 shared InstancedMeshes
 *   (chassis, upper cabin, glowing headlamps, roof beacon/cargo) — zero shadows, zero GC per frame.
 * - 1 Composite low-poly Scenic Airship (hull, tail fins, gondola, spinning rear propeller)
 *   drifting calmly across the sky; automatically disabled on Low graphics quality.
 */

export interface TownVehiclesHandle {
  group: THREE.Group;
  setUnlockedBiomes: (biomes: BiomeId[]) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setNightFactor: (nightFactor: number) => void;
  setVisible: (visible: boolean) => void;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

interface VehicleSlot {
  kind: 'tram' | 'van';
  progress: number; // 0..1
  speed: number;
  dir: 1 | -1;
  biomeIdx: number;
  baseColorHex: number;
  cargoColorHex: number;
}

const MAX_ROAD_VEHICLES = 7; // 1 Street Tram + up to 6 Biome Delivery Vans

// Pre-allocated scratch math (zero GC in render loop)
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _color = new THREE.Color();

// Inner square street loop for the Street Tram (clear of plots & buildings)
const TRAM_LOOP: Array<[number, number]> = [
  [-12.2, -11.4],
  [12.2, -11.4],
  [12.2, 10.6],
  [-12.2, 10.6],
];

const BIOME_DELIVERY_TARGETS: Record<BiomeId, [number, number]> = {
  forest: [-23.5, -18.5],
  desert: [23.5, -18.5],
  cave: [0, -25.5],
  alpine: [0, 24.5],
  river: [-23.5, 16.5],
  canyon: [23.5, 16.5],
};

const BIOME_CARGO_COLORS: Record<BiomeId, number> = {
  forest: 0x92400e, // Timber logs
  desert: 0xd97706, // Sandstone blocks
  cave: 0x38bdf8, // Glowing crystals
  alpine: 0xe2e8f0, // Ice & ore
  river: 0x22c55e, // Fresh harvest
  canyon: 0xea580c, // Red rock masonry
};

function sampleClosedLoop(
  pts: Array<[number, number]>,
  t: number,
): { x: number; z: number; yaw: number } {
  const n = pts.length;
  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * n;
  const idx = Math.floor(scaled) % n;
  const nextIdx = (idx + 1) % n;
  const frac = scaled - Math.floor(scaled);
  const [x0, z0] = pts[idx];
  const [x1, z1] = pts[nextIdx];
  const x = x0 + (x1 - x0) * frac;
  const z = z0 + (z1 - z0) * frac;
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  return { x, z, yaw };
}

export function buildTownVehiclesSystem(scene: THREE.Scene): TownVehiclesHandle {
  const group = new THREE.Group();
  group.name = 'town_vehicles_traffic';

  // 1) Instanced Street Tram + Delivery Vans (4 shared draw calls total)
  const chassisGeo = new THREE.BoxGeometry(1, 0.42, 1.85);
  const cabinGeo = new THREE.BoxGeometry(0.86, 0.44, 0.92);
  const cargoGeo = new THREE.BoxGeometry(0.76, 0.34, 0.84);
  const lampGeo = new THREE.BoxGeometry(0.84, 0.14, 0.12);

  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.35,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.2,
  });
  const cargoMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.1,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfde047,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });

  const chassisMesh = new THREE.InstancedMesh(chassisGeo, chassisMat, MAX_ROAD_VEHICLES);
  const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, MAX_ROAD_VEHICLES);
  const cargoMesh = new THREE.InstancedMesh(cargoGeo, cargoMat, MAX_ROAD_VEHICLES);
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, MAX_ROAD_VEHICLES);

  const instancedAll = [chassisMesh, cabinMesh, cargoMesh, lampMesh];
  for (const m of instancedAll) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    m.count = 0;
    group.add(m);
  }

  // 2) Composite Low-Poly Scenic Dirigible Airship (7 parts, distinct roughness/metalness)
  const airshipGroup = new THREE.Group();
  airshipGroup.name = 'scenic_airship';

  const hullGeo = new THREE.SphereGeometry(1.4, 14, 10);
  hullGeo.scale(1.0, 0.85, 2.35);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.62,
    metalness: 0.08,
  });
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  airshipGroup.add(hullMesh);

  const stripeGeo = new THREE.TorusGeometry(1.26, 0.12, 8, 18);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.34,
    metalness: 0.45,
  });
  const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
  stripeMesh.scale.set(1.0, 0.86, 1.0);
  airshipGroup.add(stripeMesh);

  const gondolaGeo = new THREE.BoxGeometry(0.75, 0.55, 1.65);
  const gondolaMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.52,
  });
  const gondolaMesh = new THREE.Mesh(gondolaGeo, gondolaMat);
  gondolaMesh.position.set(0, -1.55, 0);
  airshipGroup.add(gondolaMesh);

  const gondolaWindowGeo = new THREE.BoxGeometry(0.8, 0.22, 1.2);
  const gondolaWindowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });
  const gondolaWinMesh = new THREE.Mesh(gondolaWindowGeo, gondolaWindowMat);
  gondolaWinMesh.position.set(0, -1.52, 0);
  airshipGroup.add(gondolaWinMesh);

  const finGeo = new THREE.BoxGeometry(0.1, 1.1, 1.0);
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x0f766e,
    roughness: 0.55,
    metalness: 0.2,
  });
  const topFin = new THREE.Mesh(finGeo, finMat);
  topFin.position.set(0, 0.72, -2.45);
  airshipGroup.add(topFin);

  const sideFin = new THREE.Mesh(finGeo, finMat);
  sideFin.rotation.z = Math.PI / 2;
  sideFin.position.set(0, 0, -2.45);
  airshipGroup.add(sideFin);

  const propGeo = new THREE.BoxGeometry(1.15, 0.14, 0.08);
  const propMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.28,
    metalness: 0.75,
  });
  const propeller = new THREE.Mesh(propGeo, propMat);
  propeller.position.set(0, -1.55, -0.92);
  airshipGroup.add(propeller);

  airshipGroup.position.set(0, 17.5, -18);
  group.add(airshipGroup);

  // Vehicle state slots
  const slots: VehicleSlot[] = [
    {
      kind: 'tram',
      progress: 0.12,
      speed: 0.028,
      dir: 1,
      biomeIdx: 0,
      baseColorHex: 0xd97706, // Golden Street Tram
      cargoColorHex: 0x0f766e,
    },
  ];
  const vanColors = [0x2563eb, 0x059669, 0x7c3aed, 0x0891b2, 0xea580c, 0xbe123c];
  for (let i = 0; i < MAX_ROAD_VEHICLES - 1; i++) {
    slots.push({
      kind: 'van',
      progress: (i * 0.17) % 1,
      speed: 0.042 + (i % 3) * 0.008,
      dir: 1,
      biomeIdx: i,
      baseColorHex: vanColors[i % vanColors.length],
      cargoColorHex: 0xf59e0b,
    });
  }

  let unlockedBiomes: BiomeId[] = [];
  let graphicsQuality: GraphicsQuality = 'medium';
  let activeCount = 1;

  function syncVehicleCounts(): void {
    const maxVans =
      graphicsQuality === 'low' ? 2 : graphicsQuality === 'medium' ? 4 : 6;
    const biomeCount = Math.min(maxVans, Math.max(1, unlockedBiomes.length));
    activeCount = Math.min(MAX_ROAD_VEHICLES, 1 + biomeCount);

    for (let i = 0; i < activeCount; i++) {
      const slot = slots[i];
      _color.setHex(slot.baseColorHex);
      chassisMesh.setColorAt(i, _color);

      if (slot.kind === 'van') {
        const biomeId = unlockedBiomes[i - 1] ?? 'forest';
        slot.cargoColorHex = BIOME_CARGO_COLORS[biomeId] ?? 0xd97706;
      }
      _color.setHex(slot.cargoColorHex);
      cargoMesh.setColorAt(i, _color);
    }

    for (const m of instancedAll) {
      m.count = activeCount;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    airshipGroup.visible = graphicsQuality !== 'low';
  }

  syncVehicleCounts();
  scene.add(group);

  let lowAccum = 0;

  return {
    group,

    setUnlockedBiomes(biomes: BiomeId[]) {
      unlockedBiomes = [...biomes];
      syncVehicleCounts();
    },

    setGraphicsQuality(quality: GraphicsQuality) {
      graphicsQuality = quality;
      syncVehicleCounts();
    },

    setNightFactor(nightFactor: number) {
      lampMat.emissiveIntensity = 0.55 + nightFactor * 1.45;
      gondolaWindowMat.emissiveIntensity = 0.65 + nightFactor * 1.3;
    },

    setVisible(visible: boolean) {
      group.visible = visible;
    },

    update(delta: number, elapsed: number) {
      if (!group.visible) return;
      if (graphicsQuality === 'low') {
        lowAccum += delta;
        if (lowAccum < 0.04) return;
        delta = lowAccum;
        lowAccum = 0;
      }

      const dt = Math.min(delta, 0.12);

      // Update scenic airship cruise
      if (airshipGroup.visible) {
        const orbitAng = elapsed * 0.075;
        const rx = 22.5;
        const rz = 17.5;
        const ax = Math.cos(orbitAng) * rx;
        const az = Math.sin(orbitAng) * rz;
        const nextAx = Math.cos(orbitAng + 0.04) * rx;
        const nextAz = Math.sin(orbitAng + 0.04) * rz;
        airshipGroup.position.set(ax, 17.4 + Math.sin(elapsed * 0.8) * 0.65, az);
        airshipGroup.rotation.y = Math.atan2(nextAx - ax, nextAz - az);
        propeller.rotation.z += dt * 14;
      }

      // Update instanced tram & biome delivery vans
      for (let i = 0; i < activeCount; i++) {
        const slot = slots[i];
        let x = 0;
        let z = 0;
        let yaw = 0;
        let scaleLen = 1.0;

        if (slot.kind === 'tram') {
          slot.progress = (slot.progress + dt * slot.speed) % 1;
          const sample = sampleClosedLoop(TRAM_LOOP, slot.progress);
          x = sample.x;
          z = sample.z;
          yaw = sample.yaw;
          scaleLen = 1.45;
        } else {
          // Delivery van shuttles smoothly between Market Square edge and unlocked biome hub
          slot.progress += dt * slot.speed * slot.dir;
          if (slot.progress >= 1) {
            slot.progress = 1;
            slot.dir = -1;
          } else if (slot.progress <= 0) {
            slot.progress = 0;
            slot.dir = 1;
          }
          const biomeId: BiomeId = unlockedBiomes[i - 1] ?? 'forest';
          const target =
            BIOME_DELIVERY_TARGETS[biomeId] ?? [BIOME_META.forest.center.x, BIOME_META.forest.center.z];
          const startX = 6.2 * (target[0] >= 0 ? 1 : -1);
          const startZ = 4.6 * (target[1] >= 0 ? 1 : -1);
          // Smooth ease-in-out near endpoints
          const t = slot.progress;
          const eased = t * t * (3 - 2 * t);
          x = startX + (target[0] - startX) * eased;
          z = startZ + (target[1] - startZ) * eased;
          const dx = (target[0] - startX) * slot.dir;
          const dz = (target[1] - startZ) * slot.dir;
          yaw = Math.atan2(dx, dz);
        }

        const sinY = Math.sin(yaw);
        const cosY = Math.cos(yaw);
        const bob = Math.sin(elapsed * 14 + i * 1.9) * 0.015;

        // Chassis
        _pos.set(x, 0.27 + bob, z);
        _euler.set(0, yaw, 0);
        _quat.setFromEuler(_euler);
        _scale.set(slot.kind === 'tram' ? 1.12 : 0.92, 1, scaleLen);
        _mat.compose(_pos, _quat, _scale);
        chassisMesh.setMatrixAt(i, _mat);

        // Upper cabin (centered for tram, forward for van)
        const cabForward = slot.kind === 'tram' ? 0 : 0.34;
        _pos.set(x + sinY * cabForward, 0.66 + bob, z + cosY * cabForward);
        _scale.set(slot.kind === 'tram' ? 1.1 : 0.9, 1, slot.kind === 'tram' ? 2.45 : 0.92);
        _mat.compose(_pos, _quat, _scale);
        cabinMesh.setMatrixAt(i, _mat);

        // Cargo bed (rear of van) or tram pantograph roof bar
        const cargoBack = slot.kind === 'tram' ? 0 : -0.44;
        const cargoY = slot.kind === 'tram' ? 0.98 + bob : 0.58 + bob;
        _pos.set(x + sinY * cargoBack, cargoY, z + cosY * cargoBack);
        _scale.set(slot.kind === 'tram' ? 0.65 : 0.92, slot.kind === 'tram' ? 0.35 : 1, slot.kind === 'tram' ? 1.8 : 1.0);
        _mat.compose(_pos, _quat, _scale);
        cargoMesh.setMatrixAt(i, _mat);

        // Glowing headlamps at front nose
        const noseDist = 0.92 * scaleLen;
        _pos.set(x + sinY * noseDist, 0.34 + bob, z + cosY * noseDist);
        _scale.set(slot.kind === 'tram' ? 1.05 : 0.88, 1, 1);
        _mat.compose(_pos, _quat, _scale);
        lampMesh.setMatrixAt(i, _mat);
      }

      chassisMesh.instanceMatrix.needsUpdate = true;
      cabinMesh.instanceMatrix.needsUpdate = true;
      cargoMesh.instanceMatrix.needsUpdate = true;
      lampMesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      scene.remove(group);
      chassisGeo.dispose();
      cabinGeo.dispose();
      cargoGeo.dispose();
      lampGeo.dispose();
      chassisMat.dispose();
      cabinMat.dispose();
      cargoMat.dispose();
      lampMat.dispose();
      hullGeo.dispose();
      hullMat.dispose();
      stripeGeo.dispose();
      stripeMat.dispose();
      gondolaGeo.dispose();
      gondolaMat.dispose();
      gondolaWindowGeo.dispose();
      gondolaWindowMat.dispose();
      finGeo.dispose();
      finMat.dispose();
      propGeo.dispose();
      propMat.dispose();
    },
  };
}
