import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  COURT, NET, SURFACES, netCordHeight, type Surface,
} from '../data/courtDimensions'

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
    new THREE.MeshLambertMaterial({ color: s.color }),
  )
  court.rotation.x = -Math.PI / 2
  court.receiveShadow = true
  scene.add(court)

  // ── LÍNEAS (geometría fusionada) ──────────────────────────────────────────
  scene.add(buildLines(s.lineColor))

  // ── RED Y POSTES ──────────────────────────────────────────────────────────
  buildNet(scene)
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
    new THREE.MeshLambertMaterial({ color }),
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

  const netMat = new THREE.MeshLambertMaterial({
    color: 0xdddddd,
    transparent: true,
    opacity: 0.5,
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
