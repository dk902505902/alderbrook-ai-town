import * as THREE from 'three';
import type { CustomBuildingStyle, GraphicsQuality, PlotId, StructureType, TownStructure, TownTheme } from '../types/town.ts';
import { createClothWaveMaterial, createWindSwayMaterial, type WindUniforms } from './townEnvironment.ts';
import { applyThemeToObjectTree, tagThemeMaterial, type ThemeMaterialRole } from './townThemes.ts';

function addPart(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addContactShadow(
  parent: THREE.Group,
  shadowTex: THREE.Texture,
  size: number,
): void {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  parent.add(shadow);
}

function createWindowMat(
  lanternMaterials: THREE.MeshStandardMaterial[],
  tint = 0xfef3c7,
  emissive = 0xf59e0b,
  role: ThemeMaterialRole = 'window',
): THREE.MeshStandardMaterial {
  const mat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: tint,
      emissive,
      emissiveIntensity: 0.25,
      roughness: 0.28,
    }),
    role,
  );
  lanternMaterials.push(mat);
  return mat;
}

/**
 * Builds 4 hollow exterior walls around a rectangular footprint so the building interior
 * is clearly visible when its roof fades to opacity 0.15.
 */
function addHollowBoxWalls(
  parent: THREE.Group,
  width: number,
  height: number,
  depth: number,
  baseY: number,
  thickness: number,
  wallMat: THREE.Material,
  floorMat: THREE.Material,
): void {
  const cy = baseY + height / 2;
  // Floor slab
  addPart(parent, new THREE.BoxGeometry(width - thickness * 0.4, 0.06, depth - thickness * 0.4), floorMat, 0, baseY + 0.03, 0);
  // Back wall (-Z)
  addPart(parent, new THREE.BoxGeometry(width, height, thickness), wallMat, 0, cy, -depth / 2 + thickness / 2);
  // Front wall (+Z)
  addPart(parent, new THREE.BoxGeometry(width, height, thickness), wallMat, 0, cy, depth / 2 - thickness / 2);
  // Left wall (-X)
  addPart(parent, new THREE.BoxGeometry(thickness, height, depth - thickness * 2), wallMat, -width / 2 + thickness / 2, cy, 0);
  // Right wall (+X)
  addPart(parent, new THREE.BoxGeometry(thickness, height, depth - thickness * 2), wallMat, width / 2 - thickness / 2, cy, 0);
}

function addWoodenTable(
  parent: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  w: number,
  d: number,
  woodMat: THREE.Material,
): void {
  addPart(parent, new THREE.BoxGeometry(w, 0.08, d), woodMat, x, baseY + 0.42, z);
  const lx = w * 0.38;
  const lz = d * 0.36;
  const legGeo = new THREE.BoxGeometry(0.07, 0.4, 0.07);
  addPart(parent, legGeo, woodMat, x - lx, baseY + 0.2, z - lz);
  addPart(parent, legGeo, woodMat, x + lx, baseY + 0.2, z - lz);
  addPart(parent, legGeo, woodMat, x - lx, baseY + 0.2, z + lz);
  addPart(parent, legGeo, woodMat, x + lx, baseY + 0.2, z + lz);
}

function addWallShelf(
  parent: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  rotY: number,
  woodMat: THREE.Material,
  itemMat: THREE.Material,
): void {
  const shelf = new THREE.Group();
  shelf.position.set(x, baseY, z);
  shelf.rotation.y = rotY;
  addPart(shelf, new THREE.BoxGeometry(0.76, 0.92, 0.05), woodMat, 0, 0.46, -0.1);
  addPart(shelf, new THREE.BoxGeometry(0.74, 0.05, 0.22), woodMat, 0, 0.34, 0);
  addPart(shelf, new THREE.BoxGeometry(0.74, 0.05, 0.22), woodMat, 0, 0.66, 0);
  // Small props / loaves / jars / books
  addPart(shelf, new THREE.BoxGeometry(0.18, 0.16, 0.14), itemMat, -0.2, 0.45, 0.01);
  addPart(shelf, new THREE.BoxGeometry(0.22, 0.14, 0.14), itemMat, 0.14, 0.44, 0.01);
  addPart(shelf, new THREE.BoxGeometry(0.16, 0.18, 0.13), itemMat, -0.14, 0.78, 0.01);
  addPart(shelf, new THREE.BoxGeometry(0.18, 0.14, 0.13), itemMat, 0.18, 0.76, 0.01);
  parent.add(shelf);
}

function addCozyBed(
  parent: THREE.Group,
  x: number,
  baseY: number,
  z: number,
  rotY: number,
  woodMat: THREE.Material,
  blanketMat: THREE.Material,
  pillowMat: THREE.Material,
): void {
  const bed = new THREE.Group();
  bed.position.set(x, baseY, z);
  bed.rotation.y = rotY;
  addPart(bed, new THREE.BoxGeometry(0.66, 0.18, 1.05), woodMat, 0, 0.12, 0);
  addPart(bed, new THREE.BoxGeometry(0.68, 0.44, 0.08), woodMat, 0, 0.25, -0.5);
  addPart(bed, new THREE.BoxGeometry(0.58, 0.14, 0.94), pillowMat, 0, 0.26, 0.02);
  addPart(bed, new THREE.BoxGeometry(0.6, 0.15, 0.64), blanketMat, 0, 0.275, 0.17);
  addPart(bed, new THREE.BoxGeometry(0.42, 0.1, 0.22), pillowMat, 0, 0.36, -0.32);
  parent.add(bed);
}

export function buildEmptyPlotMesh(
  plotId: PlotId,
  isSelected: boolean,
  theme: TownTheme = 'meadow',
): THREE.Group {
  const group = new THREE.Group();
  group.userData.plotId = plotId;

  const padMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: isSelected ? 0xc2b280 : 0x9ca3af,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    'stone',
  );
  const pad = addPart(group, new THREE.CylinderGeometry(1.85, 1.95, 0.05, 8), padMat, 0, 0.025, 0);
  pad.rotation.y = Math.PI / 8;

  const stakeMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: isSelected ? 0xf59e0b : 0x78350f,
      roughness: 0.85,
    }),
    isSelected ? 'gold' : 'wood',
  );
  const offsets: Array<[number, number]> = [
    [-1.15, -1.15],
    [1.15, -1.15],
    [-1.15, 1.15],
    [1.15, 1.15],
  ];
  const stakeGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.42, 6);
  for (const [sx, sz] of offsets) {
    addPart(group, stakeGeo, stakeMat, sx, 0.21, sz);
  }

  // Thin selection border ring when highlighted
  if (isSelected) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const ring = addPart(group, new THREE.RingGeometry(1.72, 1.92, 24), ringMat, 0, 0.04, 0, -Math.PI / 2);
    ring.rotation.x = -Math.PI / 2;
  }

  // Raycast hit proxy so tapping anywhere in the plot works reliably
  const hitProxy = addPart(
    group,
    new THREE.CylinderGeometry(1.9, 1.9, 1.1, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
    0,
    0.55,
    0,
  );
  hitProxy.userData.plotId = plotId;

  if (theme !== 'meadow') {
    applyThemeToObjectTree(group, theme);
  }
  return group;
}

