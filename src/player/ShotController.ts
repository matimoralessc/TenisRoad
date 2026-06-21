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
import { buildImpulse } from './shotMath'
import { STRIKE_RADIUS, PLAYER_MAX_SPEED } from '../physics/constants'
import type { ShotAttributes } from '../data/players'

// ── Tuning de la mecánica de timing ───────────────────────────────────────────
const CHARGE_RISE = 0.7        // s para llenar la barra 0→1 (luego rebota)
const AIM_SPEED = 4.0          // m/s de desplazamiento del objetivo con A/D
const STRETCH_THRESHOLD = 0.75 // fracción de MAX_SPEED que activa "on the stretch"
const MAX_REACH_HEIGHT = 2.2   // m: por encima no se alcanza la pelota

// Zonas (por valor de la barra; el pico = sweet spot)
const GOOD_LO = 0.70
const PERFECT_LO = 0.90
const PERFECT_LO_FULL_SHRINK = 0.95  // ventana Perfect comprimida (mental = 0)

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
 * Máquina de estados del golpe humano: IDLE → CHARGING → EXECUTE → IDLE.
 *
 * Modelo ping-pong/sobrecarga: la barra sube 0→1 en CHARGE_RISE y rebota si se
 * mantiene de más; el sweet spot está en el pico. Al correr (>75% de MAX_SPEED)
 * la ventana Perfect se comprime, modulada por el atributo `mental` del jugador.
 *
 * EXECUTE es transitorio: al soltar la tecla valida proximidad (<1.5 m), evalúa
 * el timing y aplica el impulso a la pelota. Si conecta, invoca `onStrike`.
 */
export class ShotController {
  private state: ShotState = 'idle'
  private shotType: ShotKey = 'flat'
  private charge = 0
  private phase = 1            // +1 subiendo, −1 bajando (rebote)
  private targetX = 0          // objetivo en el lado rival (m)

  constructor(
    private readonly ball: Ball,
    private readonly player: Player,
    private readonly trail: Trail,
    private readonly input: InputController,
    private readonly attrs: ShotAttributes,
    private readonly onResult?: (label: string) => void,
    private readonly onStrike?: () => void,
  ) {}

  /** ¿Está el jugador "on the stretch" (corriendo defensivamente)? */
  private get stretch(): boolean {
    return this.player.speed > STRETCH_THRESHOLD * PLAYER_MAX_SPEED
  }

  /**
   * Límite inferior de la zona Perfect. Al correr se encoge; cuánto depende del
   * mental (1 → casi sin encoger; 0 → encogimiento total a PERFECT_LO_FULL_SHRINK).
   */
  private get perfectLo(): number {
    if (!this.stretch) return PERFECT_LO
    const shrink = (PERFECT_LO_FULL_SHRINK - PERFECT_LO) * (1 - this.attrs.mental)
    return PERFECT_LO + shrink
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
    this.onStrike?.()
    this.reset()
  }

  private applyShot(result: TimingResult): void {
    const base = SHOT_PROFILES[this.shotType]
    const tune = TIMING[result]

    // Multiplicadores por atributo del jugador
    let power = tune.power
    let spin = tune.spin
    if (this.shotType === 'flat') power *= this.attrs.flatDepth
    if (this.shotType === 'topspin') spin *= this.attrs.topspinPower

    // Objetivo con error de timing (determinista: signo según la fase)
    const aimSign = this.phase > 0 ? 1 : -1
    const targetX = this.targetX + aimSign * tune.aimError

    const impulse = buildImpulse(
      this.ball.state.position,
      targetX,
      TARGET_DEPTH_Z,
      base,
      power,
      spin,
    )
    this.ball.applyImpulse(impulse)
    this.trail.clear()
  }

  private reset(): void {
    this.state = 'idle'
    this.charge = 0
    this.phase = 1
  }
}
