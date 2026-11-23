import * as THREE from 'three';
import type { GraphicsQuality, TownTheme } from '../types/town.ts';
import { applyThemeToObjectTree, tagThemeMaterial } from './townThemes.ts';

export interface TownRailwayHandle {
  group: THREE.Group;
  stationGroup: THREE.Group;
  outerStationGroup: THREE.Group;
  stationFocusTarget: THREE.Vector3;
  frontierDepotFocusTarget: THREE.Vector3;
  isNearTrackOrStation: (x: number, z: number, pad?: number) => boolean;
  triggerTrainNow: () => void;
  setRailSpurBuilt: (enabled: boolean) => void;
  update: (delta: number, elapsed: number) => void;
  applyTheme: (theme: TownTheme) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
}

const CYCLE_DURATION = 60.0; // Exact 60-second train schedule (pure frame-delta math)
const STOP_DURATION = 10.0; // 10 seconds stopped at Alderbrook Station
const MOVE_DURATION = CYCLE_DURATION - STOP_DURATION; // 50s moving around loop
const ACCEL_FRAC = 8.0 / MOVE_DURATION; // 8s smooth departure acceleration
const DECEL_FRAC = 8.0 / MOVE_DURATION; // 8s smooth braking into station
const CRUISE_VEL = 1.0 / (1.0 - 0.5 * ACCEL_FRAC - 0.5 * DECEL_FRAC);

const STATION_U = 0.21; // South-East scenic curve facing the town & default camera

// Pre-allocated scratch math helpers (zero GC in per-frame update)
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _stackWorld = new THREE.Vector3();
const _puffOrigin = new THREE.Vector3();

function createSoftSteamTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 3, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.45, 'rgba(241, 245, 249, 0.55)');
    grad.addColorStop(1, 'rgba(241, 245, 249, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function evaluateSmoothLeg(
  elapsedInLeg: number,
  legDuration: number,
  accelSec: number,
  decelSec: number,
): { s: number; vNorm: number } {
  if (legDuration <= 0.01) return { s: 1, vNorm: 0 };
  const tau = Math.min(1, Math.max(0, elapsedInLeg / legDuration));
  const aFrac = Math.min(0.4, accelSec / legDuration);
  const dFrac = Math.min(0.4, decelSec / legDuration);
  const vCruise = 1.0 / (1.0 - 0.5 * aFrac - 0.5 * dFrac);

  if (tau < aFrac) {
    const k = tau / aFrac;
    return {
      s: vCruise * (0.5 * tau - (aFrac / (2 * Math.PI)) * Math.sin(Math.PI * k)),
      vNorm: vCruise * 0.5 * (1 - Math.cos(Math.PI * k)),
    };
  }
  if (tau <= 1 - dFrac) {
    return {
      s: vCruise * (0.5 * aFrac + (tau - aFrac)),
      vNorm: vCruise,
    };
  }
  const q = tau - (1 - dFrac);
  const k = q / dFrac;
  const baseS = 1 - vCruise * 0.5 * dFrac;
  return {
    s: baseS + vCruise * (0.5 * q + (dFrac / (2 * Math.PI)) * Math.sin(Math.PI * k)),
    vNorm: vCruise * 0.5 * (1 + Math.cos(Math.PI * k)),
  };
}

/**
 * Analytic C2-smooth loop progress s in [0, 1] and normalized speed v in [0, CRUISE_VEL].
 * Guarantees exact station alignment every 60 seconds with zero cumulative drift.
 */
function evaluateTrainSchedule(cycleTime: number): {
  progress: number;
  speedNorm: number;
  isStopped: boolean;
  stopElapsed: number;
} {
  if (cycleTime < STOP_DURATION) {
    return {
      progress: 0,
      speedNorm: 0,
      isStopped: true,
      stopElapsed: cycleTime,
    };
  }

  const tau = Math.min(1, Math.max(0, (cycleTime - STOP_DURATION) / MOVE_DURATION));
  let s = 0;
  let v = 0;

  if (tau < ACCEL_FRAC) {
    const k = tau / ACCEL_FRAC;
    s = CRUISE_VEL * (0.5 * tau - (ACCEL_FRAC / (2 * Math.PI)) * Math.sin(Math.PI * k));
    v = CRUISE_VEL * 0.5 * (1 - Math.cos(Math.PI * k));
  } else if (tau <= 1 - DECEL_FRAC) {
    s = CRUISE_VEL * (0.5 * ACCEL_FRAC + (tau - ACCEL_FRAC));
    v = CRUISE_VEL;
  } else {
    const q = tau - (1 - DECEL_FRAC);
    const k = q / DECEL_FRAC;
    const baseS = 1 - CRUISE_VEL * 0.5 * DECEL_FRAC;
    s = baseS + CRUISE_VEL * (0.5 * q + (DECEL_FRAC / (2 * Math.PI)) * Math.sin(Math.PI * k));
    v = CRUISE_VEL * 0.5 * (1 + Math.cos(Math.PI * k));
  }

  return {
    progress: s,
    speedNorm: v,
    isStopped: false,
    stopElapsed: 0,
  };
}

function findClosestCurveU(
  curve: THREE.CatmullRomCurve3,
  target: THREE.Vector3,
  samples = 480,
): number {
  let bestU = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, _pos);
    const dx = _pos.x - target.x;
    const dz = _pos.z - target.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestU = u;
    }
  }
  return bestU;
}

