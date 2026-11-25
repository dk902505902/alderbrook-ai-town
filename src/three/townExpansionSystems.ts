import * as THREE from 'three';
import type { GraphicsQuality, MiniGameMode, TownEraId } from '../types/town.ts';

export interface TownExpansionSystemsHandle {
  group: THREE.Group;
  harborFocusTarget: THREE.Vector3;
  harborCameraPos: THREE.Vector3;
  undergroundFocusTarget: THREE.Vector3;
  undergroundCameraPos: THREE.Vector3;
  setSubwayBuilt: (built: boolean) => void;
  setUndergroundXray: (enabled: boolean) => void;
  setHarborUnlocked: (unlocked: boolean) => void;
  setIslandResortBuilt: (built: boolean) => void;
  setIslandDefenseBuilt: (built: boolean) => void;
  setTownEra: (era: TownEraId) => void;
  setMiniGameMode: (mode: MiniGameMode) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  getInteractiveTargets: () => THREE.Object3D[];
  tryHitTargetObject: (hitObj: THREE.Object3D) => { kind: 'crate' | 'drone'; points: number } | null;
  triggerFireDefenseVolley: () => { hitCount: number; points: number };
  triggerCollectNearestCrate: () => { collected: boolean; points: number; remaining: number };
  getRemainingCratesCount: () => number;
  update: (delta: number, elapsed: number, isNight: boolean) => void;
  dispose: () => void;
}

// Pre-allocated scratch vectors (zero GC per frame)
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpMid = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);

interface SubwayTrainRig {
  cars: THREE.Group[];
  angle: number;
  dir: 1 | -1;
}

interface SkyCrateRig {
  id: number;
  group: THREE.Group;
  basePos: THREE.Vector3;
  collected: boolean;
  respawnTimer: number;
}

interface TargetDroneRig {
  id: number;
  group: THREE.Group;
  active: boolean;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  respawnTimer: number;
}

