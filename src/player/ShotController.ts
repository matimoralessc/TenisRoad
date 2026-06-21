import * as THREE from 'three'
import { Ball } from '../entities/Ball'
import { Player } from '../entities/Player'
import { Trail } from '../scene/Trail'
import { InputController } from '../input/InputController'
import { COURT } from '../data/courtDimensions'
import {
  SHOT_PROFILES,
  TARGET_DEPTH_Z,
  type ShotKey,
} from '../data/shotProfiles'
import {
  STRIKE_RADIUS,
  PLAYER_MAX_SPEED,
} from '../physics/constants'

// ── Tuning de la mecánica de timing ───────────────────────────────────────────
const CHARGE_RISE = 0.7        // s para llenar la barra 0→1 (luego rebota)
const AIM_SPEED = 4.0          // m/s de desplazamiento del objetivo con A/D
const STRETCH_THRESHOLD = 0.75 // fracción de MAX_SPEED que activa "on the stretch"
const MAX_REACH_HEIGHT = 2.2   // m: por encima no se alcanza la pelota

// Zonas (por valor de la barra; el pico = sweet spot)
const GOOD_LO = 0.70
const PERFECT_LO = 0.90
const PERFECT_LO_STRETCH = 0.95  // ventana Perfect comprimida al correr

export type ShotState = 'idle' | 'charging'
export type TimingResult = 'perfect' | 'good' | 'early' | 'late'

/** Snapshot para que la barra UI se dibuje sin acoplarse a la lógica. */
export interface ChargeView {
  active: boolean
  charge: number       // 0..1 posición del marcador
  goodLo: number
  perfectLo: number
  stretch: boolean
}

interface TimingTuning {
  power: number
  spin: number
  aimError: number
}

const TIMING: Record<TimingResult, TimingTuning> = {
  perfect: { power: 1.00, spin: 1.00, aimError: 0.0 },
  good:    { power: 0.88, spin: 0.90, aimError: 0.4 },
  early:   { power: 0.62, spin: 0.55, aimError: 1.2 },
  late:    { power: 0.72, spin: 1.25, aimError: 1.0 },
}

const RESULT_LABEL: Record<TimingResult, string> = {
  perfect: 'PERFECT',
  good: 'Good',
  early: 'Too Early',
  late: 'Too Late',
}

/**
 * Máquina de estados del golpe (Fase 3): IDLE → CHARGING → EXECUTE → IDLE.
 *
 * CHARGING usa un modelo ping-pong/sobrecarga: la barra sube 0→1 en CHARGE_RISE
 * y rebota hacia abajo si se mantiene de más. El sweet spot está en el pico.
 * Al correr (>75% de MAX_SPEED) la ventana Perfect se comprime (tiro defensivo).
 *
 * EXECUTE es transitorio: al soltar la tecla se valida proximidad (<1.5 m),
 * se evalúa el timing y se aplica el impulso a la pelota en un solo tick.
 */
export class ShotController {
  private state: ShotState = 'idle'
  private shotType: ShotKey = 'flat'
  private charge = 0
  private phase = 1            // +1 subiendo, −1 bajando (rebote)
  private targetX = 0          // objetivo en el lado rival (m)

  private readonly _target = new THREE.Vector3()

  constructor(
    private readonly ball: Ball,
    private readonly player: Player,
    private readonly trail: Trail,
    private readonly input: InputController,
    private readonly onResult?: (label: string) => void,
  ) {}

  /** ¿Está el jugador "on the stretch" (corriendo defensivamente)? */
  private get stretch(): boolean {
    return this.player.speed > STRETCH_THRESHOLD * PLAYER_MAX_SPEED
  }

  /** Límite inferior de la zona Perfect según estado de carrera. */
  private get perfectLo(): number {
    return this.stretch ? PERFECT_LO_STRETCH : PERFECT_LO
  }

  update(dt: number): void {
    if (this.state === 'idle') {
      const pressed = this.input.pressedShot()
      if (pressed) this.beginCharge(pressed)
      return
    }

    // state === 'charging'
    this.advanceCharge(dt)
    this.advanceAim(dt)

    // Soltar la tecla del golpe en curso → ejecutar
    if (!this.input.isShotHeld(this.shotType)) {
      this.execute()
    }
  }

  /** Snapshot inmutable para el render de la barra. */
  getView(): ChargeView {
    return {
      active: this.state === 'charging',
      charge: this.charge,
      goodLo: GOOD_LO,
      perfectLo: this.perfectLo,
      stretch: this.stretch,
    }
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private beginCharge(type: ShotKey): void {
    this.state = 'charging'
    this.shotType = type
    this.charge = 0
    this.phase = 1
    this.targetX = 0
  }

  private advanceCharge(dt: number): void {
    this.charge += this.phase * (dt / CHARGE_RISE)
    if (this.charge >= 1) {
      this.charge = 1
      this.phase = -1
    } else if (this.charge <= 0) {
      this.charge = 0
      this.phase = 1
    }
  }

  private advanceAim(dt: number): void {
    const axis = this.input.aimAxis()
    if (axis !== 0) {
      this.targetX += axis * AIM_SPEED * dt
      const lim = COURT.singlesHalfWidth
      this.targetX = Math.max(-lim, Math.min(lim, this.targetX))
    }
  }

  private classify(): TimingResult {
    if (this.charge >= this.perfectLo) return 'perfect'
    if (this.charge >= GOOD_LO) return 'good'
    // Por debajo de la zona buena: distinguir por fase del ping-pong
    return this.phase > 0 ? 'early' : 'late'
  }

  private execute(): void {
    const ballPos = this.ball.state.position
    const playerPos = this.player.position

    const reachable =
      Math.hypot(ballPos.x - playerPos.x, ballPos.z - playerPos.z) < STRIKE_RADIUS &&
      ballPos.y < MAX_REACH_HEIGHT

    if (!reachable) {
      this.onResult?.('Whiff')
      this.reset()
      return
    }

    const result = this.classify()
    this.applyShot(result)
    this.onResult?.(RESULT_LABEL[result])
    this.reset()
  }

  private applyShot(result: TimingResult): void {
    const base = SHOT_PROFILES[this.shotType]
    const tune = TIMING[result]

    // Objetivo con error de timing (determinista: signo según la fase)
    const aimSign = this.phase > 0 ? 1 : -1
    const targetX = this.targetX + aimSign * tune.aimError
    this._target.set(targetX, 0, TARGET_DEPTH_Z)

    // Dirección horizontal desde el contacto hacia el objetivo
    const bp = this.ball.state.position
    let dx = this._target.x - bp.x
    let dz = this._target.z - bp.z
    const hLen = Math.hypot(dx, dz) || 1
    dx /= hLen
    dz /= hLen

    // Velocidad: rapidez·timing descompuesta por el ángulo de lanzamiento
    const speed = base.speed * tune.power
    const ang = (base.launchAngle * Math.PI) / 180
    const hSpeed = speed * Math.cos(ang)
    const vy = speed * Math.sin(ang)

    const velocity: [number, number, number] = [dx * hSpeed, vy, dz * hSpeed]
    const spin: [number, number, number] = [
      base.spin[0] * tune.spin,
      base.spin[1] * tune.spin,
      base.spin[2] * tune.spin,
    ]

    this.ball.applyImpulse({ name: base.name, velocity, spin })
    this.trail.clear()
  }

  private reset(): void {
    this.state = 'idle'
    this.charge = 0
    this.phase = 1
  }
}