export function buildScaffoldingMesh(
  structure: TownStructure,
  shadowTex: THREE.Texture,
  isSelected: boolean,
  theme: TownTheme = 'meadow',
): THREE.Group {
  const group = new THREE.Group();
  group.userData.plotId = structure.plotId;
  addContactShadow(group, shadowTex, 4.4);

  const stoneMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 }), 'stone');
  const timberMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.84 }), 'wood');
  const coreMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 }), 'wall');

  // Foundation plinth
  addPart(group, new THREE.BoxGeometry(2.6, 0.24, 2.6), stoneMat, 0, 0.12, 0);

  // Rising masonry proportional to construction progress (15%..95%)
  const ratio = Math.max(0.2, Math.min(1, structure.progress / 100));
  const coreH = 0.5 + ratio * 1.45;
  addPart(group, new THREE.BoxGeometry(1.75, coreH, 1.75), coreMat, 0, 0.24 + coreH / 2, 0);

  // 4 corner timber scaffolding poles
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6);
  const corners: Array<[number, number]> = [
    [-1.12, -1.12],
    [1.12, -1.12],
    [-1.12, 1.12],
    [1.12, 1.12],
  ];
  for (const [cx, cz] of corners) {
    addPart(group, poleGeo, timberMat, cx, 1.2, cz);
  }

  // Horizontal scaffold beams
  const beamGeo = new THREE.BoxGeometry(2.34, 0.08, 0.08);
  addPart(group, beamGeo, timberMat, 0, 1.25, 1.12);
  addPart(group, beamGeo, timberMat, 0, 1.25, -1.12);
  addPart(group, beamGeo, timberMat, 0, 2.05, 1.12);
  addPart(group, beamGeo, timberMat, 0, 2.05, -1.12);

  // Blueprint sign post
  const signPost = addPart(group, new THREE.BoxGeometry(0.68, 0.44, 0.08), timberMat, 0, 0.72, 1.38);
  signPost.rotation.x = -0.15;

  if (isSelected) {
    const ring = addPart(
      group,
      new THREE.RingGeometry(1.85, 2.05, 24),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide }),
      0,
      0.04,
      0,
      -Math.PI / 2,
    );
    ring.rotation.x = -Math.PI / 2;
  }

  if (theme !== 'meadow') {
    applyThemeToObjectTree(group, theme);
  }
  return group;
}

