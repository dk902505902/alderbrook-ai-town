import * as THREE from 'three';
import {
  ALL_PLOT_IDS,
  PLOT_META,
  type BiomeId,
  type GraphicsQuality,
  type PlotId,
  type TownTheme,
} from '../types/town.ts';
import {
  applyThemeToMaterial,
  COBBLE_PALETTES,
  GRASS_TUFT_PALETTES,
  tagThemeMaterial,
  WILDFLOWER_PALETTES,
} from './townThemes.ts';

export interface WindUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
}

export interface WaterUniforms {
  uTime: { value: number };
}

export interface TownDetailsHandle {
  group: THREE.Group;
  windUniforms: WindUniforms;
  setDensityFactor: (factor: number) => void;
  setLanternShadows: (enabled: boolean) => void;
  applyTheme: (theme: TownTheme) => void;
  dispose: () => void;
}

function createSeededRandom(seedInitial: number): () => number {
  let seed = seedInitial >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function mergeSimpleGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;

  const nonIndexed = geometries.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (!out.attributes.normal) {
      out.computeVertexNormals();
    }
    const pos = out.attributes.position;
    totalVerts += pos.count;
    totalIndices += pos.count;
    return out;
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalIndices * 3);

  let offset = 0;
  for (const g of nonIndexed) {
    const posArr = g.attributes.position.array as Float32Array;
    const normArr = g.attributes.normal.array as Float32Array;
    positions.set(posArr, offset * 3);
    normals.set(normArr, offset * 3);
    offset += g.attributes.position.count;
    if (!geometries.includes(g)) {
      g.dispose();
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return merged;
}

export function createWindSwayMaterial(
  params: THREE.MeshStandardMaterialParameters,
  windUniforms: WindUniforms,
  options: { swayScale?: number; heightMin?: number; heightRange?: number } = {},
): THREE.MeshStandardMaterial {
  const swayScale = options.swayScale ?? 0.08;
  const heightMin = options.heightMin ?? 0.0;
  const heightRange = options.heightRange ?? 1.2;

  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWindStrength;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float swayH = clamp((position.y - ${heightMin.toFixed(3)}) / ${heightRange.toFixed(3)}, 0.0, 1.4);
      #ifdef USE_INSTANCING
        vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 instOrigin = vec3(0.0);
      #endif
      float windPhase = uTime * 1.85 + instOrigin.x * 0.42 + instOrigin.z * 0.37;
      float gust = sin(windPhase) + 0.35 * sin(windPhase * 2.1 + 0.8);
      transformed.x += gust * swayH * swayH * ${swayScale.toFixed(4)} * uWindStrength;
      transformed.z += cos(windPhase * 0.85) * swayH * swayH * ${(swayScale * 0.65).toFixed(4)} * uWindStrength;`,
    );
  };
  mat.customProgramCacheKey = () => `wind_sway_${swayScale}_${heightMin}_${heightRange}`;
  return mat;
}

export function createClothWaveMaterial(
  params: THREE.MeshStandardMaterialParameters,
  windUniforms: WindUniforms,
  options: { waveAmp?: number; waveFreq?: number; phaseOffset?: number } = {},
): THREE.MeshStandardMaterial {
  const waveAmp = options.waveAmp ?? 0.085;
  const waveFreq = options.waveFreq ?? 5.5;
  const phaseOffset = options.phaseOffset ?? 0.0;

  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    ...params,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWindStrength;`,
    );

    // Anchor rigidly at top edge (uv.y == 1.0) and flutter smoothly toward bottom hem (uv.y == 0.0)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float dropFactor = clamp(1.0 - uv.y, 0.0, 1.0);
      float flutter = dropFactor * dropFactor;
      float clothPhase = uTime * 3.4 - uv.y * ${waveFreq.toFixed(2)} + uv.x * 2.2 + ${phaseOffset.toFixed(2)};
      float waveZ = (sin(clothPhase) + 0.35 * sin(clothPhase * 1.9 + 1.1)) * ${waveAmp.toFixed(4)} * flutter * uWindStrength;
      float waveX = cos(clothPhase * 0.75) * ${(waveAmp * 0.38).toFixed(4)} * flutter * uWindStrength;
      transformed.z += waveZ;
      transformed.x += waveX;`,
    );
  };
  mat.customProgramCacheKey = () => `cloth_wave_${waveAmp}_${waveFreq}_${phaseOffset}`;
  return mat;
}

export function createRipplingWaterMaterial(
  waterUniforms: WaterUniforms,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.14,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      varying float vRippleCrest;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float radialDist = length(position.xz);
      float ringWave = sin(radialDist * 13.5 - uTime * 3.8);
      float crossWave = cos(position.x * 5.2 + uTime * 2.1) * sin(position.z * 5.2 - uTime * 1.9);
      float fadeEdge = smoothstep(1.9, 0.2, radialDist);
      float disp = (ringWave * 0.02 + crossWave * 0.008) * fadeEdge;
      transformed.y += disp;
      vRippleCrest = clamp((ringWave * 0.5 + 0.5) * fadeEdge, 0.0, 1.0);`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying float vRippleCrest;`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 crestFoam = vec3(0.78, 0.95, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, crestFoam, pow(vRippleCrest, 3.0) * 0.42);`,
    );
  };
  mat.customProgramCacheKey = () => 'alderbrook_water_ripples_v1';
  return mat;
}

function isNearRoadOrBuilding(x: number, z: number, minPlotClearance = 3.1): boolean {
  const distCenter = Math.hypot(x, z);
  if (distCenter < 5.6) return true;
  // North-South path (x in [-1.6, 1.6], z in [-13.5, 13.5])
  if (Math.abs(x) < 1.85 && Math.abs(z) < 13.5) return true;
  // East-West path (z around -0.5, x in [-13.5, 13.5])
  if (Math.abs(z + 0.5) < 1.85 && Math.abs(x) < 13.5) return true;
  // Cardinal Landmarks
  if (Math.hypot(x, z + 10.5) < 4.5) return true; // Town Hall
  if (Math.hypot(x - 10.5, z + 0.5) < 4.2) return true; // Workshop
  if (Math.hypot(x + 10.5, z + 0.5) < 4.2) return true; // Market
  if (Math.hypot(x, z - 10.2) < 4.4) return true; // Park
  // Residential Cottages (West & East Meadow)
  if (Math.hypot(x + 13.8, z - 6.2) < 3.4) return true;
  if (Math.hypot(x - 13.8, z - 6.2) < 3.4) return true;
  // The Signal Relay (CLI Agent Hub near Train Station)
  if (Math.hypot(x - 10.6, z - 12.6) < 3.7) return true;
  // Scenic Railway Perimeter & Station Corridor
  if (distCenter > 16.8 && distCenter < 22.8) return true;

  for (const plotId of ALL_PLOT_IDS) {
    const pm = PLOT_META[plotId];
    if (Math.hypot(x - pm.x, z - pm.z) < minPlotClearance) {
      return true;
    }
  }
  return false;
}