function buildBallastRibbon(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  halfWidth: number,
): THREE.BufferGeometry {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const normals = new Float32Array((segments + 1) * 2 * 3);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u % 1, _pos);
    curve.getTangentAt(u % 1, _tan).normalize();
    _side.crossVectors(_up, _tan).normalize();

    const lx = _pos.x - _side.x * halfWidth;
    const lz = _pos.z - _side.z * halfWidth;
    const rx = _pos.x + _side.x * halfWidth;
    const rz = _pos.z + _side.z * halfWidth;

    const v0 = i * 2;
    const v1 = v0 + 1;
    positions[v0 * 3] = lx;
    positions[v0 * 3 + 1] = 0.03;
    positions[v0 * 3 + 2] = lz;
    positions[v1 * 3] = rx;
    positions[v1 * 3 + 1] = 0.03;
    positions[v1 * 3 + 2] = rz;

    normals[v0 * 3 + 1] = 1;
    normals[v1 * 3 + 1] = 1;

    if (i < segments) {
      const n0 = (i + 1) * 2;
      const n1 = n0 + 1;
      indices.push(v0, n0, v1, v1, n0, n1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function buildOffsetRailCurve(
  curve: THREE.CatmullRomCurve3,
  samples: number,
  lateralOffset: number,
  yHeight: number,
): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, _pos);
    curve.getTangentAt(u, _tan).normalize();
    _side.crossVectors(_up, _tan).normalize();
    pts.push(
      new THREE.Vector3(
        _pos.x + _side.x * lateralOffset,
        yHeight,
        _pos.z + _side.z * lateralOffset,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
}

interface TrainConsist {
  locomotive: THREE.Group;
  carriages: THREE.Group[];
  wheels: THREE.Object3D[];
  smokestackTip: THREE.Object3D;
  headlampMat: THREE.MeshStandardMaterial;
}

function buildLocomotiveAndCarriages(
  lanternMaterials: THREE.MeshStandardMaterial[],
): TrainConsist {
  const wheels: THREE.Object3D[] = [];

  // Shared materials across the consist (keeps draw calls & RAM minimal)
  const ironMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.36, metalness: 0.78 }),
    'metal',
  );
  const crimsonMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45, metalness: 0.18 }),
    'banner',
  );
  const carriageWoodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.55, metalness: 0.1 }),
    'roofSecondary',
  );
  const carriageRoofMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.58, metalness: 0.22 }),
    'roofPrimary',
  );
  const brassMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.24, metalness: 0.88 }),
    'gold',
  );
  const timberMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78, metalness: 0.05 }),
    'darkWood',
  );
  const windowMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.55,
      roughness: 0.22,
    }),
    'window',
  );
  const headlampMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfde047,
      emissiveIntensity: 0.95,
      roughness: 0.18,
    }),
    'lantern',
  );
  lanternMaterials.push(windowMat, headlampMat);

  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.12, 0.34, 0.06);

  const makeWheel = (x: number, y: number, z: number): THREE.Group => {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    const rim = new THREE.Mesh(wheelGeo, ironMat);
    const spoke = new THREE.Mesh(hubGeo, brassMat);
    wg.add(rim, spoke);
    wheels.push(wg);
    return wg;
  };

  // --- 1. STEAM LOCOMOTIVE (local +Z = forward travel direction) ---
  const loco = new THREE.Group();
  loco.name = 'railway:locomotive';

  // Chassis bed
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.22, 2.55), ironMat);
  chassis.position.set(0, 0.38, 0);
  loco.add(chassis);

  // Cowcatcher wedge at front (+Z)
  const cowcatcher = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.55, 4), crimsonMat);
  cowcatcher.rotation.x = Math.PI / 2;
  cowcatcher.rotation.y = Math.PI / 4;
  cowcatcher.scale.set(1.0, 1.0, 0.58);
  cowcatcher.position.set(0, 0.28, 1.44);
  loco.add(cowcatcher);

  // Cylindrical iron boiler
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.48, 12), ironMat);
  boiler.rotation.x = Math.PI / 2;
  boiler.position.set(0, 0.88, 0.38);
  loco.add(boiler);

  // Brass boiler rings
  const ringGeo = new THREE.CylinderGeometry(0.465, 0.465, 0.06, 12);
  ringGeo.rotateX(Math.PI / 2);
  for (const bz of [0.05, 0.55, 0.96]) {
    const band = new THREE.Mesh(ringGeo, brassMat);
    band.position.set(0, 0.88, bz);
    loco.add(band);
  }

  // Brass steam dome
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.28, 10), brassMat);
  dome.position.set(0, 1.38, 0.24);
  loco.add(dome);

  // Flared smokestack at front of boiler
  const stackBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.56, 8), ironMat);
  stackBase.position.set(0, 1.48, 0.86);
  const stackRim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.14, 8), brassMat);
  stackRim.position.set(0, 1.78, 0.86);
  loco.add(stackBase, stackRim);

  const smokestackTip = new THREE.Object3D();
  smokestackTip.position.set(0, 1.92, 0.86);
  loco.add(smokestackTip);

  // Glowing front brass headlamp
  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 8), brassMat);
  lampHousing.rotation.x = Math.PI / 2;
  lampHousing.position.set(0, 1.12, 1.16);
  const lampLens = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), headlampMat);
  lampLens.position.set(0, 1.12, 1.24);
  loco.add(lampHousing, lampLens);

  // Engineer Cab at rear (-Z)
  const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.15, 0.98), crimsonMat);
  cabBody.position.set(0, 1.04, -0.74);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.14, 1.18), carriageRoofMat);
  cabRoof.position.set(0, 1.66, -0.74);
  const cabWinL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.54), windowMat);
  cabWinL.position.set(0, 1.22, -0.74);
  loco.add(cabBody, cabRoof, cabWinL);

  // 6 Rotating wheels (3 per side)
  for (const wz of [-0.82, 0.05, 0.85]) {
    loco.add(makeWheel(-0.52, 0.28, wz), makeWheel(0.52, 0.28, wz));
  }

  // --- 2. TWO PASSENGER CARRIAGES ---
  const carriages: THREE.Group[] = [];
  const coachBodyMats = [crimsonMat, carriageWoodMat];

  for (let c = 0; c < 2; c++) {
    const car = new THREE.Group();
    car.name = `railway:carriage_${c + 1}`;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.18, 2.28), timberMat);
    deck.position.set(0, 0.36, 0);
    car.add(deck);

    // Coupler bar at front
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.42), ironMat);
    coupler.position.set(0, 0.36, 1.24);
    car.add(coupler);

    // Coach hull
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.92, 1.98), coachBodyMats[c]);
    body.position.set(0, 0.9, 0);
    car.add(body);

    // Brass belt trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.07, 2.02), brassMat);
    trim.position.set(0, 0.64, 0);
    car.add(trim);

    // Clerestory roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.14, 2.2), carriageRoofMat);
    roof.position.set(0, 1.42, 0);
    const clerestory = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 1.72), carriageRoofMat);
    clerestory.position.set(0, 1.54, 0);
    car.add(roof, clerestory);

    // Warm passenger windows (3 along each side)
    for (const wz of [-0.58, 0, 0.58]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.36, 0.38), windowMat);
      win.position.set(0, 1.0, wz);
      car.add(win);
    }

    // 4 Rotating wheels
    for (const wz of [-0.68, 0.68]) {
      car.add(makeWheel(-0.5, 0.28, wz), makeWheel(0.5, 0.28, wz));
    }

    carriages.push(car);
  }

  return {
    locomotive: loco,
    carriages,
    wheels,
    smokestackTip,
    headlampMat,
  };
}

