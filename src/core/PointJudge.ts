import { COURT, BALL } from '../data/courtDimensions'
import type { PhysicsEvent } from '../physics/types'

export type Who = 'player' | 'ai'

/**
 * Desenlace de un tick para el juez:
 *   · point — el punto terminó (OUT / NET / WINNER / DOUBLE FAULT).
 *   · fault — el saque fue inválido (a la red, fuera o fuera del cuadro).
 *   · let   — el saque rozó el cordón y cayó en el cuadro: se repite.
 */
export type JudgeResult =
  | { kind: 'point'; winner: Who; reason: string }
  | { kind: 'fault' }
  | { kind: 'let' }

interface ServiceBox {
  xMin: number
  xMax: number
  zMin: number
  zMax: number
}

const opponent = (w: Who): Who => (w === 'player' ? 'ai' : 'player')
const TOL = BALL.radius   // tolerancia de línea (la pelota toca = dentro)

/**
 * Construye el cuadro de saque diagonal correcto según servidor y lado.
 * Jugador (sur, z>0) saca al norte (z<0); IA (norte) saca al sur (z>0).
 * Deuce → mitad derecha del servidor; Ad → mitad izquierda. Los signos en X
 * coinciden con las direcciones de saque definidas en main.ts.
 */
function serviceBox(server: Who, side: 'deuce' | 'ad'): ServiceBox {
  const W = COURT.singlesHalfWidth
  const L = COURT.serviceLineZ
  if (server === 'player') {
    const xNeg = side === 'deuce'              // deuce del jugador → x ∈ [−W,0]
    return { xMin: xNeg ? -W : 0, xMax: xNeg ? 0 : W, zMin: -L, zMax: 0 }
  }
  const xPos = side === 'deuce'                // deuce de la IA → x ∈ [0,W]
  return { xMin: xPos ? 0 : -W, xMax: xPos ? W : 0, zMin: 0, zMax: L }
}

/**
 * Juez de punto stateful (Fase 4 + reglas de saque Fase 8).
 *
 *  · Modo SAQUE: el primer bote debe caer en el cuadro diagonal correcto. A la
 *    red, largo o ancho → FALTA. Roce de cordón cayendo en el cuadro → LET.
 *  · Modo PELOTEO: OUT (fuera o en la propia mitad), NET (no pasó), WINNER
 *    (doble bote sin devolución).
 */
export class PointJudge {
  private lastHitter: Who | null = null
  private bounceCount = 0

  private serving = false
  private box: ServiceBox | null = null
  private serveClipped = false

  /** Reinicia el rastreo para un nuevo punto. */
  reset(): void {
    this.lastHitter = null
    this.bounceCount = 0
    this.serving = false
    this.box = null
    this.serveClipped = false
  }

  /** Arranca un saque: el siguiente bote se arbitra contra el cuadro diagonal. */
  beginServe(server: Who, side: 'deuce' | 'ad'): void {
    this.serving = true
    this.lastHitter = server
    this.bounceCount = 0
    this.serveClipped = false
    this.box = serviceBox(server, side)
  }

  /** Golpe válido de peloteo: cambia el golpeador y reinicia el conteo de botes. */
  notifyHit(who: Who): void {
    this.serving = false
    this.lastHitter = who
    this.bounceCount = 0
  }

  /** Procesa los eventos de un tick; devuelve el desenlace si lo hubo. */
  process(events: PhysicsEvent[]): JudgeResult | null {
    for (const e of events) {
      const r = this.serving ? this.serveEvent(e) : this.rallyEvent(e)
      if (r) return r
    }
    return null
  }

  // ── Saque ─────────────────────────────────────────────────────────────────

  private serveEvent(e: PhysicsEvent): JudgeResult | null {
    if (e.type === 'net') {
      if (!e.passed) return { kind: 'fault' }   // saque a la red
      if (e.clip) this.serveClipped = true       // posible LET: se decide al botar
      return null
    }

    // Primer bote del saque
    const inBox = this.inBox(e.position)
    this.serving = false

    if (this.serveClipped) {
      return inBox ? { kind: 'let' } : { kind: 'fault' }
    }
    if (!inBox) return { kind: 'fault' }

    // Saque bueno: la pelota sigue viva, con el bote del saque ya contado.
    this.bounceCount = 1
    return null
  }

  private inBox(pos: { x: number; z: number }): boolean {
    const b = this.box!
    return (
      pos.x >= b.xMin - TOL && pos.x <= b.xMax + TOL &&
      pos.z >= b.zMin - TOL && pos.z <= b.zMax + TOL
    )
  }

  // ── Peloteo ─────────────────────────────────────────────────────────────────

  private rallyEvent(e: PhysicsEvent): JudgeResult | null {
    return e.type === 'net' ? this.onNet(e.passed) : this.onBounce(e.position)
  }

  private onNet(passed: boolean): JudgeResult | null {
    if (passed || this.lastHitter === null) return null
    return { kind: 'point', winner: opponent(this.lastHitter), reason: 'NET' }
  }

  private onBounce(pos: { x: number; z: number }): JudgeResult | null {
    if (this.lastHitter === null) return null
    this.bounceCount++

    const inBounds =
      Math.abs(pos.x) <= COURT.singlesHalfWidth + TOL &&
      Math.abs(pos.z) <= COURT.halfLength + TOL

    if (!inBounds) {
      return { kind: 'point', winner: opponent(this.lastHitter), reason: 'OUT' }
    }

    // Lado donde cayó: sur = 'player', norte = 'ai'
    const landedSide: Who = pos.z < 0 ? 'ai' : 'player'

    // Cayó en la propia mitad del golpeador → no cruzó: error
    if (landedSide === this.lastHitter) {
      return { kind: 'point', winner: opponent(this.lastHitter), reason: 'OUT' }
    }

    // Segundo bote válido sin devolución → punto del golpeador
    if (this.bounceCount >= 2) {
      return { kind: 'point', winner: this.lastHitter, reason: 'WINNER' }
    }

    return null  // primer bote válido: la pelota sigue viva
  }
}
