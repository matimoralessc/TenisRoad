import * as THREE from 'three'
import {
  stepMovement,
  planarSpeed,
  type MovementState,
  type MovementParams,
} from '../player/movement'
import { PLAYER_MAX_SPEED } from '../physics/constants'

// ── Silueta atlética (grupo de primitivas) ────────────────────────────────────
const LEG_W = 0.16, LEG_H = 0.82, LEG_D = 0.20   // piernas (bloques separados)
const LEG_GAP = 0.12                              // separación lateral de piernas
const TORSO_W = 0.42, TORSO_H = 0.60, TORSO_D = 0.27
const HEAD_R = 0.135
const LEG_TOP = LEG_H                                   // 0.82
const TORSO_CY = LEG_TOP + TORSO_H / 2                  // centro del torso
const TORSO_TOP = LEG_TOP + TORSO_H                     // 1.42
const HEAD_CY = TORSO_TOP + HEAD_R * 0.9                // centro de la cabeza
const TOTAL_HEIGHT = HEAD_CY + HEAD_R                   // ≈ 1.68 m
const HEAD_Y = TOTAL_HEIGHT                             // tope (para proyectar la barra UI)
const SKIN_COLOR = 0xcc9b6d                             // tono de piel neutro

/** Inclinación máxima del torso a rapidez plena (rad ≈ 10°). */
const LEAN_MAX = 0.18
/** Velocidad de respuesta de la inclinación (s⁻¹): alta = sigue al cuerpo sin saltos. */
const LEAN_RESPONSE = 12

const TWO_PI = Math.PI * 2
/** Cadencia de carrera (Hz): pasos por segundo en función de la rapidez. */
const STRIDE_FREQ_MIN = 2.2
const STRIDE_FREQ_MAX = 5.0
/** Amplitud del rebote de zancada al correr (m). */
const STRIDE_AMP = 0.07
/** Ready-bounce (split-step) al estar plantado: frecuencia (Hz) y amplitud (m). */
const IDLE_FREQ = 1.8
const IDLE_AMP = 0.025
/** Umbral de rapidez para considerar "en carrera" (m/s). */
const MOVING_EPS = 0.4
/** Suavizado de la amplitud del bob al cambiar idle↔carrera (s⁻¹). */
const BOB_BLEND = 9

// ── Brazo + raqueta (swing) ───────────────────────────────────────────────────
const SHOULDER_X = 0.28                     // hombro derecho (m del centro)
const SHOULDER_Y = TORSO_TOP - 0.10         // altura del hombro (m)
const REST_X = -0.30                         // pose de reposo: leve adelanto
const REST_Z = 0.22                          // pose de reposo: raqueta hacia afuera
const SWING_DURATION = 0.45                  // s del swing completo
const SWING_BACK = 1.3                       // rad de armado (atrás)
const SWING_FOLLOW = 1.9                     // rad de barrido (cruce delante)
const SWING_LIFT = 0.9                       // rad de elevación low→high en el contacto

/** smoothstep 3u²−2u³ para arranques/frenadas suaves de la animación. */
function smooth(u: number): number {
  const c = Math.max(0, Math.min(1, u))
  return c * c * (3 - 2 * c)
}

export interface CharacterOptions {
  color: number          // color de la camiseta (torso)
  trimColor: number      // color del short (piernas)
  accentColor: number    // color del marcador de orientación (pecho)
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
  private leanX = 0   // inclinación hacia ±z (suavizada)
  private leanZ = 0   // inclinación hacia ±x (suavizada)
  private gaitPhase = 0  // fase del ciclo de zancada/ready-bounce (rad)
  private bobAmp = 0     // amplitud actual del bob, suavizada (m)
  private bobY = 0       // desplazamiento vertical del cuerpo este frame (m)

  private readonly arm: THREE.Group
  private readonly swingSign: number   // espeja el barrido según el lado de cancha
  private swingTimer = 0               // s restantes del swing en curso (0 = reposo)