export function buildCompletedStructureMesh(
  structure: TownStructure,
  shadowTex: THREE.Texture,
  lanternMaterials: THREE.MeshStandardMaterial[],
  isSelected: boolean,
  windUniforms?: WindUniforms,
  theme: TownTheme = 'meadow',
): THREE.Group {
  const group = new THREE.Group();
  group.userData.plotId = structure.plotId;
  addContactShadow(group, shadowTex, 4.8);

  const plinthMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 }), 'stone');
  const woodMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 }), 'wood');
  const interiorFloorMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.86 }), 'wood');
  const interiorWoodMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78 }), 'darkWood');
  const hearthStoneMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }), 'stone');
  const pillowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.82 });
  const breadItemMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72 });
  const winMat = createWindowMat(lanternMaterials);

  const cutawayRoofMaterials: THREE.MeshStandardMaterial[] = [];
  const interiorFireMats: THREE.MeshStandardMaterial[] = [];

  const createFireGlowMat = (): THREE.MeshStandardMaterial => {
    const fm = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf97316,
      emissiveIntensity: 1.65,
      roughness: 0.25,
    });
    interiorFireMats.push(fm);
    return fm;
  };

  const type: StructureType = structure.structureType;

  if (type === 'bakery') {
    const brickMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.78 }), 'wall');
    const roofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 }), 'roofPrimary');
    const chimneyWoodMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 }), 'wood');
    const chimneyCapMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 }), 'stone');
    const awningMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 }), 'banner');
    cutawayRoofMaterials.push(roofMat, chimneyWoodMat, chimneyCapMat);

    addPart(group, new THREE.BoxGeometry(2.6, 0.24, 2.4), plinthMat, 0, 0.12, 0);
    // Hollow exterior walls so the glowing bread oven & counter are visible inside
    addHollowBoxWalls(group, 2.3, 1.55, 2.0, 0.24, 0.14, brickMat, interiorFloorMat);

    // Interior: Warm Glowing Brick Bread Oven (back-right corner beneath chimney)
    addPart(group, new THREE.BoxGeometry(0.76, 0.96, 0.68), hearthStoneMat, 0.58, 0.74, -0.48);
    addPart(group, new THREE.CylinderGeometry(0.32, 0.36, 0.42, 8), hearthStoneMat, 0.58, 1.38, -0.48);
    addPart(group, new THREE.BoxGeometry(0.38, 0.34, 0.12), createFireGlowMat(), 0.58, 0.66, -0.14);
    // Interior: Wooden Bakery Prep Table with Bread Loaves & Flour Sack
    addWoodenTable(group, -0.35, 0.26, 0.15, 0.92, 0.56, interiorWoodMat);
    addPart(group, new THREE.CylinderGeometry(0.11, 0.12, 0.18, 6), breadItemMat, -0.52, 0.76, 0.14, 0, 0, Math.PI / 2);
    addPart(group, new THREE.CylinderGeometry(0.1, 0.11, 0.18, 6), breadItemMat, -0.22, 0.76, 0.18, 0, 0.4, Math.PI / 2);
    addPart(group, new THREE.CylinderGeometry(0.14, 0.16, 0.24, 7), pillowMat, 0.02, 0.8, 0.08);
    // Interior: Bread Display Shelf along left wall
    addWallShelf(group, -0.94, 0.26, -0.22, Math.PI / 2, interiorWoodMat, breadItemMat);

    // Cutaway Roof & Chimney
    addPart(group, new THREE.ConeGeometry(1.85, 1.15, 4), roofMat, 0, 2.36, 0, 0, Math.PI / 4);
    addPart(group, new THREE.BoxGeometry(0.45, 1.3, 0.45), chimneyWoodMat, 0.78, 2.35, -0.55);
    addPart(group, new THREE.BoxGeometry(0.56, 0.1, 0.56), chimneyCapMat, 0.78, 3.02, -0.55);
    addPart(group, new THREE.BoxGeometry(1.5, 0.14, 0.65), awningMat, 0, 1.18, 1.24, 0.3);
    addPart(group, new THREE.BoxGeometry(0.5, 0.78, 0.08), woodMat, -0.45, 0.63, 1.02);
    addPart(group, new THREE.BoxGeometry(0.58, 0.52, 0.08), winMat, 0.48, 0.95, 1.02);
    addPart(group, new THREE.BoxGeometry(0.48, 0.44, 0.08), winMat, 1.16, 1.0, 0.1);
  } else if (type === 'watchtower') {
    const stoneMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.84, side: THREE.DoubleSide }), 'stone');
    const slateMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.58, metalness: 0.12 }), 'roofPrimary');
    const deckRoofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 }), 'wood');
    const blanketMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.72 }), 'banner');
    const beaconMat = createWindowMat(lanternMaterials, 0xfef08a, 0xfacc15, 'lantern');
    cutawayRoofMaterials.push(slateMat, deckRoofMat);

    addPart(group, new THREE.CylinderGeometry(1.45, 1.65, 0.35, 8), stoneMat, 0, 0.175, 0);
    // Hollow open-top lower stone tower shaft so guard room is visible when roof & upper deck fade
    addPart(group, new THREE.CylinderGeometry(1.06, 1.2, 2.35, 8, 1, true), stoneMat, 0, 1.52, 0);
    addPart(group, new THREE.CylinderGeometry(1.12, 1.12, 0.08, 8), interiorFloorMat, 0, 0.36, 0);

    // Interior: Guard Bunk Bed, Tactical Table, Supply Shelf & Warm Brazier
    addCozyBed(group, -0.46, 0.4, -0.22, 0.25, interiorWoodMat, blanketMat, pillowMat);
    addWoodenTable(group, 0.36, 0.4, 0.18, 0.62, 0.48, interiorWoodMat);
    addPart(group, new THREE.BoxGeometry(0.32, 0.03, 0.24), pillowMat, 0.36, 0.87, 0.18);
    addWallShelf(group, 0.28, 0.4, -0.78, 0, interiorWoodMat, hearthStoneMat);
    addPart(group, new THREE.CylinderGeometry(0.18, 0.12, 0.36, 6), hearthStoneMat, -0.1, 0.58, 0.56);
    addPart(group, new THREE.OctahedronGeometry(0.14, 0), createFireGlowMat(), -0.1, 0.84, 0.56);

    // Cutaway Upper Lookout Deck & Slate Roof
    addPart(group, new THREE.BoxGeometry(2.15, 0.34, 2.15), deckRoofMat, 0, 2.86, 0);
    addPart(group, new THREE.ConeGeometry(1.58, 1.25, 4), slateMat, 0, 3.66, 0, 0, Math.PI / 4);
    addPart(group, new THREE.SphereGeometry(0.22, 8, 6), beaconMat, 0, 3.22, 0);
    addPart(group, new THREE.BoxGeometry(0.46, 0.82, 0.1), woodMat, 0, 0.76, 1.14);
  } else if (type === 'greenhouse') {
    const ironMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.55 }), 'metal');
    const glassMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xa7f3d0,
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.62,
      }),
      'glass',
    );
    const roofGlassMat = glassMat.clone();
    cutawayRoofMaterials.push(roofGlassMat);
    const foliageMat = tagThemeMaterial(
      windUniforms
        ? createWindSwayMaterial({ color: 0x16a34a, roughness: 0.85 }, windUniforms, {
            swayScale: 0.06,
            heightMin: 0.0,
            heightRange: 0.5,
          })
        : new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.85 }),
      'foliage',
    );

    addPart(group, new THREE.BoxGeometry(2.7, 0.45, 2.3), plinthMat, 0, 0.225, 0);
    addPart(group, new THREE.BoxGeometry(2.45, 1.25, 2.05), glassMat, 0, 1.08, 0);
    addPart(group, new THREE.ConeGeometry(1.88, 0.9, 4), roofGlassMat, 0, 2.15, 0, 0, Math.PI / 4);
    // Iron ribs
    addPart(group, new THREE.BoxGeometry(2.55, 0.08, 0.08), ironMat, 0, 1.72, 1.04);
    addPart(group, new THREE.BoxGeometry(2.55, 0.08, 0.08), ironMat, 0, 1.72, -1.04);
    // Foliage shrubs inside + potting bench + swaying exterior planter crops
    addPart(group, new THREE.DodecahedronGeometry(0.42, 0), foliageMat, -0.5, 0.82, 0);
    addPart(group, new THREE.DodecahedronGeometry(0.48, 0), foliageMat, 0.48, 0.86, -0.15);
    addWoodenTable(group, 0, 0.45, -0.55, 0.95, 0.38, interiorWoodMat);
    addPart(group, new THREE.ConeGeometry(0.16, 0.42, 5), foliageMat, -1.12, 0.28, 1.32);
    addPart(group, new THREE.ConeGeometry(0.16, 0.45, 5), foliageMat, 1.12, 0.28, 1.32);
    addPart(group, new THREE.BoxGeometry(0.32, 0.36, 0.08), winMat, 0, 1.15, 1.04);
  } else if (type === 'windmill') {
    const wallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.8, side: THREE.DoubleSide }), 'wall');
    const capMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65 }), 'roofPrimary');
    const sailMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.72 }), 'trim');
    const wheatMat = tagThemeMaterial(
      windUniforms
        ? createWindSwayMaterial({ color: 0xeab308, roughness: 0.82 }, windUniforms, {
            swayScale: 0.09,
            heightMin: 0.0,
            heightRange: 0.45,
          })
        : new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.82 }),
      'crop',
    );
    cutawayRoofMaterials.push(capMat);

    addPart(group, new THREE.CylinderGeometry(1.35, 1.55, 0.32, 10), plinthMat, 0, 0.16, 0);
    // Open-top hollow mill tower with interior millstone & flour sacks
    addPart(group, new THREE.CylinderGeometry(0.88, 1.18, 2.65, 10, 1, true), wallMat, 0, 1.64, 0);
    addPart(group, new THREE.CylinderGeometry(1.12, 1.12, 0.06, 10), interiorFloorMat, 0, 0.34, 0);
    addPart(group, new THREE.CylinderGeometry(0.42, 0.46, 0.28, 10), hearthStoneMat, 0, 0.5, -0.1);
    addPart(group, new THREE.CylinderGeometry(0.18, 0.2, 0.38, 7), pillowMat, -0.52, 0.56, 0.26);
    addPart(group, new THREE.CylinderGeometry(0.16, 0.18, 0.32, 7), pillowMat, 0.48, 0.53, 0.32);

    addPart(group, new THREE.ConeGeometry(1.12, 1.05, 10), capMat, 0, 3.48, 0);
    addPart(group, new THREE.BoxGeometry(0.46, 0.8, 0.12), woodMat, 0, 0.72, 1.12);
    addPart(group, new THREE.BoxGeometry(0.38, 0.38, 0.08), winMat, 0, 1.85, 0.98);
    // Golden wheat sheaves swaying around windmill base
    for (const [wx, wz] of [[-1.45, 0.75], [-1.35, 1.15], [1.42, 0.8]] as Array<[number, number]>) {
      addPart(group, new THREE.ConeGeometry(0.15, 0.48, 5), wheatMat, wx, 0.24, wz);
    }

    // Animated Windmill Rotor Group (4 lattice sail vanes rotating continuously)
    const rotor = new THREE.Group();
    rotor.position.set(0, 2.65, 1.04);
    addPart(rotor, new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8), woodMat, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      addPart(arm, new THREE.BoxGeometry(0.08, 1.62, 0.06), woodMat, 0, 0.81, 0.06);
      addPart(arm, new THREE.BoxGeometry(0.44, 1.18, 0.03), sailMat, 0.2, 0.96, 0.08);
      rotor.add(arm);
    }
    group.add(rotor);
    group.userData.windmillRotor = rotor;
  } else if (type === 'library') {
    const wallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.78 }), 'wall');
    const roofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.62 }), 'roofPrimary');
    const bookMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.6 }), 'banner');
    cutawayRoofMaterials.push(roofMat);

    addPart(group, new THREE.BoxGeometry(2.8, 0.28, 2.4), plinthMat, 0, 0.14, 0);
    addHollowBoxWalls(group, 2.4, 1.65, 1.95, 0.28, 0.14, wallMat, interiorFloorMat);

    // Interior: Reading Table, Open Parchment, Bookshelves & Warm Lamp
    addWoodenTable(group, 0, 0.3, 0.12, 0.95, 0.56, interiorWoodMat);
    addPart(group, new THREE.BoxGeometry(0.32, 0.04, 0.22), pillowMat, -0.15, 0.78, 0.12);
    addPart(group, new THREE.SphereGeometry(0.1, 7, 6), createFireGlowMat(), 0.26, 0.84, 0.12);
    addWallShelf(group, -0.96, 0.3, -0.1, Math.PI / 2, interiorWoodMat, bookMat);
    addWallShelf(group, 0.96, 0.3, -0.1, -Math.PI / 2, interiorWoodMat, breadItemMat);
    addWallShelf(group, 0, 0.3, -0.76, 0, interiorWoodMat, bookMat);

    addPart(group, new THREE.ConeGeometry(1.92, 1.0, 4), roofMat, 0, 2.42, 0, 0, Math.PI / 4);
    addPart(group, new THREE.CylinderGeometry(0.11, 0.12, 1.55, 8), wallMat, -0.78, 1.05, 1.08);
    addPart(group, new THREE.CylinderGeometry(0.11, 0.12, 1.55, 8), wallMat, 0.78, 1.05, 1.08);
    addPart(group, new THREE.BoxGeometry(0.55, 0.85, 0.1), woodMat, 0, 0.7, 0.99);
    addPart(group, new THREE.BoxGeometry(0.42, 0.6, 0.08), winMat, -0.82, 1.15, 0.99);
    addPart(group, new THREE.BoxGeometry(0.42, 0.6, 0.08), winMat, 0.82, 1.15, 0.99);
  } else if (type === 'granary') {
    const timberMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 }), 'wood');
    const roofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7 }), 'roofPrimary');
    const crateMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.82 }), 'crate');
    const cropMat = windUniforms
      ? tagThemeMaterial(
          createWindSwayMaterial({ color: 0xd97706, roughness: 0.85 }, windUniforms, {
            swayScale: 0.08,
            heightMin: 0.0,
            heightRange: 0.42,
          }),
          'crop',
        )
      : crateMat;
    cutawayRoofMaterials.push(roofMat);

    // Stilts + raised floor
    for (const [sx, sz] of [[-1.0, -0.8], [1.0, -0.8], [-1.0, 0.8], [1.0, 0.8]] as Array<[number, number]>) {
      addPart(group, new THREE.BoxGeometry(0.22, 0.45, 0.22), woodMat, sx, 0.225, sz);
    }
    addPart(group, new THREE.BoxGeometry(2.6, 0.18, 2.1), woodMat, 0, 0.5, 0);
    addHollowBoxWalls(group, 2.3, 1.3, 1.85, 0.59, 0.14, timberMat, interiorFloorMat);

    // Interior: Grain sacks, supply shelves & weigh table
    addPart(group, new THREE.CylinderGeometry(0.2, 0.22, 0.44, 7), pillowMat, -0.58, 0.84, -0.32);
    addPart(group, new THREE.CylinderGeometry(0.18, 0.2, 0.38, 7), pillowMat, -0.22, 0.81, -0.42);
    addPart(group, new THREE.BoxGeometry(0.4, 0.36, 0.4), crateMat, 0.54, 0.8, -0.35);
    addWoodenTable(group, 0.15, 0.62, 0.32, 0.76, 0.42, interiorWoodMat);
    addWallShelf(group, 0.92, 0.62, 0.05, -Math.PI / 2, interiorWoodMat, crateMat);

    const roof = addPart(group, new THREE.CylinderGeometry(0.98, 0.98, 2.45, 10, 1, false, 0, Math.PI), roofMat, 0, 1.89, 0);
    roof.rotation.z = Math.PI / 2;
    addPart(group, new THREE.BoxGeometry(0.45, 0.45, 0.45), crateMat, 0.75, 0.82, 1.12);
    addPart(group, new THREE.BoxGeometry(0.42, 0.42, 0.08), winMat, 0, 1.4, 0.94);
    addPart(group, new THREE.ConeGeometry(0.14, 0.42, 5), cropMat, -1.35, 0.21, 0.95);
    addPart(group, new THREE.ConeGeometry(0.14, 0.38, 5), cropMat, -1.1, 0.19, 1.15);
  } else if (type === 'pavilion') {
    const pillarMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.78 }), 'wood');
    const roofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.55 }), 'roofSecondary');
    const lampMat = createWindowMat(lanternMaterials, 0xfef3c7, 0xf59e0b, 'lantern');
    cutawayRoofMaterials.push(roofMat);

    addPart(group, new THREE.CylinderGeometry(1.7, 1.85, 0.26, 6), plinthMat, 0, 0.13, 0);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      addPart(group, new THREE.CylinderGeometry(0.08, 0.09, 1.6, 6), pillarMat, Math.cos(angle) * 1.28, 1.06, Math.sin(angle) * 1.28);
    }
    // Cozy wooden garden tea table inside pavilion
    addWoodenTable(group, 0, 0.26, 0, 0.75, 0.75, interiorWoodMat);
    addPart(group, new THREE.ConeGeometry(2.05, 0.85, 6), roofMat, 0, 2.28, 0);
    addPart(group, new THREE.ConeGeometry(1.25, 0.65, 6), roofMat, 0, 2.86, 0);
    addPart(group, new THREE.SphereGeometry(0.24, 8, 6), lampMat, 0, 1.55, 0);
  } else if (type === 'hospital') {
    // Town Hospital / Clinic — hollow see-inside ward with medical cots, glowing healing lantern & medicine shelf
    const clinicWallMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.68 }),
      'wall',
    );
    const clinicFloorMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.76 }),
      'stone',
    );
    const clinicRoofMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.56 }),
      'roofPrimary',
    );
    const crossRedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.35,
      roughness: 0.35,
    });
    const cotBlanketMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.72 });
    const bottleMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });
    const healingLanternMat = new THREE.MeshStandardMaterial({
      color: 0xa7f3d0,
      emissive: 0x10b981,
      emissiveIntensity: 1.55,
      roughness: 0.2,
    });
    interiorFireMats.push(healingLanternMat);
    cutawayRoofMaterials.push(clinicRoofMat);

    // Plinth & hollow exterior clinic walls
    addPart(group, new THREE.BoxGeometry(3.0, 0.28, 2.55), plinthMat, 0, 0.14, 0);
    addHollowBoxWalls(group, 2.68, 1.65, 2.2, 0.28, 0.14, clinicWallMat, clinicFloorMat);

    // Interior: 2 Medical Cots with crisp white pillows & teal blankets
    addCozyBed(group, -0.78, 0.3, -0.25, 0, interiorWoodMat, cotBlanketMat, pillowMat);
    addCozyBed(group, 0.78, 0.3, -0.25, 0, interiorWoodMat, cotBlanketMat, pillowMat);

    // Interior: Medicine Apothecary Shelf on back wall + front triage desk
    addWallShelf(group, 0, 0.3, -0.88, 0, interiorWoodMat, bottleMat);
    addWoodenTable(group, 0, 0.3, 0.48, 0.82, 0.42, interiorWoodMat);

    // Interior: Glowing Healing Lantern on central stand
    addPart(group, new THREE.CylinderGeometry(0.06, 0.08, 0.62, 6), woodMat, 0, 0.62, -0.15);
    addPart(group, new THREE.OctahedronGeometry(0.16, 0), healingLanternMat, 0, 1.02, -0.15);

    // Cutaway Pitched Roof + Front Gable Awning
    addPart(group, new THREE.ConeGeometry(2.14, 1.08, 4), clinicRoofMat, 0, 2.46, 0, 0, Math.PI / 4);
    addPart(group, new THREE.BoxGeometry(1.45, 0.12, 0.62), clinicRoofMat, 0, 1.52, 1.32, 0.22);

    // Bold 3D Red-Cross Emblem on white facade plaque & rooftop sign
    addPart(group, new THREE.BoxGeometry(0.68, 0.68, 0.08), clinicWallMat, 0, 1.72, 1.14);
    addPart(group, new THREE.BoxGeometry(0.42, 0.14, 0.1), crossRedMat, 0, 1.72, 1.17);
    addPart(group, new THREE.BoxGeometry(0.14, 0.42, 0.1), crossRedMat, 0, 1.72, 1.17);

    // Door & glowing clinic windows
    addPart(group, new THREE.BoxGeometry(0.62, 0.98, 0.08), woodMat, 0, 0.78, 1.12);
    addPart(group, new THREE.BoxGeometry(0.54, 0.5, 0.08), winMat, -0.86, 1.14, 1.12);
    addPart(group, new THREE.BoxGeometry(0.54, 0.5, 0.08), winMat, 0.86, 1.14, 1.12);
  } else if (type === 'defense_wall') {
    // Stone Defense Palisade & Elevated Rotating Brass/Iron Cannon Turret
    const fortStoneMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.86 }),
      'stone',
    );
    const darkStoneMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 }),
      'stone',
    );
    const deckMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }),
      'wood',
    );
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.36,
      metalness: 0.72,
    });
    const brassMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.82 }),
      'gold',
    );
    const bannerMat = tagThemeMaterial(
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 }),
      'banner',
    );
    cutawayRoofMaterials.push(deckMat, darkStoneMat);

    // Wide fortified stone bastion plinth + hollow lower guardroom
    addPart(group, new THREE.BoxGeometry(3.15, 0.38, 2.55), fortStoneMat, 0, 0.19, 0);
    addHollowBoxWalls(group, 2.48, 1.55, 2.05, 0.38, 0.18, fortStoneMat, interiorFloorMat);

    // Interior: Tactical defense table, brass ammo rack & warm guard brazier
    addWoodenTable(group, -0.35, 0.4, 0.15, 0.78, 0.46, interiorWoodMat);
    addWallShelf(group, 0.85, 0.4, -0.15, -Math.PI / 2, interiorWoodMat, brassMat);
    addPart(group, new THREE.CylinderGeometry(0.18, 0.12, 0.34, 6), hearthStoneMat, -0.58, 0.58, -0.55);
    addPart(group, new THREE.OctahedronGeometry(0.14, 0), createFireGlowMat(), -0.58, 0.84, -0.55);

    // Flanking wooden palisade spikes on left & right wings
    const stakeGeo = new THREE.ConeGeometry(0.15, 1.55, 6);
    for (const sx of [-1.72, -1.48, 1.48, 1.72]) {
      addPart(group, stakeGeo, woodMat, sx, 0.78, 0.32);
      addPart(group, stakeGeo, woodMat, sx, 0.78, -0.32);
    }

    // Upper parapet deck & 4 crenellated stone merlons (fade during roof cutaway)
    addPart(group, new THREE.BoxGeometry(2.68, 0.22, 2.26), deckMat, 0, 2.04, 0);
    for (const [mx, mz] of [
      [-1.12, -0.92],
      [1.12, -0.92],
      [-1.12, 0.92],
      [1.12, 0.92],
    ] as Array<[number, number]>) {
      addPart(group, new THREE.BoxGeometry(0.46, 0.52, 0.46), darkStoneMat, mx, 2.4, mz);
    }

    // Rotating Defense Cannon Turret mounted on top of the bastion
    const turret = new THREE.Group();
    turret.position.set(0, 2.18, 0);
    addPart(turret, new THREE.CylinderGeometry(0.56, 0.66, 0.28, 10), darkStoneMat, 0, 0.14, 0);
    addPart(turret, new THREE.BoxGeometry(0.52, 0.32, 0.64), woodMat, 0, 0.42, 0);
    // Tapered iron cannon barrel pointing +Z in turret local space
    addPart(turret, new THREE.CylinderGeometry(0.13, 0.2, 1.25, 10), ironMat, 0, 0.62, 0.34, Math.PI / 2 - 0.12);
    addPart(turret, new THREE.TorusGeometry(0.15, 0.04, 6, 10), brassMat, 0, 0.7, 0.92);
    addPart(turret, new THREE.SphereGeometry(0.19, 8, 6), brassMat, 0, 0.56, -0.26);
    group.add(turret);
    group.userData.defenseTurret = turret;

    // Front reinforced gate & shield emblem
    addPart(group, new THREE.BoxGeometry(0.68, 1.02, 0.12), woodMat, 0, 0.89, 1.04);
    addPart(group, new THREE.BoxGeometry(0.42, 0.52, 0.08), bannerMat, -0.82, 1.25, 1.04);
    addPart(group, new THREE.BoxGeometry(0.42, 0.52, 0.08), bannerMat, 0.82, 1.25, 1.04);
  } else if (type === 'custom') {
    const style: CustomBuildingStyle = structure.customStyle || 'lab';
    const labelText = (structure.customLabel || 'Research Lab').trim().slice(0, 24);

    // Procedural CanvasTexture nameplate sign mounted on the front facade
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sCtx = signCanvas.getContext('2d');
    const styleAccentMap: Record<CustomBuildingStyle, string> = {
      lab: '#06b6d4',
      observatory: '#6366f1',
      cafe: '#d97706',
      tavern: '#b45309',
      forge: '#ea580c',
      guild: '#8b5cf6',
      cabin: '#16a34a',
      tower: '#3b82f6',
    };
    const accentHex = styleAccentMap[style] || '#06b6d4';
    if (sCtx) {
      sCtx.fillStyle = '#0f172a';
      sCtx.fillRect(0, 0, 256, 64);
      sCtx.strokeStyle = accentHex;
      sCtx.lineWidth = 6;
      sCtx.strokeRect(4, 4, 248, 56);
      sCtx.fillStyle = '#f8fafc';
      sCtx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'middle';
      sCtx.fillText(labelText, 128, 33, 232);
    }
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.35,
      emissive: new THREE.Color(accentHex),
      emissiveIntensity: 0.22,
    });

    if (style === 'lab') {
      const labWallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.58 }), 'wall');
      const labTrimMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x0e7490, roughness: 0.42, metalness: 0.35 }), 'metal');
      const domeGlassMat = new THREE.MeshStandardMaterial({
        color: 0xa5f3fc,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.32,
        roughness: 0.16,
        transparent: true,
        opacity: 0.72,
      });
      const cyanCoreMat = new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.35,
        roughness: 0.2,
      });
      interiorFireMats.push(cyanCoreMat);
      cutawayRoofMaterials.push(labTrimMat, domeGlassMat);

      addPart(group, new THREE.BoxGeometry(3.0, 0.3, 2.5), plinthMat, 0, 0.15, 0);
      addHollowBoxWalls(group, 2.65, 1.65, 2.15, 0.3, 0.14, labWallMat, interiorFloorMat);

      // Interior: Research workbench, glowing cyan reactor tube, specimen shelves
      addWoodenTable(group, -0.45, 0.32, -0.42, 1.15, 0.54, interiorWoodMat);
      addPart(group, new THREE.CylinderGeometry(0.18, 0.22, 0.92, 10), cyanCoreMat, 0.65, 0.82, -0.45);
      addPart(group, new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10), labTrimMat, 0.65, 0.36, -0.45);
      addPart(group, new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10), labTrimMat, 0.65, 1.28, -0.45);
      addWallShelf(group, -1.06, 0.32, 0.2, Math.PI / 2, labTrimMat, cyanCoreMat);

      // Roof deck + translucent research dome + brass antenna
      addPart(group, new THREE.BoxGeometry(2.85, 0.16, 2.35), labTrimMat, 0, 2.02, 0);
      addPart(group, new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeGlassMat, 0, 2.1, 0);
      addPart(group, new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6), labTrimMat, 0.85, 2.45, -0.55);
      addPart(group, new THREE.SphereGeometry(0.11, 8, 6), cyanCoreMat, 0.85, 2.86, -0.55);

      // Door, lab windows & custom nameplate
      addPart(group, new THREE.BoxGeometry(0.58, 0.98, 0.08), labTrimMat, 0, 0.79, 1.09);
      addPart(group, new THREE.BoxGeometry(0.52, 0.52, 0.08), winMat, -0.86, 1.18, 1.09);
      addPart(group, new THREE.BoxGeometry(0.52, 0.52, 0.08), winMat, 0.86, 1.18, 1.09);
      addPart(group, new THREE.BoxGeometry(1.56, 0.38, 0.07), signMat, 0, 1.82, 1.14);
    } else if (style === 'observatory') {
      const obsWallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xddd6fe, roughness: 0.72 }), 'wall');
      const obsDomeMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.38, metalness: 0.55 }), 'roofPrimary');
      const brassMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.75 }), 'gold');
      cutawayRoofMaterials.push(obsDomeMat);

      addPart(group, new THREE.CylinderGeometry(1.62, 1.75, 0.32, 12), plinthMat, 0, 0.16, 0);
      addHollowBoxWalls(group, 2.25, 1.7, 2.25, 0.32, 0.14, obsWallMat, interiorFloorMat);

      // Interior: Star chart table + glowing celestial orb
      addWoodenTable(group, 0, 0.34, 0, 0.96, 0.62, interiorWoodMat);
      addPart(group, new THREE.OctahedronGeometry(0.2, 0), createFireGlowMat(), 0, 1.02, 0);

      // Rotating dome + brass telescope barrel
      addPart(group, new THREE.SphereGeometry(1.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), obsDomeMat, 0, 2.02, 0);
      addPart(group, new THREE.CylinderGeometry(0.14, 0.2, 1.45, 8), brassMat, 0.45, 2.75, 0.45, Math.PI / 4, 0, -Math.PI / 6);
      addPart(group, new THREE.BoxGeometry(0.56, 0.96, 0.08), woodMat, 0, 0.8, 1.14);
      addPart(group, new THREE.BoxGeometry(1.52, 0.36, 0.07), signMat, 0, 1.78, 1.18);
    } else if (style === 'cafe') {
      const cafeWallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.76 }), 'wall');
      const cafeRoofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.62 }), 'roofPrimary');
      const awningMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 }), 'roofSecondary');
      cutawayRoofMaterials.push(cafeRoofMat);

      addPart(group, new THREE.BoxGeometry(2.95, 0.28, 2.45), plinthMat, 0, 0.14, 0);
      addHollowBoxWalls(group, 2.55, 1.58, 2.05, 0.28, 0.14, cafeWallMat, interiorFloorMat);

      // Interior: Espresso bar counter + glowing coffee roaster + cozy bistro table
      addWoodenTable(group, -0.55, 0.3, -0.45, 1.1, 0.48, interiorWoodMat);
      addPart(group, new THREE.BoxGeometry(0.32, 0.34, 0.26), createFireGlowMat(), -0.68, 0.94, -0.46);
      addWoodenTable(group, 0.58, 0.3, 0.22, 0.66, 0.66, interiorWoodMat);

      // Cafe roof + front terrace awning + outdoor bistro table + nameplate
      addPart(group, new THREE.ConeGeometry(2.05, 0.96, 4), cafeRoofMat, 0, 2.34, 0, 0, Math.PI / 4);
      addPart(group, new THREE.BoxGeometry(2.35, 0.1, 0.74), awningMat, 0, 1.56, 1.32, 0.24);
      addPart(group, new THREE.BoxGeometry(0.58, 0.96, 0.08), woodMat, 0, 0.76, 1.04);
      addPart(group, new THREE.BoxGeometry(0.56, 0.54, 0.08), winMat, -0.82, 1.08, 1.04);
      addPart(group, new THREE.BoxGeometry(0.56, 0.54, 0.08), winMat, 0.82, 1.08, 1.04);
      addPart(group, new THREE.BoxGeometry(1.54, 0.36, 0.07), signMat, 0, 1.88, 1.08);
    } else {
      // Tavern / Forge / Guild / Cabin / Tower versatile procedural civic hall
      const roofColorMap: Record<CustomBuildingStyle, number> = {
        lab: 0x0e7490,
        observatory: 0x312e81,
        cafe: 0x92400e,
        tavern: 0x7c2d12,
        forge: 0x44403c,
        guild: 0x4c1d95,
        cabin: 0x166534,
        tower: 0x1e3a8a,
      };
      const wallColorMap: Record<CustomBuildingStyle, number> = {
        lab: 0xe2e8f0,
        observatory: 0xddd6fe,
        cafe: 0xfef3c7,
        tavern: 0xf5e6d3,
        forge: 0x94a3b8,
        guild: 0xf1f5f9,
        cabin: 0xb45309,
        tower: 0xcbd5e1,
      };
      const wallMat = tagThemeMaterial(
        new THREE.MeshStandardMaterial({ color: wallColorMap[style] ?? 0xf1f5f9, roughness: 0.78 }),
        'wall',
      );
      const roofMat = tagThemeMaterial(
        new THREE.MeshStandardMaterial({ color: roofColorMap[style] ?? 0x1e3a8a, roughness: 0.62 }),
        'roofPrimary',
      );
      cutawayRoofMaterials.push(roofMat);

      const isTall = style === 'tower';
      const wallH = isTall ? 2.45 : 1.62;
      const wX = isTall ? 1.85 : 2.55;
      const wZ = isTall ? 1.85 : 2.1;

      addPart(group, new THREE.BoxGeometry(wX + 0.4, 0.3, wZ + 0.4), plinthMat, 0, 0.15, 0);
      addHollowBoxWalls(group, wX, wallH, wZ, 0.3, 0.14, wallMat, interiorFloorMat);

      // Interior focal table + glowing hearth/forge/lantern
      const shelfAccentMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 });
      addWoodenTable(group, 0, 0.32, 0.1, 0.88, 0.52, interiorWoodMat);
      addPart(group, new THREE.BoxGeometry(0.46, 0.42, 0.42), createFireGlowMat(), -0.58, 0.56, -0.55);
      addWallShelf(group, wX / 2 - 0.24, 0.32, -0.1, -Math.PI / 2, interiorWoodMat, shelfAccentMat);

      // Roof + optional forge chimney
      addPart(group, new THREE.ConeGeometry(isTall ? 1.55 : 2.08, isTall ? 1.35 : 1.05, 4), roofMat, 0, 0.3 + wallH + (isTall ? 0.66 : 0.5), 0, 0, Math.PI / 4);
      if (style === 'forge' || style === 'tavern') {
        addPart(group, new THREE.BoxGeometry(0.46, 1.15, 0.46), plinthMat, -0.78, 0.3 + wallH + 0.45, -0.55);
      }

      addPart(group, new THREE.BoxGeometry(0.56, 0.96, 0.08), woodMat, 0, 0.78, wZ / 2 + 0.02);
      addPart(group, new THREE.BoxGeometry(0.46, 0.48, 0.08), winMat, -wX * 0.3, 1.12, wZ / 2 + 0.02);
      addPart(group, new THREE.BoxGeometry(0.46, 0.48, 0.08), winMat, wX * 0.3, 1.12, wZ / 2 + 0.02);
      addPart(group, new THREE.BoxGeometry(1.52, 0.36, 0.07), signMat, 0, 0.3 + wallH - 0.08, wZ / 2 + 0.08);
    }
  } else {
    // clock_tower
    const brickMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.76 }), 'brick');
    const trimMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.65 }), 'trim');
    const spireMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.45 }), 'roofPrimary');
    const faceMat = createWindowMat(lanternMaterials, 0xfef9c3, 0xfde047, 'window');
    cutawayRoofMaterials.push(spireMat, trimMat);

    addPart(group, new THREE.BoxGeometry(2.2, 0.32, 2.2), plinthMat, 0, 0.16, 0);
    addHollowBoxWalls(group, 1.48, 2.8, 1.48, 0.32, 0.14, brickMat, interiorFloorMat);
    // Interior: Clockmaker Desk, Shelves & Glowing Pendulum Weight
    addWoodenTable(group, 0, 0.36, -0.22, 0.72, 0.44, interiorWoodMat);
    addPart(group, new THREE.SphereGeometry(0.14, 8, 6), createFireGlowMat(), 0, 1.25, 0);

    addPart(group, new THREE.BoxGeometry(1.66, 0.22, 1.66), trimMat, 0, 3.18, 0);
    addPart(group, new THREE.ConeGeometry(1.25, 1.45, 4), spireMat, 0, 4.02, 0, 0, Math.PI / 4);
    // Clock dials on front/back/sides
    addPart(group, new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), faceMat, 0, 2.65, 0.76, Math.PI / 2);
    addPart(group, new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), faceMat, 0.76, 2.65, 0, 0, 0, Math.PI / 2);
    addPart(group, new THREE.BoxGeometry(0.46, 0.78, 0.1), woodMat, 0, 0.71, 0.76);
  }

  // Tier 2 Enhancement: Cloth-Wave Banner & Side Alcove
  if (structure.tier >= 2) {
    const bannerMat = tagThemeMaterial(
      windUniforms
        ? createClothWaveMaterial({ color: 0x2563eb, roughness: 0.58 }, windUniforms, {
            waveAmp: 0.065,
            waveFreq: 5.2,
            phaseOffset: 1.4,
          })
        : new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55, side: THREE.DoubleSide }),
      'banner',
    );
    const poleMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.6 }), 'gold');
    addPart(group, new THREE.CylinderGeometry(0.04, 0.04, 1.45, 6), poleMat, -1.42, 0.72, 1.18);
    addPart(group, new THREE.BoxGeometry(0.52, 0.05, 0.05), poleMat, -1.42, 1.42, 1.2);
    addPart(group, new THREE.PlaneGeometry(0.46, 0.68, 3, 7), bannerMat, -1.42, 1.07, 1.22);
  }

  // Tier 3 Enhancement: Gilded Crest & Courtyard Lantern Post
  if (structure.tier >= 3) {
    const goldMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.85 }), 'gold');
    const postMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 }), 'metal');
    const globeMat = createWindowMat(lanternMaterials, 0xfef3c7, 0xf59e0b, 'lantern');
    addPart(group, new THREE.OctahedronGeometry(0.22, 0), goldMat, 0, 3.65, 0);
    addPart(group, new THREE.CylinderGeometry(0.05, 0.06, 1.45, 6), postMat, 1.45, 0.72, 1.18);
    addPart(group, new THREE.SphereGeometry(0.16, 8, 6), globeMat, 1.45, 1.5, 1.18);
  }

  if (isSelected) {
    const ring = addPart(
      group,
      new THREE.RingGeometry(1.95, 2.15, 24),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide }),
      0,
      0.04,
      0,
      -Math.PI / 2,
    );
    ring.rotation.x = -Math.PI / 2;
  }

  group.userData.cutawayRoofMaterials = cutawayRoofMaterials;
  group.userData.interiorFireMats = interiorFireMats;

  if (theme !== 'meadow') {
    applyThemeToObjectTree(group, theme);
  }
  return group;
}

