import { AI } from '../entities/AI'
import { Ball } from '../entities/Ball'
import { Player } from '../entities/Player'
import { Trail } from '../scene/Trail'
import { COURT, type Surface } from '../data/courtDimensions'
import { SHOT_PROFILES } from '../data/shotProfiles'
import { buildImpulse } from '../player/shotMath'
import { STRIKE_RADIUS } from '../physics/constants'
import { predictContact, type LandingPrediction } from './trajectoryPredict'
import type { PlayerAttributes } from '../data/players'

const REACTION_DELAY = 0.11      // s de procesamiento humano antes de reaccionar
const ARRIVE_RADIUS = 0.20       // m: deja de empujar input para frenar limpio
const MAX_REACH_HEIGHT = 2.2     // m
const STRETCH_THRESHOLD = 0.75   // fracción de maxSpeed → modo defensivo
const RECOVER_Z = -COURT.halfLength + 0.6
const TARGET_DEEP_Z = 8          // profundidad objetivo en cancha del jugador (+z)

type AIPhase = 'idle' | 'react' | 'track'

/**
 * Controlador de la IA (Fase 4): árbol de comportamiento secuencial
 * ANTICIPATE → MOVE → STRIKE. Usa el MISMO integrador inercial que el humano
 * (vía AI.step) y predice el bote con la física real (predictLanding).
 *
 *  · ANTICIPATE: al golpear el jugador, espera REACTION_DELAY y predice el bote.
 *  · MOVE: alimenta vectores de dirección hacia el punto predicho.
 *  · STRIKE: al entrar la pelota en STRIKE_RADIUS, devuelve al instante con un
 *    perfil elegido por contexto (agresivo si está montado, slice si corre).
 */
export class AIController {
  private phase: AIPhase = 'idle'
  private timer = 0
  private target: LandingPrediction | null = null

  constructor(
    private readonly ai: AI,
    private readonly ball: Ball,
    private readonly player: Player,
    private readonly trail: Trail,
    private readonly attrs: PlayerAttributes,
    private readonly surface: Surface,
    private readonly onStrike?: () => void,
  ) {}

  /** Disparado cuando el jugador golpea: inicia la anticipación. */
  onPlayerStrike(): void {
    this.phase = 'react'
    this.timer = REACTION_DELAY
    this.target = null
  }

  /** Vuelve a reposo (nuevo punto). */
  reset(): void {
    this.phase = 'idle'
    this.timer = 0
    this.target = null
  }

  /** Un tick: decide dirección, mueve la IA y, si procede, golpea. */
  update(dt: number): void {
    switch (this.phase) {
      case 'idle':
        this.moveToward(0, RECOVER_Z, dt)
        break

      case 'react':
        this.timer -= dt
        this.ai.step({ x: 0, z: 0 }, dt)    // split-step: plantado leyendo la pelota
        if (this.timer <= 0) {
          this.target = predictContact(this.ball.state, this.surface)
          this.phase = 'track'
        }
        break

      case 'track': {
        const tx = this.target ? this.target.x : 0
        const tz = this.target ? this.target.z : RECOVER_Z
        this.moveToward(tx, tz, dt)
        if (this.canStrike()) {
          this.strike()
          this.phase = 'idle'
        }
        break
      }
    }
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private moveToward(tx: number, tz: number, dt: number): void {
    const p = this.ai.position
    const dx = tx - p.x
    const dz = tz - p.z
    const dist = Math.hypot(dx, dz)
    if (dist > ARRIVE_RADIUS) {
      this.ai.step({ x: dx / dist, z: dz / dist }, dt)
    } else {
      this.ai.step({ x: 0, z: 0 }, dt)   // fricción frena al llegar
    }
  }

  private canStrike(): boolean {
    const b = this.ball.state.position
    if (b.z >= 0) return false               // aún no está en el lado de la IA
    if (b.y > MAX_REACH_HEIGHT) return false
    return Math.hypot(b.x - this.ai.position.x, b.z - this.ai.position.z) < STRIKE_RADIUS
  }

  private strike(): void {
    const onStretch = this.ai.speed > STRETCH_THRESHOLD * (this.attrs.maxSpeed)
    const aiX = this.ai.position.x
    const playerX = this.player.position.x

    let base = SHOT_PROFILES.flat
    let power = 1.0
    let spin = 1.0
    let targetX: number
    const targetZ = TARGET_DEEP_Z

    if (onStretch) {
      // Defensivo: slice flotado y profundo al centro para recuperar
      base = SHOT_PROFILES.slice
      power = 0.85
      targetX = aiX * 0.3
    } else {
      // Agresivo: a la cancha abierta (lejos del jugador), buscando el corredor
      targetX = playerX >= 0 ? -3.6 : 3.6
      const crossCourt = Math.sign(targetX) !== Math.sign(aiX || 1)
      if (crossCourt) {
        base = SHOT_PROFILES.topspin
        spin = this.attrs.topspinPower
      } else {
        base = SHOT_PROFILES.flat
        power = this.attrs.flatDepth
      }
    }

    const impulse = buildImpulse(this.ball.state.position, targetX, targetZ, base, power, spin)
    this.ball.applyImpulse(impulse)
    this.ai.swing()
    this.trail.clear()
    this.onStrike?.()
  }
}
