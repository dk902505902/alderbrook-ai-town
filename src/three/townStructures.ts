import * as THREE from 'three';
import type { PlotId, StructureType, TownStructure } from '../types/town.ts';
import { createWindSwayMaterial, type WindUniforms } from './townEnvironment.ts';

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
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: tint,
    emissive,
    emissiveIntensity: 0.25,
    roughness: 0.28,
  });
  lanternMaterials.push(mat);
  return mat;
}

export function buildEmptyPlotMesh(
  plotId: PlotId,
  isSelected: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.plotId = plotId;

  const padMat = new THREE.MeshStandardMaterial({
    color: isSelected ? 0xc2b280 : 0x9ca3af,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const pad = addPart(group, new THREE.CylinderGeometry(1.85, 1.95, 0.05, 8), padMat, 0, 0.025, 0);
  pad.rotation.y = Math.PI / 8;

  const stakeMat = new THREE.MeshStandardMaterial({
    color: isSelected ? 0xf59e0b : 0x78350f,
    roughness: 0.85,
  });
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

  return group;
}

export function buildScaffoldingMesh(
  structure: TownStructure,
  shadowTex: THREE.Texture,
  isSelected: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.plotId = structure.plotId;
  addContactShadow(group, shadowTex, 4.4);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.84 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });

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

  return group;
}