export function buildScatteredTownDetails(
  scene: THREE.Scene,
  lanternMaterials: THREE.MeshStandardMaterial[],
  windUniforms: WindUniforms,
): TownDetailsHandle {
  const group = new THREE.Group();
  group.name = 'town:instanced_details';
  const rand = createSeededRandom(20261120);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const disposables: Array<{ dispose: () => void }> = [];

  // -------------------------------------------------------------------------
  // 1. Procedural Cobblestones around Square & Path Borders (140 instances)
  // -------------------------------------------------------------------------
  const cobbleGeo = new THREE.CylinderGeometry(0.18, 0.23, 0.06, 6);
  const cobbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.03,
  });
  disposables.push(cobbleGeo, cobbleMat);

  const cobbleCoords: Array<{ x: number; z: number; s: number; rot: number; hex: number }> = [];
  const cobblePalette = [0xa8a29e, 0x94a3b8, 0xcbd5e1, 0xb8a99a];

  // Ring around central cobble plaza
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + (rand() - 0.5) * 0.08;
    const r = 4.65 + (rand() - 0.5) * 0.55;
    cobbleCoords.push({
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      s: 0.8 + rand() * 0.55,
      rot: rand() * Math.PI,
      hex: cobblePalette[i % cobblePalette.length],
    });
  }
  // Borders along the 4 cardinal paths
  for (let i = 0; i < 104; i++) {
    const axis = i % 2;
    const side = (i % 4 < 2 ? -1 : 1) * (1.22 + rand() * 0.25);
    const along = (rand() - 0.5) * 18.2;
    const x = axis === 0 ? side : along;
    const z = axis === 0 ? along : -0.5 + side;
    if (Math.hypot(x, z) < 4.5) continue;
    cobbleCoords.push({
      x,
      z,
      s: 0.72 + rand() * 0.58,
      rot: rand() * Math.PI,
      hex: cobblePalette[i % cobblePalette.length],
    });
  }

  const cobbleMax = cobbleCoords.length;
  const cobbleMesh = new THREE.InstancedMesh(cobbleGeo, cobbleMat, cobbleMax);
  cobbleMesh.receiveShadow = true;
  cobbleCoords.forEach((c, idx) => {
    dummy.position.set(c.x, 0.025, c.z);
    dummy.rotation.set(0, c.rot, 0);
    dummy.scale.set(c.s, 0.85, c.s * (0.8 + rand() * 0.35));
    dummy.updateMatrix();
    cobbleMesh.setMatrixAt(idx, dummy.matrix);
    color.setHex(c.hex);
    cobbleMesh.setColorAt(idx, color);
  });
  cobbleMesh.instanceMatrix.needsUpdate = true;
  if (cobbleMesh.instanceColor) cobbleMesh.instanceColor.needsUpdate = true;
  cobbleMesh.computeBoundingSphere();
  group.add(cobbleMesh);

  // -------------------------------------------------------------------------
  // 2. Stylized Grass Tufts with Wind Sway (180 instances)
  // -------------------------------------------------------------------------
  const blade1 = new THREE.ConeGeometry(0.06, 0.34, 4);
  blade1.translate(0, 0.17, 0);
  const blade2 = new THREE.ConeGeometry(0.055, 0.28, 4);
  blade2.rotateZ(0.26);
  blade2.translate(0.07, 0.14, 0.03);
  const blade3 = new THREE.ConeGeometry(0.055, 0.26, 4);
  blade3.rotateZ(-0.24);
  blade3.rotateY(0.9);
  blade3.translate(-0.06, 0.13, -0.04);
  const grassGeo = mergeSimpleGeometries([blade1, blade2, blade3]);
  blade1.dispose();
  blade2.dispose();
  blade3.dispose();

  const grassMat = createWindSwayMaterial(
    { color: 0xffffff, roughness: 0.88, metalness: 0.0 },
    windUniforms,
    { swayScale: 0.075, heightMin: 0.02, heightRange: 0.34 },
  );
  disposables.push(grassGeo, grassMat);

  const grassMax = 180;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassMax);
  const grassPalette = [0x65a30d, 0x4d7c0f, 0x84cc16, 0x5c8d46];
  let gIdx = 0;
  let attempts = 0;
  while (gIdx < grassMax && attempts < 1400) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = 5.8 + rand() * 16.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearRoadOrBuilding(x, z, 2.7)) continue;

    const s = 0.8 + rand() * 0.55;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.85 + rand() * 0.35), s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(gIdx, dummy.matrix);
    color.setHex(grassPalette[gIdx % grassPalette.length]);
    grassMesh.setColorAt(gIdx, color);
    gIdx++;
  }
  grassMesh.count = gIdx;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);

  // -------------------------------------------------------------------------
  // 3. Wildflowers (Stems + Blossoms with Wind Sway, 110 instances)
  // -------------------------------------------------------------------------
  const stemGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.24, 5);
  stemGeo.translate(0, 0.12, 0);
  const stemMat = tagThemeMaterial(
    createWindSwayMaterial(
      { color: 0x4d7c0f, roughness: 0.85 },
      windUniforms,
      { swayScale: 0.08, heightMin: 0.0, heightRange: 0.28 },
    ),
    'foliage',
  );
  const bloomGeo = new THREE.DodecahedronGeometry(0.075, 0);
  bloomGeo.translate(0, 0.25, 0);
  const bloomMat = createWindSwayMaterial(
    { color: 0xffffff, roughness: 0.62, metalness: 0.02 },
    windUniforms,
    { swayScale: 0.08, heightMin: 0.0, heightRange: 0.28 },
  );
  disposables.push(stemGeo, stemMat, bloomGeo, bloomMat);

  const flowerMax = 110;
  const stemMesh = new THREE.InstancedMesh(stemGeo, stemMat, flowerMax);
  const bloomMesh = new THREE.InstancedMesh(bloomGeo, bloomMat, flowerMax);
  const flowerPalette = [0xf43f5e, 0xfbbf24, 0xfb923c, 0xa78bfa, 0xfef3c7];

  let fIdx = 0;
  attempts = 0;
  while (fIdx < flowerMax && attempts < 1200) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = 5.8 + rand() * 14.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isNearRoadOrBuilding(x, z, 2.65)) continue;

    const s = 0.85 + rand() * 0.4;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    stemMesh.setMatrixAt(fIdx, dummy.matrix);
    bloomMesh.setMatrixAt(fIdx, dummy.matrix);
    color.setHex(flowerPalette[fIdx % flowerPalette.length]);
    bloomMesh.setColorAt(fIdx, color);
    fIdx++;
  }
  stemMesh.count = fIdx;
  bloomMesh.count = fIdx;
  stemMesh.instanceMatrix.needsUpdate = true;
  bloomMesh.instanceMatrix.needsUpdate = true;
  if (bloomMesh.instanceColor) bloomMesh.instanceColor.needsUpdate = true;
  stemMesh.computeBoundingSphere();
  bloomMesh.computeBoundingSphere();
  group.add(stemMesh, bloomMesh);

  // -------------------------------------------------------------------------
  // 4. Stylized Wooden Fences (Merged post+rail geometry, 20 instances)
  // -------------------------------------------------------------------------
  const postL = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  postL.translate(-0.75, 0.31, 0);
  const postR = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  postR.translate(0.75, 0.31, 0);
  const railTop = new THREE.BoxGeometry(1.62, 0.07, 0.06);
  railTop.translate(0, 0.48, 0);
  const railMid = new THREE.BoxGeometry(1.62, 0.07, 0.06);
  railMid.translate(0, 0.27, 0);
  const fenceGeo = mergeSimpleGeometries([postL, postR, railTop, railMid]);
  postL.dispose();
  postR.dispose();
  railTop.dispose();
  railMid.dispose();

  const fenceMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.85 }),
    'wood',
  );
  disposables.push(fenceGeo, fenceMat);

  const fencePlacements: Array<[number, number, number]> = [];
  // Outer meadow & park accent segments positioned safely outside plots & roads
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2 + 0.14;
    // Leave openings along N, S, E, W approach axes
    if (
      Math.abs(Math.cos(angle)) < 0.18 ||
      Math.abs(Math.sin(angle)) < 0.18
    ) {
      continue;
    }
    const r = 16.0;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (isNearRoadOrBuilding(x, z, 2.7)) continue;
    fencePlacements.push([x, z, Math.atan2(x, z) + Math.PI / 2]);
  }

  const fenceMax = Math.max(fencePlacements.length, 1);
  const fenceMesh = new THREE.InstancedMesh(fenceGeo, fenceMat, fenceMax);
  fenceMesh.castShadow = true;
  fenceMesh.receiveShadow = true;
  fencePlacements.forEach(([x, z, rotY], idx) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fenceMesh.setMatrixAt(idx, dummy.matrix);
  });
  fenceMesh.count = fencePlacements.length;
  fenceMesh.instanceMatrix.needsUpdate = true;
  fenceMesh.computeBoundingSphere();
  group.add(fenceMesh);

  // -------------------------------------------------------------------------
  // 5. Glowing Street Lanterns around Square & Paths (12 instances)
  // -------------------------------------------------------------------------
  const lBase = new THREE.CylinderGeometry(0.08, 0.12, 0.25, 6);
  lBase.translate(0, 0.125, 0);
  const lPole = new THREE.CylinderGeometry(0.045, 0.06, 1.85, 6);
  lPole.translate(0, 1.12, 0);
  const lCap = new THREE.ConeGeometry(0.24, 0.18, 6);
  lCap.translate(0, 2.34, 0);
  const lanternFrameGeo = mergeSimpleGeometries([lBase, lPole, lCap]);
  lBase.dispose();
  lPole.dispose();
  lCap.dispose();

  const lanternFrameMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.42,
      metalness: 0.75,
    }),
    'metal',
  );
  const lanternBulbGeo = new THREE.OctahedronGeometry(0.16, 0);
  lanternBulbGeo.translate(0, 2.13, 0);
  const lanternBulbMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
      roughness: 0.22,
    }),
    'lantern',
  );
  lanternMaterials.push(lanternBulbMat);
  disposables.push(lanternFrameGeo, lanternFrameMat, lanternBulbGeo, lanternBulbMat);

  const lanternCoords: Array<[number, number]> = [
    [-3.5, -3.5],
    [3.5, -3.5],
    [-3.5, 3.5],
    [3.5, 3.5],
    [-1.45, -6.2],
    [1.45, -6.2],
    [-1.45, 5.8],
    [1.45, 5.8],
    [-6.2, -1.95],
    [-6.2, 0.95],
    [6.2, -1.95],
    [6.2, 0.95],
  ];

  const lanternFrameMesh = new THREE.InstancedMesh(
    lanternFrameGeo,
    lanternFrameMat,
    lanternCoords.length,
  );
  lanternFrameMesh.castShadow = true;
  const lanternBulbMesh = new THREE.InstancedMesh(
    lanternBulbGeo,
    lanternBulbMat,
    lanternCoords.length,
  );

  lanternCoords.forEach(([x, z], idx) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, idx * 0.4, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lanternFrameMesh.setMatrixAt(idx, dummy.matrix);
    lanternBulbMesh.setMatrixAt(idx, dummy.matrix);
  });
  lanternFrameMesh.instanceMatrix.needsUpdate = true;
  lanternBulbMesh.instanceMatrix.needsUpdate = true;
  lanternFrameMesh.computeBoundingSphere();
  lanternBulbMesh.computeBoundingSphere();
  group.add(lanternFrameMesh, lanternBulbMesh);

  // -------------------------------------------------------------------------
  // 6. Cozy Torch Braziers flanking Landmarks (6 instances)
  // -------------------------------------------------------------------------
  const tStand = new THREE.CylinderGeometry(0.09, 0.14, 0.85, 6);
  tStand.translate(0, 0.425, 0);
  const tBowl = new THREE.CylinderGeometry(0.22, 0.12, 0.2, 6);
  tBowl.translate(0, 0.92, 0);
  const torchStandGeo = mergeSimpleGeometries([tStand, tBowl]);
  tStand.dispose();
  tBowl.dispose();

  const torchFlameGeo = new THREE.ConeGeometry(0.14, 0.34, 6);
  torchFlameGeo.translate(0, 1.15, 0);
  const torchFlameMat = tagThemeMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf97316,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    }),
    'torchFlame',
  );
  lanternMaterials.push(torchFlameMat);
  disposables.push(torchStandGeo, torchFlameGeo, torchFlameMat);

  const torchCoords: Array<[number, number]> = [
    [-2.4, -7.8],
    [2.4, -7.8],
    [7.8, -2.3],
    [7.8, 1.3],
    [-7.8, -2.3],
    [-7.8, 1.3],
  ];

  const torchStandMesh = new THREE.InstancedMesh(
    torchStandGeo,
    lanternFrameMat,
    torchCoords.length,
  );
  torchStandMesh.castShadow = true;
  const torchFlameMesh = new THREE.InstancedMesh(
    torchFlameGeo,
    torchFlameMat,
    torchCoords.length,
  );
  torchCoords.forEach(([x, z], idx) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, idx * 0.5, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    torchStandMesh.setMatrixAt(idx, dummy.matrix);
    torchFlameMesh.setMatrixAt(idx, dummy.matrix);
  });
  torchStandMesh.instanceMatrix.needsUpdate = true;
  torchFlameMesh.instanceMatrix.needsUpdate = true;
  torchStandMesh.computeBoundingSphere();
  torchFlameMesh.computeBoundingSphere();
  group.add(torchStandMesh, torchFlameMesh);

  scene.add(group);

  const totalGrass = gIdx;
  const totalFlowers = fIdx;
  const totalFences = fencePlacements.length;

  return {
    group,
    windUniforms,
    setDensityFactor: (factor: number) => {
      const f = Math.max(0.35, Math.min(1, factor));
      cobbleMesh.count = Math.max(24, Math.round(cobbleMax * f));
      grassMesh.count = Math.max(30, Math.round(totalGrass * f));
      const fCount = Math.max(20, Math.round(totalFlowers * f));
      stemMesh.count = fCount;
      bloomMesh.count = fCount;
      fenceMesh.count = Math.max(4, Math.round(totalFences * f));
    },
    setLanternShadows: (enabled: boolean) => {
      fenceMesh.castShadow = enabled;
      lanternFrameMesh.castShadow = enabled;
      torchStandMesh.castShadow = enabled;
    },
    applyTheme: (theme: TownTheme) => {
      const cPal = COBBLE_PALETTES[theme];
      for (let i = 0; i < cobbleMax; i++) {
        color.setHex(cPal[i % cPal.length]);
        cobbleMesh.setColorAt(i, color);
      }
      if (cobbleMesh.instanceColor) cobbleMesh.instanceColor.needsUpdate = true;

      const gPal = GRASS_TUFT_PALETTES[theme];
      for (let i = 0; i < totalGrass; i++) {
        color.setHex(gPal[i % gPal.length]);
        grassMesh.setColorAt(i, color);
      }
      if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;

      const fPal = WILDFLOWER_PALETTES[theme];
      for (let i = 0; i < totalFlowers; i++) {
        color.setHex(fPal[i % fPal.length]);
        bloomMesh.setColorAt(i, color);
      }
      if (bloomMesh.instanceColor) bloomMesh.instanceColor.needsUpdate = true;

      applyThemeToMaterial(stemMat, theme);
      applyThemeToMaterial(fenceMat, theme);
      applyThemeToMaterial(lanternFrameMat, theme);
      applyThemeToMaterial(lanternBulbMat, theme);
      applyThemeToMaterial(torchFlameMat, theme);
    },
    dispose: () => {
      for (const mat of [lanternBulbMat, torchFlameMat]) {
        const idx = lanternMaterials.indexOf(mat);
        if (idx !== -1) lanternMaterials.splice(idx, 1);
      }
      scene.remove(group);
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}

// ============================================================================
// Expandable Outer Biomes (Dense Forest, Desert Dunes, Crystal Mountain Cave)
// & Instanced Cobblestone Road Builder (4 GB RAM Mobile-Optimized)
// ============================================================================

export interface TownExpansionHandle {
  group: THREE.Group;
  caveGroup: THREE.Group;
  caveRoofMaterials: THREE.MeshStandardMaterial[];
  caveCrystalMaterials: THREE.MeshStandardMaterial[];
  setUnlockedBiomes: (biomes: BiomeId[]) => void;
  setRoads: (roads: string[]) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  applyTheme: (theme: TownTheme) => void;
  update: (elapsed: number) => void;
  dispose: () => void;
}

export function buildExpandableBiomesAndRoads(
  scene: THREE.Scene,
  lanternMaterials: THREE.MeshStandardMaterial[],
  initialTheme: TownTheme = 'meadow',
): TownExpansionHandle {
  const root = new THREE.Group();
  root.name = 'town_expansions_root';
  const disposables: Array<{ dispose: () => void }> = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // -------------------------------------------------------------------------
  // 1. AI-Built Instanced Cobblestone Roads (Single InstancedMesh, 680 cap)
  // -------------------------------------------------------------------------
  const MAX_ROAD_TILES = 960;
  const roadTileGeo = new THREE.BoxGeometry(1.05, 0.045, 0.74);
  const roadTileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const roadMesh = new THREE.InstancedMesh(roadTileGeo, roadTileMat, MAX_ROAD_TILES);
  roadMesh.receiveShadow = true;
  roadMesh.castShadow = false;
  roadMesh.count = 0;
  roadMesh.frustumCulled = false;
  root.add(roadMesh);
  disposables.push(roadTileGeo, roadTileMat);

  let currentRoads: string[] = [];
  let currentTheme: TownTheme = initialTheme;

  const isNearAnyPlot = (x: number, z: number, minClearance = 3.8): boolean => {
    const minSq = minClearance * minClearance;
    for (const pm of Object.values(PLOT_META)) {
      const dx = x - pm.x;
      const dz = z - pm.z;
      if (dx * dx + dz * dz < minSq) return true;
    }
    return false;
  };

  const ROAD_SEGMENTS: Record<string, Array<[number, number]>> = {
    plaza_to_forest: [
      [-8.6, -8.4],
      [-15.0, -14.2],
      [-21.2, -19.4],
      [-24.8, -22.2],
      [-30.5, -17.0],
    ],
    plaza_to_desert: [
      [8.6, 8.2],
      [15.2, 14.0],
      [21.4, 19.2],
      [25.2, 22.4],
      [30.8, 16.8],
    ],
    plaza_to_cave: [
      [8.6, -8.4],
      [14.8, -14.4],
      [20.4, -20.8],
      [25.6, -24.6],
      [21.8, -28.8],
    ],
    plaza_to_spur: [
      [10.5, -0.5],
      [17.5, 0.5],
      [24.5, 1.5],
      [30.6, 2.2],
    ],
    plaza_to_alpine: [
      [0.0, -13.5],
      [0.8, -24.5],
      [1.8, -36.5],
      [2.5, -47.0],
    ],
    plaza_to_river: [
      [-13.5, -0.5],
      [-24.5, 0.4],
      [-36.5, 1.4],
      [-46.5, 2.2],
    ],
    plaza_to_canyon: [
      [0.0, 13.5],
      [0.8, 24.5],
      [1.8, 36.5],
      [2.2, 47.0],
    ],
  };

  const rebuildRoadInstances = () => {
    const pal = COBBLE_PALETTES[currentTheme] ?? COBBLE_PALETTES.meadow;
    let idx = 0;

    const laySegment = (x0: number, z0: number, x1: number, z1: number) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) return;
      const angle = Math.atan2(dx, dz);
      const step = 0.88;
      const steps = Math.max(2, Math.floor(dist / step));
      const sideX = -dz / dist;
      const sideZ = dx / dist;

      for (let i = 0; i <= steps && idx < MAX_ROAD_TILES; i++) {
        const t = i / steps;
        const jitter = Math.sin(i * 1.9 + idx * 0.7) * 0.12;
        const bx = x0 + dx * t + sideX * jitter;
        const bz = z0 + dz * t + sideZ * jitter;

        // Primary stone tile
        dummy.position.set(bx, 0.028, bz);
        dummy.rotation.set(0, angle + (i % 2 === 0 ? 0.04 : -0.04), 0);
        dummy.scale.set(0.95 + (i % 3) * 0.08, 1, 0.92 + ((i + 1) % 3) * 0.07);
        dummy.updateMatrix();
        roadMesh.setMatrixAt(idx, dummy.matrix);
        color.setHex(pal[idx % pal.length]);
        roadMesh.setColorAt(idx, color);
        idx++;

        // Secondary flanking stone for cozy cobblestone width
        if (idx < MAX_ROAD_TILES && i % 2 === 0) {
          const offset = i % 4 === 0 ? 0.62 : -0.62;
          dummy.position.set(bx + sideX * offset, 0.025, bz + sideZ * offset);
          dummy.rotation.set(0, angle + 0.14, 0);
          dummy.scale.set(0.68, 0.9, 0.72);
          dummy.updateMatrix();
          roadMesh.setMatrixAt(idx, dummy.matrix);
          color.setHex(pal[(idx + 2) % pal.length]);
          roadMesh.setColorAt(idx, color);
          idx++;
        }
      }
    };

    for (const roadId of currentRoads) {
      if (idx >= MAX_ROAD_TILES) break;
      const preset = ROAD_SEGMENTS[roadId];
      if (preset) {
        for (let s = 0; s < preset.length - 1; s++) {
          laySegment(preset[s][0], preset[s][1], preset[s + 1][0], preset[s + 1][1]);
        }
      } else if (roadId.startsWith('plot:')) {
        const pid = roadId.slice(5) as PlotId;
        const pm = PLOT_META[pid];
        if (pm) {
          // Connect from nearest town axis hub to the plot entrance
          const hubX = Math.abs(pm.x) > 15 ? (pm.x > 0 ? 10.5 : -10.5) : 0;
          const hubZ = Math.abs(pm.z) > 15 ? (pm.z > 0 ? 10.2 : -10.2) : 0;
          laySegment(hubX, hubZ, pm.x * 0.92, pm.z * 0.92);
        }
      }
    }

    roadMesh.count = idx;
    roadMesh.visible = idx > 0;
    roadMesh.instanceMatrix.needsUpdate = true;
    if (roadMesh.instanceColor) roadMesh.instanceColor.needsUpdate = true;
  };

  // -------------------------------------------------------------------------
  // 2. Dense Forest Biome (North-West, centered around -28, -24)
  // -------------------------------------------------------------------------
  const forestGroup = new THREE.Group();
  forestGroup.name = 'biome:forest';
  forestGroup.visible = false;

  const forestGroundGeo = new THREE.CircleGeometry(17.5, 24);
  const forestGroundMat = new THREE.MeshStandardMaterial({
    color: 0x3f6234,
    roughness: 0.96,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const forestGround = new THREE.Mesh(forestGroundGeo, forestGroundMat);
  forestGround.rotation.x = -Math.PI / 2;
  forestGround.position.set(-28.5, 0.015, -22.5);
  forestGround.receiveShadow = true;
  forestGroup.add(forestGround);
  disposables.push(forestGroundGeo, forestGroundMat);

  const pineTrunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.55, 6);
  pineTrunkGeo.translate(0, 0.77, 0);
  const pineCone1 = new THREE.ConeGeometry(1.25, 2.2, 6);
  pineCone1.translate(0, 2.2, 0);
  const pineCone2 = new THREE.ConeGeometry(0.92, 1.85, 6);
  pineCone2.translate(0, 3.35, 0);
  const pineCanopyGeo = mergeSimpleGeometries([pineCone1, pineCone2]);
  pineCone1.dispose();
  pineCone2.dispose();

  const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
  const pineCanopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const mossRockGeo = new THREE.DodecahedronGeometry(0.65, 0);
  const mossRockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.92 });
  disposables.push(pineTrunkGeo, pineCanopyGeo, pineTrunkMat, pineCanopyMat, mossRockGeo, mossRockMat);

  const pineCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 52; i++) {
    const angle = (i * 2.39996) % (Math.PI * 2);
    const rad = 3.2 + ((i * 3.9) % 13.6);
    const px = -28.5 + Math.cos(angle) * rad;
    const pz = -22.5 + Math.sin(angle) * rad;
    // Keep all plots (including outer expansion ring) and inner railway clear
    if (isNearAnyPlot(px, pz, 4.0)) continue;
    if (Math.hypot(px, pz) < 22.8) continue; // Outside railway
    pineCoords.push([px, pz, 0.85 + (i % 5) * 0.14]);
  }
  const pineTrunkMesh = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, Math.max(1, pineCoords.length));
  const pineCanopyMesh = new THREE.InstancedMesh(pineCanopyGeo, pineCanopyMat, Math.max(1, pineCoords.length));
  const pinePalette = [0x166534, 0x15803d, 0x14532d, 0x1e6b3a];
  pineCoords.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i * 0.9, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    pineTrunkMesh.setMatrixAt(i, dummy.matrix);
    pineCanopyMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(pinePalette[i % pinePalette.length]);
    pineCanopyMesh.setColorAt(i, color);
  });
  pineTrunkMesh.count = pineCoords.length;
  pineCanopyMesh.count = pineCoords.length;
  pineTrunkMesh.instanceMatrix.needsUpdate = true;
  pineCanopyMesh.instanceMatrix.needsUpdate = true;
  if (pineCanopyMesh.instanceColor) pineCanopyMesh.instanceColor.needsUpdate = true;
  pineTrunkMesh.computeBoundingSphere();
  pineCanopyMesh.computeBoundingSphere();
  forestGroup.add(pineTrunkMesh, pineCanopyMesh);

  const rockCount = 14;
  const forestRockMesh = new THREE.InstancedMesh(mossRockGeo, mossRockMat, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + 0.3;
    const r = 5.5 + (i % 4) * 2.1;
    const rx = -28.0 + Math.cos(a) * r;
    const rz = -22.0 + Math.sin(a) * r;
    dummy.position.set(rx, 0.28, rz);
    dummy.rotation.set(i * 0.5, i * 1.1, 0);
    dummy.scale.set(1.1 + (i % 3) * 0.3, 0.65, 0.95);
    dummy.updateMatrix();
    forestRockMesh.setMatrixAt(i, dummy.matrix);
  }
  forestRockMesh.instanceMatrix.needsUpdate = true;
  forestGroup.add(forestRockMesh);
  root.add(forestGroup);

  // -------------------------------------------------------------------------
  // 3. Desert Dunes Biome (South-East, centered around 28, 22)
  // -------------------------------------------------------------------------
  const desertGroup = new THREE.Group();
  desertGroup.name = 'biome:desert';
  desertGroup.visible = false;

  const desertGroundGeo = new THREE.CircleGeometry(17.5, 24);
  const desertGroundMat = new THREE.MeshStandardMaterial({
    color: 0xe6be7a,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const desertGround = new THREE.Mesh(desertGroundGeo, desertGroundMat);
  desertGround.rotation.x = -Math.PI / 2;
  desertGround.position.set(28.5, 0.016, 22.5);
  desertGround.receiveShadow = true;
  desertGroup.add(desertGround);
  disposables.push(desertGroundGeo, desertGroundMat);

  // Sculpted sand dunes (InstancedMesh, kept clear of outer plots & outer railway loop)
  const duneGeo = new THREE.SphereGeometry(2.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xdcb065, roughness: 0.95 });
  const duneCoords: Array<[number, number, number, number]> = [
    [40.8, 30.2, 1.5, 0.6],
    [39.8, 19.8, 1.3, 0.52],
    [29.8, 32.8, 1.4, 0.58],
    [26.4, 34.4, 1.2, 0.48],
    [40.6, 12.6, 1.1, 0.46],
    [15.8, 28.4, 1.0, 0.42],
  ];
  const duneMesh = new THREE.InstancedMesh(duneGeo, duneMat, duneCoords.length);
  duneCoords.forEach(([x, z, sx, sy], i) => {
    dummy.position.set(x, -0.05, z);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.set(sx, sy, sx * 0.8);
    dummy.updateMatrix();
    duneMesh.setMatrixAt(i, dummy.matrix);
  });
  duneMesh.instanceMatrix.needsUpdate = true;
  duneMesh.computeBoundingSphere();
  desertGroup.add(duneMesh);
  disposables.push(duneGeo, duneMat);

  // Merged Saguaro Cactus InstancedMesh (1 draw call for all cacti!)
  const cTrunk = new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6);
  cTrunk.translate(0, 1.1, 0);
  const cArmL = new THREE.CylinderGeometry(0.12, 0.13, 0.88, 6);
  cArmL.translate(-0.36, 1.38, 0);
  const cArmLConn = new THREE.BoxGeometry(0.36, 0.2, 0.2);
  cArmLConn.translate(-0.18, 1.02, 0);
  const cArmR = new THREE.CylinderGeometry(0.12, 0.13, 0.78, 6);
  cArmR.translate(0.36, 1.54, 0);
  const cArmRConn = new THREE.BoxGeometry(0.36, 0.2, 0.2);
  cArmRConn.translate(0.18, 1.24, 0);
  const cactusGeo = mergeSimpleGeometries([cTrunk, cArmL, cArmLConn, cArmR, cArmRConn]);
  cTrunk.dispose();
  cArmL.dispose();
  cArmLConn.dispose();
  cArmR.dispose();
  cArmRConn.dispose();

  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4e, roughness: 0.86 });
  disposables.push(cactusGeo, cactusMat);

  const cactusCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 30; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const r = 3.8 + ((i * 3.1) % 13.0);
    const cx = 28.5 + Math.cos(a) * r;
    const cz = 22.5 + Math.sin(a) * r;
    if (isNearAnyPlot(cx, cz, 4.0)) continue;
    if (Math.hypot(cx, cz) < 22.8) continue;
    if (cx > 17 && cx < 37 && cz < 13.5) continue; // Keep East outer railway loop clear
    cactusCoords.push([cx, cz, 0.78 + (i % 4) * 0.16]);
  }
  const cactusMesh = new THREE.InstancedMesh(cactusGeo, cactusMat, Math.max(1, cactusCoords.length));
  cactusCoords.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    cactusMesh.setMatrixAt(i, dummy.matrix);
  });
  cactusMesh.count = cactusCoords.length;
  cactusMesh.instanceMatrix.needsUpdate = true;
  cactusMesh.computeBoundingSphere();
  desertGroup.add(cactusMesh);

  // Sandstone Arch Landmark near Desert Dunes edge
  const sandstoneMat = new THREE.MeshStandardMaterial({ color: 0xc27849, roughness: 0.9 });
  const archGeoL = new THREE.BoxGeometry(1.05, 3.2, 1.2);
  const archGeoTop = new THREE.BoxGeometry(4.4, 0.95, 1.35);
  const archPillarL = new THREE.Mesh(archGeoL, sandstoneMat);
  archPillarL.position.set(34.2, 1.6, 23.8);
  const archPillarR = new THREE.Mesh(archGeoL, sandstoneMat);
  archPillarR.position.set(37.4, 1.6, 21.8);
  const archTop = new THREE.Mesh(archGeoTop, sandstoneMat);
  archTop.position.set(35.8, 3.45, 22.8);
  archTop.rotation.y = Math.atan2(2.0, 3.2);
  desertGroup.add(archPillarL, archPillarR, archTop);
  disposables.push(sandstoneMat, archGeoL, archGeoTop);
  root.add(desertGroup);

  // -------------------------------------------------------------------------
  // 4. Crystal Mountain Cave Biome (North-East, centered around 28, -25)
  //    Hollow See-Inside Cavern with Roof Cutaway & Glowing Instanced Crystals
  // -------------------------------------------------------------------------
  const caveGroup = new THREE.Group();
  caveGroup.name = 'biome:cave';
  caveGroup.userData.biomeCave = true;
  caveGroup.visible = false;

  const caveRoofMaterials: THREE.MeshStandardMaterial[] = [];
  const caveCrystalMaterials: THREE.MeshStandardMaterial[] = [];

  const caveGroundGeo = new THREE.CircleGeometry(14.0, 24);
  const caveGroundMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const caveGround = new THREE.Mesh(caveGroundGeo, caveGroundMat);
  caveGround.rotation.x = -Math.PI / 2;
  caveGround.position.set(27.6, 0.018, -24.6);
  caveGround.receiveShadow = true;
  caveGroup.add(caveGround);
  disposables.push(caveGroundGeo, caveGroundMat);

  // Hollow Rocky Cliff Walls surrounding plot_cave_1 (27.6, -24.6), wide mouth facing SW toward Alderbrook
  const cliffWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.92, flatShading: true });
  const cliffRoofMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.88, flatShading: true });
  const snowPeakMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.72, flatShading: true });
  caveRoofMaterials.push(cliffRoofMat, snowPeakMat);
  disposables.push(cliffWallMat, cliffRoofMat, snowPeakMat);

  const wallRockGeo = new THREE.DodecahedronGeometry(2.6, 0);
  const cliffWallCoords: Array<[number, number, number, number, number]> = [
    // Back (North-East) semicircle of cave walls leaving SW entrance wide open
    [27.6, 2.2, -30.2, 1.8, 1.4],
    [32.4, 2.3, -28.6, 1.7, 1.5],
    [33.8, 2.2, -24.2, 1.6, 1.4],
    [31.8, 2.0, -19.8, 1.5, 1.2],
    [23.2, 1.9, -29.2, 1.4, 1.2],
    // Entrance flanking boulders (wide 6-unit walkway opening for villagers)
    [23.0, 1.5, -21.0, 1.0, 0.95],
    [27.8, 1.5, -18.8, 1.05, 0.95],
  ];
  for (const [wx, wy, wz, sx, sy] of cliffWallCoords) {
    const m = new THREE.Mesh(wallRockGeo, cliffWallMat);
    m.position.set(wx, wy, wz);
    m.scale.set(sx, sy, sx * 0.9);
    m.rotation.set(0.2, wx * 0.5, 0.1);
    caveGroup.add(m);
  }
  disposables.push(wallRockGeo);

  // Cutaway Mountain Roof Dome + Snow-Capped Peak (fades to opacity 0.15 on click/zoom!)
  const roofDomeGeo = new THREE.ConeGeometry(8.4, 6.2, 7);
  const roofDome = new THREE.Mesh(roofDomeGeo, cliffRoofMat);
  roofDome.position.set(28.8, 6.4, -25.4);
  roofDome.rotation.y = 0.4;
  const peakCapGeo = new THREE.ConeGeometry(3.2, 2.5, 7);
  const peakCap = new THREE.Mesh(peakCapGeo, snowPeakMat);
  peakCap.position.set(28.8, 8.6, -25.4);
  peakCap.rotation.y = 0.4;
  caveGroup.add(roofDome, peakCap);
  disposables.push(roofDomeGeo, peakCapGeo);

  // Cave Interior Timber Support Beams & Hanging Mining Lantern
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const beamPostGeo = new THREE.BoxGeometry(0.26, 3.4, 0.26);
  const beamCrossGeo = new THREE.BoxGeometry(4.4, 0.28, 0.28);
  const bL = new THREE.Mesh(beamPostGeo, beamMat);
  bL.position.set(24.6, 1.7, -21.8);
  const bR = new THREE.Mesh(beamPostGeo, beamMat);
  bR.position.set(27.2, 1.7, -20.2);
  const bTop = new THREE.Mesh(beamCrossGeo, beamMat);
  bTop.position.set(25.9, 3.35, -21.0);
  bTop.rotation.y = -Math.atan2(-1.6, 2.6);
  caveGroup.add(bL, bR, bTop);

  const caveLanternMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  lanternMaterials.push(caveLanternMat);
  const caveLanternGeo = new THREE.OctahedronGeometry(0.24, 0);
  const caveLantern = new THREE.Mesh(caveLanternGeo, caveLanternMat);
  caveLantern.position.set(25.9, 2.95, -21.0);
  caveGroup.add(caveLantern);
  disposables.push(beamMat, beamPostGeo, beamCrossGeo, caveLanternGeo, caveLanternMat);

  // Glowing Crystal Clusters (Single InstancedMesh, 28 spires!)
  const crystalGeo = new THREE.ConeGeometry(0.32, 1.45, 5);
  crystalGeo.translate(0, 0.72, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.15,
    roughness: 0.18,
    metalness: 0.2,
  });
  caveCrystalMaterials.push(crystalMat);
  disposables.push(crystalGeo, crystalMat);

  const crystalCount = 28;
  const crystalMesh = new THREE.InstancedMesh(crystalGeo, crystalMat, crystalCount);
  const crystalColors = [0x22d3ee, 0x67e8f9, 0x38bdf8, 0xfbbf24, 0xc084fc];
  for (let i = 0; i < crystalCount; i++) {
    const a = -Math.PI * 0.82 + (i / crystalCount) * Math.PI * 1.38;
    const rad = 3.2 + (i % 3) * 1.05;
    const cx = 27.6 + Math.cos(a) * rad;
    const cz = -24.6 + Math.sin(a) * rad;
    const s = 0.65 + (i % 4) * 0.34;
    dummy.position.set(cx, 0.05, cz);
    dummy.rotation.set((i % 3 - 1) * 0.28, i * 0.85, ((i + 1) % 3 - 1) * 0.24);
    dummy.scale.set(s * 0.85, s * 1.2, s * 0.85);
    dummy.updateMatrix();
    crystalMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(crystalColors[i % crystalColors.length]);
    crystalMesh.setColorAt(i, color);
  }
  crystalMesh.instanceMatrix.needsUpdate = true;
  if (crystalMesh.instanceColor) crystalMesh.instanceColor.needsUpdate = true;
  caveGroup.add(crystalMesh);

  // Soft interior cyan glow (automatically disabled on 'low' quality)
  const caveLight = new THREE.PointLight(0x22d3ee, 1.35, 13, 1.6);
  caveLight.position.set(27.6, 2.4, -24.6);
  caveLight.castShadow = false;
  caveGroup.add(caveLight);

  root.add(caveGroup);

  // -------------------------------------------------------------------------
  // 5. Alpine Snow Peaks Biome (Far North, centered around 2, -50)
  // -------------------------------------------------------------------------
  const alpineGroup = new THREE.Group();
  alpineGroup.name = 'biome:alpine';
  alpineGroup.visible = false;

  const alpineGroundGeo = new THREE.CircleGeometry(22.5, 28);
  const alpineGroundMat = new THREE.MeshStandardMaterial({
    color: 0xe2eef8,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const alpineGround = new THREE.Mesh(alpineGroundGeo, alpineGroundMat);
  alpineGround.rotation.x = -Math.PI / 2;
  alpineGround.position.set(2.0, 0.017, -50.0);
  alpineGround.receiveShadow = true;
  alpineGroup.add(alpineGround);
  disposables.push(alpineGroundGeo, alpineGroundMat);

  // Instanced Snow-Capped Alpine Peaks (stone base + snow cap, 2 draw calls)
  const peakBaseGeo = new THREE.ConeGeometry(4.2, 8.6, 6);
  peakBaseGeo.translate(0, 4.3, 0);
  const peakBaseMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.9,
    flatShading: true,
  });
  const peakSnowGeo = new THREE.ConeGeometry(2.15, 4.2, 6);
  peakSnowGeo.translate(0, 6.65, 0);
  const peakSnowMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.72,
    flatShading: true,
  });
  disposables.push(peakBaseGeo, peakBaseMat, peakSnowGeo, peakSnowMat);

  const alpinePeakCoords: Array<[number, number, number, number]> = [
    [-19.5, -59.0, 1.35, 1.45],
    [-9.0, -64.5, 1.55, 1.75],
    [3.5, -66.0, 1.65, 1.9],
    [15.0, -63.5, 1.45, 1.6],
    [23.5, -56.5, 1.25, 1.35],
    [-21.0, -45.5, 1.05, 1.15],
    [22.5, -43.0, 1.0, 1.1],
    [-2.5, -59.5, 1.15, 1.25],
    [10.5, -58.5, 1.1, 1.2],
  ];
  const alpinePeakBaseMesh = new THREE.InstancedMesh(peakBaseGeo, peakBaseMat, alpinePeakCoords.length);
  const alpinePeakSnowMesh = new THREE.InstancedMesh(peakSnowGeo, peakSnowMat, alpinePeakCoords.length);
  alpinePeakCoords.forEach(([px, pz, sx, sy], i) => {
    dummy.position.set(px, -0.2, pz);
    dummy.rotation.set(0, i * 0.85, 0);
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
    alpinePeakBaseMesh.setMatrixAt(i, dummy.matrix);
    alpinePeakSnowMesh.setMatrixAt(i, dummy.matrix);
  });
  alpinePeakBaseMesh.instanceMatrix.needsUpdate = true;
  alpinePeakSnowMesh.instanceMatrix.needsUpdate = true;
  alpinePeakBaseMesh.computeBoundingSphere();
  alpinePeakSnowMesh.computeBoundingSphere();
  alpineGroup.add(alpinePeakBaseMesh, alpinePeakSnowMesh);

  // Frost-Dusted Alpine Evergreens (reusing pineTrunkGeo + pineCanopyGeo!)
  const frostCanopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 });
  disposables.push(frostCanopyMat);
  const alpinePineCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 40; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const rad = 4.2 + ((i * 3.7) % 16.5);
    const tx = 2.0 + Math.cos(a) * rad;
    const tz = -50.0 + Math.sin(a) * rad;
    if (tz < -57.5) continue;
    if (Math.abs(tx - 2.0) < 2.8 && tz > -48.0) continue; // Keep north road clear
    if (isNearAnyPlot(tx, tz, 4.3)) continue;
    alpinePineCoords.push([tx, tz, 0.78 + (i % 5) * 0.13]);
  }
  const alpineTrunkMesh = new THREE.InstancedMesh(
    pineTrunkGeo,
    pineTrunkMat,
    Math.max(1, alpinePineCoords.length),
  );
  const alpineCanopyMesh = new THREE.InstancedMesh(
    pineCanopyGeo,
    frostCanopyMat,
    Math.max(1, alpinePineCoords.length),
  );
  const frostPalette = [0x94c5b8, 0x6ba69d, 0xb8dce0, 0x4d8b7d];
  alpinePineCoords.forEach(([tx, tz, s], i) => {
    dummy.position.set(tx, 0, tz);
    dummy.rotation.set(0, i * 1.05, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    alpineTrunkMesh.setMatrixAt(i, dummy.matrix);
    alpineCanopyMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(frostPalette[i % frostPalette.length]);
    alpineCanopyMesh.setColorAt(i, color);
  });
  alpineTrunkMesh.count = alpinePineCoords.length;
  alpineCanopyMesh.count = alpinePineCoords.length;
  alpineTrunkMesh.instanceMatrix.needsUpdate = true;
  alpineCanopyMesh.instanceMatrix.needsUpdate = true;
  if (alpineCanopyMesh.instanceColor) alpineCanopyMesh.instanceColor.needsUpdate = true;
  alpineGroup.add(alpineTrunkMesh, alpineCanopyMesh);

  // Glacial Ice Boulders
  const glacialRockMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.78 });
  disposables.push(glacialRockMat);
  const glacialRockCount = 14;
  const glacialRockMesh = new THREE.InstancedMesh(mossRockGeo, glacialRockMat, glacialRockCount);
  for (let i = 0; i < glacialRockCount; i++) {
    const a = (i / glacialRockCount) * Math.PI * 2 + 0.4;
    const rad = 6.5 + (i % 4) * 3.1;
    const rx = 2.0 + Math.cos(a) * rad;
    const rz = -50.0 + Math.sin(a) * rad;
    dummy.position.set(rx, 0.25, rz);
    dummy.rotation.set(i * 0.4, i * 0.9, 0.1);
    dummy.scale.set(1.25 + (i % 3) * 0.35, 0.7, 1.05);
    dummy.updateMatrix();
    glacialRockMesh.setMatrixAt(i, dummy.matrix);
  }
  glacialRockMesh.instanceMatrix.needsUpdate = true;
  alpineGroup.add(glacialRockMesh);
  root.add(alpineGroup);

  // -------------------------------------------------------------------------
  // 6. Turquoise River Crossing Biome (Far West, centered around -50, 2)
  // -------------------------------------------------------------------------
  const riverGroup = new THREE.Group();
  riverGroup.name = 'biome:river';
  riverGroup.visible = false;

  const riverMeadowGeo = new THREE.CircleGeometry(22.5, 28);
  const riverMeadowMat = new THREE.MeshStandardMaterial({
    color: 0x5c9b64,
    roughness: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const riverMeadow = new THREE.Mesh(riverMeadowGeo, riverMeadowMat);
  riverMeadow.rotation.x = -Math.PI / 2;
  riverMeadow.position.set(-50.0, 0.016, 2.0);
  riverMeadow.receiveShadow = true;
  riverGroup.add(riverMeadow);
  disposables.push(riverMeadowGeo, riverMeadowMat);

  // Winding Shimmering Turquoise River Channel (1 curved ribbon mesh!)
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-42.5, 0.055, -24.5),
    new THREE.Vector3(-39.5, 0.055, -10.5),
    new THREE.Vector3(-41.2, 0.055, 2.2),
    new THREE.Vector3(-38.8, 0.055, 14.5),
    new THREE.Vector3(-43.5, 0.055, 26.5),
  ]);
  const rSegs = 40;
  const rHalfW = 3.15;
  const rPos = new Float32Array((rSegs + 1) * 2 * 3);
  const rNorm = new Float32Array((rSegs + 1) * 2 * 3);
  const rIdx: number[] = [];
  const rPt = new THREE.Vector3();
  const rTan = new THREE.Vector3();
  const rSide = new THREE.Vector3();
  const rUp = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= rSegs; i++) {
    const u = i / rSegs;
    riverCurve.getPointAt(u, rPt);
    riverCurve.getTangentAt(u, rTan).normalize();
    rSide.crossVectors(rUp, rTan).normalize();
    const v0 = i * 2;
    const v1 = v0 + 1;
    rPos[v0 * 3] = rPt.x - rSide.x * rHalfW;
    rPos[v0 * 3 + 1] = 0.06;
    rPos[v0 * 3 + 2] = rPt.z - rSide.z * rHalfW;
    rPos[v1 * 3] = rPt.x + rSide.x * rHalfW;
    rPos[v1 * 3 + 1] = 0.06;
    rPos[v1 * 3 + 2] = rPt.z + rSide.z * rHalfW;
    rNorm[v0 * 3 + 1] = 1;
    rNorm[v1 * 3 + 1] = 1;
    if (i < rSegs) {
      const n0 = (i + 1) * 2;
      const n1 = n0 + 1;
      rIdx.push(v0, n0, v1, v1, n0, n1);
    }
  }
  const riverWaterGeo = new THREE.BufferGeometry();
  riverWaterGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  riverWaterGeo.setAttribute('normal', new THREE.BufferAttribute(rNorm, 3));
  riverWaterGeo.setIndex(rIdx);
  riverWaterGeo.computeBoundingSphere();

  const riverWaterMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.34,
    roughness: 0.16,
    metalness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const riverWaterMesh = new THREE.Mesh(riverWaterGeo, riverWaterMat);
  riverGroup.add(riverWaterMesh);
  disposables.push(riverWaterGeo, riverWaterMat);

  // Wooden Arched Crossing Bridge spanning the Turquoise River at (-41.0, 2.0)
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(-41.0, 0, 2.0);
  const bridgeWoodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.84 });
  const bridgeRailMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.86 });
  const bridgeDeckGeo = new THREE.BoxGeometry(7.8, 0.22, 2.45);
  const bridgeDeck = new THREE.Mesh(bridgeDeckGeo, bridgeWoodMat);
  bridgeDeck.position.set(0, 0.42, 0);
  const bridgeRampLGeo = new THREE.BoxGeometry(1.75, 0.18, 2.4);
  const bridgeRampL = new THREE.Mesh(bridgeRampLGeo, bridgeWoodMat);
  bridgeRampL.position.set(-4.5, 0.22, 0);
  bridgeRampL.rotation.z = 0.22;
  const bridgeRampR = new THREE.Mesh(bridgeRampLGeo, bridgeWoodMat);
  bridgeRampR.position.set(4.5, 0.22, 0);
  bridgeRampR.rotation.z = -0.22;
  const bridgeRailGeo = new THREE.BoxGeometry(7.9, 0.12, 0.12);
  const bridgeRailN = new THREE.Mesh(bridgeRailGeo, bridgeRailMat);
  bridgeRailN.position.set(0, 1.05, -1.12);
  const bridgeRailS = new THREE.Mesh(bridgeRailGeo, bridgeRailMat);
  bridgeRailS.position.set(0, 1.05, 1.12);
  const bridgePostGeo = new THREE.BoxGeometry(0.16, 0.82, 0.16);
  for (const bx of [-3.6, -1.2, 1.2, 3.6]) {
    for (const bz of [-1.12, 1.12]) {
      const post = new THREE.Mesh(bridgePostGeo, bridgeRailMat);
      post.position.set(bx, 0.72, bz);
      bridgeGroup.add(post);
    }
  }
  bridgeGroup.add(bridgeDeck, bridgeRampL, bridgeRampR, bridgeRailN, bridgeRailS);
  riverGroup.add(bridgeGroup);
  disposables.push(bridgeWoodMat, bridgeRailMat, bridgeDeckGeo, bridgeRampLGeo, bridgeRailGeo, bridgePostGeo);

  // Riverbank Reeds & Smooth River Stones (InstancedMesh)
  const reedGeo = new THREE.CylinderGeometry(0.04, 0.06, 1.05, 5);
  reedGeo.translate(0, 0.52, 0);
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4e, roughness: 0.84 });
  const riverStoneMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.86 });
  disposables.push(reedGeo, reedMat, riverStoneMat);

  const reedCoords: Array<[number, number, number]> = [];
  const riverStoneCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 36; i++) {
    const u = (i + 0.5) / 36;
    riverCurve.getPointAt(u, rPt);
    riverCurve.getTangentAt(u, rTan).normalize();
    rSide.crossVectors(rUp, rTan).normalize();
    const bank = i % 2 === 0 ? 1 : -1;
    const off = rHalfW + 0.45 + (i % 3) * 0.42;
    const rx = rPt.x + rSide.x * bank * off;
    const rz = rPt.z + rSide.z * bank * off;
    if (Math.abs(rz - 2.0) < 2.2) continue; // Keep bridge approaches open
    reedCoords.push([rx, rz, 0.75 + (i % 4) * 0.18]);
    if (i % 2 === 0) {
      riverStoneCoords.push([
        rx + rSide.x * bank * 0.65,
        rz + rSide.z * bank * 0.65,
        0.75 + (i % 3) * 0.3,
      ]);
    }
  }
  const reedMesh = new THREE.InstancedMesh(reedGeo, reedMat, Math.max(1, reedCoords.length));
  reedCoords.forEach(([rx, rz, s], i) => {
    dummy.position.set(rx, 0, rz);
    dummy.rotation.set((i % 3 - 1) * 0.1, i * 0.7, ((i + 1) % 3 - 1) * 0.1);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    reedMesh.setMatrixAt(i, dummy.matrix);
  });
  reedMesh.count = reedCoords.length;
  reedMesh.instanceMatrix.needsUpdate = true;

  const riverStoneMesh = new THREE.InstancedMesh(
    mossRockGeo,
    riverStoneMat,
    Math.max(1, riverStoneCoords.length),
  );
  riverStoneCoords.forEach(([sx, sz, s], i) => {
    dummy.position.set(sx, 0.22, sz);
    dummy.rotation.set(0.2, i * 1.2, 0);
    dummy.scale.set(s, 0.52, s * 0.85);
    dummy.updateMatrix();
    riverStoneMesh.setMatrixAt(i, dummy.matrix);
  });
  riverStoneMesh.count = riverStoneCoords.length;
  riverStoneMesh.instanceMatrix.needsUpdate = true;
  riverGroup.add(reedMesh, riverStoneMesh);
  root.add(riverGroup);

  // -------------------------------------------------------------------------
  // 7. Red-Rock Canyon Biome (Far South, centered around 2, 50)
  // -------------------------------------------------------------------------
  const canyonGroup = new THREE.Group();
  canyonGroup.name = 'biome:canyon';
  canyonGroup.visible = false;

  const canyonGroundGeo = new THREE.CircleGeometry(22.5, 28);
  const canyonGroundMat = new THREE.MeshStandardMaterial({
    color: 0xc96a3b,
    roughness: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const canyonGround = new THREE.Mesh(canyonGroundGeo, canyonGroundMat);
  canyonGround.rotation.x = -Math.PI / 2;
  canyonGround.position.set(2.0, 0.017, 50.0);
  canyonGround.receiveShadow = true;
  canyonGroup.add(canyonGround);
  disposables.push(canyonGroundGeo, canyonGroundMat);

  // Stepped Red-Rock Mesas (InstancedMesh with per-instance terracotta color variation)
  const mesaLow = new THREE.CylinderGeometry(3.2, 4.1, 2.8, 7);
  mesaLow.translate(0, 1.4, 0);
  const mesaTop = new THREE.CylinderGeometry(2.15, 2.85, 2.1, 7);
  mesaTop.translate(0, 3.85, 0);
  const mesaGeo = mergeSimpleGeometries([mesaLow, mesaTop]);
  mesaLow.dispose();
  mesaTop.dispose();
  const mesaMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    flatShading: true,
  });
  disposables.push(mesaGeo, mesaMat);

  const mesaCoords: Array<[number, number, number, number]> = [
    [-19.5, 58.5, 1.35, 1.4],
    [-8.5, 63.5, 1.5, 1.65],
    [4.5, 64.5, 1.55, 1.75],
    [16.5, 61.5, 1.3, 1.45],
    [23.0, 52.0, 1.15, 1.25],
    [-21.0, 44.0, 1.05, 1.15],
    [21.5, 41.0, 1.0, 1.05],
    [-1.5, 58.5, 1.05, 1.2],
  ];
  const mesaPalette = [0xb4532a, 0xc2410c, 0x9a3412, 0xd97746];
  const mesaMesh = new THREE.InstancedMesh(mesaGeo, mesaMat, mesaCoords.length);
  mesaCoords.forEach(([mx, mz, sx, sy], i) => {
    dummy.position.set(mx, 0, mz);
    dummy.rotation.set(0, i * 0.78, 0);
    dummy.scale.set(sx, sy, sx * 0.9);
    dummy.updateMatrix();
    mesaMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(mesaPalette[i % mesaPalette.length]);
    mesaMesh.setColorAt(i, color);
  });
  mesaMesh.instanceMatrix.needsUpdate = true;
  if (mesaMesh.instanceColor) mesaMesh.instanceColor.needsUpdate = true;
  mesaMesh.computeBoundingSphere();
  canyonGroup.add(mesaMesh);

  // Red-Rock Natural Canyon Arch Landmark at (11.5, 55.5)
  const canyonArchMat = new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.9 });
  const cArchColGeo = new THREE.BoxGeometry(1.3, 4.0, 1.45);
  const cArchSpanGeo = new THREE.BoxGeometry(5.2, 1.15, 1.55);
  const cArchL = new THREE.Mesh(cArchColGeo, canyonArchMat);
  cArchL.position.set(9.2, 2.0, 56.2);
  const cArchR = new THREE.Mesh(cArchColGeo, canyonArchMat);
  cArchR.position.set(13.4, 2.0, 54.6);
  const cArchSpan = new THREE.Mesh(cArchSpanGeo, canyonArchMat);
  cArchSpan.position.set(11.3, 4.25, 55.4);
  cArchSpan.rotation.y = Math.atan2(1.6, 4.2);
  canyonGroup.add(cArchL, cArchR, cArchSpan);
  disposables.push(canyonArchMat, cArchColGeo, cArchSpanGeo);

  // Canyon Scrub & Hoodoo Spires (InstancedMesh)
  const scrubGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const scrubMat = new THREE.MeshStandardMaterial({ color: 0x6b7c3f, roughness: 0.92 });
  disposables.push(scrubGeo, scrubMat);
  const scrubCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const rad = 4.5 + ((i * 2.9) % 14.5);
    const sx = 2.0 + Math.cos(a) * rad;
    const sz = 50.0 + Math.sin(a) * rad;
    if (isNearAnyPlot(sx, sz, 4.1)) continue;
    if (Math.abs(sx - 2.0) < 2.6 && sz < 48.0) continue;
    scrubCoords.push([sx, sz, 0.75 + (i % 3) * 0.25]);
  }
  const scrubMesh = new THREE.InstancedMesh(scrubGeo, scrubMat, Math.max(1, scrubCoords.length));
  scrubCoords.forEach(([sx, sz, s], i) => {
    dummy.position.set(sx, 0.22, sz);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(s * 1.15, s * 0.72, s);
    dummy.updateMatrix();
    scrubMesh.setMatrixAt(i, dummy.matrix);
  });
  scrubMesh.count = scrubCoords.length;
  scrubMesh.instanceMatrix.needsUpdate = true;
  canyonGroup.add(scrubMesh);
  root.add(canyonGroup);

  scene.add(root);

  let activeQuality: GraphicsQuality = 'medium';

  return {
    group: root,
    caveGroup,
    caveRoofMaterials,
    caveCrystalMaterials,
    setUnlockedBiomes: (biomes: BiomeId[]) => {
      const set = new Set<BiomeId>(biomes);
      forestGroup.visible = set.has('forest');
      desertGroup.visible = set.has('desert');
      caveGroup.visible = set.has('cave');
      alpineGroup.visible = set.has('alpine');
      riverGroup.visible = set.has('river');
      canyonGroup.visible = set.has('canyon');
      caveLight.visible = set.has('cave') && activeQuality !== 'low';
    },
    setRoads: (roads: string[]) => {
      currentRoads = [...roads];
      rebuildRoadInstances();
    },
    setGraphicsQuality: (quality: GraphicsQuality) => {
      activeQuality = quality;
      const factor = quality === 'low' ? 0.5 : quality === 'medium' ? 0.78 : 1.0;
      pineTrunkMesh.count = Math.max(8, Math.round(pineCoords.length * factor));
      pineCanopyMesh.count = pineTrunkMesh.count;
      forestRockMesh.count = Math.max(5, Math.round(rockCount * factor));
      cactusMesh.count = Math.max(8, Math.round(cactusCoords.length * factor));
      crystalMesh.count = Math.max(10, Math.round(crystalCount * factor));
      alpineTrunkMesh.count = Math.max(8, Math.round(alpinePineCoords.length * factor));
      alpineCanopyMesh.count = alpineTrunkMesh.count;
      glacialRockMesh.count = Math.max(5, Math.round(glacialRockCount * factor));
      reedMesh.count = Math.max(10, Math.round(reedCoords.length * factor));
      riverStoneMesh.count = Math.max(5, Math.round(riverStoneCoords.length * factor));
      scrubMesh.count = Math.max(8, Math.round(scrubCoords.length * factor));
      caveLight.visible = caveGroup.visible && quality !== 'low';
    },
    applyTheme: (theme: TownTheme) => {
      currentTheme = theme;
      rebuildRoadInstances();
      if (theme === 'fantasy_night') {
        forestGroundMat.color.setHex(0x1f3a3d);
        desertGroundMat.color.setHex(0x8c6d46);
        alpineGroundMat.color.setHex(0x94a3b8);
        riverMeadowMat.color.setHex(0x274c43);
        riverWaterMat.color.setHex(0x0284c7);
        riverWaterMat.emissive.setHex(0x38bdf8);
        canyonGroundMat.color.setHex(0x7c3a25);
        crystalMat.emissive.setHex(0xa855f7);
        caveLight.color.setHex(0xc084fc);
      } else if (theme === 'solarpunk_oasis') {
        forestGroundMat.color.setHex(0x2f7d57);
        desertGroundMat.color.setHex(0xf0c987);
        alpineGroundMat.color.setHex(0xdbeafe);
        riverMeadowMat.color.setHex(0x3ea86b);
        riverWaterMat.color.setHex(0x14b8a6);
        riverWaterMat.emissive.setHex(0x2dd4bf);
        canyonGroundMat.color.setHex(0xd97746);
        crystalMat.emissive.setHex(0x14b8a6);
        caveLight.color.setHex(0x2dd4bf);
      } else {
        forestGroundMat.color.setHex(0x3f6234);
        desertGroundMat.color.setHex(0xe6be7a);
        alpineGroundMat.color.setHex(0xe2eef8);
        riverMeadowMat.color.setHex(0x5c9b64);
        riverWaterMat.color.setHex(0x06b6d4);
        riverWaterMat.emissive.setHex(0x0891b2);
        canyonGroundMat.color.setHex(0xc96a3b);
        crystalMat.emissive.setHex(0x06b6d4);
        caveLight.color.setHex(0x22d3ee);
      }
    },
    update: (elapsed: number) => {
      if (caveGroup.visible) {
        const pulse = 0.95 + Math.sin(elapsed * 2.2) * 0.25;
        crystalMat.emissiveIntensity = pulse;
        if (activeQuality !== 'low') {
          caveLight.intensity = 1.15 + Math.sin(elapsed * 2.2) * 0.3;
        }
      }
      if (riverGroup.visible) {
        riverWaterMat.emissiveIntensity = 0.28 + Math.sin(elapsed * 2.1) * 0.1;
      }
    },
    dispose: () => {
      const idx = lanternMaterials.indexOf(caveLanternMat);
      if (idx !== -1) lanternMaterials.splice(idx, 1);
      scene.remove(root);
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}

