export type MatchState =
  | 'WARMUP'
  | 'SERVICE_READY'
  | 'IN_PLAY'
  | 'POINT_SCORED'
  | 'GAME_OVER'

export interface MatchConfig {
  gamesToWinSet: number    // games para ganar el set (sin desempate)
  tiebreakAtGames: number  // si ambos llegan a este nº de games → tie-break
  tiebreakTo: number       // puntos para ganar el tie-break (con diferencia de 2)
}

const DEFAULT_CONFIG: MatchConfig = {
  gamesToWinSet: 4,
  tiebreakAtGames: 3,
  tiebreakTo: 7,
}

const POINT_LABELS = ['0', '15', '30', '40']

export interface SideSnapshot {
  name: string
  point: string
  games: number
  sets: number
  serving: boolean
}

export interface MatchSnapshot {
  state: MatchState
  sides: [SideSnapshot, SideSnapshot]
  tiebreak: boolean
  announcement: string
  matchOver: boolean
  winnerName: string | null
  servingSide: 'deuce' | 'ad'
}

/**
 * Motor de estado y puntuación de partido (Fase 4).
 *
 * Set rápido configurable: a 4 games, con tie-break a 7 si se llega a 3-3.
 * Maneja 0/15/30/40, Deuce/Advantage, cambio de servidor por game y lado
 * Deuce/Ad por paridad de puntos. Partido a un set (single fast-set).
 */
export class MatchStateManager {
  private _state: MatchState = 'WARMUP'
  private readonly cfg: MatchConfig

  private points: [number, number] = [0, 0]
  private games: [number, number] = [0, 0]
  private sets: [number, number] = [0, 0]
  private server: 0 | 1 = 0
  private tiebreak = false
  private tbPoints: [number, number] = [0, 0]
  private matchOver = false
  private announcement = ''

  constructor(
    private readonly names: [string, string],
    config: Partial<MatchConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  get state(): MatchState {
    return this._state
  }

  /** Inicia el partido: listo para el primer saque. */
  beginMatch(): void {
    this._state = 'SERVICE_READY'
    this.announcement = ''
  }

  /** El saque puso la pelota en juego. */
  serveStarted(): void {
    this._state = 'IN_PLAY'
  }

  /** Falta de saque: vuelve a SERVICE_READY (segundo saque) sin tocar el marcador. */
  returnToServe(): void {
    this._state = 'SERVICE_READY'
  }

  /** Índice del servidor actual (0 = sur/jugador, 1 = norte/IA). */
  get servingIndex(): 0 | 1 {
    return this.server
  }

  /** Lado de saque según paridad de puntos del game/tie-break actual. */
  get servingSide(): 'deuce' | 'ad' {
    const total = this.tiebreak
      ? this.tbPoints[0] + this.tbPoints[1]
      : this.points[0] + this.points[1]
    return total % 2 === 0 ? 'deuce' : 'ad'
  }

  /** Otorga el punto al ganador (0 o 1) y avanza el marcador. */
  awardPoint(winner: 0 | 1, reason: string): void {
    const loser = (1 - winner) as 0 | 1
    this.announcement = reason

    if (this.tiebreak) {
      this.tbPoints[winner]++
      if (
        this.tbPoints[winner] >= this.cfg.tiebreakTo &&
        this.tbPoints[winner] - this.tbPoints[loser] >= 2
      ) {
        this.completeGame(winner, true)
      } else if ((this.tbPoints[0] + this.tbPoints[1]) % 2 === 1) {
        this.switchServer()  // cambio de servidor en TB tras puntos impares
      }
    } else {
      this.points[winner]++
      const a = this.points[0]
      const b = this.points[1]
      if (a >= 3 && b >= 3 && a === b) {
        // Deuce: normaliza la ventaja perdida
        this.points = [3, 3]
      } else if (this.points[winner] >= 4 && this.points[winner] - this.points[loser] >= 2) {
        this.completeGame(winner, false)
      }
    }

    this._state = 'POINT_SCORED'
  }

  /** Transición tras anotar: nuevo saque o fin de partido. */
  nextPoint(): void {
    this._state = this.matchOver ? 'GAME_OVER' : 'SERVICE_READY'
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private completeGame(winner: 0 | 1, fromTiebreak: boolean): void {
    this.games[winner]++
    this.points = [0, 0]
    this.tbPoints = [0, 0]
    if (fromTiebreak) this.tiebreak = false
    this.switchServer()

    const loser = (1 - winner) as 0 | 1

    if (fromTiebreak) {
      this.winSet(winner)
      return
    }
    if (this.games[0] === this.cfg.tiebreakAtGames && this.games[1] === this.cfg.tiebreakAtGames) {
      this.tiebreak = true  // 3-3 → desempate
      return
    }
    if (this.games[winner] >= this.cfg.gamesToWinSet && this.games[winner] - this.games[loser] >= 2) {
      this.winSet(winner)
    }
  }

  private winSet(winner: 0 | 1): void {
    this.sets[winner]++
    this.matchOver = true  // partido a un set
  }

  private switchServer(): void {
    this.server = (1 - this.server) as 0 | 1
  }

  private pointLabel(side: 0 | 1): string {
    if (this.tiebreak) return String(this.tbPoints[side])

    const a = this.points[0]
    const b = this.points[1]
    if (a >= 3 && b >= 3) {
      if (a === b) return '40'                       // Deuce
      return this.points[side] > this.points[1 - side] ? 'Ad' : '40'
    }
    return POINT_LABELS[Math.min(this.points[side], 3)]
  }

  /** Snapshot inmutable para el HUD. */
  snapshot(): MatchSnapshot {
    const winnerIdx = this.matchOver ? (this.sets[0] > this.sets[1] ? 0 : 1) : null
    return {
      state: this._state,
      tiebreak: this.tiebreak,
      announcement: this.announcement,
      matchOver: this.matchOver,
      winnerName: winnerIdx === null ? null : this.names[winnerIdx],
      servingSide: this.servingSide,
      sides: [
        {
          name: this.names[0],
          point: this.pointLabel(0),
          games: this.games[0],
          sets: this.sets[0],
          serving: this.server === 0,
        },
        {
          name: this.names[1],
          point: this.pointLabel(1),
          games: this.games[1],
          sets: this.sets[1],
          serving: this.server === 1,
        },
      ],
    }
  }
}