function buildTrainStation(
  lanternMaterials: THREE.MeshStandardMaterial[],
): {
  group: THREE.Group;
  signalLanternMat: THREE.MeshStandardMaterial;
  signalHalo: THREE.Mesh;
  signalHaloMat: THREE.MeshBasicMaterial;
  signalLight: THREE.PointLight;
} {
  const group = new THREE.Group();
  group.name = 'landmark:train_station';
  group.userData = { stationId: 'alderbrook_station' };

  const timberMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78, metalness: 0.04 }),
    'wood',
  );
  const darkWoodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x5c2b0c, roughness: 0.84, metalness: 0.04 }),
    'darkWood',
  );
  const roofMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.56, metalness: 0.16 }),
    'roofPrimary',
  );
  const trimMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xe2dcd0, roughness: 0.75 }),
    'trim',
  );
  const ironMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.38, metalness: 0.75 }),
    'metal',
  );
  const crateMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72 }),
    'crate',
  );

  // Raised wooden boarding deck (local +Z faces the track, local -Z faces town)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.34, 2.25), timberMat);
  deck.position.set(0, 0.17, 0);
  deck.receiveShadow = true;
  group.add(deck);

  // Timber deck edge beam + steps facing town (-Z)
  const edgeTrim = new THREE.Mesh(new THREE.BoxGeometry(5.26, 0.09, 0.16), trimMat);
  edgeTrim.position.set(0, 0.35, 1.06);
  group.add(edgeTrim);

  const step = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.45), darkWoodMat);
  step.position.set(0, 0.08, -1.32);
  group.add(step);

  // 4 Canopy support posts
  const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 2.15, 6);
  for (const [px, pz] of [
    [-2.05, -0.78],
    [2.05, -0.78],
    [-2.05, 0.65],
    [2.05, 0.65],
  ] as Array<[number, number]>) {
    const post = new THREE.Mesh(postGeo, darkWoodMat);
    post.position.set(px, 1.4, pz);
    group.add(post);
  }

  // Sloped wooden shelter canopy roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 2.35), roofMat);
  roof.position.set(0, 2.52, -0.05);
  roof.rotation.x = 0.14;
  group.add(roof);

  // Back windbreak wall + timetable board
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.35, 0.14), timberMat);
  backWall.position.set(0, 1.02, -0.82);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.18), trimMat);
  signBoard.position.set(0, 2.02, -0.82);
  group.add(backWall, signBoard);

  // Waiting bench & traveler's luggage trunk
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.1, 0.46), darkWoodMat);
  benchSeat.position.set(-0.7, 0.68, -0.35);
  const benchLegL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.42), ironMat);
  benchLegL.position.set(-1.35, 0.51, -0.35);
  const benchLegR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.42), ironMat);
  benchLegR.position.set(-0.05, 0.51, -0.35);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.42), crateMat);
  trunk.position.set(1.15, 0.55, -0.25);
  group.add(benchSeat, benchLegL, benchLegR, trunk);

  // Visual Signal Lantern Post at the platform edge (pulses on arrival & departure!)
  const signalPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.65, 6), ironMat);
  signalPost.position.set(2.38, 1.65, 0.85);
  const signalArm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), ironMat);
  signalArm.position.set(2.58, 2.9, 0.85);
  group.add(signalPost, signalArm);

  const signalLanternMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    }),
    'lantern',
  );
  lanternMaterials.push(signalLanternMat);

  const lanternBulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), signalLanternMat);
  lanternBulb.position.set(2.74, 2.66, 0.85);
  group.add(lanternBulb);

  // Expanding visual lantern ring pulse (zero extra draw calls when hidden)
  const signalHaloMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const signalHalo = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.38, 18), signalHaloMat);
  signalHalo.position.set(2.74, 2.66, 0.85);
  signalHalo.visible = false;
  group.add(signalHalo);

  const signalLight = new THREE.PointLight(0xfbbf24, 0, 10, 1.6);
  signalLight.position.set(2.74, 2.66, 0.85);
  signalLight.castShadow = false;
  group.add(signalLight);

  return { group, signalLanternMat, signalHalo, signalHaloMat, signalLight };
}

