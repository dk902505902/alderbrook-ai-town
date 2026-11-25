import * as THREE from 'three';
import {
  ALL_PLOT_IDS,
  PLOT_META,
  type BiomeId,
  type DistrictZoneType,
  type GraphicsQuality,
  type LampMood,
  type PlotId,
  type TownStructure,
  type UtilityGridSummary,
} from '../types/town.ts';

export interface TownInfrastructureHandle {
  group: THREE.Group;
  setUtilityOverlayVisible: (visible: boolean, structures: TownStructure[], grid: UtilityGridSummary) => void;
  setZoneOverlayVisible: (visible: boolean, zoneMap: Partial<Record<PlotId, DistrictZoneType>>, availablePlots: PlotId[]) => void;
  setDronePatrolEnabled: (enabled: boolean) => void;
  setBalloonsEnabled: (enabled: boolean) => void;
  setAuroraEnabled: (enabled: boolean) => void;
  setDeliveryVanEnabled: (enabled: boolean) => void;
  setAirshipEnabled: (enabled: boolean) => void;
  setSkyTramEnabled: (enabled: boolean) => void;
  setMeteorShowerEnabled: (enabled: boolean) => void;
  triggerMeteorShower: () => void;
  setSearchlightsEnabled: (enabled: boolean) => void;
  setRainbowEnabled: (enabled: boolean) => void;
  setFirefliesEnabled: (enabled: boolean) => void;
  setHoloEmblemEnabled: (enabled: boolean) => void;
  setBirdsEnabled: (enabled: boolean) => void;
  setSatelliteEnabled: (enabled: boolean) => void;
  setEmblemColor: (hex: string) => void;
  setWonderCount: (count: number) => void;
  setBeaconTarget: (target: { x: number; z: number } | null) => void;
  setLampMood: (mood: LampMood) => void;
  setUnlockedBiomes: (biomes: BiomeId[]) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setNightFactor: (factor: number) => void;
  launchFireworks: () => void;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

const ZONE_HEX: Record<DistrictZoneType, number> = {
  mixed: 0x94a3b8,
  residential: 0x10b981,
  commercial: 0xf59e0b,
  civic: 0x3b82f6,
  tech: 0x06b6d4,
};

const LAMP_MOOD_HEX: Record<LampMood, { accent: number; auroraA: number; auroraB: number }> = {
  warm: { accent: 0xfde68a, auroraA: 0x34d399, auroraB: 0x38bdf8 },
  amber: { accent: 0xf59e0b, auroraA: 0xfbbf24, auroraB: 0xf43f5e },
  cyber: { accent: 0x22d3ee, auroraA: 0x38bdf8, auroraB: 0xa855f7 },
  emerald: { accent: 0x34d399, auroraA: 0x10b981, auroraB: 0x2dd4bf },
};

const FIREWORK_PARTICLE_COUNT = 96;

interface FireworkBurstParticle {
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
 * Lightweight 4 GB RAM Android-safe 3D infrastructure & atmosphere system:
 * 1) 3D Power/Water Utility Conduits (1 LineSegments draw call)
 * 2) 3D District Zone Borders (shared RingGeometry pooled per plot)
 * 3) On-demand GPU-friendly 3D Fireworks Show (1 Points draw call, zero GC)
 * 4) Composite 6-part Patrol Quadcopter Drone (disabled on Low quality)
 * 5) Composite 5-part River Ferry Boat when River biome is unlocked (disabled on Low quality)
 * 6) Composite 5-part Hot Air Balloon Fleet (1 on Low, 3 on Med/High)
 * 7) Night Aurora Borealis Sky Ribbon (1 translucent vertex-animated ribbon)
 * 8) Composite 6-part Electric Delivery Van cruising town lanes (disabled on Low)
 * 9) 3D Landmark Waypoint Beacon Pillar & rotating ground ring
 */