export function buildCompletedStructureMesh(
  structure: TownStructure,
  shadowTex: THREE.Texture,
  lanternMaterials: THREE.MeshStandardMaterial[],
  isSelected: boolean,
  windUniforms?: WindUniforms,
): THREE.Group {
  const group = new THREE.Group();
  group.userData.plotId = structure.plotId;
  addContactShadow(group, shadowTex, 4.8);

  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.82 });
  const winMat = createWindowMat(lanternMaterials);

  const type: StructureType = structure.structureType;

  if (type === 'bakery') {
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.78 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65 });
    const awningMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });

    addPart(group, new THREE.BoxGeometry(2.6, 0.24, 2.4), plinthMat, 0, 0.12, 0);
    addPart(group, new THREE.BoxGeometry(2.3, 1.55, 2.0), brickMat, 0, 1.01, 0);
    addPart(group, new THREE.ConeGeometry(1.85, 1.15, 4), roofMat, 0, 2.36, 0, 0, Math.PI / 4);
    addPart(group, new THREE.BoxGeometry(0.45, 1.3, 0.45), woodMat, 0.78, 2.35, -0.55);
    addPart(group, new THREE.BoxGeometry(0.56, 0.1, 0.56), plinthMat, 0.78, 3.02, -0.55);
    addPart(group, new THREE.BoxGeometry(1.5, 0.14, 0.65), awningMat, 0, 1.18, 1.24, 0.3);
    addPart(group, new THREE.BoxGeometry(0.5, 0.78, 0.08), woodMat, -0.45, 0.63, 1.02);
    addPart(group, new THREE.BoxGeometry(0.58, 0.52, 0.08), winMat, 0.48, 0.95, 1.02);
    addPart(group, new THREE.BoxGeometry(0.48, 0.44, 0.08), winMat, 1.16, 1.0, 0.1);
  } else if (type === 'watchtower') {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.84 });
    const slateMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.58, metalness: 0.12 });
    const beaconMat = createWindowMat(lanternMaterials, 0xfef08a, 0xfacc15);

    addPart(group, new THREE.CylinderGeometry(1.45, 1.65, 0.35, 8), stoneMat, 0, 0.175, 0);
    addPart(group, new THREE.CylinderGeometry(0.92, 1.18, 2.55, 8), stoneMat, 0, 1.6, 0);
    addPart(group, new THREE.BoxGeometry(2.15, 0.38, 2.15), woodMat, 0, 2.98, 0);
    addPart(group, new THREE.ConeGeometry(1.58, 1.25, 4), slateMat, 0, 3.78, 0, 0, Math.PI / 4);
    addPart(group, new THREE.SphereGeometry(0.22, 8, 6), beaconMat, 0, 3.3, 0);
    addPart(group, new THREE.BoxGeometry(0.46, 0.82, 0.1), woodMat, 0, 0.76, 1.06);
  } else if (type === 'greenhouse') {
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xa7f3d0,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.62,
    });
    const foliageMat = windUniforms
      ? createWindSwayMaterial({ color: 0x16a34a, roughness: 0.85 }, windUniforms, {
          swayScale: 0.06,
          heightMin: 0.0,
          heightRange: 0.5,
        })
      : new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.85 });

    addPart(group, new THREE.BoxGeometry(2.7, 0.45, 2.3), plinthMat, 0, 0.225, 0);
    addPart(group, new THREE.BoxGeometry(2.45, 1.25, 2.05), glassMat, 0, 1.08, 0);
    addPart(group, new THREE.ConeGeometry(1.88, 0.9, 4), glassMat, 0, 2.15, 0, 0, Math.PI / 4);
    // Iron ribs
    addPart(group, new THREE.BoxGeometry(2.55, 0.08, 0.08), ironMat, 0, 1.72, 1.04);
    addPart(group, new THREE.BoxGeometry(2.55, 0.08, 0.08), ironMat, 0, 1.72, -1.04);
    // Foliage shrubs inside + swaying exterior planter crops
    addPart(group, new THREE.DodecahedronGeometry(0.42, 0), foliageMat, -0.5, 0.82, 0);
    addPart(group, new THREE.DodecahedronGeometry(0.48, 0), foliageMat, 0.48, 0.86, -0.15);
    addPart(group, new THREE.ConeGeometry(0.16, 0.42, 5), foliageMat, -1.12, 0.28, 1.32);
    addPart(group, new THREE.ConeGeometry(0.16, 0.45, 5), foliageMat, 1.12, 0.28, 1.32);
    addPart(group, new THREE.BoxGeometry(0.32, 0.36, 0.08), winMat, 0, 1.15, 1.04);
  } else if (type === 'windmill') {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.72 });
    const wheatMat = windUniforms
      ? createWindSwayMaterial({ color: 0xeab308, roughness: 0.82 }, windUniforms, {
          swayScale: 0.09,
          heightMin: 0.0,
          heightRange: 0.45,
        })
      : new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.82 });

    addPart(group, new THREE.CylinderGeometry(1.35, 1.55, 0.32, 10), plinthMat, 0, 0.16, 0);
    addPart(group, new THREE.CylinderGeometry(0.88, 1.18, 2.65, 10), wallMat, 0, 1.64, 0);
    addPart(group, new THREE.ConeGeometry(1.12, 1.05, 10), capMat, 0, 3.48, 0);
    addPart(group, new THREE.BoxGeometry(0.46, 0.8, 0.12), woodMat, 0, 0.72, 1.12);
    addPart(group, new THREE.BoxGeometry(0.38, 0.38, 0.08), winMat, 0, 1.85, 0.98);
    // Golden wheat sheaves swaying around windmill base
    for (const [wx, wz] of [[-1.45, 0.75], [-1.35, 1.15], [1.42, 0.8]] as Array<[number, number]>) {
      addPart(group, new THREE.ConeGeometry(0.15, 0.48, 5), wheatMat, wx, 0.24, wz);
    }

    // Animated Windmill Rotor Group
    const rotor = new THREE.Group();
    rotor.position.set(0, 2.65, 1.04);
    addPart(rotor, new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8), woodMat, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      addPart(arm, new THREE.BoxGeometry(0.08, 1.55, 0.06), woodMat, 0, 0.78, 0.06);
      addPart(arm, new THREE.BoxGeometry(0.42, 1.12, 0.03), sailMat, 0.18, 0.94, 0.08);
      rotor.add(arm);
    }
    group.add(rotor);
    group.userData.windmillRotor = rotor;
  } else if (type === 'library') {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.78 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.62 });

    addPart(group, new THREE.BoxGeometry(2.8, 0.28, 2.4), plinthMat, 0, 0.14, 0);
    addPart(group, new THREE.BoxGeometry(2.4, 1.65, 1.95), wallMat, 0, 1.1, 0);
    addPart(group, new THREE.ConeGeometry(1.92, 1.0, 4), roofMat, 0, 2.42, 0, 0, Math.PI / 4);
    addPart(group, new THREE.CylinderGeometry(0.11, 0.12, 1.55, 8), wallMat, -0.78, 1.05, 1.08);
    addPart(group, new THREE.CylinderGeometry(0.11, 0.12, 1.55, 8), wallMat, 0.78, 1.05, 1.08);
    addPart(group, new THREE.BoxGeometry(0.55, 0.85, 0.1), woodMat, 0, 0.7, 0.99);
    addPart(group, new THREE.BoxGeometry(0.42, 0.6, 0.08), winMat, -0.82, 1.15, 0.99);
    addPart(group, new THREE.BoxGeometry(0.42, 0.6, 0.08), winMat, 0.82, 1.15, 0.99);
  } else if (type === 'granary') {
    const timberMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.82 });
    const cropMat = windUniforms
      ? createWindSwayMaterial({ color: 0xd97706, roughness: 0.85 }, windUniforms, {
          swayScale: 0.08,
          heightMin: 0.0,
          heightRange: 0.42,
        })
      : crateMat;

    // Stilts + raised floor
    for (const [sx, sz] of [[-1.0, -0.8], [1.0, -0.8], [-1.0, 0.8], [1.0, 0.8]] as Array<[number, number]>) {
      addPart(group, new THREE.BoxGeometry(0.22, 0.45, 0.22), woodMat, sx, 0.225, sz);
    }
    addPart(group, new THREE.BoxGeometry(2.6, 0.18, 2.1), woodMat, 0, 0.5, 0);
    addPart(group, new THREE.BoxGeometry(2.3, 1.3, 1.85), timberMat, 0, 1.24, 0);
    const roof = addPart(group, new THREE.CylinderGeometry(0.98, 0.98, 2.45, 10, 1, false, 0, Math.PI), roofMat, 0, 1.89, 0);
    roof.rotation.z = Math.PI / 2;
    addPart(group, new THREE.BoxGeometry(0.45, 0.45, 0.45), crateMat, 0.75, 0.82, 1.12);
    addPart(group, new THREE.BoxGeometry(0.42, 0.42, 0.08), winMat, 0, 1.4, 0.94);
    addPart(group, new THREE.ConeGeometry(0.14, 0.42, 5), cropMat, -1.35, 0.21, 0.95);
    addPart(group, new THREE.ConeGeometry(0.14, 0.38, 5), cropMat, -1.1, 0.19, 1.15);
  } else if (type === 'pavilion') {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.78 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.55 });
    const lampMat = createWindowMat(lanternMaterials, 0xfef3c7, 0xf59e0b);

    addPart(group, new THREE.CylinderGeometry(1.7, 1.85, 0.26, 6), plinthMat, 0, 0.13, 0);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      addPart(group, new THREE.CylinderGeometry(0.08, 0.09, 1.6, 6), pillarMat, Math.cos(angle) * 1.28, 1.06, Math.sin(angle) * 1.28);
    }
    addPart(group, new THREE.ConeGeometry(2.05, 0.85, 6), roofMat, 0, 2.28, 0);
    addPart(group, new THREE.ConeGeometry(1.25, 0.65, 6), roofMat, 0, 2.86, 0);
    addPart(group, new THREE.SphereGeometry(0.24, 8, 6), lampMat, 0, 1.55, 0);
  } else {
    // clock_tower
    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.76 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.65 });
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.45 });
    const faceMat = createWindowMat(lanternMaterials, 0xfef9c3, 0xfde047);

    addPart(group, new THREE.BoxGeometry(2.2, 0.32, 2.2), plinthMat, 0, 0.16, 0);
    addPart(group, new THREE.BoxGeometry(1.48, 2.8, 1.48), brickMat, 0, 1.72, 0);
    addPart(group, new THREE.BoxGeometry(1.66, 0.22, 1.66), trimMat, 0, 3.18, 0);
    addPart(group, new THREE.ConeGeometry(1.25, 1.45, 4), spireMat, 0, 4.02, 0, 0, Math.PI / 4);
    // Clock dials on front/back/sides
    addPart(group, new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), faceMat, 0, 2.65, 0.76, Math.PI / 2);
    addPart(group, new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), faceMat, 0.76, 2.65, 0, 0, 0, Math.PI / 2);
    addPart(group, new THREE.BoxGeometry(0.46, 0.78, 0.1), woodMat, 0, 0.71, 0.76);
  }

  // Tier 2 Enhancement: Banner & Side Alcove
  if (structure.tier >= 2) {
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.6 });
    addPart(group, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), poleMat, -1.42, 0.7, 1.18);
    addPart(group, new THREE.BoxGeometry(0.42, 0.62, 0.05), bannerMat, -1.42, 1.12, 1.21);
  }

  // Tier 3 Enhancement: Gilded Crest & Courtyard Lantern Post
  if (structure.tier >= 3) {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.85 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 });
    const globeMat = createWindowMat(lanternMaterials, 0xfef3c7, 0xf59e0b);
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
        const idx = lanternMaterials.indexOf(mat as THREE.MeshStandardMaterial);
        if (idx !== -1) {
          lanternMaterials.splice(idx, 1);
        }
        mat.dispose();
      }
    }
  });
}