export function buildTownRailway(
  scene: THREE.Scene,
  lanternMaterials: THREE.MeshStandardMaterial[],
  initialTheme: TownTheme = 'meadow',
): TownRailwayHandle {
  const root = new THREE.Group();
  root.name = 'town:scenic_railway';
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Scenic closed perimeter loop outside the r=16 fence ring (r ~ 19.6)
  const controlPts: THREE.Vector3[] = [];
  const numPts = 16;
  for (let i = 0; i < numPts; i++) {
    const angle = (i / numPts) * Math.PI * 2;
    // Slight organic contour while staying comfortably outside all 8 plots and fences
    const r = 19.6 + Math.sin(angle * 2) * 0.45 + Math.cos(angle * 3) * 0.3;
    controlPts.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
  }
  const trackCurve = new THREE.CatmullRomCurve3(controlPts, true, 'catmullrom', 0.5);
  const trackLength = trackCurve.getLength();

  // Sample points once for fast tree/foliage clearance checks
  const clearanceSamples = trackCurve.getSpacedPoints(72);

  // 2. Gravel Ballast Bed (1 draw call)
  const ballastGeo = buildBallastRibbon(trackCurve, 128, 0.82);
  const ballastMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.95,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    'stone',
  );
  const ballastMesh = new THREE.Mesh(ballastGeo, ballastMat);
  ballastMesh.receiveShadow = true;
  root.add(ballastMesh);
  disposables.push(ballastGeo, ballastMat);

  // 3. Wooden Sleepers / Ties (1 InstancedMesh draw call)
  const tieCount = 136;
  const tieGeo = new THREE.BoxGeometry(1.32, 0.075, 0.22);
  const tieMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x5c2b0c, roughness: 0.88, metalness: 0.03 }),
    'darkWood',
  );
  const tiesMesh = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
  tiesMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tieCount; i++) {
    const u = i / tieCount;
    trackCurve.getPointAt(u, _pos);
    trackCurve.getTangentAt(u, _tan).normalize();
    dummy.position.set(_pos.x, 0.068, _pos.z);
    dummy.rotation.set(0, Math.atan2(_tan.x, _tan.z), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    tiesMesh.setMatrixAt(i, dummy.matrix);
  }
  tiesMesh.instanceMatrix.needsUpdate = true;
  tiesMesh.computeBoundingSphere();
  root.add(tiesMesh);
  disposables.push(tieGeo, tieMat);

  // 4. Twin Steel Rails (2 low-poly TubeGeometry draw calls)
  const railMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.85 }),
    'metal',
  );
  const innerRailCurve = buildOffsetRailCurve(trackCurve, 72, -0.42, 0.135);
  const outerRailCurve = buildOffsetRailCurve(trackCurve, 72, 0.42, 0.135);
  const innerRailGeo = new THREE.TubeGeometry(innerRailCurve, 128, 0.036, 5, true);
  const outerRailGeo = new THREE.TubeGeometry(outerRailCurve, 128, 0.036, 5, true);
  const innerRail = new THREE.Mesh(innerRailGeo, railMat);
  const outerRail = new THREE.Mesh(outerRailGeo, railMat);
  root.add(innerRail, outerRail);
  disposables.push(innerRailGeo, outerRailGeo, railMat);

  // 5. Wooden Train Station Platform tucked on the town-facing side of STATION_U
  const stationBuilt = buildTrainStation(lanternMaterials);
  const stationGroup = stationBuilt.group;
  trackCurve.getPointAt(STATION_U, _pos);
  trackCurve.getTangentAt(STATION_U, _tan).normalize();
  // Normal pointing toward town center (0, 0, 0)
  const toTown = new THREE.Vector3(-_pos.x, 0, -_pos.z).normalize();
  const stationPos = _pos.clone().addScaledVector(toTown, 2.05);
  stationGroup.position.set(stationPos.x, 0, stationPos.z);
  // Orient station +Z toward the track
  const stationYaw = Math.atan2(-toTown.x, -toTown.z);
  stationGroup.rotation.y = stationYaw;
  stationGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && !((obj as THREE.Mesh).material as THREE.Material).transparent) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  root.add(stationGroup);

  const stationFocusTarget = new THREE.Vector3(stationPos.x, 1.2, stationPos.z);
  const mainStationTrackPt = trackCurve.getPointAt(STATION_U).clone();

  // 5b. Connected Extended Outer Railway Loop & Outer Frontier Station (East Frontier)
  // Shares exact inner-loop control points from i=2 (SE, 45°) through i=14 (NE, 315°),
  // then smoothly branches outward through East Frontier & merges back into the inner loop!
  const extControlPts: THREE.Vector3[] = [];
  for (let i = 2; i <= 14; i++) {
    extControlPts.push(controlPts[i].clone());
  }
  const frontierTrackTarget = new THREE.Vector3(33.2, 0, 2.2);
  extControlPts.push(
    new THREE.Vector3(19.6, 0, -11.4),
    new THREE.Vector3(27.2, 0, -9.0),
    new THREE.Vector3(32.2, 0, -3.4),
    frontierTrackTarget.clone(),
    new THREE.Vector3(31.6, 0, 7.8),
    new THREE.Vector3(25.8, 0, 11.2),
    new THREE.Vector3(19.0, 0, 11.6),
  );
  const extendedLoopCurve = new THREE.CatmullRomCurve3(extControlPts, true, 'catmullrom', 0.5);
  const extendedTrackLength = extendedLoopCurve.getLength();

  const extMainStationU = findClosestCurveU(extendedLoopCurve, mainStationTrackPt);
  const extFrontierStationU = findClosestCurveU(extendedLoopCurve, frontierTrackTarget);
  const extBranchStartU = findClosestCurveU(extendedLoopCurve, controlPts[14]);

  // Sample exact points from extendedLoopCurve along the East outer branch [extBranchStartU -> 1.0]
  // so visible ballast, instanced sleepers, and steel rails align with the train's exact path!
  const outerArcPts: THREE.Vector3[] = [];
  const arcSampleCount = 44;
  for (let i = 0; i <= arcSampleCount; i++) {
    const u = extBranchStartU + (1.0 - extBranchStartU) * (i / arcSampleCount);
    outerArcPts.push(extendedLoopCurve.getPointAt(u % 1).clone());
  }
  const outerArcCurve = new THREE.CatmullRomCurve3(outerArcPts, false, 'catmullrom', 0.5);

  const spurGroup = new THREE.Group();
  spurGroup.name = 'railway:frontier_outer_loop';
  spurGroup.visible = false;

  const spurBallastGeo = buildBallastRibbon(outerArcCurve, 64, 0.86);
  const spurBallastMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.95,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    'stone',
  );
  const spurBallast = new THREE.Mesh(spurBallastGeo, spurBallastMat);
  spurBallast.receiveShadow = true;
  spurGroup.add(spurBallast);
  disposables.push(spurBallastGeo, spurBallastMat);

  // Instanced wooden sleepers along the connected outer railway arc (1 draw call!)
  const SPUR_TIES = 62;
  const spurTieGeo = new THREE.BoxGeometry(1.32, 0.075, 0.22);
  const spurTieMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x5c2b0c, roughness: 0.88, metalness: 0.03 }),
    'darkWood',
  );
  const spurTieMesh = new THREE.InstancedMesh(spurTieGeo, spurTieMat, SPUR_TIES);
  spurTieMesh.receiveShadow = true;
  const tieDummy = new THREE.Object3D();
  for (let i = 0; i < SPUR_TIES; i++) {
    const u = i / (SPUR_TIES - 1);
    outerArcCurve.getPointAt(u, _pos);
    outerArcCurve.getTangentAt(u, _tan).normalize();
    tieDummy.position.set(_pos.x, 0.068, _pos.z);
    tieDummy.rotation.set(0, Math.atan2(_tan.x, _tan.z), 0);
    tieDummy.scale.set(1, 1, 1);
    tieDummy.updateMatrix();
    spurTieMesh.setMatrixAt(i, tieDummy.matrix);
  }
  spurTieMesh.instanceMatrix.needsUpdate = true;
  spurTieMesh.computeBoundingSphere();
  spurGroup.add(spurTieMesh);
  disposables.push(spurTieGeo, spurTieMat);

  // Twin metallic steel rails along the outer connected loop (2 TubeGeometry draw calls)
  const spurRailMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.85 }),
    'metal',
  );
  for (const offset of [-0.42, 0.42]) {
    const railPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      outerArcCurve.getPointAt(u, _pos);
      outerArcCurve.getTangentAt(u, _tan).normalize();
      _side.crossVectors(_up, _tan).normalize();
      railPts.push(new THREE.Vector3(_pos.x + _side.x * offset, 0.135, _pos.z + _side.z * offset));
    }
    const rCurve = new THREE.CatmullRomCurve3(railPts, false, 'catmullrom', 0.5);
    const rGeo = new THREE.TubeGeometry(rCurve, 64, 0.036, 5, false);
    const rMesh = new THREE.Mesh(rGeo, spurRailMat);
    spurGroup.add(rMesh);
    disposables.push(rGeo);
  }
  disposables.push(spurRailMat);

  // Outer Frontier Station tucked alongside the extended loop's eastern straightaway
  const frontierPt = extendedLoopCurve.getPointAt(extFrontierStationU).clone();
  const frontierTan = extendedLoopCurve.getTangentAt(extFrontierStationU).normalize();
  const frontierOutward = new THREE.Vector3(frontierPt.x, 0, frontierPt.z).normalize();
  const depotCenter = frontierPt.clone().addScaledVector(frontierOutward, 2.25);
  const depotYaw = Math.atan2(frontierTan.x, frontierTan.z);

  const outerStationGroup = new THREE.Group();
  outerStationGroup.name = 'landmark:outer_frontier_station';
  outerStationGroup.userData = { stationId: 'outer_frontier_station' };
  outerStationGroup.position.set(depotCenter.x, 0, depotCenter.z);
  outerStationGroup.rotation.y = depotYaw;

  const depotWoodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78 }),
    'wood',
  );
  const depotDarkWoodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x5c2b0c, roughness: 0.85 }),
    'darkWood',
  );
  const depotRoofMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.56, metalness: 0.14 }),
    'roofSecondary',
  );
  const depotStoneMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.86 }),
    'stone',
  );
  const depotTrimMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xe2dcd0, roughness: 0.75 }),
    'trim',
  );
  const frontierSignalMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  lanternMaterials.push(frontierSignalMat);
  disposables.push(
    depotWoodMat,
    depotDarkWoodMat,
    depotRoofMat,
    depotStoneMat,
    depotTrimMat,
    frontierSignalMat,
  );

  // Raised Frontier boarding deck + trackside edge trim
  const platDeck = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.34, 5.2), depotStoneMat);
  platDeck.position.set(0, 0.17, 0);
  platDeck.receiveShadow = true;
  outerStationGroup.add(platDeck);

  const deckEdge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 5.26), depotTrimMat);
  deckEdge.position.set(-1.05, 0.35, 0);
  outerStationGroup.add(deckEdge);

  // 4 awning posts + sloped canopy roof + back wall + timetable board
  const pGeo = new THREE.CylinderGeometry(0.08, 0.09, 2.1, 6);
  for (const [px, pz] of [
    [-0.72, -1.95],
    [0.72, -1.95],
    [-0.72, 1.95],
    [0.72, 1.95],
  ] as Array<[number, number]>) {
    const post = new THREE.Mesh(pGeo, depotDarkWoodMat);
    post.position.set(px, 1.38, pz);
    outerStationGroup.add(post);
  }
  const depotRoof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 5.5), depotRoofMat);
  depotRoof.position.set(0.05, 2.48, 0);
  depotRoof.rotation.z = -0.14;
  outerStationGroup.add(depotRoof);

  const depotBack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.35, 3.2), depotWoodMat);
  depotBack.position.set(0.82, 1.0, 0);
  const depotSign = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 1.75), depotTrimMat);
  depotSign.position.set(0.82, 1.96, 0);
  outerStationGroup.add(depotBack, depotSign);

  // Cargo crates + waiting bench + Frontier Signal Lantern post
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 0.58), depotWoodMat);
  crate.position.set(0.24, 0.6, 1.65);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 1.55), depotDarkWoodMat);
  bench.position.set(0.32, 0.66, -0.55);
  outerStationGroup.add(crate, bench);

  const sigPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), depotStoneMat);
  sigPost.position.set(-0.82, 1.6, -2.32);
  outerStationGroup.add(sigPost);

  const sigLamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), frontierSignalMat);
  sigLamp.position.set(-0.82, 2.86, -2.32);
  outerStationGroup.add(sigLamp);

  const frontierHaloMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const frontierHalo = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.38, 18), frontierHaloMat);
  frontierHalo.position.set(-0.82, 2.86, -2.32);
  frontierHalo.visible = false;
  outerStationGroup.add(frontierHalo);

  const frontierSignalLight = new THREE.PointLight(0x22d3ee, 0, 11, 1.6);
  frontierSignalLight.position.set(-0.82, 2.86, -2.32);
  frontierSignalLight.castShadow = false;
  outerStationGroup.add(frontierSignalLight);
  disposables.push(frontierHaloMat, pGeo);

  spurGroup.add(outerStationGroup);
  root.add(spurGroup);
  const frontierDepotFocusTarget = new THREE.Vector3(depotCenter.x, 1.2, depotCenter.z);

  // 6. Steam Locomotive + 2 Passenger Carriages
  const consist = buildLocomotiveAndCarriages(lanternMaterials);
  const trainGroup = new THREE.Group();
  trainGroup.name = 'railway:train_consist';
  trainGroup.add(consist.locomotive, ...consist.carriages);
  trainGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  root.add(trainGroup);

  // 7. Rising Steam Puffs (THREE.Points with soft radial canvas sprite)
  const MAX_PUFFS = 28;
  const puffPositions = new Float32Array(MAX_PUFFS * 3);
  const puffAges = new Float32Array(MAX_PUFFS);
  const puffOrigins = new Float32Array(MAX_PUFFS * 3);
  const puffDrifts = new Float32Array(MAX_PUFFS * 2);
  for (let i = 0; i < MAX_PUFFS; i++) {
    puffAges[i] = i / MAX_PUFFS;
    puffPositions[i * 3 + 1] = -20; // Hidden below ground until emitted
  }
  const steamTex = createSoftSteamTexture();
  const puffGeo = new THREE.BufferGeometry();
  puffGeo.setAttribute('position', new THREE.BufferAttribute(puffPositions, 3));
  const puffMat = new THREE.PointsMaterial({
    map: steamTex,
    color: 0xf8fafc,
    size: 0.72,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const steamPoints = new THREE.Points(puffGeo, puffMat);
  steamPoints.frustumCulled = false;
  root.add(steamPoints);
  disposables.push(steamTex, puffGeo, puffMat);

  scene.add(root);

  // Extended 2-stop loop timing (10s stop at Alderbrook Station + proportional leg1 + 10s stop at Outer Frontier Station + proportional leg2)
  const EXT_MOVE_TOTAL = 52.0;
  const leg1UDelta = ((extFrontierStationU - extMainStationU) + 1) % 1;
  const leg2UDelta = 1.0 - leg1UDelta;
  const EXT_LEG1_DUR = EXT_MOVE_TOTAL * leg1UDelta;
  const EXT_LEG2_DUR = EXT_MOVE_TOTAL * leg2UDelta;
  const EXT_FRONTIER_STOP_START = STOP_DURATION + EXT_LEG1_DUR;
  const EXT_LEG2_START = EXT_FRONTIER_STOP_START + STOP_DURATION;
  const EXT_CYCLE_DURATION = EXT_LEG2_START + EXT_LEG2_DUR;

  // Start at 53s so the player gets to watch the train smoothly pull into Alderbrook Station ~7s after opening
  let cycleTime = 53.0;
  let extCycleTime = EXT_FRONTIER_STOP_START - 4.0;
  let activeQuality: GraphicsQuality = 'medium';
  let activeTheme: TownTheme = initialTheme;
  let railSpurEnabled = false;
  let triggerToggle = false;

  const placeCarOnCurve = (
    curve: THREE.CatmullRomCurve3,
    obj: THREE.Object3D,
    uRaw: number,
  ) => {
    const u = ((uRaw % 1) + 1) % 1;
    curve.getPointAt(u, _pos);
    curve.getTangentAt(u, _tan).normalize();
    obj.position.set(_pos.x, 0.14, _pos.z);
    _look.copy(_pos).add(_tan);
    _look.y = 0.14;
    obj.lookAt(_look);
  };

  // Initialize consist position immediately on inner loop
  const initSched = evaluateTrainSchedule(cycleTime);
  const initHeadU = (STATION_U + initSched.progress) % 1;
  placeCarOnCurve(trackCurve, consist.locomotive, initHeadU);
  consist.carriages.forEach((car, idx) => {
    const distBehind = idx === 0 ? 2.65 : 5.15;
    placeCarOnCurve(trackCurve, car, initHeadU - distBehind / trackLength);
  });

  const applyTheme = (theme: TownTheme) => {
    activeTheme = theme;
    applyThemeToObjectTree(root, theme);
    if (theme === 'fantasy_night') {
      puffMat.color.setHex(0xe0e7ff);
      stationBuilt.signalHaloMat.color.setHex(0xc084fc);
      stationBuilt.signalLight.color.setHex(0xc084fc);
      frontierHaloMat.color.setHex(0xc084fc);
      frontierSignalLight.color.setHex(0xc084fc);
    } else if (theme === 'solarpunk_oasis') {
      puffMat.color.setHex(0xfef3c7);
      stationBuilt.signalHaloMat.color.setHex(0x22d3ee);
      stationBuilt.signalLight.color.setHex(0x22d3ee);
      frontierHaloMat.color.setHex(0x2dd4bf);
      frontierSignalLight.color.setHex(0x2dd4bf);
    } else {
      puffMat.color.setHex(0xf8fafc);
      stationBuilt.signalHaloMat.color.setHex(0xfde047);
      stationBuilt.signalLight.color.setHex(0xfbbf24);
      frontierHaloMat.color.setHex(0x22d3ee);
      frontierSignalLight.color.setHex(0x22d3ee);
    }
  };

  if (initialTheme !== 'meadow') {
    applyTheme(initialTheme);
  }

  return {
    group: root,
    stationGroup,
    outerStationGroup,
    stationFocusTarget,
    frontierDepotFocusTarget,
    isNearTrackOrStation: (x: number, z: number, pad = 2.6) => {
      if (Math.hypot(x - stationPos.x, z - stationPos.z) < 4.5 + pad * 0.5) {
        return true;
      }
      if (Math.hypot(x - depotCenter.x, z - depotCenter.z) < 4.5 + pad * 0.5) {
        return true;
      }
      const padSq = pad * pad;
      for (let i = 0; i < clearanceSamples.length; i++) {
        const pt = clearanceSamples[i];
        const dx = x - pt.x;
        const dz = z - pt.z;
        if (dx * dx + dz * dz < padSq) {
          return true;
        }
      }
      return false;
    },
    triggerTrainNow: () => {
      if (railSpurEnabled) {
        // Alternate pulling into Outer Frontier Station (first!) and Alderbrook Station
        if (!triggerToggle) {
          extCycleTime = Math.max(STOP_DURATION + 1, EXT_FRONTIER_STOP_START - 4.2);
        } else {
          extCycleTime = Math.max(EXT_LEG2_START + 1, EXT_CYCLE_DURATION - 3.6);
        }
        triggerToggle = !triggerToggle;
      } else {
        // Smoothly pull into Alderbrook Station over ~3.2s, ring the signal lantern, and hold for 10s
        cycleTime = 56.8;
      }
    },
    setRailSpurBuilt: (enabled: boolean) => {
      const wasEnabled = railSpurEnabled;
      railSpurEnabled = enabled;
      spurGroup.visible = enabled;
      if (enabled && !wasEnabled) {
        // Seamlessly route the existing train onto the newly connected outer loop approaching Outer Frontier Station!
        extCycleTime = Math.max(STOP_DURATION + 1, EXT_FRONTIER_STOP_START - 5.5);
        triggerToggle = false;
      }
    },
    setGraphicsQuality: (quality: GraphicsQuality) => {
      activeQuality = quality;
      const enableShadows = quality === 'high';
      stationGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.castShadow = enableShadows;
      });
      outerStationGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.castShadow = enableShadows;
      });
      trainGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.castShadow = enableShadows;
      });
      puffGeo.setDrawRange(0, quality === 'low' ? 14 : MAX_PUFFS);
      if (quality === 'low') {
        stationBuilt.signalLight.intensity = 0;
        frontierSignalLight.intensity = 0;
      }
    },
    applyTheme,
    update: (delta: number, elapsed: number) => {
      let activeCurve = trackCurve;
      let activeLen = trackLength;
      let headU = 0;
      let linearSpeed = 0;
      let isStoppedAtMain = false;
      let mainStopElapsed = 0;
      let isStoppedAtFrontier = false;
      let frontierStopElapsed = 0;

      if (railSpurEnabled) {
        // Drive the existing steam locomotive + 2 carriages continuously on the connected outer railway loop!
        activeCurve = extendedLoopCurve;
        activeLen = extendedTrackLength;
        extCycleTime = (extCycleTime + delta) % EXT_CYCLE_DURATION;

        if (extCycleTime < STOP_DURATION) {
          // 10-second stop at Alderbrook Station
          headU = extMainStationU;
          linearSpeed = 0;
          isStoppedAtMain = true;
          mainStopElapsed = extCycleTime;
        } else if (extCycleTime < EXT_FRONTIER_STOP_START) {
          // Cruise clockwise from Alderbrook Station onto the connected East Outer Frontier Loop
          const leg = evaluateSmoothLeg(extCycleTime - STOP_DURATION, EXT_LEG1_DUR, 6.0, 6.0);
          headU = (extMainStationU + leg.s * leg1UDelta) % 1;
          linearSpeed = (leg.vNorm * (leg1UDelta * extendedTrackLength)) / EXT_LEG1_DUR;
        } else if (extCycleTime < EXT_LEG2_START) {
          // 10-second stop at the new Outer Frontier Station!
          headU = extFrontierStationU;
          linearSpeed = 0;
          isStoppedAtFrontier = true;
          frontierStopElapsed = extCycleTime - EXT_FRONTIER_STOP_START;
        } else {
          // Depart Outer Frontier Station, merge back onto inner loop, and pull into Alderbrook Station
          const leg = evaluateSmoothLeg(extCycleTime - EXT_LEG2_START, EXT_LEG2_DUR, 4.0, 4.5);
          headU = (extFrontierStationU + leg.s * leg2UDelta) % 1;
          linearSpeed = (leg.vNorm * (leg2UDelta * extendedTrackLength)) / EXT_LEG2_DUR;
        }
      } else {
        cycleTime = (cycleTime + delta) % CYCLE_DURATION;
        const sched = evaluateTrainSchedule(cycleTime);
        headU = (STATION_U + sched.progress) % 1;
        linearSpeed = (sched.speedNorm * trackLength) / MOVE_DURATION;
        isStoppedAtMain = sched.isStopped;
        mainStopElapsed = sched.stopElapsed;
      }

      const isStoppedAny = isStoppedAtMain || isStoppedAtFrontier;

      // 1. Place locomotive and 2 carriages smoothly along the active curve (inner or extended loop)
      placeCarOnCurve(activeCurve, consist.locomotive, headU);
      const carDist1 = 2.65 / activeLen;
      const carDist2 = 5.15 / activeLen;
      placeCarOnCurve(activeCurve, consist.carriages[0], headU - carDist1);
      placeCarOnCurve(activeCurve, consist.carriages[1], headU - carDist2);

      // 2. Rotate wheels proportional to linear speed
      const wheelRotStep = (linearSpeed / 0.24) * delta;
      if (wheelRotStep > 0.0001) {
        for (let i = 0; i < consist.wheels.length; i++) {
          consist.wheels[i].rotation.x += wheelRotStep;
        }
      }

      // 3. Alderbrook Station Signal Lantern Pulse (arrival 0-3.2s & departure 6.8-10s)
      const isMainRinging =
        isStoppedAtMain && (mainStopElapsed < 3.2 || mainStopElapsed > 6.8);
      if (isMainRinging) {
        const pulseWave = (elapsed * 2.4) % 1;
        const glowBoost = 0.65 + Math.sin(elapsed * 14.0) * 0.35;
        stationBuilt.signalLanternMat.emissiveIntensity = 1.4 + glowBoost * 1.1;
        stationBuilt.signalHalo.visible = true;
        const haloScale = 1.0 + pulseWave * 3.2;
        stationBuilt.signalHalo.scale.set(haloScale, haloScale, 1);
        stationBuilt.signalHalo.rotation.y = elapsed * 2.2;
        stationBuilt.signalHaloMat.opacity = (1 - pulseWave) * 0.78;
        if (activeQuality !== 'low') {
          stationBuilt.signalLight.intensity = 1.2 + glowBoost * 1.4;
        }
      } else if (isStoppedAtMain) {
        stationBuilt.signalLanternMat.emissiveIntensity = 1.15 + Math.sin(elapsed * 3.5) * 0.2;
        stationBuilt.signalHalo.visible = false;
        if (activeQuality !== 'low') {
          stationBuilt.signalLight.intensity = 0.85;
        }
      } else {
        stationBuilt.signalHalo.visible = false;
        if (activeQuality !== 'low') {
          const idleGlow = activeTheme === 'fantasy_night' ? 0.5 : 0.15;
          stationBuilt.signalLight.intensity = THREE.MathUtils.lerp(
            stationBuilt.signalLight.intensity,
            idleGlow,
            1 - Math.exp(-4 * delta),
          );
        }
      }

      // 3b. Outer Frontier Station Signal Lantern Pulse (when extended loop is active)
      if (railSpurEnabled) {
        const isFrontierRinging =
          isStoppedAtFrontier && (frontierStopElapsed < 3.2 || frontierStopElapsed > 6.8);
        if (isFrontierRinging) {
          const pulseWave = (elapsed * 2.4) % 1;
          const glowBoost = 0.65 + Math.sin(elapsed * 14.0) * 0.35;
          frontierSignalMat.emissiveIntensity = 1.5 + glowBoost * 1.1;
          frontierHalo.visible = true;
          const hs = 1.0 + pulseWave * 3.4;
          frontierHalo.scale.set(hs, hs, 1);
          frontierHalo.rotation.y = elapsed * 2.2;
          frontierHaloMat.opacity = (1 - pulseWave) * 0.82;
          if (activeQuality !== 'low') {
            frontierSignalLight.intensity = 1.3 + glowBoost * 1.4;
          }
        } else if (isStoppedAtFrontier) {
          frontierSignalMat.emissiveIntensity = 1.25 + Math.sin(elapsed * 3.8) * 0.2;
          frontierHalo.visible = false;
          if (activeQuality !== 'low') {
            frontierSignalLight.intensity = 0.95;
          }
        } else {
          frontierSignalMat.emissiveIntensity = 0.8 + Math.sin(elapsed * 2.4) * 0.18;
          frontierHalo.visible = false;
          if (activeQuality !== 'low') {
            const idleGlow = activeTheme === 'fantasy_night' ? 0.55 : 0.2;
            frontierSignalLight.intensity = THREE.MathUtils.lerp(
              frontierSignalLight.intensity,
              idleGlow,
              1 - Math.exp(-4 * delta),
            );
          }
        }
      }

      // 4. Rising Steam Puffs from Locomotive Smokestack (THREE.Points)
      consist.locomotive.updateMatrixWorld();
      consist.smokestackTip.getWorldPosition(_stackWorld);
      activeCurve.getTangentAt(headU, _tan).normalize();

      const activePuffCount = activeQuality === 'low' ? 14 : MAX_PUFFS;
      const speedRatio = Math.min(1.5, linearSpeed / 2.6);
      const puffRate = isStoppedAny ? 0.45 : 0.65 + speedRatio * 0.3;
      const puffAttr = puffGeo.getAttribute('position') as THREE.BufferAttribute;

      for (let i = 0; i < activePuffCount; i++) {
        let age = puffAges[i] + delta * puffRate;
        if (age >= 1.0) {
          age = age % 1.0;
          puffOrigins[i * 3] = _stackWorld.x + Math.sin(i * 12.7 + elapsed) * 0.06;
          puffOrigins[i * 3 + 1] = _stackWorld.y;
          puffOrigins[i * 3 + 2] = _stackWorld.z + Math.cos(i * 9.3 + elapsed) * 0.06;
          const trail = isStoppedAny ? 0.18 : 0.85;
          puffDrifts[i * 2] = -_tan.x * trail + Math.sin(i * 3.1) * 0.22;
          puffDrifts[i * 2 + 1] = -_tan.z * trail + Math.cos(i * 4.7) * 0.22;
        }
        puffAges[i] = age;

        _puffOrigin.set(puffOrigins[i * 3], puffOrigins[i * 3 + 1], puffOrigins[i * 3 + 2]);
        if (_puffOrigin.y <= 0.1) {
          puffPositions[i * 3] = _stackWorld.x;
          puffPositions[i * 3 + 1] = _stackWorld.y + age * 2.4;
          puffPositions[i * 3 + 2] = _stackWorld.z;
        } else {
          const rise = isStoppedAny ? 3.2 : 2.5;
          puffPositions[i * 3] =
            _puffOrigin.x + puffDrifts[i * 2] * age + Math.sin(elapsed * 2 + i) * 0.12 * age;
          puffPositions[i * 3 + 1] = _puffOrigin.y + age * rise;
          puffPositions[i * 3 + 2] =
            _puffOrigin.z + puffDrifts[i * 2 + 1] * age + Math.cos(elapsed * 1.8 + i) * 0.12 * age;
        }
      }
      puffMat.size = isStoppedAny ? 0.84 : 0.68;
      puffAttr.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(root);
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            if (!mat) continue;
            const idx = lanternMaterials.indexOf(mat as THREE.MeshStandardMaterial);
            if (idx !== -1) lanternMaterials.splice(idx, 1);
            mat.dispose();
          }
        }
      });
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