export function buildTownInfrastructureSystem(scene: THREE.Scene): TownInfrastructureHandle {
  const group = new THREE.Group();
  group.name = 'town_infrastructure_system';

  const disposables: Array<{ dispose: () => void }> = [];
  let graphicsQuality: GraphicsQuality = 'medium';
  let droneEnabled = true;
  let balloonsEnabled = true;
  let auroraEnabled = true;
  let deliveryVanEnabled = true;
  let airshipEnabled = true;
  let skyTramEnabled = true;
  let meteorShowerEnabled = true;
  let searchlightsEnabled = false;
  let rainbowEnabled = false;
  let firefliesEnabled = true;
  let holoEmblemEnabled = true;
  let birdsEnabled = true;
  let satelliteEnabled = true;
  let wonderCount = 0;
  let manualMeteorTimer = 0;
  let hasRiver = false;
  let nightFactor = 0;

  // -------------------------------------------------------------------------
  // 1. 3D Utility Grid Conduits (Power & Water Supply Lines - 1 draw call)
  // -------------------------------------------------------------------------
  const maxLines = 48;
  const linePositions = new Float32Array(maxLines * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setDrawRange(0, 0);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
  });
  const utilityLines = new THREE.LineSegments(lineGeo, lineMat);
  utilityLines.visible = false;
  utilityLines.frustumCulled = false;
  group.add(utilityLines);
  disposables.push(lineGeo, lineMat);

  // -------------------------------------------------------------------------
  // 2. 3D District Zone Borders (shared RingGeometry pooled per plot)
  // -------------------------------------------------------------------------
  const zoneGroup = new THREE.Group();
  zoneGroup.visible = false;
  const zoneRingGeo = new THREE.RingGeometry(2.35, 2.75, 4);
  zoneRingGeo.rotateX(-Math.PI / 2);
  zoneRingGeo.rotateY(Math.PI / 4);
  disposables.push(zoneRingGeo);

  const zoneMeshes = new Map<PlotId, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }>();
  for (const plotId of ALL_PLOT_IDS) {
    const meta = PLOT_META[plotId];
    const mat = new THREE.MeshBasicMaterial({
      color: ZONE_HEX.mixed,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(zoneRingGeo, mat);
    mesh.position.set(meta.x, 0.11, meta.z);
    zoneGroup.add(mesh);
    zoneMeshes.set(plotId, { mesh, mat });
    disposables.push(mat);
  }
  group.add(zoneGroup);

  // -------------------------------------------------------------------------
  // 3. 3D Fireworks Show Particle Burst (1 Points draw call, zero GC)
  // -------------------------------------------------------------------------
  const fwPositions = new Float32Array(FIREWORK_PARTICLE_COUNT * 3);
  const fwColors = new Float32Array(FIREWORK_PARTICLE_COUNT * 3);
  const fwGeo = new THREE.BufferGeometry();
  fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPositions, 3));
  fwGeo.setAttribute('color', new THREE.BufferAttribute(fwColors, 3));
  const fwMat = new THREE.PointsMaterial({
    size: 0.52,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const fwPoints = new THREE.Points(fwGeo, fwMat);
  fwPoints.visible = false;
  fwPoints.frustumCulled = false;
  group.add(fwPoints);
  disposables.push(fwGeo, fwMat);

  const fwParticles: FireworkBurstParticle[] = Array.from({ length: FIREWORK_PARTICLE_COUNT }, () => ({
    x: 0,
    y: -20,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 1,
  }));
  let fireworksActiveTimer = 0;

  const palette = [
    new THREE.Color(0xf59e0b),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xf43f5e),
    new THREE.Color(0x34d399),
    new THREE.Color(0xc084fc),
  ];

  function spawnFireworkVolley(): void {
    const centers: Array<[number, number, number]> = [
      [0, 12.5, 0],
      [-7.5, 14.5, -5.5],
      [7.8, 13.5, 5.2],
    ];
    for (let i = 0; i < FIREWORK_PARTICLE_COUNT; i++) {
      const cIdx = i % centers.length;
      const [cx, cy, cz] = centers[cIdx];
      const theta = (i * 2.39996) % (Math.PI * 2);
      const phi = Math.acos(1 - 2 * ((i * 0.61803) % 1));
      const speed = 3.2 + (i % 7) * 0.65;
      const p = fwParticles[i];
      p.x = cx;
      p.y = cy;
      p.z = cz;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.cos(phi) * speed + 1.8;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.maxLife = 1.6 + (i % 5) * 0.28;
      p.life = p.maxLife;
      const col = palette[(cIdx + (i % 2)) % palette.length];
      fwColors[i * 3] = col.r;
      fwColors[i * 3 + 1] = col.g;
      fwColors[i * 3 + 2] = col.b;
    }
    fwGeo.attributes.color.needsUpdate = true;
    fwPoints.visible = true;
    fireworksActiveTimer = 3.2;
  }

  // -------------------------------------------------------------------------
  // 4. Composite 6-Part Civic Patrol Quadcopter Drone
  // -------------------------------------------------------------------------
  const droneGroup = new THREE.Group();
  const droneBodyGeo = new THREE.BoxGeometry(0.68, 0.22, 0.82);
  const droneArmGeo = new THREE.BoxGeometry(1.55, 0.06, 0.08);
  const droneRotorGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10);
  const droneLensGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const droneBeamGeo = new THREE.ConeGeometry(1.4, 5.8, 12, 1, true);
  droneBeamGeo.translate(0, -2.9, 0);

  const droneBodyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.35,
    metalness: 0.55,
  });
  const droneTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.4,
    metalness: 0.45,
  });
  const droneRotorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.2,
  });
  const droneLensMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const droneBeamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const droneBody = new THREE.Mesh(droneBodyGeo, droneBodyMat);
  const arm1 = new THREE.Mesh(droneArmGeo, droneTrimMat);
  arm1.rotation.y = Math.PI / 4;
  const arm2 = new THREE.Mesh(droneArmGeo, droneTrimMat);
  arm2.rotation.y = -Math.PI / 4;
  const droneLens = new THREE.Mesh(droneLensGeo, droneLensMat);
  droneLens.position.set(0, -0.1, 0.32);
  const droneBeam = new THREE.Mesh(droneBeamGeo, droneBeamMat);
  droneBeam.position.set(0, -0.15, 0.2);

  const droneRotors: THREE.Mesh[] = [];
  const rotorCoords: Array<[number, number]> = [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ];
  for (const [rx, rz] of rotorCoords) {
    const r = new THREE.Mesh(droneRotorGeo, droneRotorMat);
    r.position.set(rx, 0.14, rz);
    droneRotors.push(r);
    droneGroup.add(r);
  }
  droneGroup.add(droneBody, arm1, arm2, droneLens, droneBeam);
  droneGroup.position.set(11, 8.2, 0);
  group.add(droneGroup);
  disposables.push(
    droneBodyGeo,
    droneArmGeo,
    droneRotorGeo,
    droneLensGeo,
    droneBeamGeo,
    droneBodyMat,
    droneTrimMat,
    droneRotorMat,
    droneLensMat,
    droneBeamMat,
  );

  // -------------------------------------------------------------------------
  // 5. Composite 5-Part River Ferry Boat (cruises River Crossing waterway)
  // -------------------------------------------------------------------------
  const ferryGroup = new THREE.Group();
  const hullGeo = new THREE.BoxGeometry(1.15, 0.42, 2.75);
  const deckGeo = new THREE.BoxGeometry(0.96, 0.16, 2.2);
  const cabinGeo = new THREE.BoxGeometry(0.84, 0.62, 1.15);
  const funnelGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.55, 8);
  const bowGeo = new THREE.ConeGeometry(0.62, 0.85, 4);
  bowGeo.rotateX(Math.PI / 2);
  bowGeo.rotateZ(Math.PI / 4);

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.52, metalness: 0.18 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65, metalness: 0.05 });
  const funnelMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.35 });

  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.22;
  const deck = new THREE.Mesh(deckGeo, cabinMat);
  deck.position.y = 0.46;
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.82, -0.1);
  const funnel = new THREE.Mesh(funnelGeo, funnelMat);
  funnel.position.set(0, 1.32, -0.25);
  const bow = new THREE.Mesh(bowGeo, hullMat);
  bow.position.set(0, 0.24, 1.65);

  ferryGroup.add(hull, deck, cabin, funnel, bow);
  ferryGroup.visible = false;
  group.add(ferryGroup);
  disposables.push(hullGeo, deckGeo, cabinGeo, funnelGeo, bowGeo, hullMat, cabinMat, funnelMat);

  // -------------------------------------------------------------------------
  // 6. Composite 5-Part Hot Air Balloon Fleet (Lathe envelope + basket + burner)
  // -------------------------------------------------------------------------
  const balloonPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.42, 0.35),
    new THREE.Vector2(1.05, 1.3),
    new THREE.Vector2(1.22, 2.05),
    new THREE.Vector2(0.95, 2.7),
    new THREE.Vector2(0.35, 3.05),
    new THREE.Vector2(0.01, 3.15),
  ];
  const balloonEnvGeo = new THREE.LatheGeometry(balloonPts, 12);
  const balloonBandGeo = new THREE.TorusGeometry(1.16, 0.08, 6, 12);
  balloonBandGeo.rotateX(Math.PI / 2);
  const balloonBasketGeo = new THREE.BoxGeometry(0.58, 0.46, 0.58);
  const balloonBurnerGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const balloonStrutGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.9, 5);
  const basketMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.88, metalness: 0.02 });
  const burnerMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.4 });
  disposables.push(
    balloonEnvGeo,
    balloonBandGeo,
    balloonBasketGeo,
    balloonBurnerGeo,
    balloonStrutGeo,
    basketMat,
    burnerMat,
    strutMat,
  );

  const balloonConfigs: Array<{ envColor: number; bandColor: number; radius: number; height: number; speed: number; offset: number }> = [
    { envColor: 0xe11d48, bandColor: 0xfbbf24, radius: 19.5, height: 15.5, speed: 0.09, offset: 0.2 },
    { envColor: 0x0284c7, bandColor: 0xf8fafc, radius: 24.0, height: 18.2, speed: -0.07, offset: 2.4 },
    { envColor: 0x059669, bandColor: 0xfde047, radius: 21.5, height: 16.8, speed: 0.08, offset: 4.5 },
  ];
  const balloonGroups: THREE.Group[] = [];
  for (const cfg of balloonConfigs) {
    const bg = new THREE.Group();
    const envMat = new THREE.MeshStandardMaterial({ color: cfg.envColor, roughness: 0.55, metalness: 0.05 });
    const bandMat = new THREE.MeshStandardMaterial({ color: cfg.bandColor, roughness: 0.48, metalness: 0.08 });
    disposables.push(envMat, bandMat);

    const env = new THREE.Mesh(balloonEnvGeo, envMat);
    env.position.y = 0.72;
    const band = new THREE.Mesh(balloonBandGeo, bandMat);
    band.position.y = 2.65;
    const basket = new THREE.Mesh(balloonBasketGeo, basketMat);
    basket.position.y = 0;
    const burner = new THREE.Mesh(balloonBurnerGeo, burnerMat);
    burner.position.y = 0.74;

    const s1 = new THREE.Mesh(balloonStrutGeo, strutMat);
    s1.position.set(0.22, 0.46, 0.22);
    const s2 = new THREE.Mesh(balloonStrutGeo, strutMat);
    s2.position.set(-0.22, 0.46, -0.22);
    bg.add(env, band, basket, burner, s1, s2);
    group.add(bg);
    balloonGroups.push(bg);
  }

  // -------------------------------------------------------------------------
  // 7. Night Aurora Borealis Sky Ribbon (1 translucent vertex-animated plane)
  // -------------------------------------------------------------------------
  const auroraGeo = new THREE.PlaneGeometry(58, 7.5, 24, 1);
  const auroraMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat);
  auroraMesh.position.set(0, 26, -24);
  auroraMesh.rotation.x = 0.22;
  auroraMesh.visible = false;
  group.add(auroraMesh);
  disposables.push(auroraGeo, auroraMat);

  // -------------------------------------------------------------------------
  // 8. Composite 6-Part Electric Delivery Van (cruises main square lanes)
  // -------------------------------------------------------------------------
  const vanGroup = new THREE.Group();
  const vanCargoGeo = new THREE.BoxGeometry(0.95, 0.72, 1.45);
  const vanCabGeo = new THREE.BoxGeometry(0.9, 0.52, 0.62);
  const vanGlassGeo = new THREE.BoxGeometry(0.84, 0.28, 0.14);
  const vanWheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10);
  vanWheelGeo.rotateZ(Math.PI / 2);
  const vanLightGeo = new THREE.BoxGeometry(0.16, 0.1, 0.08);

  const vanCargoMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.12 });
  const vanCabMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.38, metalness: 0.3 });
  const vanGlassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.75 });
  const vanWheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.05 });
  const vanLightMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfde047,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const vanCargo = new THREE.Mesh(vanCargoGeo, vanCargoMat);
  vanCargo.position.set(0, 0.56, -0.26);
  const vanCab = new THREE.Mesh(vanCabGeo, vanCabMat);
  vanCab.position.set(0, 0.46, 0.72);
  const vanGlass = new THREE.Mesh(vanGlassGeo, vanGlassMat);
  vanGlass.position.set(0, 0.58, 0.98);
  const vanLightL = new THREE.Mesh(vanLightGeo, vanLightMat);
  vanLightL.position.set(-0.3, 0.34, 1.03);
  const vanLightR = new THREE.Mesh(vanLightGeo, vanLightMat);
  vanLightR.position.set(0.3, 0.34, 1.03);

  const vanWheels: THREE.Mesh[] = [];
  const wheelCoords: Array<[number, number]> = [
    [-0.48, -0.62],
    [0.48, -0.62],
    [-0.48, 0.65],
    [0.48, 0.65],
  ];
  for (const [wx, wz] of wheelCoords) {
    const w = new THREE.Mesh(vanWheelGeo, vanWheelMat);
    w.position.set(wx, 0.18, wz);
    vanWheels.push(w);
    vanGroup.add(w);
  }
  vanGroup.add(vanCargo, vanCab, vanGlass, vanLightL, vanLightR);
  group.add(vanGroup);
  disposables.push(
    vanCargoGeo,
    vanCabGeo,
    vanGlassGeo,
    vanWheelGeo,
    vanLightGeo,
    vanCargoMat,
    vanCabMat,
    vanGlassMat,
    vanWheelMat,
    vanLightMat,
  );

  // -------------------------------------------------------------------------
  // 9. 3D Landmark Waypoint Beacon (vertical sky beam + rotating ring)
  // -------------------------------------------------------------------------
  const beaconGroup = new THREE.Group();
  beaconGroup.visible = false;
  const beaconBeamGeo = new THREE.CylinderGeometry(0.22, 0.55, 18, 12, 1, true);
  beaconBeamGeo.translate(0, 9, 0);
  const beaconRingGeo = new THREE.RingGeometry(1.4, 1.85, 24);
  beaconRingGeo.rotateX(-Math.PI / 2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beaconRingMat = new THREE.MeshBasicMaterial({
    color: 0xfde68a,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beaconBeam = new THREE.Mesh(beaconBeamGeo, beaconMat);
  const beaconRing = new THREE.Mesh(beaconRingGeo, beaconRingMat);
  beaconRing.position.y = 0.16;
  beaconGroup.add(beaconBeam, beaconRing);
  group.add(beaconGroup);
  disposables.push(beaconBeamGeo, beaconRingGeo, beaconMat, beaconRingMat);

  // -------------------------------------------------------------------------
  // 10. Composite 7-Part Grand Zephyr Airship (cruises upper sky)
  // -------------------------------------------------------------------------
  const airshipGroup = new THREE.Group();
  const airshipPts = [
    new THREE.Vector2(0.01, -3.4),
    new THREE.Vector2(0.78, -2.5),
    new THREE.Vector2(1.22, -1.0),
    new THREE.Vector2(1.28, 0.5),
    new THREE.Vector2(1.05, 2.0),
    new THREE.Vector2(0.45, 3.0),
    new THREE.Vector2(0.01, 3.35),
  ];
  const airshipHullGeo = new THREE.LatheGeometry(airshipPts, 14);
  airshipHullGeo.rotateX(Math.PI / 2);
  const airshipStripeGeo = new THREE.TorusGeometry(1.25, 0.08, 6, 14);
  const airshipGondolaGeo = new THREE.BoxGeometry(0.68, 0.42, 1.55);
  const airshipFinGeo = new THREE.BoxGeometry(0.07, 1.05, 0.92);
  const airshipPropGeo = new THREE.BoxGeometry(0.55, 0.07, 0.06);
  const airshipNavGeo = new THREE.SphereGeometry(0.14, 8, 6);

  const airshipHullMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, metalness: 0.18 });
  const airshipStripeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.45 });
  const airshipGondolaMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.35 });
  const airshipFinMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.42, metalness: 0.25 });
  const airshipNavMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  const airshipHull = new THREE.Mesh(airshipHullGeo, airshipHullMat);
  const airshipStripe = new THREE.Mesh(airshipStripeGeo, airshipStripeMat);
  airshipStripe.position.z = 0.2;
  const airshipGondola = new THREE.Mesh(airshipGondolaGeo, airshipGondolaMat);
  airshipGondola.position.set(0, -1.42, 0.1);
  const airshipFinTop = new THREE.Mesh(airshipFinGeo, airshipFinMat);
  airshipFinTop.position.set(0, 0.88, -2.2);
  const airshipFinL = new THREE.Mesh(airshipFinGeo, airshipFinMat);
  airshipFinL.rotation.z = Math.PI / 2;
  airshipFinL.position.set(-0.92, 0, -2.2);
  const airshipFinR = new THREE.Mesh(airshipFinGeo, airshipFinMat);
  airshipFinR.rotation.z = Math.PI / 2;
  airshipFinR.position.set(0.92, 0, -2.2);
  const airshipPropL = new THREE.Mesh(airshipPropGeo, airshipStripeMat);
  airshipPropL.position.set(-0.56, -1.38, -0.58);
  const airshipPropR = new THREE.Mesh(airshipPropGeo, airshipStripeMat);
  airshipPropR.position.set(0.56, -1.38, -0.58);
  const airshipNav = new THREE.Mesh(airshipNavGeo, airshipNavMat);
  airshipNav.position.set(0, -1.64, 0.72);
  airshipGroup.add(
    airshipHull,
    airshipStripe,
    airshipGondola,
    airshipFinTop,
    airshipFinL,
    airshipFinR,
    airshipPropL,
    airshipPropR,
    airshipNav,
  );
  group.add(airshipGroup);
  disposables.push(
    airshipHullGeo,
    airshipStripeGeo,
    airshipGondolaGeo,
    airshipFinGeo,
    airshipPropGeo,
    airshipNavGeo,
    airshipHullMat,
    airshipStripeMat,
    airshipGondolaMat,
    airshipFinMat,
    airshipNavMat,
  );

  // -------------------------------------------------------------------------
  // 11. 3D Sky Gondola Cable-Car Line (2 pylons + overhead cable + glass cab)
  // -------------------------------------------------------------------------
  const skyTramGroup = new THREE.Group();
  const pylonGeo = new THREE.CylinderGeometry(0.18, 0.34, 11.6, 6);
  const pylonCrossGeo = new THREE.BoxGeometry(1.4, 0.22, 0.26);
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.45 });
  const pylonL = new THREE.Mesh(pylonGeo, pylonMat);
  pylonL.position.set(-18.5, 5.8, -14.5);
  const pylonCrossL = new THREE.Mesh(pylonCrossGeo, pylonMat);
  pylonCrossL.position.set(-18.5, 11.4, -14.5);
  const pylonR = new THREE.Mesh(pylonGeo, pylonMat);
  pylonR.position.set(18.5, 5.8, -14.5);
  const pylonCrossR = new THREE.Mesh(pylonCrossGeo, pylonMat);
  pylonCrossR.position.set(18.5, 11.4, -14.5);

  const cableGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-18.5, 11.45, -14.5),
    new THREE.Vector3(18.5, 11.45, -14.5),
  ]);
  const cableMat = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
  const cableLine = new THREE.Line(cableGeo, cableMat);

  const gondolaGroup = new THREE.Group();
  const gondolaArmGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.35, 6);
  const gondolaRoofGeo = new THREE.BoxGeometry(1.45, 0.16, 0.95);
  const gondolaCabGeo = new THREE.BoxGeometry(1.36, 0.78, 0.86);
  const gondolaFloorGeo = new THREE.BoxGeometry(1.45, 0.18, 0.95);
  const gondolaRoofMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.4, metalness: 0.2 });
  const gondolaGlassMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.82,
    roughness: 0.15,
    metalness: 0.4,
  });
  const gondolaArm = new THREE.Mesh(gondolaArmGeo, pylonMat);
  gondolaArm.position.y = -0.68;
  const gondolaRoof = new THREE.Mesh(gondolaRoofGeo, gondolaRoofMat);
  gondolaRoof.position.y = -1.36;
  const gondolaCab = new THREE.Mesh(gondolaCabGeo, gondolaGlassMat);
  gondolaCab.position.y = -1.82;
  const gondolaFloor = new THREE.Mesh(gondolaFloorGeo, gondolaRoofMat);
  gondolaFloor.position.y = -2.26;
  gondolaGroup.add(gondolaArm, gondolaRoof, gondolaCab, gondolaFloor);
  gondolaGroup.position.set(0, 11.45, -14.5);

  skyTramGroup.add(pylonL, pylonCrossL, pylonR, pylonCrossR, cableLine, gondolaGroup);
  group.add(skyTramGroup);
  disposables.push(
    pylonGeo,
    pylonCrossGeo,
    pylonMat,
    cableGeo,
    cableMat,
    gondolaArmGeo,
    gondolaRoofGeo,
    gondolaCabGeo,
    gondolaFloorGeo,
    gondolaRoofMat,
    gondolaGlassMat,
  );

  // -------------------------------------------------------------------------
  // 12. 3D Starlight Meteor Shower (8 zero-GC shooting star streaks)
  // -------------------------------------------------------------------------
  const METEOR_COUNT = 8;
  const meteorPositions = new Float32Array(METEOR_COUNT * 2 * 3);
  const meteorGeo = new THREE.BufferGeometry();
  meteorGeo.setAttribute('position', new THREE.BufferAttribute(meteorPositions, 3));
  const meteorMat = new THREE.LineBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
  });
  const meteorLines = new THREE.LineSegments(meteorGeo, meteorMat);
  meteorLines.visible = false;
  meteorLines.frustumCulled = false;
  group.add(meteorLines);
  disposables.push(meteorGeo, meteorMat);

  const meteors = Array.from({ length: METEOR_COUNT }, (_, idx) => ({
    x: -24 + idx * 7,
    y: 26 + (idx % 3) * 5,
    z: -26 - (idx % 4) * 5,
    vx: 14 + (idx % 3) * 4,
    vy: -9 - (idx % 2) * 3,
    vz: 3.5,
    phase: idx * 0.65,
  }));

  // -------------------------------------------------------------------------
  // 13. 3D Twin Gala Searchlights (sweeping additive sky cones)
  // -------------------------------------------------------------------------
  const searchlightsGroup = new THREE.Group();
  const slGeo = new THREE.ConeGeometry(2.3, 24, 14, 1, true);
  slGeo.translate(0, 12, 0);
  const slMat = new THREE.MeshBasicMaterial({
    color: 0xfde68a,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const searchlightL = new THREE.Mesh(slGeo, slMat);
  searchlightL.position.set(-6.8, 0.1, -6.5);
  const searchlightR = new THREE.Mesh(slGeo, slMat);
  searchlightR.position.set(6.8, 0.1, -6.5);
  searchlightsGroup.add(searchlightL, searchlightR);
  searchlightsGroup.visible = false;
  group.add(searchlightsGroup);
  disposables.push(slGeo, slMat);

  // -------------------------------------------------------------------------
  // 14. 3D Post-Rain / Civic Rainbow Arch (5 translucent torus half-arcs)
  // -------------------------------------------------------------------------
  const rainbowGroup = new THREE.Group();
  const rainbowColors = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x38bdf8];
  for (let i = 0; i < rainbowColors.length; i++) {
    const rGeo = new THREE.TorusGeometry(28 - i * 0.72, 0.34, 6, 36, Math.PI);
    const rMat = new THREE.MeshBasicMaterial({
      color: rainbowColors[i],
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const arc = new THREE.Mesh(rGeo, rMat);
    rainbowGroup.add(arc);
    disposables.push(rGeo, rMat);
  }
  rainbowGroup.position.set(0, 0.5, -22);
  rainbowGroup.visible = false;
  group.add(rainbowGroup);

  // -------------------------------------------------------------------------
  // 15. 3D Golden Fireflies Swarm (48 zero-GC drifting Points)
  // -------------------------------------------------------------------------
  const FIREFLY_COUNT = 48;
  const fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
  const fireflySeeds = Array.from({ length: FIREFLY_COUNT }, (_, i) => ({
    angle: (i / FIREFLY_COUNT) * Math.PI * 2,
    radius: 3.5 + (i % 9) * 1.4,
    baseY: 0.7 + (i % 5) * 0.55,
    speed: 0.45 + (i % 7) * 0.11,
  }));
  const fireflyGeo = new THREE.BufferGeometry();
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
  const fireflyMat = new THREE.PointsMaterial({
    color: 0xfef08a,
    size: 0.24,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const firefliesPoints = new THREE.Points(fireflyGeo, fireflyMat);
  firefliesPoints.visible = false;
  firefliesPoints.frustumCulled = false;
  group.add(firefliesPoints);
  disposables.push(fireflyGeo, fireflyMat);

  // -------------------------------------------------------------------------
  // 16. 3D Floating Holographic Town Emblem Spire (above Town Hall)
  // -------------------------------------------------------------------------
  const holoGroup = new THREE.Group();
  const holoOuterGeo = new THREE.OctahedronGeometry(0.95, 0);
  const holoCoreGeo = new THREE.OctahedronGeometry(0.45, 0);
  const holoRingGeo = new THREE.TorusGeometry(1.45, 0.06, 6, 24);
  const holoWonderRingGeo = new THREE.TorusGeometry(2.05, 0.07, 6, 28);
  const holoOuterMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    wireframe: true,
    transparent: true,
    opacity: 0.72,
  });
  const holoCoreMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.3,
  });
  const holoRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
  });
  const holoWonderMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.85,
  });
  const holoOuter = new THREE.Mesh(holoOuterGeo, holoOuterMat);
  const holoCore = new THREE.Mesh(holoCoreGeo, holoCoreMat);
  const holoRing = new THREE.Mesh(holoRingGeo, holoRingMat);
  holoRing.rotation.x = Math.PI / 3;
  const holoWonderRing = new THREE.Mesh(holoWonderRingGeo, holoWonderMat);
  holoWonderRing.rotation.x = -Math.PI / 3;
  holoWonderRing.visible = false;
  holoGroup.add(holoOuter, holoCore, holoRing, holoWonderRing);
  holoGroup.position.set(0, 12.2, -9.2);
  group.add(holoGroup);
  disposables.push(
    holoOuterGeo,
    holoCoreGeo,
    holoRingGeo,
    holoWonderRingGeo,
    holoOuterMat,
    holoCoreMat,
    holoRingMat,
    holoWonderMat,
  );

  // -------------------------------------------------------------------------
  // 17. 3D Instanced Soaring Birds / Swallows Flock (1 draw call, zero GC)
  // -------------------------------------------------------------------------
  const MAX_BIRDS = 24;
  const birdGeo = new THREE.ConeGeometry(0.16, 0.62, 3);
  birdGeo.rotateX(Math.PI / 2);
  birdGeo.scale(2.8, 0.25, 1.0);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6, metalness: 0.05 });
  const birdsInstanced = new THREE.InstancedMesh(birdGeo, birdMat, MAX_BIRDS);
  birdsInstanced.frustumCulled = false;
  group.add(birdsInstanced);
  disposables.push(birdGeo, birdMat);
  const _birdDummy = new THREE.Object3D();
  const birdSeeds = Array.from({ length: MAX_BIRDS }, (_, i) => ({
    offset: (i / MAX_BIRDS) * Math.PI * 2,
    radiusX: 14 + (i % 5) * 3.1,
    radiusZ: 11 + (i % 4) * 2.8,
    altitude: 11.5 + (i % 6) * 1.45,
    speed: 0.28 + (i % 4) * 0.05,
  }));

  // -------------------------------------------------------------------------
  // 18. Composite 5-Part Orbiting Civic Satellite Beacon
  // -------------------------------------------------------------------------
  const satGroup = new THREE.Group();
  const satCoreGeo = new THREE.BoxGeometry(0.7, 0.55, 0.7);
  const satPanelGeo = new THREE.BoxGeometry(2.8, 0.05, 0.65);
  const satDishGeo = new THREE.ConeGeometry(0.32, 0.22, 10, 1, true);
  const satBeaconGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const satCoreMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.75 });
  const satPanelMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.25, metalness: 0.6 });
  const satDishMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.5 });
  const satBeaconMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x22d3ee,
    emissiveIntensity: 1.8,
  });
  const satCore = new THREE.Mesh(satCoreGeo, satCoreMat);
  const satPanels = new THREE.Mesh(satPanelGeo, satPanelMat);
  const satDish = new THREE.Mesh(satDishGeo, satDishMat);
  satDish.position.set(0, -0.38, 0);
  const satBeacon = new THREE.Mesh(satBeaconGeo, satBeaconMat);
  satBeacon.position.set(0, 0.42, 0);
  satGroup.add(satCore, satPanels, satDish, satBeacon);
  group.add(satGroup);
  disposables.push(
    satCoreGeo,
    satPanelGeo,
    satDishGeo,
    satBeaconGeo,
    satCoreMat,
    satPanelMat,
    satDishMat,
    satBeaconMat,
  );

  scene.add(group);

  function syncActorVisibility(): void {
    const allowExtra = graphicsQuality !== 'low';
    droneGroup.visible = droneEnabled && allowExtra;
    ferryGroup.visible = hasRiver && allowExtra;
    vanGroup.visible = deliveryVanEnabled && allowExtra;
    for (let i = 0; i < balloonGroups.length; i++) {
      // Keep 1 balloon on Low if enabled, all 3 on Med/High
      balloonGroups[i].visible = balloonsEnabled && (allowExtra || i === 0);
    }
    auroraMesh.visible = auroraEnabled && allowExtra && nightFactor > 0.25;
    airshipGroup.visible = airshipEnabled;
    skyTramGroup.visible = skyTramEnabled && allowExtra;
    meteorLines.visible = manualMeteorTimer > 0 || (meteorShowerEnabled && nightFactor > 0.22);
    searchlightsGroup.visible = searchlightsEnabled && allowExtra;
    rainbowGroup.visible = rainbowEnabled;
    firefliesPoints.visible = firefliesEnabled && allowExtra && nightFactor > 0.2;
    holoGroup.visible = holoEmblemEnabled;
    holoWonderRing.visible = wonderCount > 0;
    birdsInstanced.visible = birdsEnabled;
    birdsInstanced.count = allowExtra ? MAX_BIRDS : 8;
    satGroup.visible = satelliteEnabled && allowExtra;
  }

  return {
    group,
    setUtilityOverlayVisible(visible, structures, grid) {
      utilityLines.visible = visible;
      if (!visible) return;
      lineMat.color.setHex(
        grid.status === 'shortage' ? 0xef4444 : grid.status === 'strained' ? 0xf59e0b : 0x38bdf8,
      );
      let seg = 0;
      const hubX = 0;
      const hubZ = -9.0;
      for (const s of structures) {
        if (seg >= maxLines) break;
        const meta = PLOT_META[s.plotId];
        if (!meta) continue;
        const idx = seg * 6;
        linePositions[idx] = hubX;
        linePositions[idx + 1] = 0.24;
        linePositions[idx + 2] = hubZ;
        linePositions[idx + 3] = meta.x;
        linePositions[idx + 4] = 0.24;
        linePositions[idx + 5] = meta.z;
        seg++;
      }
      lineGeo.setDrawRange(0, seg * 2);
      lineGeo.attributes.position.needsUpdate = true;
    },
    setZoneOverlayVisible(visible, zoneMap, availablePlots) {
      zoneGroup.visible = visible;
      if (!visible) return;
      const availSet = new Set(availablePlots);
      zoneMeshes.forEach((entry, plotId) => {
        const show = availSet.has(plotId) || Boolean(zoneMap[plotId]);
        entry.mesh.visible = show;
        if (!show) return;
        const z = zoneMap[plotId] ?? 'mixed';
        entry.mat.color.setHex(ZONE_HEX[z]);
      });
    },
    setDronePatrolEnabled(enabled) {
      droneEnabled = enabled;
      syncActorVisibility();
    },
    setBalloonsEnabled(enabled) {
      balloonsEnabled = enabled;
      syncActorVisibility();
    },
    setAuroraEnabled(enabled) {
      auroraEnabled = enabled;
      syncActorVisibility();
    },
    setDeliveryVanEnabled(enabled) {
      deliveryVanEnabled = enabled;
      syncActorVisibility();
    },
    setAirshipEnabled(enabled) {
      airshipEnabled = enabled;
      syncActorVisibility();
    },
    setSkyTramEnabled(enabled) {
      skyTramEnabled = enabled;
      syncActorVisibility();
    },
    setMeteorShowerEnabled(enabled) {
      meteorShowerEnabled = enabled;
      syncActorVisibility();
    },
    triggerMeteorShower() {
      manualMeteorTimer = 6.5;
      syncActorVisibility();
    },
    setSearchlightsEnabled(enabled) {
      searchlightsEnabled = enabled;
      syncActorVisibility();
    },
    setRainbowEnabled(enabled) {
      rainbowEnabled = enabled;
      syncActorVisibility();
    },
    setFirefliesEnabled(enabled) {
      firefliesEnabled = enabled;
      syncActorVisibility();
    },
    setHoloEmblemEnabled(enabled) {
      holoEmblemEnabled = enabled;
      syncActorVisibility();
    },
    setBirdsEnabled(enabled) {
      birdsEnabled = enabled;
      syncActorVisibility();
    },
    setSatelliteEnabled(enabled) {
      satelliteEnabled = enabled;
      syncActorVisibility();
    },
    setEmblemColor(hex) {
      try {
        holoOuterMat.color.set(hex);
        holoCoreMat.emissive.set(hex);
      } catch {
        holoOuterMat.color.setHex(0xf59e0b);
      }
    },
    setWonderCount(count) {
      wonderCount = Math.max(0, count);
      holoGroup.scale.setScalar(1 + Math.min(0.45, wonderCount * 0.12));
      syncActorVisibility();
    },
    setBeaconTarget(target) {
      if (!target) {
        beaconGroup.visible = false;
        return;
      }
      beaconGroup.position.set(target.x, 0, target.z);
      beaconGroup.visible = true;
    },
    setLampMood(mood) {
      const cfg = LAMP_MOOD_HEX[mood] ?? LAMP_MOOD_HEX.warm;
      droneLensMat.emissive.setHex(cfg.accent);
      droneBeamMat.color.setHex(cfg.accent);
      beaconMat.color.setHex(cfg.accent);
      beaconRingMat.color.setHex(cfg.accent);
      vanLightMat.emissive.setHex(cfg.accent);
      auroraMat.color.setHex(cfg.auroraA);
      slMat.color.setHex(cfg.accent);
      holoRingMat.color.setHex(cfg.auroraB);
    },
    setUnlockedBiomes(biomes) {
      hasRiver = biomes.includes('river');
      syncActorVisibility();
    },
    setGraphicsQuality(quality) {
      graphicsQuality = quality;
      syncActorVisibility();
    },
    setNightFactor(factor) {
      nightFactor = Math.max(0, Math.min(1, factor));
      droneBeamMat.opacity = 0.04 + nightFactor * 0.22;
      burnerMat.emissiveIntensity = 0.9 + nightFactor * 1.4;
      syncActorVisibility();
      auroraMat.opacity = Math.max(0, (nightFactor - 0.25) * 0.42);
    },
    launchFireworks() {
      spawnFireworkVolley();
    },
    update(delta, elapsed) {
      const dt = Math.min(delta, 0.08);

      // Patrol Quadcopter Drone
      if (droneGroup.visible) {
        const angle = elapsed * 0.36;
        const rx = Math.cos(angle) * 14.2;
        const rz = Math.sin(angle) * 12.8;
        droneGroup.position.set(rx, 8.2 + Math.sin(elapsed * 2.1) * 0.45, rz);
        droneGroup.rotation.y = -angle;
        for (let i = 0; i < droneRotors.length; i++) {
          droneRotors[i].rotation.y += dt * 26;
        }
      }

      // River Ferry Boat
      if (ferryGroup.visible) {
        const phase = Math.sin(elapsed * 0.28);
        const fx = -28 + phase * 8.5;
        const fz = 16 + Math.cos(elapsed * 0.28) * 1.4;
        ferryGroup.position.set(fx, 0.05 + Math.sin(elapsed * 3.0) * 0.04, fz);
        ferryGroup.rotation.y = Math.cos(elapsed * 0.28) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      // Hot Air Balloons
      for (let i = 0; i < balloonGroups.length; i++) {
        const bg = balloonGroups[i];
        if (!bg.visible) continue;
        const cfg = balloonConfigs[i];
        const ang = elapsed * cfg.speed + cfg.offset;
        bg.position.set(
          Math.cos(ang) * cfg.radius,
          cfg.height + Math.sin(elapsed * 0.75 + i * 2.1) * 0.85,
          Math.sin(ang) * (cfg.radius * 0.84),
        );
        bg.rotation.y = -ang * 0.5;
      }

      // Night Aurora Sky Ribbon
      if (auroraMesh.visible) {
        const pos = auroraGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const waveZ = Math.sin(x * 0.14 + elapsed * 0.9) * 3.2 + Math.cos(x * 0.07 - elapsed * 0.5) * 1.6;
          pos.setZ(i, waveZ);
        }
        pos.needsUpdate = true;
      }

      // Electric Delivery Van cruising rectangular town boulevard (radius ~8.2)
      if (vanGroup.visible) {
        const t = (elapsed * 0.11) % 4;
        const r = 8.2;
        let vx = 0;
        let vz = 0;
        let heading = 0;
        if (t < 1) {
          vx = -r + t * 2 * r;
          vz = -r;
          heading = Math.PI / 2;
        } else if (t < 2) {
          vx = r;
          vz = -r + (t - 1) * 2 * r;
          heading = 0;
        } else if (t < 3) {
          vx = r - (t - 2) * 2 * r;
          vz = r;
          heading = -Math.PI / 2;
        } else {
          vx = -r;
          vz = r - (t - 3) * 2 * r;
          heading = Math.PI;
        }
        vanGroup.position.set(vx, 0.03, vz);
        vanGroup.rotation.y = heading;
        for (let i = 0; i < vanWheels.length; i++) {
          vanWheels[i].rotation.x += dt * 9;
        }
      }

      // Waypoint Beacon pulse/spin
      if (beaconGroup.visible) {
        beaconRing.rotation.z += dt * 1.4;
        const sc = 0.94 + Math.sin(elapsed * 3.5) * 0.1;
        beaconRing.scale.set(sc, sc, 1);
      }

      // Fireworks Particles
      if (fireworksActiveTimer > 0) {
        fireworksActiveTimer -= dt;
        let anyAlive = false;
        for (let i = 0; i < FIREWORK_PARTICLE_COUNT; i++) {
          const p = fwParticles[i];
          if (p.life > 0) {
            anyAlive = true;
            p.life -= dt;
            p.vy -= 4.2 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            fwPositions[i * 3] = p.x;
            fwPositions[i * 3 + 1] = Math.max(0.2, p.y);
            fwPositions[i * 3 + 2] = p.z;
          } else {
            fwPositions[i * 3 + 1] = -30;
          }
        }
        fwGeo.attributes.position.needsUpdate = true;
        fwMat.opacity = Math.max(0, Math.min(1, fireworksActiveTimer / 1.4));
        if (!anyAlive || fireworksActiveTimer <= 0) {
          fwPoints.visible = false;
        }
      }

      // 10. Grand Zephyr Airship
      if (airshipGroup.visible) {
        const ang = elapsed * 0.11;
        const ax = Math.cos(ang) * 23;
        const az = Math.sin(ang) * 18.5;
        airshipGroup.position.set(ax, 21.5 + Math.sin(elapsed * 0.65) * 0.7, az);
        airshipGroup.rotation.y = -ang;
        airshipPropL.rotation.z += dt * 16;
        airshipPropR.rotation.z -= dt * 16;
      }

      // 11. Sky Gondola Cable-Car Line
      if (skyTramGroup.visible) {
        const swing = Math.sin(elapsed * 0.24);
        gondolaGroup.position.x = swing * 16.5;
        gondolaGroup.rotation.z = Math.cos(elapsed * 0.24) * 0.06;
      }

      // 12. Starlight Meteor Shower
      if (manualMeteorTimer > 0) {
        manualMeteorTimer = Math.max(0, manualMeteorTimer - dt);
        if (manualMeteorTimer === 0) syncActorVisibility();
      }
      if (meteorLines.visible) {
        for (let i = 0; i < METEOR_COUNT; i++) {
          const m = meteors[i];
          const t = (elapsed * 0.72 + m.phase) % 2.4;
          const active = t < 1.05;
          const idx = i * 6;
          if (active) {
            const hx = m.x + m.vx * t;
            const hy = m.y + m.vy * t;
            const hz = m.z + m.vz * t;
            meteorPositions[idx] = hx;
            meteorPositions[idx + 1] = hy;
            meteorPositions[idx + 2] = hz;
            meteorPositions[idx + 3] = hx - m.vx * 0.18;
            meteorPositions[idx + 4] = hy - m.vy * 0.18;
            meteorPositions[idx + 5] = hz - m.vz * 0.18;
          } else {
            meteorPositions[idx + 1] = -40;
            meteorPositions[idx + 4] = -40;
          }
        }
        meteorGeo.attributes.position.needsUpdate = true;
      }

      // 13. Twin Gala Searchlights
      if (searchlightsGroup.visible) {
        searchlightL.rotation.z = Math.sin(elapsed * 0.9) * 0.48 - 0.12;
        searchlightL.rotation.x = Math.cos(elapsed * 0.65) * 0.25;
        searchlightR.rotation.z = Math.cos(elapsed * 0.85) * 0.48 + 0.12;
        searchlightR.rotation.x = Math.sin(elapsed * 0.7) * 0.25;
        slMat.opacity = 0.08 + nightFactor * 0.16;
      }

      // 15. Golden Fireflies Swarm
      if (firefliesPoints.visible) {
        for (let i = 0; i < FIREFLY_COUNT; i++) {
          const s = fireflySeeds[i];
          const a = s.angle + elapsed * s.speed * 0.25;
          const r = s.radius + Math.sin(elapsed * s.speed + i) * 0.65;
          fireflyPositions[i * 3] = Math.cos(a) * r;
          fireflyPositions[i * 3 + 1] = s.baseY + Math.sin(elapsed * 1.9 + i * 0.7) * 0.42;
          fireflyPositions[i * 3 + 2] = Math.sin(a) * r;
        }
        fireflyGeo.attributes.position.needsUpdate = true;
      }

      // 16. Floating Holographic Town Emblem Spire
      if (holoGroup.visible) {
        holoGroup.position.y = 12.2 + Math.sin(elapsed * 1.6) * 0.35;
        holoOuter.rotation.y += dt * 0.75;
        holoCore.rotation.y -= dt * 1.25;
        holoRing.rotation.z += dt * 1.1;
        if (holoWonderRing.visible) {
          holoWonderRing.rotation.z -= dt * 0.85;
        }
      }

      // 17. Instanced Soaring Birds Flock (zero GC)
      if (birdsInstanced.visible) {
        const count = birdsInstanced.count;
        for (let i = 0; i < count; i++) {
          const b = birdSeeds[i];
          const t = elapsed * b.speed + b.offset;
          const bx = Math.cos(t) * b.radiusX;
          const bz = Math.sin(t * 1.5) * b.radiusZ;
          const by = b.altitude + Math.sin(t * 2.2) * 0.75;
          const dx = -Math.sin(t) * b.radiusX;
          const dz = Math.cos(t * 1.5) * 1.5 * b.radiusZ;
          _birdDummy.position.set(bx, by, bz);
          _birdDummy.rotation.set(0, Math.atan2(dx, dz), Math.sin(elapsed * 7 + i) * 0.25);
          _birdDummy.scale.set(1, 1 + Math.sin(elapsed * 10 + i) * 0.35, 1);
          _birdDummy.updateMatrix();
          birdsInstanced.setMatrixAt(i, _birdDummy.matrix);
        }
        birdsInstanced.instanceMatrix.needsUpdate = true;
      }

      // 18. Orbiting Civic Satellite Beacon
      if (satGroup.visible) {
        const ang = elapsed * 0.22;
        satGroup.position.set(Math.cos(ang) * 30, 27.5 + Math.sin(ang * 2) * 1.4, Math.sin(ang) * 26);
        satGroup.rotation.y = -ang + Math.PI / 2;
        satGroup.rotation.z = 0.22;
      }
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