interface LaserBoltRig {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface BurstRingRig {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

export function buildTownExpansionSystems(scene: THREE.Scene): TownExpansionSystemsHandle {
  const root = new THREE.Group();
  root.name = 'town:expansion_systems';

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  let subwayBuilt = false;
  let undergroundXray = false;
  let harborUnlocked = false;
  let islandResortBuilt = false;
  let islandDefenseBuilt = false;
  let currentEra: TownEraId = 'village';
  let currentMiniGame: MiniGameMode = 'none';
  let currentQuality: GraphicsQuality = 'medium';

  // Shared lightweight geometries
  const unitBox = track(new THREE.BoxGeometry(1, 1, 1));
  const unitCyl = track(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
  const unitCone = track(new THREE.ConeGeometry(0.5, 1, 8));
  const unitSphere = track(new THREE.SphereGeometry(0.5, 10, 8));

  const addPart = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  // =========================================================================
  // 1. UNDERGROUND SUBWAY METRO & X-RAY UTILITY NETWORK (y = -2.6)
  // =========================================================================
  const surfaceMetroKiosks = new THREE.Group();
  surfaceMetroKiosks.name = 'subway:surface_kiosks';
  surfaceMetroKiosks.visible = false;

  const undergroundGroup = new THREE.Group();
  undergroundGroup.name = 'subway:underground_network';
  undergroundGroup.visible = false;

  const metroSteelMat = track(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.72 }),
  );
  const metroCyanGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
  );
  const metroAmberGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    }),
  );
  const subwayTunnelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.78,
      metalness: 0.25,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
    }),
  );
  const subwayCarBodyMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.28, metalness: 0.55 }),
  );
  const subwayCarStripeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    }),
  );

  // 2 Surface Metro Entrance Kiosks (North-East & South-West of plaza)
  for (const [kx, kz, ry] of [
    [6.1, -5.8, Math.PI * 0.25],
    [-6.1, 5.8, -Math.PI * 0.75],
  ] as Array<[number, number, number]>) {
    const kiosk = new THREE.Group();
    kiosk.position.set(kx, 0, kz);
    kiosk.rotation.y = ry;
    addPart(kiosk, unitBox, metroSteelMat, 0, 0.25, 0, 1.9, 0.5, 1.4);
    addPart(kiosk, unitBox, metroSteelMat, -0.82, 0.95, 0, 0.14, 1.4, 1.3);
    addPart(kiosk, unitBox, metroSteelMat, 0.82, 0.95, 0, 0.14, 1.4, 1.3);
    addPart(kiosk, unitBox, metroCyanGlowMat, 0, 1.66, 0, 2.05, 0.16, 1.5);
    addPart(kiosk, unitBox, metroAmberGlowMat, 0, 1.45, 0.68, 0.72, 0.22, 0.08);
    surfaceMetroKiosks.add(kiosk);
  }
  root.add(surfaceMetroKiosks);

  // Underground Dark Bed Grid (y = -3.4) so X-ray view has crisp contrast
  const subFloorGeo = track(new THREE.CircleGeometry(22, 32));
  const subFloorMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x090f1d,
      transparent: true,
      opacity: 0.75,
    }),
  );
  const subFloor = new THREE.Mesh(subFloorGeo, subFloorMat);
  subFloor.rotation.x = -Math.PI / 2;
  subFloor.position.y = -3.45;
  undergroundGroup.add(subFloor);

  // Glowing Underground Water Mains (Cyan) & Power Conduits (Amber) as 2 LineSegments draw calls
  const waterPipeVerts = new Float32Array([
    -15, -1.65, -0.8, 15, -1.65, -0.8,
    -0.8, -1.65, -15, -0.8, -1.65, 15,
    -8.5, -1.65, -8.5, 8.5, -1.65, 8.5,
    -8.5, -1.65, 8.5, 8.5, -1.65, -8.5,
  ]);
  const waterPipeGeo = track(new THREE.BufferGeometry());
  waterPipeGeo.setAttribute('position', new THREE.BufferAttribute(waterPipeVerts, 3));
  const waterPipeMat = track(new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
  const waterPipes = new THREE.LineSegments(waterPipeGeo, waterPipeMat);
  undergroundGroup.add(waterPipes);

  const powerPipeVerts = new Float32Array([
    -15, -1.95, 0.8, 15, -1.95, 0.8,
    0.8, -1.95, -15, 0.8, -1.95, 15,
    -11, -1.95, 0.8, -11, -1.95, -9,
    11, -1.95, 0.8, 11, -1.95, 9,
  ]);
  const powerPipeGeo = track(new THREE.BufferGeometry());
  powerPipeGeo.setAttribute('position', new THREE.BufferAttribute(powerPipeVerts, 3));
  const powerPipeMat = track(new THREE.LineBasicMaterial({ color: 0xfbbf24 }));
  const powerPipes = new THREE.LineSegments(powerPipeGeo, powerPipeMat);
  undergroundGroup.add(powerPipes);

  // Subway Circular Tunnel Shell & Glowing Track Ring (r = 12.2, y = -2.65)
  const SUBWAY_RADIUS = 12.2;
  const SUBWAY_Y = -2.65;
  const subwayGroup = new THREE.Group();
  subwayGroup.visible = false;

  const tunnelGeo = track(new THREE.TorusGeometry(SUBWAY_RADIUS, 0.86, 10, 48));
  const tunnelMesh = new THREE.Mesh(tunnelGeo, subwayTunnelMat);
  tunnelMesh.rotation.x = Math.PI / 2;
  tunnelMesh.position.y = SUBWAY_Y + 0.25;
  subwayGroup.add(tunnelMesh);

  const trackRingGeo = track(new THREE.TorusGeometry(SUBWAY_RADIUS, 0.08, 6, 48));
  const trackRingInner = new THREE.Mesh(trackRingGeo, metroCyanGlowMat);
  trackRingInner.rotation.x = Math.PI / 2;
  trackRingInner.position.y = SUBWAY_Y - 0.36;
  trackRingInner.scale.set(0.97, 0.97, 1);
  const trackRingOuter = new THREE.Mesh(trackRingGeo, metroCyanGlowMat);
  trackRingOuter.rotation.x = Math.PI / 2;
  trackRingOuter.position.y = SUBWAY_Y - 0.36;
  trackRingOuter.scale.set(1.03, 1.03, 1);
  subwayGroup.add(trackRingInner, trackRingOuter);

  // 4 Subterranean Metro Stations (N, E, S, W)
  const stationAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  for (const ang of stationAngles) {
    const st = new THREE.Group();
    st.position.set(Math.cos(ang) * SUBWAY_RADIUS, SUBWAY_Y - 0.38, Math.sin(ang) * SUBWAY_RADIUS);
    st.rotation.y = -ang;
    addPart(st, unitBox, metroSteelMat, 0, 0, 0, 2.3, 0.24, 3.8);
    addPart(st, unitBox, metroCyanGlowMat, -1.05, 0.16, 0, 0.14, 0.1, 3.6);
    addPart(st, unitBox, metroCyanGlowMat, 1.05, 0.16, 0, 0.14, 0.1, 3.6);
    addPart(st, unitBox, metroAmberGlowMat, 0, 1.28, 0, 2.1, 0.12, 3.2);
    subwayGroup.add(st);
  }

  // Twin Composite 3-Car Subway Metro Trains moving in opposite directions
  const subwayTrains: SubwayTrainRig[] = [];
  for (let t = 0; t < 2; t++) {
    const cars: THREE.Group[] = [];
    for (let c = 0; c < 3; c++) {
      const car = new THREE.Group();
      addPart(car, unitBox, subwayCarBodyMat, 0, 0.32, 0, 0.86, 0.66, 1.92);
      addPart(car, unitBox, subwayCarStripeMat, 0, 0.22, 0, 0.9, 0.16, 1.94);
      addPart(car, unitBox, metroAmberGlowMat, 0, 0.44, 0, 0.9, 0.2, 1.48);
      if (c === 0) {
        addPart(car, unitSphere, metroCyanGlowMat, 0, 0.32, 0.96, 0.32, 0.24, 0.18);
      }
      subwayGroup.add(car);
      cars.push(car);
    }
    subwayTrains.push({
      cars,
      angle: t * Math.PI,
      dir: t === 0 ? 1 : -1,
    });
  }

  undergroundGroup.add(subwayGroup);
  root.add(undergroundGroup);

  // =========================================================================
  // 2. COASTAL HARBOR, STRIPED LIGHTHOUSE, CRUISE SHIP & OFFSHORE ISLAND
  //    Cleanly positioned at SE Coast (x: 24..54, z: 26..54) — zero collisions!
  // =========================================================================
  const harborGroup = new THREE.Group();
  harborGroup.name = 'harbor:coastal_expansion';
  harborGroup.visible = false;

  const bayWaterMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.18,
    }),
  );
  const sandMat = track(
    new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.92, metalness: 0.02 }),
  );
  const islandGrassMat = track(
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.88 }),
  );
  const dockTimberMat = track(
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.84 }),
  );
  const pierDeckMat = track(
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 }),
  );
  const warehouseMat = track(
    new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.68 }),
  );
  const craneYellowMat = track(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.42, metalness: 0.45 }),
  );
  const lhWhiteMat = track(
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }),
  );
  const lhRedMat = track(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.48 }),
  );
  const cruiseNavyMat = track(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.32 }),
  );
  const cruiseGoldMat = track(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.7 }),
  );
  const beaconBeamMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  // Shimmering Coastal Bay Water Plane
  const bayGeo = track(new THREE.CircleGeometry(18.5, 32));
  const bayWater = new THREE.Mesh(bayGeo, bayWaterMat);
  bayWater.rotation.x = -Math.PI / 2;
  bayWater.position.set(38.5, 0.05, 39.5);
  bayWater.receiveShadow = true;
  harborGroup.add(bayWater);

  // Shoreline Sand Embankment (NW edge of bay)
  const shoreSandGeo = track(new THREE.RingGeometry(16.8, 19.8, 28, 1, Math.PI * 0.72, Math.PI * 0.92));
  const shoreSand = new THREE.Mesh(shoreSandGeo, sandMat);
  shoreSand.rotation.x = -Math.PI / 2;
  shoreSand.position.set(38.5, 0.04, 39.5);
  harborGroup.add(shoreSand);

  // Timber Harbor Pier & Dockyard Warehouse at (29.5, 0, 31.2)
  const pierGroup = new THREE.Group();
  pierGroup.position.set(29.5, 0, 31.2);
  pierGroup.rotation.y = Math.PI * 0.22;
  // Main planked pier jutting into the bay
  addPart(pierGroup, unitBox, pierDeckMat, 0, 0.42, 2.2, 3.2, 0.24, 9.2);
  // Wooden pier pilings
  for (const pz of [-1.8, 0.6, 3.0, 5.4]) {
    addPart(pierGroup, unitCyl, dockTimberMat, -1.35, 0.22, pz, 0.26, 0.7, 0.26);
    addPart(pierGroup, unitCyl, dockTimberMat, 1.35, 0.22, pz, 0.26, 0.7, 0.26);
  }
  // Dockyard Cargo Warehouse
  addPart(pierGroup, unitBox, warehouseMat, -3.2, 1.15, -1.5, 3.4, 2.1, 2.8);
  addPart(pierGroup, unitBox, lhWhiteMat, -3.2, 2.3, -1.5, 3.7, 0.28, 3.1);
  // Harbor Loading Crane
  addPart(pierGroup, unitBox, craneYellowMat, 1.1, 1.85, 2.2, 0.35, 3.1, 0.35);
  addPart(pierGroup, unitBox, craneYellowMat, 1.75, 3.25, 2.6, 2.4, 0.24, 0.26, 0, 0.35, 0.28);
  // Colorful shipping containers
  addPart(pierGroup, unitBox, subwayCarStripeMat, -2.6, 0.65, 1.2, 1.4, 0.9, 0.8);
  addPart(pierGroup, unitBox, cruiseGoldMat, -2.6, 1.5, 1.2, 1.35, 0.82, 0.78);
  harborGroup.add(pierGroup);

  // Striped Red & White Coastal Lighthouse at (25.2, 0, 35.4)
  const lighthouse = new THREE.Group();
  lighthouse.position.set(25.2, 0, 35.4);
  addPart(lighthouse, unitCyl, metroSteelMat, 0, 0.3, 0, 2.4, 0.6, 2.4);
  addPart(lighthouse, unitCyl, lhWhiteMat, 0, 1.1, 0, 1.75, 1.1, 1.75);
  addPart(lighthouse, unitCyl, lhRedMat, 0, 2.2, 0, 1.55, 1.1, 1.55);
  addPart(lighthouse, unitCyl, lhWhiteMat, 0, 3.3, 0, 1.35, 1.1, 1.35);
  addPart(lighthouse, unitCyl, lhRedMat, 0, 4.4, 0, 1.15, 1.1, 1.15);
  addPart(lighthouse, unitCyl, metroAmberGlowMat, 0, 5.25, 0, 0.96, 0.65, 0.96);
  addPart(lighthouse, unitCone, lhRedMat, 0, 5.95, 0, 1.35, 0.85, 1.35);

  // Rotating Lighthouse Beacon Beam
  const beaconPivot = new THREE.Group();
  beaconPivot.position.set(0, 5.25, 0);
  const beamGeo = track(new THREE.ConeGeometry(2.1, 12.5, 12, 1, true));
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, 0, 6.25);
  const beamMesh = new THREE.Mesh(beamGeo, beaconBeamMat);
  beaconPivot.add(beamMesh);
  lighthouse.add(beaconPivot);
  harborGroup.add(lighthouse);

  // Composite 8-Part Grand Ocean Cruise Ship (steaming into harbor & docking!)
  const cruiseShip = new THREE.Group();
  cruiseShip.name = 'harbor:cruise_ship';
  // 1. Lower dark navy hull
  addPart(cruiseShip, unitBox, cruiseNavyMat, 0, 0.42, 0, 2.4, 0.84, 7.6);
  // 2. Tapered bow prow
  addPart(cruiseShip, unitCone, cruiseNavyMat, 0, 0.56, 4.6, 2.35, 2.2, 1.65, Math.PI / 2, 0, 0);
  // 3. White upper hull deck
  addPart(cruiseShip, unitBox, lhWhiteMat, 0, 1.05, -0.1, 2.52, 0.46, 7.2);
  // 4. Deck Tier 1 & glowing promenade cabin strip
  addPart(cruiseShip, unitBox, lhWhiteMat, 0, 1.65, -0.35, 2.18, 0.78, 5.9);
  addPart(cruiseShip, unitBox, metroAmberGlowMat, 0, 1.68, -0.35, 2.24, 0.28, 5.3);
  // 5. Deck Tier 2 & upper suites
  addPart(cruiseShip, unitBox, lhWhiteMat, 0, 2.32, -0.55, 1.78, 0.62, 4.6);
  addPart(cruiseShip, unitBox, metroCyanGlowMat, 0, 2.34, -0.55, 1.84, 0.22, 4.0);
  // 6. Captain's Bridge
  addPart(cruiseShip, unitBox, lhWhiteMat, 0, 2.82, 1.15, 2.35, 0.42, 0.95);
  // 7-8. Twin Red & Gold Funnels
  addPart(cruiseShip, unitCyl, lhRedMat, 0, 3.05, -0.45, 0.62, 0.98, 0.85, -0.18, 0, 0);
  addPart(cruiseShip, unitCyl, cruiseGoldMat, 0, 3.45, -0.52, 0.66, 0.2, 0.88, -0.18, 0, 0);
  addPart(cruiseShip, unitCyl, lhRedMat, 0, 2.98, -1.75, 0.56, 0.88, 0.78, -0.18, 0, 0);
  addPart(cruiseShip, unitCyl, cruiseGoldMat, 0, 3.34, -1.82, 0.6, 0.18, 0.8, -0.18, 0, 0);
  cruiseShip.position.set(35.8, 0.1, 35.0);
  harborGroup.add(cruiseShip);

  // Scenic Arch Bridge linking Mainland Shore -> Offshore Paradise Island
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(34.5, 0, 42.2);
  bridgeGroup.rotation.y = Math.atan2(43.2 - 26.2, 45.2 - 39.2);
  addPart(bridgeGroup, unitBox, dockTimberMat, 0, 0.55, 0, 1.75, 0.22, 13.5);
  addPart(bridgeGroup, unitBox, lhWhiteMat, -0.82, 0.88, 0, 0.12, 0.42, 13.4);
  addPart(bridgeGroup, unitBox, lhWhiteMat, 0.82, 0.88, 0, 0.12, 0.42, 13.4);
  for (const bz of [-4.2, 0, 4.2]) {
    addPart(bridgeGroup, unitCyl, metroSteelMat, 0, 0.25, bz, 0.42, 0.8, 0.42);
  }
  harborGroup.add(bridgeGroup);

  // Offshore Paradise Island at (43.8, 0, 45.6)
  const islandGroup = new THREE.Group();
  islandGroup.position.set(43.8, 0, 45.6);
  addPart(islandGroup, unitCyl, sandMat, 0, 0.16, 0, 13.5, 0.34, 12.2);
  addPart(islandGroup, unitCyl, islandGrassMat, 0, 0.36, 0, 10.6, 0.26, 9.6);
  // 5 Stylized Island Palm Trees
  for (const [px, pz, tilt] of [
    [-3.6, -2.5, 0.18],
    [3.8, -2.2, -0.16],
    [-3.4, 2.8, 0.14],
    [3.6, 2.6, -0.2],
    [0.2, 3.8, 0.12],
  ] as Array<[number, number, number]>) {
    const palm = new THREE.Group();
    palm.position.set(px, 0.46, pz);
    addPart(palm, unitCyl, dockTimberMat, 0, 1.1, 0, 0.22, 2.2, 0.22, tilt, 0, tilt * 0.7);
    addPart(palm, unitCone, islandGrassMat, tilt * 1.1, 2.25, tilt * 0.7, 1.8, 0.65, 1.8);
    islandGroup.add(palm);
  }

  // Optional 3D Luxury Island Resort (pool + 3 tiki cabanas + glowing palms)
  const islandResortGroup = new THREE.Group();
  islandResortGroup.name = 'harbor:island_resort';
  islandResortGroup.visible = false;
  // Turquoise infinity pool
  addPart(islandResortGroup, unitBox, lhWhiteMat, 0, 0.52, -0.4, 3.6, 0.18, 2.4);
  addPart(islandResortGroup, unitBox, metroCyanGlowMat, 0, 0.58, -0.4, 3.1, 0.12, 1.9);
  // 3 Tiki Cabanas
  for (const [cx, cz] of [
    [-2.4, -0.8],
    [2.4, -0.8],
    [0, -2.7],
  ] as Array<[number, number]>) {
    addPart(islandResortGroup, unitBox, lhWhiteMat, cx, 0.95, cz, 1.45, 0.9, 1.35);
    addPart(islandResortGroup, unitCone, cruiseGoldMat, cx, 1.72, cz, 2.1, 0.82, 2.1);
    addPart(islandResortGroup, unitBox, metroAmberGlowMat, cx, 0.95, cz + 0.68, 0.5, 0.45, 0.08);
  }
  islandGroup.add(islandResortGroup);

  // Optional 3D Coastal Missile Defense Battery (bunker + twin pods + spinning radar)
  const islandDefenseGroup = new THREE.Group();
  islandDefenseGroup.name = 'harbor:island_defense';
  islandDefenseGroup.visible = false;
  islandDefenseGroup.position.set(3.2, 0.48, -3.2);
  addPart(islandDefenseGroup, unitCyl, metroSteelMat, 0, 0.38, 0, 2.4, 0.76, 2.4);
  addPart(islandDefenseGroup, unitBox, warehouseMat, -0.45, 1.05, 0, 0.48, 0.62, 1.15, -0.35, 0, 0);
  addPart(islandDefenseGroup, unitBox, warehouseMat, 0.45, 1.05, 0, 0.48, 0.62, 1.15, -0.35, 0, 0);
  const coastalRadarDish = new THREE.Group();
  coastalRadarDish.position.set(0, 1.45, -0.35);
  addPart(coastalRadarDish, unitCyl, metroSteelMat, 0, 0, 0, 0.18, 0.6, 0.18);
  addPart(coastalRadarDish, unitBox, metroCyanGlowMat, 0, 0.34, 0, 1.2, 0.38, 0.12);
  islandDefenseGroup.add(coastalRadarDish);
  islandGroup.add(islandDefenseGroup);

  harborGroup.add(islandGroup);
  root.add(harborGroup);

  // =========================================================================
  // 3. LIVING TOWN ERAS VISUAL EVOLUTION ACCENTS (Steam City & Neo-Metropolis)
  // =========================================================================
  const steamEraGroup = new THREE.Group();
  steamEraGroup.name = 'era:steam_city';
  steamEraGroup.visible = false;

  const brassMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.82 }),
  );
  const copperMat = track(
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4, metalness: 0.65 }),
  );
  const eraGearMeshes: THREE.Mesh[] = [];
  const gearGeo = track(new THREE.TorusGeometry(0.42, 0.08, 6, 12));

  // 4 Ornate Brass Plaza Arches framing the 4 Town Square avenues
  const archCoords: Array<[number, number, number]> = [
    [0, -5.2, 0],
    [0, 5.2, 0],
    [-5.2, -0.5, Math.PI / 2],
    [5.2, -0.5, Math.PI / 2],
  ];
  for (const [ax, az, ry] of archCoords) {
    const arch = new THREE.Group();
    arch.position.set(ax, 0, az);
    arch.rotation.y = ry;
    addPart(arch, unitCyl, copperMat, -1.45, 1.6, 0, 0.22, 3.2, 0.22);
    addPart(arch, unitCyl, copperMat, 1.45, 1.6, 0, 0.22, 3.2, 0.22);
    addPart(arch, unitBox, brassMat, 0, 3.22, 0, 3.3, 0.26, 0.28);
    addPart(arch, unitSphere, metroAmberGlowMat, -1.45, 3.45, 0, 0.32, 0.32, 0.32);
    addPart(arch, unitSphere, metroAmberGlowMat, 1.45, 3.45, 0, 0.32, 0.32, 0.32);
    const gear = new THREE.Mesh(gearGeo, brassMat);
    gear.position.set(0, 3.65, 0);
    arch.add(gear);
    eraGearMeshes.push(gear);
    steamEraGroup.add(arch);
  }
  root.add(steamEraGroup);

  const neoEraGroup = new THREE.Group();
  neoEraGroup.name = 'era:neo_metropolis';
  neoEraGroup.visible = false;

  const neoTrimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.35,
      roughness: 0.16,
      metalness: 0.4,
    }),
  );
  const neoHaloMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    }),
  );

  // 4 Sleek Solar Spire Pylons framing the central plaza
  for (const [sx, sz] of [
    [-4.6, -4.6],
    [4.6, -4.6],
    [-4.6, 4.6],
    [4.6, 4.6],
  ] as Array<[number, number]>) {
    addPart(neoEraGroup, unitCyl, metroSteelMat, sx, 2.2, sz, 0.36, 4.4, 0.36);
    addPart(neoEraGroup, unitCyl, neoTrimMat, sx, 4.55, sz, 0.16, 1.2, 0.16);
    addPart(neoEraGroup, unitSphere, metroAmberGlowMat, sx, 5.25, sz, 0.32, 0.32, 0.32);
  }
  // Glowing Cyan Avenue Light Strips along N/S and E/W roads
  addPart(neoEraGroup, unitBox, neoTrimMat, -1.25, 0.05, -7.8, 0.1, 0.04, 6.2);
  addPart(neoEraGroup, unitBox, neoTrimMat, 1.25, 0.05, -7.8, 0.1, 0.04, 6.2);
  addPart(neoEraGroup, unitBox, neoTrimMat, -1.25, 0.05, 7.8, 0.1, 0.04, 6.2);
  addPart(neoEraGroup, unitBox, neoTrimMat, 1.25, 0.05, 7.8, 0.1, 0.04, 6.2);
  addPart(neoEraGroup, unitBox, neoTrimMat, -7.8, 0.05, -1.75, 6.2, 0.04, 0.1);
  addPart(neoEraGroup, unitBox, neoTrimMat, -7.8, 0.05, 0.75, 6.2, 0.04, 0.1);
  addPart(neoEraGroup, unitBox, neoTrimMat, 7.8, 0.05, -1.75, 6.2, 0.04, 0.1);
  addPart(neoEraGroup, unitBox, neoTrimMat, 7.8, 0.05, 0.75, 6.2, 0.04, 0.1);

  // Floating Holographic Sky-Ring above Central Plaza (y = 7.4)
  const neoSkyRingGeo = track(new THREE.TorusGeometry(4.4, 0.09, 8, 40));
  const neoSkyRing = new THREE.Mesh(neoSkyRingGeo, neoHaloMat);
  neoSkyRing.rotation.x = Math.PI / 2;
  neoSkyRing.position.set(0, 7.4, 0);
  neoEraGroup.add(neoSkyRing);
  root.add(neoEraGroup);

  // =========================================================================
  // 4. INTERACTIVE 3D MINI-GAMES (Drone Sky Treasure Hunt + Turret Defense)
  // =========================================================================
  const miniGameGroup = new THREE.Group();
  miniGameGroup.name = 'minigame:actors';
  miniGameGroup.visible = false;
  root.add(miniGameGroup);

  const interactiveTargets: THREE.Object3D[] = [];

  // 4a. 8 Golden Sky Treasure Crates (drone_hunt)
  const crateGoldMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.75,
    }),
  );
  const crateBeaconMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  const crateCoords: Array<[number, number, number]> = [
    [-8.5, 3.2, -8.5],
    [8.5, 3.6, -8.2],
    [-9.2, 3.0, 8.4],
    [9.4, 3.4, 8.6],
    [0.0, 4.2, -13.5],
    [13.8, 3.3, -0.5],
    [-13.8, 3.5, -0.5],
    [0.0, 3.8, 13.4],
  ];
  const skyCrates: SkyCrateRig[] = crateCoords.map(([x, y, z], id) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.userData.miniGameTarget = { kind: 'crate', id };
    const box = addPart(g, unitBox, crateGoldMat, 0, 0, 0, 1.05, 1.05, 1.05);
    box.userData.miniGameTarget = { kind: 'crate', id };
    const trim = addPart(g, unitBox, lhWhiteMat, 0, 0, 0, 1.16, 0.22, 1.16);
    trim.userData.miniGameTarget = { kind: 'crate', id };
    const beam = addPart(g, unitCyl, crateBeaconMat, 0, -y * 0.5, 0, 0.22, y, 0.22);
    beam.userData.miniGameTarget = { kind: 'crate', id };
    g.visible = false;
    miniGameGroup.add(g);
    interactiveTargets.push(g);
    return { id, group: g, basePos: new THREE.Vector3(x, y, z), collected: false, respawnTimer: 0 };
  });

  // 4b. 5 Incoming Raider Target Drones (turret_defense)
  const targetDroneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.25,
      roughness: 0.25,
      metalness: 0.45,
    }),
  );
  const targetDroneCoreMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf97316,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    }),
  );
  const targetDrones: TargetDroneRig[] = Array.from({ length: 5 }, (_, id) => {
    const g = new THREE.Group();
    g.userData.miniGameTarget = { kind: 'drone', id };
    const hull = addPart(g, unitSphere, targetDroneMat, 0, 0, 0, 1.25, 0.65, 1.25);
    hull.userData.miniGameTarget = { kind: 'drone', id };
    const core = addPart(g, unitSphere, targetDroneCoreMat, 0, 0.15, 0, 0.55, 0.55, 0.55);
    core.userData.miniGameTarget = { kind: 'drone', id };
    const wing = addPart(g, unitBox, metroSteelMat, 0, 0, 0, 2.2, 0.14, 0.34);
    wing.userData.miniGameTarget = { kind: 'drone', id };
    g.visible = false;
    miniGameGroup.add(g);
    interactiveTargets.push(g);
    return {
      id,
      group: g,
      active: false,
      angle: (id / 5) * Math.PI * 2,
      radius: 17 + id * 1.4,
      height: 4.0 + (id % 3) * 1.1,
      speed: 2.3 + (id % 3) * 0.45,
      respawnTimer: 0,
    };
  });

  // Pooled Laser Interceptor Bolts & Explosion Burst Rings (zero GC!)
  const laserBoltGeo = track(new THREE.CylinderGeometry(0.08, 0.08, 1, 6));
  const laserBolts: LaserBoltRig[] = Array.from({ length: 6 }, () => {
    const mat = track(
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 }),
    );
    const mesh = new THREE.Mesh(laserBoltGeo, mat);
    mesh.visible = false;
    miniGameGroup.add(mesh);
    return { mesh, mat, life: 0, maxLife: 0.28 };
  });

  const burstRingGeo = track(new THREE.RingGeometry(0.35, 0.68, 18));
  const burstRings: BurstRingRig[] = Array.from({ length: 6 }, () => {
    const mat = track(
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(burstRingGeo, mat);
    mesh.visible = false;
    miniGameGroup.add(mesh);
    return { mesh, mat, life: 0, maxLife: 0.45 };
  });

  const spawnBurst = (pos: THREE.Vector3, hexColor: number) => {
    const slot = burstRings.find((b) => b.life <= 0) ?? burstRings[0];
    slot.mesh.position.copy(pos);
    slot.mesh.rotation.x = Math.PI / 2;
    slot.mesh.scale.setScalar(1);
    slot.mat.color.setHex(hexColor);
    slot.mat.opacity = 0.95;
    slot.life = slot.maxLife;
    slot.mesh.visible = true;
  };

  const spawnLaser = (from: THREE.Vector3, to: THREE.Vector3) => {
    const slot = laserBolts.find((l) => l.life <= 0) ?? laserBolts[0];
    _tmpMid.addVectors(from, to).multiplyScalar(0.5);
    _tmpV1.subVectors(to, from);
    const len = _tmpV1.length();
    slot.mesh.position.copy(_tmpMid);
    slot.mesh.scale.set(1, Math.max(0.2, len), 1);
    slot.mesh.quaternion.setFromUnitVectors(_upAxis, _tmpV1.normalize());
    slot.mat.opacity = 0.95;
    slot.life = slot.maxLife;
    slot.mesh.visible = true;
  };

  const resetSkyCrates = () => {
    for (const c of skyCrates) {
      c.collected = false;
      c.respawnTimer = 0;
      c.group.position.copy(c.basePos);
      c.group.visible = currentMiniGame === 'drone_hunt';
    }
  };

  const resetTargetDrones = () => {
    for (let i = 0; i < targetDrones.length; i++) {
      const d = targetDrones[i];
      d.active = currentMiniGame === 'turret_defense';
      d.angle = (i / targetDrones.length) * Math.PI * 2 + 0.3;
      d.radius = 16.5 + i * 1.5;
      d.height = 4.0 + (i % 3) * 1.1;
      d.respawnTimer = 0;
      d.group.position.set(Math.cos(d.angle) * d.radius, d.height, Math.sin(d.angle) * d.radius);
      d.group.visible = d.active;
    }
  };

  const syncSubwayVisibility = () => {
    surfaceMetroKiosks.visible = subwayBuilt;
    undergroundGroup.visible = undergroundXray;
    subwayGroup.visible = undergroundXray && subwayBuilt;
  };

  const syncEraVisibility = () => {
    steamEraGroup.visible = currentEra === 'steam_city';
    neoEraGroup.visible = currentEra === 'neo_metropolis';
  };

  scene.add(root);

  return {
    group: root,
    harborFocusTarget: new THREE.Vector3(35.5, 1.4, 37.5),
    harborCameraPos: new THREE.Vector3(19.5, 14.5, 52.5),
    undergroundFocusTarget: new THREE.Vector3(0, -2.2, 0),
    undergroundCameraPos: new THREE.Vector3(15.5, 10.5, 18.5),
    setSubwayBuilt: (built: boolean) => {
      subwayBuilt = built;
      syncSubwayVisibility();
    },
    setUndergroundXray: (enabled: boolean) => {
      undergroundXray = enabled;
      syncSubwayVisibility();
    },
    setHarborUnlocked: (unlocked: boolean) => {
      harborUnlocked = unlocked;
      harborGroup.visible = unlocked;
    },
    setIslandResortBuilt: (built: boolean) => {
      islandResortBuilt = built;
      islandResortGroup.visible = built;
    },
    setIslandDefenseBuilt: (built: boolean) => {
      islandDefenseBuilt = built;
      islandDefenseGroup.visible = built;
    },
    setTownEra: (era: TownEraId) => {
      currentEra = era;
      syncEraVisibility();
    },
    setMiniGameMode: (mode: MiniGameMode) => {
      currentMiniGame = mode;
      miniGameGroup.visible = mode === 'drone_hunt' || mode === 'turret_defense';
      resetSkyCrates();
      resetTargetDrones();
    },
    setGraphicsQuality: (quality: GraphicsQuality) => {
      currentQuality = quality;
    },
    getInteractiveTargets: () =>
      currentMiniGame === 'drone_hunt' || currentMiniGame === 'turret_defense'
        ? interactiveTargets
        : [],
    tryHitTargetObject: (hitObj: THREE.Object3D) => {
      let cur: THREE.Object3D | null = hitObj;
      while (cur) {
        const meta = cur.userData?.miniGameTarget as { kind: 'crate' | 'drone'; id: number } | undefined;
        if (meta) {
          if (meta.kind === 'crate' && currentMiniGame === 'drone_hunt') {
            const crate = skyCrates[meta.id];
            if (crate && !crate.collected) {
              crate.collected = true;
              crate.respawnTimer = 6.5;
              crate.group.visible = false;
              spawnBurst(crate.group.position, 0xfde047);
              return { kind: 'crate', points: 1 };
            }
          } else if (meta.kind === 'drone' && currentMiniGame === 'turret_defense') {
            const drone = targetDrones[meta.id];
            if (drone && drone.active) {
              drone.active = false;
              drone.respawnTimer = 1.6;
              drone.group.visible = false;
              _tmpV2.set(0, 2.2, 0);
              spawnLaser(_tmpV2, drone.group.position);
              spawnBurst(drone.group.position, 0x38bdf8);
              return { kind: 'drone', points: 1 };
            }
          }
          return null;
        }
        cur = cur.parent;
      }
      return null;
    },
    triggerFireDefenseVolley: () => {
      if (currentMiniGame !== 'turret_defense') return { hitCount: 0, points: 0 };
      // Lock onto closest active incoming target drone (effortless 1-tap mobile play!)
      let best: TargetDroneRig | null = null;
      for (const d of targetDrones) {
        if (!d.active) continue;
        if (!best || d.radius < best.radius) best = d;
      }
      if (!best) return { hitCount: 0, points: 0 };
      best.active = false;
      best.respawnTimer = 1.4;
      best.group.visible = false;
      _tmpV2.set(0, 2.2, 0);
      spawnLaser(_tmpV2, best.group.position);
      spawnBurst(best.group.position, 0x38bdf8);
      return { hitCount: 1, points: 1 };
    },
    triggerCollectNearestCrate: () => {
      if (currentMiniGame !== 'drone_hunt') {
        return { collected: false, points: 0, remaining: 0 };
      }
      const nextCrate = skyCrates.find((c) => !c.collected);
      if (!nextCrate) {
        return { collected: false, points: 0, remaining: 0 };
      }
      nextCrate.collected = true;
      nextCrate.respawnTimer = 6.0;
      nextCrate.group.visible = false;
      _tmpV2.set(0, 3.8, 0);
      spawnLaser(_tmpV2, nextCrate.group.position);
      spawnBurst(nextCrate.group.position, 0xfde047);
      const remaining = skyCrates.filter((c) => !c.collected).length;
      return { collected: true, points: 1, remaining };
    },
    getRemainingCratesCount: () => skyCrates.filter((c) => !c.collected).length,
    update: (delta: number, elapsed: number, isNight: boolean) => {
      // 1. Underground Subway Trains Animation
      if (undergroundXray && subwayBuilt) {
        const activeTrainCount = currentQuality === 'low' ? 1 : 2;
        for (let t = 0; t < subwayTrains.length; t++) {
          const train = subwayTrains[t];
          const show = t < activeTrainCount;
          train.angle = (train.angle + delta * 0.42 * train.dir + Math.PI * 2) % (Math.PI * 2);
          for (let c = 0; c < train.cars.length; c++) {
            const car = train.cars[c];
            car.visible = show;
            if (!show) continue;
            const carAng = train.angle - train.dir * c * 0.175;
            car.position.set(
              Math.cos(carAng) * SUBWAY_RADIUS,
              SUBWAY_Y - 0.36,
              Math.sin(carAng) * SUBWAY_RADIUS,
            );
            // Tangent orientation along circle
            car.rotation.y = -carAng + (train.dir === 1 ? 0 : Math.PI);
          }
        }
      }

      // 2. Coastal Harbor: Lighthouse Beacon, Bay Water Pulse, Cruise Ship Docking Cycle & Radar
      if (harborUnlocked) {
        beaconPivot.rotation.y = elapsed * 0.85;
        beaconBeamMat.opacity = isNight ? 0.34 : 0.12;
        bayWater.position.y = 0.05 + Math.sin(elapsed * 1.9) * 0.014;

        // 36-second Cruise Ship Docking Cycle:
        // 0..10s steam in to dock | 10..20s docked disembarking tourists | 20..30s cruise out | 30..36s distant turn
        const cycle = elapsed % 36;
        let tDock = 0;
        let shipYaw = -Math.PI * 0.72;
        if (cycle < 10) {
          tDock = 1 - Math.cos((cycle / 10) * Math.PI * 0.5);
          shipYaw = -Math.PI * 0.72;
        } else if (cycle < 20) {
          tDock = 1;
          shipYaw = -Math.PI * 0.72;
        } else if (cycle < 30) {
          const p = (cycle - 20) / 10;
          tDock = Math.cos(p * Math.PI * 0.5);
          shipYaw = Math.PI * 0.28;
        } else {
          tDock = 0;
          shipYaw = Math.PI * 0.28 + ((cycle - 30) / 6) * Math.PI;
        }
        const sx = THREE.MathUtils.lerp(49.5, 34.4, tDock);
        const sz = THREE.MathUtils.lerp(49.5, 34.6, tDock);
        cruiseShip.position.set(sx, 0.12 + Math.sin(elapsed * 2.1) * 0.04, sz);
        cruiseShip.rotation.y = shipYaw;
        cruiseShip.rotation.z = Math.sin(elapsed * 1.5) * 0.025;

        if (islandDefenseBuilt) {
          coastalRadarDish.rotation.y = elapsed * 2.4;
        }
      }

      // 3. Living Town Era Accents
      if (currentEra === 'steam_city') {
        for (let i = 0; i < eraGearMeshes.length; i++) {
          eraGearMeshes[i].rotation.z = elapsed * (i % 2 === 0 ? 1.1 : -1.1);
        }
      } else if (currentEra === 'neo_metropolis') {
        neoSkyRing.rotation.z = elapsed * 0.38;
        neoSkyRing.position.y = 7.4 + Math.sin(elapsed * 1.6) * 0.28;
        neoHaloMat.opacity = isNight ? 0.65 : 0.36;
      }

      // 4. Mini-Game Actors (Sky Crates + Target Drones + Lasers + Bursts)
      if (currentMiniGame === 'drone_hunt') {
        for (const c of skyCrates) {
          if (c.collected) {
            c.respawnTimer -= delta;
            if (c.respawnTimer <= 0) {
              c.collected = false;
              c.group.visible = true;
            }
          } else {
            c.group.position.y = c.basePos.y + Math.sin(elapsed * 2.6 + c.id) * 0.38;
            c.group.rotation.y = elapsed * 1.6 + c.id;
          }
        }
      } else if (currentMiniGame === 'turret_defense') {
        for (const d of targetDrones) {
          if (!d.active) {
            d.respawnTimer -= delta;
            if (d.respawnTimer <= 0) {
              d.active = true;
              d.radius = 19.0 + (d.id % 3) * 1.5;
              d.angle = (elapsed * 0.7 + d.id * 1.35) % (Math.PI * 2);
              d.group.visible = true;
            }
          } else {
            d.angle += delta * 0.36;
            d.radius -= delta * d.speed;
            if (d.radius < 3.6) {
              d.radius = 19.5;
              d.angle += 1.2;
            }
            d.group.position.set(
              Math.cos(d.angle) * d.radius,
              d.height + Math.sin(elapsed * 4.2 + d.id) * 0.35,
              Math.sin(d.angle) * d.radius,
            );
            d.group.rotation.y = -d.angle;
          }
        }
      }

      // Update pooled laser bolts & burst rings
      for (const l of laserBolts) {
        if (l.life > 0) {
          l.life -= delta;
          if (l.life <= 0) {
            l.mesh.visible = false;
          } else {
            l.mat.opacity = Math.max(0, l.life / l.maxLife);
          }
        }
      }
      for (const b of burstRings) {
        if (b.life > 0) {
          b.life -= delta;
          if (b.life <= 0) {
            b.mesh.visible = false;
          } else {
            const p = 1 - b.life / b.maxLife;
            b.mesh.scale.setScalar(1 + p * 3.8);
            b.mat.opacity = (1 - p) * 0.9;
          }
        }
      }
    },
    dispose: () => {
      scene.remove(root);
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
