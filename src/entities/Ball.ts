import * as THREE from 'three'
import { BALL_RADIUS } from '../physics/constants'
import { makeBallTexture, hasCanvas } from '../scene/textures'
import type { BallState, ShotProfile } from '../physics/types'

/**
 * Pelota: posee el vector de estado físico y su representación visual.
 * Guarda prevPos/currPos para la interpolación alpha del render (sin jitter),
 * de modo que la física a 120Hz queda desacoplada del framerate del monitor.
 */
export class Ball {
  readonly mesh: THREE.Mesh
  readonly state: BallState

  private readonly shadow: THREE.Mesh
  private readonly prevPos = new THREE.Vector3()
  private readonly spinAxis = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    // Fieltro PBR: textura procedural (pelusa + costura) si hay DOM; si no
    // (test headless), color liso. Rugoso y nada metálico.
    const mat = new THREE.MeshStandardMaterial({
      color: hasCanvas() ? 0xffffff : 0xCCDD00,
      roughness: 0.85,
      metalness: 0.0,
    })
    if (hasCanvas()) mat.map = makeBallTexture()

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 24), mat)
    this.mesh.castShadow = true
    scene.add(this.mesh)

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_RADIUS, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    scene.add(this.shadow)

    this.state = {
      position: new THREE.Vector3(0, BALL_RADIUS, 0),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
    }
    this.prevPos.copy(this.state.position)
  }

  /** Guarda la posición previa al tick de física (para interpolar en render). */
  cachePrevious(): void {
    this.prevPos.copy(this.state.position)
  }

  /** Reinicia el estado físico en una posición dada (relanzamiento). */
  reset(x: number, y: number, z: number): void {
    this.state.position.set(x, y, z)
    this.state.velocity.set(0, 0, 0)
    this.state.angularVelocity.set(0, 0, 0)
    this.prevPos.copy(this.state.position)
  }

  /** Aplica un perfil de golpe (velocidad + spin iniciales). */
  applyImpulse(profile: ShotProfile): void {
    this.state.velocity.set(...profile.velocity)
    this.state.angularVelocity.set(...profile.spin)
  }

  /** Gira el mesh según el spin real (visual): topspin/slice se ven rodar. */
  applySpinVisual(dt: number): void {
    const w = this.state.angularVelocity
    const len = w.length()
    if (len < 1e-4) return
    this.spinAxis.copy(w).divideScalar(len)
    this.mesh.rotateOnWorldAxis(this.spinAxis, len * dt)
  }

  /** Interpola prev→curr con alpha ∈ [0,1) y sincroniza mesh + sombra. */
  syncMesh(alpha: number): void {
    const p = this.prevPos
    const c = this.state.position
    const x = p.x + (c.x - p.x) * alpha
    const y = p.y + (c.y - p.y) * alpha
    const z = p.z + (c.z - p.z) * alpha

    this.mesh.position.set(x, y, z)

    this.shadow.position.set(x, 0.002, z)
    const h = Math.max(y - BALL_RADIUS, 0)
    const scale = 1 + h * 0.35
    this.shadow.scale.set(scale, scale, 1)
    ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.3 - h * 0.08, 0.05)
  }
}