  constructor(scene: THREE.Scene, opts: CharacterOptions) {
    this.params = opts.params ?? {}
    this.group = new THREE.Group()

    const jersey = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.7, metalness: 0 })
    const shorts = new THREE.MeshStandardMaterial({ color: opts.trimColor, roughness: 0.8, metalness: 0 })
    const skin = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.6, metalness: 0 })

    // Torso atlético alargado
    const torso = new THREE.Mesh(new THREE.BoxGeometry(TORSO_W, TORSO_H, TORSO_D), jersey)
    torso.position.y = TORSO_CY
    torso.castShadow = true
    this.group.add(torso)

    // Cabeza
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 20, 16), skin)
    headMesh.position.y = HEAD_CY
    headMesh.castShadow = true
    this.group.add(headMesh)

    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0 })

    // Piernas (bloques separados: base para un ciclo de carrera mecánico futuro)
    for (const sign of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(LEG_W, LEG_H, LEG_D), shorts)
      leg.position.set(sign * LEG_GAP, LEG_H / 2, 0)
      leg.castShadow = true
      this.group.add(leg)

      // Zapatilla: caja con la puntera hacia la dirección de orientación
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(LEG_W + 0.02, 0.08, LEG_D + 0.12), shoeMat)
      shoe.position.set(sign * LEG_GAP, 0.04, opts.accentZ * 0.05)
      shoe.castShadow = true
      this.group.add(shoe)
    }

    // Cuello
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), skin)
    neck.position.y = TORSO_TOP + 0.03
    neck.castShadow = true
    this.group.add(neck)

    // Brazo izquierdo estático (el derecho es el del swing): da volumen atlético
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.46, 8), skin)
    leftArm.position.set(-SHOULDER_X, SHOULDER_Y - 0.20, 0.02)
    leftArm.rotation.z = 0.18
    leftArm.castShadow = true
    this.group.add(leftArm)

    // Marcador de orientación: franja en el pecho mirando al frente
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.12, 0.05),
      new THREE.MeshStandardMaterial({ color: opts.accentColor, roughness: 0.5, metalness: 0 }),
    )
    accent.position.set(0, TORSO_CY + 0.06, opts.accentZ * (TORSO_D / 2 + 0.01))
    accent.castShadow = true
    this.group.add(accent)

    // Brazo + raqueta, pivotando en el hombro derecho
    this.arm = new THREE.Group()
    this.arm.position.set(SHOULDER_X, SHOULDER_Y, 0)
    this.swingSign = opts.accentZ < 0 ? 1 : -1

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.42, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    )
    handle.position.y = -0.21
    handle.castShadow = true
    this.arm.add(handle)

    const head = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.018, 8, 20),
      new THREE.MeshLambertMaterial({ color: opts.accentColor }),
    )
    head.position.y = -0.50
    head.castShadow = true
    this.arm.add(head)

    this.arm.rotation.set(REST_X, 0, REST_Z)
    this.group.add(this.arm)

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
    this.updateLean(dt)
    this.updateGait(dt)
    this.updateSwing(dt)
  }

  /** Dispara un swing completo (armado → contacto → follow-through). */
  swing(): void {
    this.swingTimer = SWING_DURATION
  }

  /**
   * Anima el brazo durante un swing: armado atrás, barrido cruzado y elevación
   * en el contacto, y recuperación a la pose de reposo. Espejado por lado de
   * cancha. Fuera de un swing, mantiene la pose de reposo.
   */
  private updateSwing(dt: number): void {
    if (this.swingTimer <= 0) {
      this.arm.rotation.set(REST_X, 0, REST_Z)
      return
    }
    this.swingTimer = Math.max(0, this.swingTimer - dt)
    const p = 1 - this.swingTimer / SWING_DURATION   // progreso 0→1

    let sweep: number
    let lift: number
    if (p < 0.3) {                                   // armado
      sweep = smooth(p / 0.3) * SWING_BACK
      lift = 0
    } else if (p < 0.55) {                           // barrido al contacto
      const u = smooth((p - 0.3) / 0.25)
      sweep = SWING_BACK + (-SWING_FOLLOW - SWING_BACK) * u
      lift = u * SWING_LIFT
    } else {                                          // follow-through → reposo
      const u = smooth((p - 0.55) / 0.45)
      sweep = -SWING_FOLLOW * (1 - u)
      lift = SWING_LIFT * (1 - u)
    }

    this.arm.rotation.set(REST_X - lift, sweep * this.swingSign, REST_Z)
  }

  /**
   * Cadencia vertical del cuerpo: al correr, rebote de zancada cuya frecuencia
   * y amplitud crecen con la rapidez; al estar plantado, un ready-bounce lento
   * (split-step) que mantiene al personaje "vivo". El bob nunca baja de 0, así
   * los pies no atraviesan la cancha. La amplitud se suaviza en las transiciones.
   */
  private updateGait(dt: number): void {
    const maxSpeed = this.params.maxSpeed ?? PLAYER_MAX_SPEED
    const speedFrac = Math.min(this.speed / maxSpeed, 1)
    const moving = this.speed > MOVING_EPS

    const freq = moving
      ? STRIDE_FREQ_MIN + (STRIDE_FREQ_MAX - STRIDE_FREQ_MIN) * speedFrac
      : IDLE_FREQ
    const targetAmp = moving ? STRIDE_AMP * (0.4 + 0.6 * speedFrac) : IDLE_AMP

    const blend = 1 - Math.exp(-BOB_BLEND * dt)
    this.bobAmp += (targetAmp - this.bobAmp) * blend

    this.gaitPhase += TWO_PI * freq * dt
    if (this.gaitPhase > TWO_PI) this.gaitPhase -= TWO_PI
    // (1−cos)/2 ∈ [0,1]: rebote siempre hacia arriba desde el suelo
    this.bobY = this.bobAmp * (0.5 - 0.5 * Math.cos(this.gaitPhase))
  }

  /**
   * Inclina el torso HACIA la dirección de carrera (peso atlético, estilo Top
   * Spin). Deriva de la velocidad ya suavizada por accel/decel y normaliza por
   * la rapidez máxima; vuelve a vertical al frenar. Pivota sobre los pies.
   */
  private updateLean(dt: number): void {
    const maxSpeed = this.params.maxSpeed ?? PLAYER_MAX_SPEED
    const v = this.state.velocity
    const targetLeanX = LEAN_MAX * (v.z / maxSpeed)   // top hacia +z al correr a +z
    const targetLeanZ = -LEAN_MAX * (v.x / maxSpeed)  // top hacia +x al correr a +x
    const k = 1 - Math.exp(-LEAN_RESPONSE * dt)
    this.leanX += (targetLeanX - this.leanX) * k
    this.leanZ += (targetLeanZ - this.leanZ) * k
  }

  /** Reposiciona en seco (nuevo punto): sin velocidad ni interpolación residual. */
  resetTo(x: number, z: number): void {
    this.state.position.set(x, 0, z)
    this.state.velocity.set(0, 0, 0)
    this.prevPos.copy(this.state.position)
    this.group.position.copy(this.state.position)
    this.leanX = 0
    this.leanZ = 0
    this.gaitPhase = 0
    this.bobAmp = 0
    this.bobY = 0
    this.swingTimer = 0
    this.arm.rotation.set(REST_X, 0, REST_Z)
    this.group.rotation.set(0, 0, 0)
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
      this.bobY,
      p.z + (c.z - p.z) * alpha,
    )
    this.group.rotation.set(this.leanX, 0, this.leanZ)
  }
}
