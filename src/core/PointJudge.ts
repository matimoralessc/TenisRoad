import { COURT } from '../data/courtDimensions'
import type { PhysicsEvent } from '../physics/types'

export type Who = 'player' | 'ai'

export interface PointOutcome {
  winner: Who
  reason: 'OUT' | 'NET' | 'WINNER'
}

const opponent = (w: Who): Who => (w === 'player' ? 'ai' : 'player')

/**
 * Juez de punto stateful (Fase 4). Escucha los eventos de la física y los
 * impactos de los golpeadores para arbitrar:
 *   · OUT    — bote fuera de las líneas de singles (o en la propia mitad).
 *   · NET    — la pelota no superó el cordón de la red.
 *   · WINNER — doble bote: el rival no devolvió antes del 2º bote.
 *
 * Convención de lados: jugador = sur (z>0), IA = norte (z<0). Un golpe válido
 * debe botar en la mitad contraria al golpeador.
 */
export class PointJudge {
  private lastHitter: Who | null = null
  private bounceCount = 0

  /** Reinicia el rastreo para un nuevo punto. */
  reset(): void {
    this.lastHitter = null
    this.bounceCount = 0
  }

  /** Notifica un golpe válido: cambia el golpeador y reinicia el conteo de botes. */
  notifyHit(who: Who): void {
    this.lastHitter = who
    this.bounceCount = 0
  }

  /** Procesa los eventos de un tick; devuelve el desenlace si el punto terminó. */
  process(events: PhysicsEvent[]): PointOutcome | null {
    for (const e of events) {
      const outcome = e.type === 'net' ? this.onNet(e.passed) : this.onBounce(e.position)
      if (outcome) return outcome
    }
    return null
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private onNet(passed: boolean): PointOutcome | null {
    if (passed || this.lastHitter === null) return null
    return { winner: opponent(this.lastHitter), reason: 'NET' }
  }

  private onBounce(pos: { x: number; z: number }): PointOutcome | null {
    if (this.lastHitter === null) return null
    this.bounceCount++

    const inBounds =
      Math.abs(pos.x) <= COURT.singlesHalfWidth &&
      Math.abs(pos.z) <= COURT.halfLength

    if (!inBounds) {
      return { winner: opponent(this.lastHitter), reason: 'OUT' }
    }

    // Lado donde cayó: sur = 'player', norte = 'ai'
    const landedSide: Who = pos.z < 0 ? 'ai' : 'player'

    // Cayó en la propia mitad del golpeador → no cruzó: error
    if (landedSide === this.lastHitter) {
      return { winner: opponent(this.lastHitter), reason: 'OUT' }
    }

    // Segundo bote válido sin devolución → punto del golpeador
    if (this.bounceCount >= 2) {
      return { winner: this.lastHitter, reason: 'WINNER' }
    }

    return null  // primer bote válido: la pelota sigue viva
  }
}
