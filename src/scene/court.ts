import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  COURT, NET, SURFACES, netCordHeight, type Surface,
} from '../data/courtDimensions'
import { makeClayTexture, makeClayNormalMap, makeNetAlphaTexture, makeCrowdTexture } from './textures'

const LINE_W = 0.05   // ancho de línea ITF: 5cm
const LINE_Y = 0.001  // offset vertical para evitar z-fighting

/**
 * Construye la cancha completa (suelo, superficie, líneas, red, postes).
 * Optimización clave: TODAS las líneas se fusionan en una sola BufferGeometry
 * → 1 draw call y 1 material en lugar de ~14.
 */
export function createCourt(scene: THREE.Scene, surface: Surface = 'clay'): void {
  const s = SURFACES[surface]

  // ── SUELO BASE (fuera de la cancha) ───────────────────────────────────────
  const groundColor =
    surface === 'clay' ? 0x8B3A10 : surface === 'grass' ? 0x1A4A1A : 0x1A3066
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 50),
    new THREE.MeshLambertMaterial({ color: groundColor }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // ── SUPERFICIE DE JUEGO ───────────────────────────────────────────────────
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.doublesHalfWidth * 2, COURT.halfLength * 2),
    buildSurfaceMaterial(surface, s.color),
  )
  court.rotation.x = -Math.PI / 2
  court.receiveShadow = true
  scene.add(court)

  // ── LÍNEAS (geometría fusionada) ──────────────────────────────────────────
  scene.add(buildLines(s.lineColor))

  // ── RED Y POSTES ──────────────────────────────────────────────────────────
  buildNet(scene)

  // ── ESTADIO (gradas laterales + fondo norte) ──────────────────────────────
  buildStadium(scene)
}

/**
 * Material de la superficie de juego. En arcilla, un MeshStandardMaterial rugoso
 * con mapa de color procedural (grano + parches secos) y mapa de normales para
 * que capte la luz del estadio en vez de leerse como un bloque plano. En otras
 * superficies, un Standard liso del color base.
 */
function buildSurfaceMaterial(surface: Surface, color: number): THREE.Material {
  if (surface === 'clay') {
    return new THREE.MeshStandardMaterial({
      map: makeClayTexture(),
      normalMap: makeClayNormalMap(),
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.96,
      metalness: 0.0,
    })
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 })
}

/**
 * Estadio: gradas escalonadas a ambos lados (eje Z) y fondo tras la baseline
 * norte, con planos de público (textura procedural) mirando a la cancha y una
 * franja de patrocinadores al pie. Nada detrás de la baseline sur para no tapar
 * la cámara de transmisión. Da escala, color y profundidad de "lleno" sin coste
 * de draw calls notable.
 */
function buildStadium(scene: THREE.Scene): void {
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x202531, roughness: 0.95, metalness: 0 })
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.7, metalness: 0.1 })
  const sponsorMat = new THREE.MeshStandardMaterial({ color: 0x0b66c2, roughness: 0.4, metalness: 0.1 })

  const crowdTex = makeCrowdTexture()
  const crowdMat = (repeatX: number) => {
    const t = crowdTex.clone()
    t.needsUpdate = true
    t.repeat.set(repeatX, 3)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 })
  }

  // Grada escalonada: dos peldaños de hormigón + plano de público inclinado.
  const addGrandstand = (
    length: number, x: number, z: number, faceX: number,   // faceX = dir hacia la cancha
  ): void => {
    const baseH = 1.0, tierH = 4.5, depth = 9
    // Peldaño bajo (más cerca de la cancha) y cuerpo alto detrás
    const low = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.45, baseH, length), concreteMat)
    low.position.set(x - faceX * depth * 0.28, baseH / 2, z)
    low.receiveShadow = true
    scene.add(low)

    const high = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.6, tierH, length), concreteMat)
    high.position.set(x + faceX * depth * 0.18, tierH / 2, z)
    high.receiveShadow = true
    scene.add(high)

    // Público: plano inclinado mirando a la cancha sobre la grada alta
    const crowd = new THREE.Mesh(new THREE.PlaneGeometry(tierH * 1.15, length), crowdMat(length / 3))
    crowd.position.set(x - faceX * 0.6, tierH * 0.55, z)
    crowd.rotation.set(0, faceX > 0 ? Math.PI / 2 : -Math.PI / 2, 0)
    crowd.rotation.z = faceX > 0 ? -0.5 : 0.5
    scene.add(crowd)

    // Baranda + franja de patrocinador al borde de la cancha
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, length), railMat)
    rail.position.set(x - faceX * depth * 0.5, baseH + 0.2, z)
    scene.add(rail)
    const sponsor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, length), sponsorMat)
    sponsor.position.set(x - faceX * (depth * 0.5 + 0.05), 0.45, z)
    scene.add(sponsor)
  }

  const sideX = COURT.doublesHalfWidth + 5.6
  addGrandstand(38, -sideX, 0, +1)   // grada oeste, mira hacia +x
  addGrandstand(38, sideX, 0, -1)    // grada este, mira hacia −x

  // Fondo norte (detrás de la IA): muro + público
  const endZ = -(COURT.halfLength + 4)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(34, 5.5, 2.5), concreteMat)
  wall.position.set(0, 2.75, endZ - 1)
  wall.receiveShadow = true
  scene.add(wall)
  const endCrowd = new THREE.Mesh(new THREE.PlaneGeometry(34, 4.2), crowdMat(11))
  endCrowd.position.set(0, 3.0, endZ + 0.3)
  endCrowd.rotation.x = -0.18
  scene.add(endCrowd)
  const endSponsor = new THREE.Mesh(new THREE.BoxGeometry(34, 0.8, 0.12), sponsorMat)
  endSponsor.position.set(0, 0.6, endZ + 0.4)
  scene.add(endSponsor)
}

