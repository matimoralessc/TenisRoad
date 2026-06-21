import * as THREE from 'three'
import {
  stepMovement,
  planarSpeed,
  type MovementState,
  type MovementParams,
} from '../player/movement'

const BODY_RADIUS = 0.30
const BODY_HEIGHT = 1.10                       // tramo recto de la cápsula
const TOTAL_HEIGHT = BODY_HEIGHT + 2 * BODY_RADIUS  // ≈ 1.70 m
const HEAD_Y = TOTAL_HEIGHT                     // tope (para proyectar la barra UI)

export interface CharacterOptions {
  color: number          // color de la cápsula
  accentColor: number    // color del acento de orientación
  accentZ: number        // −1 mira hacia −z (sur), +1 mira hacia +z (norte)
  spawn: THREE.Vector3   // posición inicial (pies)
  params?: MovementParams
}

/**
 * Base compartida de Player y AI (Fase 4): cápsula minimalista con acento de
 * orientación, estado cinemático e interpolación prev→curr para render sin
 * jitter. Ambos usan EXACTAMENTE el mismo integrador inercial (movement.ts),
 * parametrizado por atributos del personaje.
 */
export class Character {
  readonly group: THREE.Group
  readonly state: MovementState
  readonly params: MovementParams

  protected readonly prevPos = new THREE.Vector3()

  constructor(scene: THREE.Scene, opts: CharacterOptions) {
    this.params = opts.params ?? {}
    this.group = new THREE.Group()

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT, 8, 16),
      new THREE.MeshLambertMaterial({ color: opts.color }),
    )
    body.position.y = TOTAL_HEIGHT / 2
    body.castShadow = true
    this.group.add(body)

    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.40, 0.18, 0.12),
      new THREE.MeshLambertMaterial({ color: opts.accentColor }),
    )
    accent.position.set(0, TOTAL_HEIGHT * 0.62, opts.accentZ * (BODY_RADIUS + 0.05))
    accent.castShadow = true
    this.group.add(accent)

    scene.add(this.group)

    this.state = {
      position: opts.spawn.clone(),
      velocity: new THREE.Vector3(),
    }
    this.prevPos.copy(this.state.position)
    this.group.position.copy(this.state.position)
  }

  /** Rapidez actual en el plano (m/s). */
  get speed(): number {
    return planarSpeed(this.state)
  }

  /** Posición lógica (centro de los pies). */
  get position(): THREE.Vector3 {
    return this.state.position
  }

  /** Cachea la posición previa al tick de física (interpolación de render). */
  cachePrevious(): void {
    this.prevPos.copy(this.state.position)
  }

  /** Avanza la física inercial un tick fijo con los parámetros del personaje. */
  step(dir: { x: number; z: number }, dt: number): void {
    stepMovement(this.state, dir, dt, this.params)
  }

  /** Reposiciona en seco (nuevo punto): sin velocidad ni interpolación residual. */
  resetTo(x: number, z: number): void {
    this.state.position.set(x, 0, z)
    this.state.velocity.set(0, 0, 0)
    this.prevPos.copy(this.state.position)
    this.group.position.copy(this.state.position)
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
