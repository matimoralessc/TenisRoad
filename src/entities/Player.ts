import * as THREE from 'three'
import { COURT } from '../data/courtDimensions'
import { stepMovement, planarSpeed, type MovementState } from '../player/movement'

const BODY_RADIUS = 0.30
const BODY_HEIGHT = 1.10           // tramo recto de la cápsula
const TOTAL_HEIGHT = BODY_HEIGHT + 2 * BODY_RADIUS   // ≈ 1.70 m
const HEAD_Y = TOTAL_HEIGHT        // tope de la cápsula (para proyectar la barra)

/**
 * Jugador (Fase 3): cápsula minimalista con un acento frontal que indica
 * orientación (mira hacia −z, hacia la red). Posee estado cinemático e
 * interpolación prev→curr para render sin jitter, igual que la pelota.
 */
export class Player {
  readonly group: THREE.Group
  readonly state: MovementState

  private readonly prevPos = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group()

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT, 8, 16),
      new THREE.MeshLambertMaterial({ color: 0x1e6fff }),
    )
    body.position.y = TOTAL_HEIGHT / 2   // base de la cápsula en y=0
    body.castShadow = true
    this.group.add(body)

    // Acento frontal (visera/pecho) que marca hacia dónde mira el jugador (−z)
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.40, 0.18, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xffd54a }),
    )
    accent.position.set(0, TOTAL_HEIGHT * 0.62, -BODY_RADIUS - 0.05)
    accent.castShadow = true
    this.group.add(accent)

    scene.add(this.group)

    this.state = {
      position: new THREE.Vector3(0, 0, COURT.halfLength),  // baseline sur
      velocity: new THREE.Vector3(),
    }
    this.prevPos.copy(this.state.position)
    this.group.position.copy(this.state.position)
  }

  /** Rapidez actual en el plano (m/s). */
  get speed(): number {
    return planarSpeed(this.state)
  }

  /** Posición lógica actual (centro de los pies). */
  get position(): THREE.Vector3 {
    return this.state.position
  }

  /** Cachea la posición previa al tick de física (para interpolar en render). */
  cachePrevious(): void {
    this.prevPos.copy(this.state.position)
  }

  /** Avanza la física inercial un tick fijo. */
  step(dir: { x: number; z: number }, dt: number): void {
    stepMovement(this.state, dir, dt)
  }

  /** Punto de la cabeza en coordenadas de mundo (para anclar la barra UI). */
  headWorldPosition(out: THREE.Vector3, alpha: number): THREE.Vector3 {
    const p = this.prevPos
    const c = this.state.position
    out.set(
      p.x + (c.x - p.x) * alpha,
      HEAD_Y,
      p.z + (c.z - p.z) * alpha,
    )
    return out
  }

  /** Interpola prev→curr con alpha ∈ [0,1) y sincroniza el grupo visual. */
  syncMesh(alpha: number): void {
    const p = this.prevPos
    const c = this.state.position
    this.group.position.set(
      p.x + (c.x - p.x) * alpha,
      0,
      p.z + (c.z - p.z) * alpha,
    )
  }
}