/** Crea un rectángulo de línea ya orientado en el plano XZ y posicionado. */
function lineRect(x: number, z: number, width: number, depth: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, depth)
  geo.rotateX(-Math.PI / 2)
  geo.translate(x, LINE_Y, z)
  return geo
}

function buildLines(color: number): THREE.Mesh {
  const cHW = COURT.singlesHalfWidth
  const dHW = COURT.doublesHalfWidth
  const hL = COURT.halfLength
  const sLZ = COURT.serviceLineZ

  const rects: THREE.BufferGeometry[] = [
    // Líneas de fondo (baselines) — ancho de dobles
    lineRect(0, hL, dHW * 2, LINE_W),
    lineRect(0, -hL, dHW * 2, LINE_W),
    // Laterales de singles
    lineRect(cHW, 0, LINE_W, hL * 2),
    lineRect(-cHW, 0, LINE_W, hL * 2),
    // Laterales de dobles
    lineRect(dHW, 0, LINE_W, hL * 2),
    lineRect(-dHW, 0, LINE_W, hL * 2),
    // Líneas de saque (a ±6.40m de la red)
    lineRect(0, sLZ, cHW * 2, LINE_W),
    lineRect(0, -sLZ, cHW * 2, LINE_W),
    // Línea central de saque
    lineRect(0, 0, LINE_W, sLZ * 2),
    // Marcas de centro en baselines
    lineRect(0, hL - 0.1, LINE_W, 0.20),
    lineRect(0, -hL + 0.1, LINE_W, 0.20),
  ]

  const merged = mergeGeometries(rects, false)
  rects.forEach((g) => g.dispose())

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 }),
  )
  mesh.receiveShadow = true
  return mesh
}

function buildNet(scene: THREE.Scene): void {
  const half = NET.postOffset
  const SEG = 32

  // ── Cuerpo de la red: plano con el borde superior curvado (sag real) ──────
  const bodyGeo = new THREE.PlaneGeometry(half * 2, 1, SEG, 4)
  const pos = bodyGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    // v ∈ [-0.5, 0.5] → mapear a [0, cordHeight(x)]
    const v = pos.getY(i)
    pos.setY(i, (v + 0.5) * netCordHeight(x))
  }
  pos.needsUpdate = true
  bodyGeo.computeVertexNormals()

  // Tejido: alphaMap de rejilla → solo se ven los cordones, los huecos calan.
  const netMat = new THREE.MeshLambertMaterial({
    color: 0xf2f2f2,
    transparent: true,
    alphaMap: makeNetAlphaTexture(),
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const body = new THREE.Mesh(bodyGeo, netMat)
  scene.add(body)

  // ── Cordón superior (tubo siguiendo la curva real) ────────────────────────
  const cordPts: THREE.Vector3[] = []
  for (let i = 0; i <= SEG; i++) {
    const x = -half + (i / SEG) * half * 2
    cordPts.push(new THREE.Vector3(x, netCordHeight(x), 0))
  }
  const cord = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPts), SEG, 0.012, 6, false),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  )
  cord.castShadow = true
  scene.add(cord)

  // ── Banda blanca inferior ─────────────────────────────────────────────────
  const bandGeo = new THREE.PlaneGeometry(half * 2, 0.08)
  bandGeo.translate(0, 0.04, 0)
  const band = new THREE.Mesh(
    bandGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  )
  scene.add(band)

  // ── Postes (a ±6.399m, fuera de la línea de dobles) ───────────────────────
  const postGeo = new THREE.CylinderGeometry(0.025, 0.025, NET.height_post, 8)
  const postMat = new THREE.MeshLambertMaterial({ color: 0xcccccc })
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(sign * half, NET.height_post / 2, 0)
    post.castShadow = true
    scene.add(post)
  }
}