export function disposeStructureGroup(
  group: THREE.Group,
  lanternMaterials: THREE.MeshStandardMaterial[],
): void {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (stdMat.map && stdMat.map instanceof THREE.CanvasTexture) {
          stdMat.map.dispose();
        }
        const idx = lanternMaterials.indexOf(stdMat);
        if (idx !== -1) {
          lanternMaterials.splice(idx, 1);
        }
        mat.dispose();
      }
    }
  });
}

export interface SignalRelayHandle {
  group: THREE.Group;
  roofMaterials: THREE.MeshStandardMaterial[];
  fireMaterials: THREE.MeshStandardMaterial[];
  applyTheme: (theme: TownTheme) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  pulse: (durationSec?: number) => void;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

/**
 * Builds "The Signal Relay" (CLI Agent Hub) — a low-poly timber-and-stone cabin with:
 * - Hollow 4-wall interior (telegraph/terminal console, glowing screen, chair, punch-card rack)
 * - Smooth roof cutaway materials (opacity -> 0.15 on click/close zoom)
 * - Rotating rooftop antenna switching cleanly between Meadow (brass/cyan dish),
 *   Fantasy Night (arcane violet crystal spire), and Solarpunk Oasis (copper solar relay)
 * - Pulsing status beacon + expanding signal halo ring when external CLI agents send commands
 */
export function buildSignalRelayLandmark(
  shadowTex: THREE.Texture,
  lanternMaterials: THREE.MeshStandardMaterial[],
  initialTheme: TownTheme = 'meadow',
): SignalRelayHandle {
  const group = new THREE.Group();
  group.userData.signalRelay = true;
  addContactShadow(group, shadowTex, 4.9);

  const roofMaterials: THREE.MeshStandardMaterial[] = [];
  const fireMaterials: THREE.MeshStandardMaterial[] = [];

  // Shared cabin materials
  const stoneMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 }), 'stone');
  const wallMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0xf1e8d8, roughness: 0.78 }), 'wall');
  const timberMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.82 }), 'darkWood');
  const woodMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.78 }), 'wood');
  const floorMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x78553a, roughness: 0.88 }), 'darkWood');
  const roofMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.62 }), 'roofPrimary');
  const trimMat = tagThemeMaterial(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.52, metalness: 0.35 }), 'metal');
  const windowMat = createWindowMat(lanternMaterials, 0xe0f2fe, 0x38bdf8, 'window');
  roofMaterials.push(roofMat, trimMat);

  // Stone foundation plinth + front step
  addPart(group, new THREE.BoxGeometry(3.45, 0.3, 2.95), stoneMat, 0, 0.15, 0);
  addPart(group, new THREE.BoxGeometry(1.1, 0.16, 0.45), stoneMat, 0, 0.08, 1.62);

  // Hollow 4-wall timber-and-stone relay cabin
  addHollowBoxWalls(group, 3.0, 1.85, 2.48, 0.3, 0.15, wallMat, floorMat);

  // Lower stone wainscot strips & corner timber posts (minimal boxes)
  const postGeo = new THREE.BoxGeometry(0.18, 1.9, 0.18);
  addPart(group, postGeo, timberMat, -1.48, 1.25, -1.22);
  addPart(group, postGeo, timberMat, 1.48, 1.25, -1.22);
  addPart(group, postGeo, timberMat, -1.48, 1.25, 1.22);
  addPart(group, postGeo, timberMat, 1.48, 1.25, 1.22);

  // Front door + glowing side windows + small brass nameplate
  addPart(group, new THREE.BoxGeometry(0.68, 1.15, 0.08), woodMat, 0, 0.88, 1.26);
  const signBrassMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.32, metalness: 0.72 }),
    'gold',
  );
  addPart(group, new THREE.BoxGeometry(0.95, 0.2, 0.06), signBrassMat, 0, 1.68, 1.27);
  addPart(group, new THREE.BoxGeometry(0.66, 0.56, 0.08), windowMat, -0.92, 1.26, 1.26);
  addPart(group, new THREE.BoxGeometry(0.66, 0.56, 0.08), windowMat, 0.92, 1.26, 1.26);
  addPart(group, new THREE.BoxGeometry(0.08, 0.56, 0.72), windowMat, 1.52, 1.26, 0);

  // Interior: Telegraph / Terminal Console Desk, Glowing Screen, Chair & Punch-Card Rack
  const consoleMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.5 });
  const terminalScreenMat = new THREE.MeshStandardMaterial({
    color: 0x67e8f9,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.1,
    roughness: 0.25,
  });
  const cardMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.72 });
  fireMaterials.push(terminalScreenMat);

  // Desk along back-left interior
  addWoodenTable(group, -0.45, 0.36, -0.58, 1.35, 0.62, woodMat);
  // Terminal monitor housing + glowing status screen + telegraph key pad
  addPart(group, new THREE.BoxGeometry(0.62, 0.44, 0.32), consoleMetalMat, -0.52, 1.04, -0.68);
  addPart(group, new THREE.BoxGeometry(0.5, 0.32, 0.04), terminalScreenMat, -0.52, 1.06, -0.51);
  addPart(group, new THREE.BoxGeometry(0.46, 0.06, 0.22), signBrassMat, -0.48, 0.85, -0.38);
  // Operator chair in front of console
  addPart(group, new THREE.BoxGeometry(0.4, 0.07, 0.4), timberMat, -0.45, 0.64, 0.14);
  addPart(group, new THREE.BoxGeometry(0.4, 0.42, 0.07), timberMat, -0.45, 0.86, 0.32);
  addPart(group, new THREE.CylinderGeometry(0.05, 0.08, 0.28, 6), consoleMetalMat, -0.45, 0.49, 0.14);

  // Punch-card rack along back-right wall
  addPart(group, new THREE.BoxGeometry(0.84, 1.18, 0.28), consoleMetalMat, 0.85, 0.95, -0.84);
  addPart(group, new THREE.BoxGeometry(0.68, 0.12, 0.18), cardMat, 0.85, 0.74, -0.76);
  addPart(group, new THREE.BoxGeometry(0.68, 0.12, 0.18), cardMat, 0.85, 1.04, -0.76);
  addPart(group, new THREE.BoxGeometry(0.68, 0.12, 0.18), terminalScreenMat, 0.85, 1.32, -0.76);

  // Cutaway Pitched Roof + Mast Collar
  const roofMesh = addPart(group, new THREE.ConeGeometry(2.38, 1.18, 4), roofMat, 0, 2.72, 0, 0, Math.PI / 4);
  roofMesh.scale.set(1.06, 1, 0.92);
  addPart(group, new THREE.BoxGeometry(3.26, 0.12, 2.74), trimMat, 0, 2.16, 0);

  // Rooftop Mast & Rotating Signal Assembly (stays visible even during cutaway)
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.65 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.28, metalness: 0.78 });
  const cyanAccentMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0x9333ea,
    emissiveIntensity: 1.3,
    roughness: 0.18,
    metalness: 0.15,
  });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.3, metalness: 0.76 });
  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: 0x0e7490,
    emissive: 0x0891b2,
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.5,
  });

  addPart(group, new THREE.CylinderGeometry(0.14, 0.2, 0.28, 8), mastMat, 0, 3.24, 0);
  addPart(group, new THREE.CylinderGeometry(0.06, 0.08, 1.32, 8), mastMat, 0, 3.92, 0);

  const antennaRotor = new THREE.Group();
  antennaRotor.position.set(0, 4.18, 0);
  group.add(antennaRotor);

  // 1) Meadow assembly: brass parabolic dish + cyan feed horn + telegraph crossbar
  const meadowDish = new THREE.Group();
  const dishCup = addPart(meadowDish, new THREE.CylinderGeometry(0.56, 0.14, 0.26, 12), brassMat, 0, 0.06, 0.22, Math.PI / 2.3);
  dishCup.castShadow = false;
  addPart(meadowDish, new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), mastMat, 0, 0.14, 0.36, Math.PI / 2.3);
  addPart(meadowDish, new THREE.SphereGeometry(0.11, 8, 6), cyanAccentMat, 0, 0.22, 0.56);
  addPart(meadowDish, new THREE.BoxGeometry(1.18, 0.05, 0.05), brassMat, 0, -0.34, 0);
  antennaRotor.add(meadowDish);

  // 2) Fantasy Night assembly: glowing arcane crystal spire + rune ring
  const fantasyCrystal = new THREE.Group();
  addPart(fantasyCrystal, new THREE.OctahedronGeometry(0.36, 0), crystalMat, 0, 0.24, 0);
  const runeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.04, 6, 18),
    cyanAccentMat,
  );
  runeRing.rotation.x = Math.PI / 2.6;
  runeRing.position.y = 0.2;
  fantasyCrystal.add(runeRing);
  antennaRotor.add(fantasyCrystal);

  // 3) Solarpunk Oasis assembly: copper solar relay dish + twin solar wings
  const solarpunkDish = new THREE.Group();
  addPart(solarpunkDish, new THREE.CylinderGeometry(0.5, 0.16, 0.22, 10), copperMat, 0, 0.08, 0.2, Math.PI / 2.4);
  addPart(solarpunkDish, new THREE.SphereGeometry(0.1, 8, 6), cyanAccentMat, 0, 0.2, 0.5);
  addPart(solarpunkDish, new THREE.BoxGeometry(0.72, 0.04, 0.34), solarPanelMat, -0.62, -0.18, 0, 0.28, 0, 0.18);
  addPart(solarpunkDish, new THREE.BoxGeometry(0.72, 0.04, 0.34), solarPanelMat, 0.62, -0.18, 0, 0.28, 0, -0.18);
  antennaRotor.add(solarpunkDish);

  // Status Beacon Light & Expanding Signal Pulse Ring atop mast
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 1.0,
    roughness: 0.2,
  });
  const beaconBulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), beaconMat);
  beaconBulb.position.set(0, 4.72, 0);
  group.add(beaconBulb);

  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beaconHalo = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 20), haloMat);
  beaconHalo.rotation.x = -Math.PI / 2;
  beaconHalo.position.set(0, 4.72, 0);
  group.add(beaconHalo);

  const beaconLight = new THREE.PointLight(0x22d3ee, 0.8, 7.5, 1.8);
  beaconLight.position.set(0, 4.85, 0);
  group.add(beaconLight);

  let currentTheme: TownTheme = initialTheme;
  let graphicsQuality: GraphicsQuality = 'medium';
  let pulseTimer = 0;

  const applyTheme = (theme: TownTheme) => {
    currentTheme = theme;
    applyThemeToObjectTree(group, theme);
    meadowDish.visible = theme === 'meadow';
    fantasyCrystal.visible = theme === 'fantasy_night';
    solarpunkDish.visible = theme === 'solarpunk_oasis';

    if (theme === 'fantasy_night') {
      beaconMat.color.setHex(0xc084fc);
      beaconMat.emissive.setHex(0xa855f7);
      haloMat.color.setHex(0xd8b4fe);
      beaconLight.color.setHex(0xc084fc);
    } else if (theme === 'solarpunk_oasis') {
      beaconMat.color.setHex(0x2dd4bf);
      beaconMat.emissive.setHex(0x14b8a6);
      haloMat.color.setHex(0x5eead4);
      beaconLight.color.setHex(0x2dd4bf);
    } else {
      beaconMat.color.setHex(0x34d399);
      beaconMat.emissive.setHex(0x10b981);
      haloMat.color.setHex(0x22d3ee);
      beaconLight.color.setHex(0x22d3ee);
    }
  };

  const setGraphicsQuality = (quality: GraphicsQuality) => {
    graphicsQuality = quality;
    beaconLight.visible = quality !== 'low';
  };

  const pulse = (durationSec = 8) => {
    pulseTimer = Math.max(pulseTimer, durationSec);
  };

  const update = (delta: number, elapsed: number) => {
    const active = pulseTimer > 0;
    if (active) {
      pulseTimer = Math.max(0, pulseTimer - delta);
    }

    // Smooth dish / crystal rotation (spins briskly when receiving CLI signals)
    const spinSpeed = active ? 2.1 : 0.42;
    antennaRotor.rotation.y += delta * spinSpeed;
    if (currentTheme === 'fantasy_night') {
      fantasyCrystal.position.y = Math.sin(elapsed * 2.6) * 0.08;
      runeRing.rotation.z = elapsed * (active ? 2.4 : 0.7);
    }

    // Beacon intensity + expanding signal ring
    if (active) {
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 8.5);
      beaconMat.emissiveIntensity = 1.6 + wave * 2.2;
      beaconLight.intensity = graphicsQuality === 'low' ? 0 : 1.5 + wave * 2.2;
      const ringPhase = (elapsed * 1.4) % 1;
      const ringScale = 1 + ringPhase * 4.2;
      beaconHalo.scale.set(ringScale, ringScale, 1);
      haloMat.opacity = (1 - ringPhase) * 0.85;
      beaconHalo.visible = true;
    } else {
      const idleWave = 0.5 + 0.5 * Math.sin(elapsed * 2.2);
      beaconMat.emissiveIntensity = 0.65 + idleWave * 0.55;
      beaconLight.intensity = graphicsQuality === 'low' ? 0 : 0.45 + idleWave * 0.35;
      const ringScale = 1 + idleWave * 0.45;
      beaconHalo.scale.set(ringScale, ringScale, 1);
      haloMat.opacity = 0.16 + idleWave * 0.14;
      beaconHalo.visible = graphicsQuality !== 'low';
    }
  };

  applyTheme(initialTheme);

  return {
    group,
    roofMaterials,
    fireMaterials,
    applyTheme,
    setGraphicsQuality,
    pulse,
    update,
    dispose: () => {
      disposeStructureGroup(group, lanternMaterials);
    },
  };
}
