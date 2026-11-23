import * as THREE from 'three';
import type { GraphicsQuality, TownTheme } from '../types/town.ts';
import { applyThemeToObjectTree, tagThemeMaterial } from './townThemes.ts';

export interface TownBusHandle {
  group: THREE.Group;
  busGroup: THREE.Group;
  busStopGroup: THREE.Group;
  busStopFocusTarget: THREE.Vector3;
  portalFocusTarget: THREE.Vector3;
  getBusCameraPose: (
    seat: 'window' | 'driver',
    outEye: THREE.Vector3,
    outLook: THREE.Vector3,
  ) => void;
  getBusRadarPos: () => { x: number; z: number; atStop: boolean };
  setDestinationName: (townName: string) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  applyTheme: (theme: TownTheme) => void;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

// Pre-allocated scratch math objects (zero per-frame GC on 4 GB RAM Android devices)
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();

const BUS_CYCLE_DURATION = 48.0;
const TOWN_STOP_DURATION = 7.5;
const OUTBOUND_DURATION = 16.5;
const PORTAL_STOP_DURATION = 5.0;
const RETURN_DURATION = BUS_CYCLE_DURATION - TOWN_STOP_DURATION - OUTBOUND_DURATION - PORTAL_STOP_DURATION;

function evaluateSmoothSegment(
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

function buildHighwayRibbon(
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

    const v0 = i * 2;
    const v1 = v0 + 1;
    positions[v0 * 3] = _pos.x - _side.x * halfWidth;
    positions[v0 * 3 + 1] = 0.032;
    positions[v0 * 3 + 2] = _pos.z - _side.z * halfWidth;
    positions[v1 * 3] = _pos.x + _side.x * halfWidth;
    positions[v1 * 3 + 1] = 0.032;
    positions[v1 * 3 + 2] = _pos.z + _side.z * halfWidth;

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

function drawSignCanvas(
  canvas: HTMLCanvasElement,
  title: string,
  subtitle: string,
  accentHex: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = accentHex;
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subtitle, w / 2, h * 0.3);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(title, w / 2, h * 0.68, w - 24);
}

/**
 * Low-poly Inter-Town Shuttle Bus, Town Bus Stop, and Frontier Highway Loop.
 * Features a hollow see-inside cabin (seats, steering wheel, dashboard, large clear windows)
 * so both Inside Window View and Driver Front POV look cleanly out onto Alderbrook & the frontier.
 */
export function buildTownShuttleBus(
  scene: THREE.Scene,
  lanternMaterials: THREE.MeshStandardMaterial[],
  initialTheme: TownTheme = 'meadow',
): TownBusHandle {
  const root = new THREE.Group();
  root.name = 'town:inter_town_bus_system';
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Highway Loop Curve (starts right past Town Bus Stop at SE inner edge -> curves out to Frontier Portal Arch -> loops cleanly back)
  const highwayPts = [
    new THREE.Vector3(12.2, 0, 8.8),  // u = 0.0: Town Bus Stop pickup bay
    new THREE.Vector3(17.8, 0, 12.2),
    new THREE.Vector3(24.8, 0, 14.8),
    new THREE.Vector3(33.5, 0, 16.4),
    new THREE.Vector3(41.5, 0, 16.0), // ~u = 0.45: Inter-Town Frontier Portal Arch
    new THREE.Vector3(44.2, 0, 21.8),
    new THREE.Vector3(36.8, 0, 27.6),
    new THREE.Vector3(24.5, 0, 27.2),
    new THREE.Vector3(13.8, 0, 23.2),
    new THREE.Vector3(9.4, 0, 15.8),
  ];
  const highwayCurve = new THREE.CatmullRomCurve3(highwayPts, true, 'catmullrom', 0.45);
  const highwayLength = highwayCurve.getLength();

  // Compute exact curve U for the Frontier Portal Arch
  const portalPoint = new THREE.Vector3(41.5, 0, 16.0);
  let portalU = 0.42;
  let bestPortalDistSq = Infinity;
  for (let i = 0; i < 240; i++) {
    const u = i / 240;
    highwayCurve.getPointAt(u, _pos);
    const dSq = (_pos.x - portalPoint.x) ** 2 + (_pos.z - portalPoint.z) ** 2;
    if (dSq < bestPortalDistSq) {
      bestPortalDistSq = dSq;
      portalU = u;
    }
  }
  const stopU = 0.0;

  // 2. Asphalt Highway Ribbon (1 draw call)
  const asphaltGeo = buildHighwayRibbon(highwayCurve, 112, 1.38);
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.92,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const asphaltMesh = new THREE.Mesh(asphaltGeo, asphaltMat);
  asphaltMesh.receiveShadow = true;
  root.add(asphaltMesh);
  disposables.push(asphaltGeo, asphaltMat);

  // 3. Instanced Dashed Yellow Centerline (1 draw call)
  const DASH_COUNT = 78;
  const dashGeo = new THREE.BoxGeometry(0.12, 0.015, 0.62);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.72 });
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, DASH_COUNT);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < DASH_COUNT; i++) {
    const u = i / DASH_COUNT;
    highwayCurve.getPointAt(u, _pos);
    highwayCurve.getTangentAt(u, _tan).normalize();
    dummy.position.set(_pos.x, 0.042, _pos.z);
    dummy.rotation.set(0, Math.atan2(_tan.x, _tan.z), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(i, dummy.matrix);
  }
  dashMesh.instanceMatrix.needsUpdate = true;
  dashMesh.computeBoundingSphere();
  root.add(dashMesh);
  disposables.push(dashGeo, dashMat);

  // 4. Instanced Roadside Guide Posts (1 draw call)
  const POST_COUNT = 32;
  const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.68, 6);
  postGeo.translate(0, 0.34, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 });
  const postMesh = new THREE.InstancedMesh(postGeo, postMat, POST_COUNT);
  let postIdx = 0;
  for (let i = 0; i < POST_COUNT; i++) {
    const u = ((i + 0.5) / POST_COUNT) % 1;
    highwayCurve.getPointAt(u, _pos);
    highwayCurve.getTangentAt(u, _tan).normalize();
    _side.crossVectors(_up, _tan).normalize();
    const bank = i % 2 === 0 ? 1.65 : -1.65;
    dummy.position.set(_pos.x + _side.x * bank, 0, _pos.z + _side.z * bank);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(postIdx++, dummy.matrix);
  }
  postMesh.instanceMatrix.needsUpdate = true;
  postMesh.computeBoundingSphere();
  root.add(postMesh);
  disposables.push(postGeo, postMat);

  // 5. Town Bus Stop Shelter at u = 0 (tucked cleanly beside the town curb)
  const busStopGroup = new THREE.Group();
  busStopGroup.name = 'landmark:bus_stop';
  busStopGroup.userData = { busStop: true };
  highwayCurve.getPointAt(stopU, _pos);
  highwayCurve.getTangentAt(stopU, _tan).normalize();
  _side.crossVectors(_up, _tan).normalize();
  // Place shelter on the town-facing left side of the bus bay
  const stopPos = _pos.clone().addScaledVector(_side, 2.35);
  busStopGroup.position.set(stopPos.x, 0, stopPos.z);
  busStopGroup.rotation.y = Math.atan2(_tan.x, _tan.z);

  const curbMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 }),
    'stone',
  );
  const shelterRoofMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45, metalness: 0.25 }),
    'roofSecondary',
  );
  const ironMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.38, metalness: 0.72 }),
    'metal',
  );
  const woodMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 }),
    'wood',
  );
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.24,
    roughness: 0.14,
    metalness: 0.1,
    depthWrite: false,
  });
  const busBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });
  lanternMaterials.push(busBeaconMat);
  disposables.push(curbMat, shelterRoofMat, ironMat, woodMat, glassMat, busBeaconMat);

  const curb = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.2, 3.6), curbMat);
  curb.position.set(0, 0.1, 0);
  curb.receiveShadow = true;
  busStopGroup.add(curb);

  const shelterPostGeo = new THREE.CylinderGeometry(0.055, 0.06, 2.05, 6);
  for (const [px, pz] of [
    [0.55, -1.3],
    [0.55, 1.3],
    [-0.55, -1.3],
    [-0.55, 1.3],
  ] as Array<[number, number]>) {
    const p = new THREE.Mesh(shelterPostGeo, ironMat);
    p.position.set(px, 1.2, pz);
    busStopGroup.add(p);
  }
  const shelterBackGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.55, 2.45), glassMat);
  shelterBackGlass.position.set(0.55, 1.15, 0);
  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.14, 3.3), shelterRoofMat);
  shelterRoof.position.set(0, 2.28, 0);
  shelterRoof.rotation.z = 0.08;
  const stopBench = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 1.7), woodMat);
  stopBench.position.set(0.18, 0.56, 0);
  const stopSignPole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.45, 6), ironMat);
  stopSignPole.position.set(-0.55, 1.4, 1.6);
  const stopSignHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.72), shelterRoofMat);
  stopSignHead.position.set(-0.55, 2.42, 1.6);
  const stopLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), busBeaconMat);
  stopLantern.position.set(-0.55, 2.78, 1.6);
  busStopGroup.add(shelterBackGlass, shelterRoof, stopBench, stopSignPole, stopSignHead, stopLantern);
  root.add(busStopGroup);
  const busStopFocusTarget = new THREE.Vector3(stopPos.x, 1.2, stopPos.z);

  // 6. Inter-Town Frontier Portal Arch at portalU with Dynamic Destination CanvasTexture
  const portalGroup = new THREE.Group();
  portalGroup.name = 'landmark:inter_town_bus_portal';
  highwayCurve.getPointAt(portalU, _pos);
  highwayCurve.getTangentAt(portalU, _tan).normalize();
  portalGroup.position.set(_pos.x, 0, _pos.z);
  portalGroup.rotation.y = Math.atan2(_tan.x, _tan.z);

  const portalPillarGeo = new THREE.BoxGeometry(0.75, 4.2, 0.75);
  const pLeft = new THREE.Mesh(portalPillarGeo, curbMat);
  pLeft.position.set(-2.35, 2.1, 0);
  const pRight = new THREE.Mesh(portalPillarGeo, curbMat);
  pRight.position.set(2.35, 2.1, 0);
  const pBeam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.52, 0.82), ironMat);
  pBeam.position.set(0, 4.25, 0);
  portalGroup.add(pLeft, pRight, pBeam);

  const portalCanvas = document.createElement('canvas');
  portalCanvas.width = 384;
  portalCanvas.height = 96;
  drawSignCanvas(portalCanvas, 'FRONTIER HIGHWAY →', 'INTER-TOWN SHUTTLE', '#38bdf8');
  const portalSignTex = new THREE.CanvasTexture(portalCanvas);
  portalSignTex.colorSpace = THREE.SRGBColorSpace;
  const portalSignMat = new THREE.MeshStandardMaterial({
    map: portalSignTex,
    roughness: 0.3,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25,
  });
  const portalSign = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.05, 0.16), portalSignMat);
  portalSign.position.set(0, 4.92, 0);
  const portalOrbGeo = new THREE.OctahedronGeometry(0.22, 0);
  const pOrbL = new THREE.Mesh(portalOrbGeo, busBeaconMat);
  pOrbL.position.set(-2.35, 4.6, 0);
  const pOrbR = new THREE.Mesh(portalOrbGeo, busBeaconMat);
  pOrbR.position.set(2.35, 4.6, 0);
  portalGroup.add(portalSign, pOrbL, pOrbR);
  root.add(portalGroup);
  disposables.push(portalPillarGeo, portalSignTex, portalSignMat, portalOrbGeo);
  const portalFocusTarget = new THREE.Vector3(_pos.x, 2.0, _pos.z);

  // 7. Hollow See-Inside Low-Poly Shuttle Bus (local +Z = forward travel direction!)
  const busGroup = new THREE.Group();
  busGroup.name = 'vehicle:shuttle_bus';
  busGroup.userData = { shuttleBus: true };

  const busBodyMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // Warm golden-amber civic shuttle livery
    roughness: 0.42,
    metalness: 0.15,
  });
  const busStripeMat = new THREE.MeshStandardMaterial({
    color: 0x0f766e,
    roughness: 0.48,
    metalness: 0.18,
  });
  const busRoofMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.52,
    metalness: 0.1,
  });
  const cabinFloorMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.88,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.72,
  });
  const consoleDashMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.62,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.32,
    metalness: 0.75,
  });
  const headLightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfde047,
    emissiveIntensity: 1.0,
    roughness: 0.2,
  });
  const tailLightMat = new THREE.MeshStandardMaterial({
    color: 0xfca5a5,
    emissive: 0xef4444,
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  const dashGlowMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.7,
    roughness: 0.25,
  });
  lanternMaterials.push(headLightMat, tailLightMat);
  disposables.push(
    busBodyMat,
    busStripeMat,
    busRoofMat,
    cabinFloorMat,
    seatMat,
    consoleDashMat,
    tireMat,
    hubMat,
    headLightMat,
    tailLightMat,
    dashGlowMat,
  );

  // Bus chassis floor (y = 0.44) & lower body panels (hollow interior above y = 1.05!)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 3.65), cabinFloorMat);
  floor.position.set(0, 0.46, 0);
  busGroup.add(floor);

  // Lower left & right side skirts (y: 0.48 -> 1.08, leaving huge clear window opening above!)
  const sideSkirtGeo = new THREE.BoxGeometry(0.1, 0.62, 3.62);
  const skirtL = new THREE.Mesh(sideSkirtGeo, busBodyMat);
  skirtL.position.set(-0.73, 0.78, 0);
  const skirtR = new THREE.Mesh(sideSkirtGeo, busBodyMat);
  skirtR.position.set(0.73, 0.78, 0);
  // Teal livery belt stripe along both sides
  const stripeGeo = new THREE.BoxGeometry(0.115, 0.16, 3.64);
  const stripeL = new THREE.Mesh(stripeGeo, busStripeMat);
  stripeL.position.set(-0.735, 0.92, 0);
  const stripeR = new THREE.Mesh(stripeGeo, busStripeMat);
  stripeR.position.set(0.735, 0.92, 0);
  busGroup.add(skirtL, skirtR, stripeL, stripeR);

  // Lower front nose apron & rear engine wall
  const frontApron = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.64, 0.14), busBodyMat);
  frontApron.position.set(0, 0.79, 1.78);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, 0.2), ironMat);
  frontBumper.position.set(0, 0.42, 1.85);
  const rearWallLow = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.72, 0.14), busBodyMat);
  rearWallLow.position.set(0, 0.84, -1.78);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, 0.18), ironMat);
  rearBumper.position.set(0, 0.42, -1.85);
  busGroup.add(frontApron, frontBumper, rearWallLow, rearBumper);

  // Thin structural window pillars framing large open side & front windows
  const pillarGeo = new THREE.BoxGeometry(0.08, 0.86, 0.09);
  for (const px of [-0.73, 0.73]) {
    for (const pz of [-1.74, -0.62, 0.56, 1.74]) {
      const pil = new THREE.Mesh(pillarGeo, busBodyMat);
      pil.position.set(px, 1.5, pz);
      busGroup.add(pil);
    }
  }

  // Clear low-opacity glass panes (side windows, rear window, and panoramic front windshield)
  const sideWinGeo = new THREE.BoxGeometry(0.025, 0.76, 3.36);
  const winL = new THREE.Mesh(sideWinGeo, glassMat);
  winL.position.set(-0.73, 1.5, 0);
  const winR = new THREE.Mesh(sideWinGeo, glassMat);
  winR.position.set(0.73, 1.5, 0);
  const frontWindshield = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.76, 0.03), glassMat);
  frontWindshield.position.set(0, 1.5, 1.78);
  const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.66, 0.03), glassMat);
  rearWindow.position.set(0, 1.52, -1.78);
  busGroup.add(winL, winR, frontWindshield, rearWindow);

  // Roof cap + roof AC pod + glowing route header box
  const busRoof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.14, 3.74), busRoofMat);
  busRoof.position.set(0, 1.98, 0);
  const acUnit = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 1.15), curbMat);
  acUnit.position.set(0, 2.13, -0.15);
  const routeHeader = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.18, 0.14), consoleDashMat);
  routeHeader.position.set(0, 1.92, 1.84);
  const routeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.09, 0.04), busBeaconMat);
  routeGlow.position.set(0, 1.92, 1.91);
  busGroup.add(busRoof, acUnit, routeHeader, routeGlow);

  // Headlights & Taillights
  const lightGeo = new THREE.BoxGeometry(0.24, 0.14, 0.06);
  for (const lx of [-0.52, 0.52]) {
    const hl = new THREE.Mesh(lightGeo, headLightMat);
    hl.position.set(lx, 0.68, 1.86);
    const tl = new THREE.Mesh(lightGeo, tailLightMat);
    tl.position.set(lx, 0.72, -1.86);
    busGroup.add(hl, tl);
  }

  // --- SEE-INSIDE INTERIOR: Dashboard, Steering Wheel, Driver Seat & 6 Passenger Seats ---
  const dashboard = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.24, 0.36), consoleDashMat);
  dashboard.position.set(0, 1.04, 1.5);
  const gaugeCluster = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), dashGlowMat);
  gaugeCluster.position.set(-0.34, 1.15, 1.38);
  busGroup.add(dashboard, gaugeCluster);

  // Steering column & angled steering wheel (visible in Driver Front POV!)
  const steerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 6), ironMat);
  steerCol.position.set(-0.34, 1.08, 1.34);
  steerCol.rotation.x = -0.68;
  const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.026, 6, 12), consoleDashMat);
  steerWheel.position.set(-0.34, 1.21, 1.21);
  steerWheel.rotation.x = 0.85;
  busGroup.add(steerCol, steerWheel);

  // Seats (driver + 6 passenger seats facing +Z along left & right aisles)
  const seatCushionGeo = new THREE.BoxGeometry(0.46, 0.1, 0.42);
  const seatBackGeo = new THREE.BoxGeometry(0.46, 0.48, 0.09);
  const addSeat = (sx: number, sz: number) => {
    const cush = new THREE.Mesh(seatCushionGeo, seatMat);
    cush.position.set(sx, 0.76, sz);
    const back = new THREE.Mesh(seatBackGeo, seatMat);
    back.position.set(sx, 1.02, sz - 0.18);
    busGroup.add(cush, back);
  };
  addSeat(-0.36, 0.88); // Driver seat
  for (const sz of [0.18, -0.58, -1.32]) {
    addSeat(-0.42, sz);
    addSeat(0.42, sz);
  }

  // Two stylized commuter passengers sitting inside the bus cabin (visible through clear windows)
  const passengerGroup = new THREE.Group();
  const paxSkinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.7 });
  const paxCoatA = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.75 });
  const paxCoatB = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.75 });
  const paxHeadGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const paxTorsoGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.36, 6);
  disposables.push(paxSkinMat, paxCoatA, paxCoatB, paxHeadGeo, paxTorsoGeo);

  const makePassenger = (px: number, pz: number, coatMat: THREE.MeshStandardMaterial) => {
    const p = new THREE.Group();
    p.position.set(px, 0.82, pz);
    const torso = new THREE.Mesh(paxTorsoGeo, coatMat);
    torso.position.y = 0.18;
    const head = new THREE.Mesh(paxHeadGeo, paxSkinMat);
    head.position.y = 0.46;
    p.add(torso, head);
    return p;
  };
  const pax1 = makePassenger(0.42, 0.18, paxCoatA);
  const pax2 = makePassenger(0.42, -1.32, paxCoatB);
  passengerGroup.add(pax1, pax2);
  busGroup.add(passengerGroup);

  // 4 Rotating Bus Wheels
  const busWheels: THREE.Group[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.2, 0.32, 0.08);
  for (const [wx, wz] of [
    [-0.78, 1.15],
    [0.78, 1.15],
    [-0.78, -1.12],
    [0.78, -1.12],
  ] as Array<[number, number]>) {
    const wg = new THREE.Group();
    wg.position.set(wx, 0.32, wz);
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wg.add(tire, hub);
    busWheels.push(wg);
    busGroup.add(wg);
  }
  disposables.push(
    sideSkirtGeo,
    stripeGeo,
    pillarGeo,
    sideWinGeo,
    lightGeo,
    seatCushionGeo,
    seatBackGeo,
    wheelGeo,
    hubGeo,
    shelterPostGeo,
  );

  root.add(busGroup);
  scene.add(root);

  let cycleTime = 4.5; // Starts near departure from Town Bus Stop so players immediately see it!
  let busPosX = stopPos.x;
  let busPosZ = stopPos.z;
  let isAtStop = true;

  const placeBusAtU = (uRaw: number) => {
    const u = ((uRaw % 1) + 1) % 1;
    highwayCurve.getPointAt(u, _pos);
    highwayCurve.getTangentAt(u, _tan).normalize();
    busGroup.position.set(_pos.x, 0.02, _pos.z);
    _look.copy(_pos).add(_tan);
    _look.y = 0.02;
    busGroup.lookAt(_look);
    busPosX = _pos.x;
    busPosZ = _pos.z;
  };
  placeBusAtU(stopU);

  const applyTheme = (theme: TownTheme) => {
    applyThemeToObjectTree(root, theme);
    if (theme === 'fantasy_night') {
      asphaltMat.color.setHex(0x1e293b);
    } else if (theme === 'solarpunk_oasis') {
      asphaltMat.color.setHex(0x475569);
    } else {
      asphaltMat.color.setHex(0x334155);
    }
  };

  if (initialTheme !== 'meadow') {
    applyTheme(initialTheme);
  }

  return {
    group: root,
    busGroup,
    busStopGroup,
    busStopFocusTarget,
    portalFocusTarget,
    getBusCameraPose: (
      seat: 'window' | 'driver',
      outEye: THREE.Vector3,
      outLook: THREE.Vector3,
    ) => {
      busGroup.updateMatrixWorld();
      if (seat === 'driver') {
        // Mode 2: First-person Driver POV right behind the steering wheel & front windshield
        outEye.set(-0.32, 1.48, 0.92).applyMatrix4(busGroup.matrixWorld);
        outLook.set(-0.28, 1.24, 12.5).applyMatrix4(busGroup.matrixWorld);
      } else {
        // Mode 1: Inside Passenger Cabin looking out through the large side window at passing scenery
        outEye.set(-0.28, 1.42, -0.52).applyMatrix4(busGroup.matrixWorld);
        outLook.set(7.2, 1.22, 0.65).applyMatrix4(busGroup.matrixWorld);
      }
    },
    getBusRadarPos: () => ({
      x: busPosX,
      z: busPosZ,
      atStop: isAtStop,
    }),
    setDestinationName: (townName: string) => {
      const clean = (townName || '').trim();
      const label = clean ? `TO ${clean.toUpperCase().slice(0, 16)} →` : 'FRONTIER HIGHWAY →';
      drawSignCanvas(portalCanvas, label, 'INTER-TOWN SHUTTLE', '#38bdf8');
      portalSignTex.needsUpdate = true;
    },
    setGraphicsQuality: (quality: GraphicsQuality) => {
      const cast = quality === 'high';
      busGroup.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.Material).transparent) {
          o.castShadow = cast;
        }
      });
      postMesh.count = quality === 'low' ? Math.floor(POST_COUNT * 0.5) : POST_COUNT;
    },
    applyTheme,
    update: (delta: number, elapsed: number) => {
      cycleTime = (cycleTime + delta) % BUS_CYCLE_DURATION;
      let busU = stopU;
      let linearSpeed = 0;

      const tOutboundEnd = TOWN_STOP_DURATION + OUTBOUND_DURATION;
      const tPortalEnd = tOutboundEnd + PORTAL_STOP_DURATION;

      if (cycleTime < TOWN_STOP_DURATION) {
        busU = stopU;
        linearSpeed = 0;
        isAtStop = true;
        // Commuters board mid-way through town stop
        pax1.visible = cycleTime > 2.2;
        pax2.visible = cycleTime > 4.0;
      } else if (cycleTime < tOutboundEnd) {
        isAtStop = false;
        pax1.visible = true;
        pax2.visible = true;
        const leg = evaluateSmoothSegment(cycleTime - TOWN_STOP_DURATION, OUTBOUND_DURATION, 3.2, 3.2);
        busU = (stopU + leg.s * portalU) % 1;
        linearSpeed = (leg.vNorm * (portalU * highwayLength)) / OUTBOUND_DURATION;
      } else if (cycleTime < tPortalEnd) {
        busU = portalU;
        linearSpeed = 0;
        isAtStop = true;
        // Commuters disembark at frontier portal for the next town, then new visitors board
        pax1.visible = cycleTime > tOutboundEnd + 2.4;
        pax2.visible = cycleTime < tOutboundEnd + 2.0;
      } else {
        isAtStop = false;
        pax1.visible = true;
        pax2.visible = false;
        const remU = 1.0 - portalU;
        const leg = evaluateSmoothSegment(cycleTime - tPortalEnd, RETURN_DURATION, 3.5, 3.8);
        busU = (portalU + leg.s * remU) % 1;
        linearSpeed = (leg.vNorm * (remU * highwayLength)) / RETURN_DURATION;
      }

      placeBusAtU(busU);

      // Gentle bus cabin suspension bounce while moving
      if (linearSpeed > 0.1) {
        busGroup.position.y = 0.02 + Math.abs(Math.sin(elapsed * 9.0)) * 0.022;
      }

      // Rotate all 4 wheels proportional to road speed
      const wheelStep = (linearSpeed / 0.32) * delta;
      if (wheelStep > 0.0001) {
        for (let i = 0; i < busWheels.length; i++) {
          busWheels[i].rotation.x += wheelStep;
        }
      }

      // Subtle blinking amber stop beacon when boarding
      busBeaconMat.emissiveIntensity = isAtStop
        ? 0.9 + Math.sin(elapsed * 8.0) * 0.45
        : 0.55;
    },
    dispose: () => {
      for (const m of [busBeaconMat, headLightMat, tailLightMat]) {
        const idx = lanternMaterials.indexOf(m);
        if (idx !== -1) lanternMaterials.splice(idx, 1);
      }
      scene.remove(root);
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            mat?.dispose();
          }
        }
      });
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
