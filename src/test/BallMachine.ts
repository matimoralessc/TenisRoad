import { Ball } from '../entities/Ball'
import { Trail } from '../scene/Trail'
import { COURT } from '../data/courtDimensions'
import type { ShotProfile } from '../physics/types'

/** Lanza desde la baseline norte (z<0) hacia +z (lado del jugador sur). */
const LAUNCH = { x: 0, y: 0.9, z: -COURT.halfLength } as const

/**
 * Alimentador infinito (Fase 3): cicla cuadrantes del lado del jugador (sur)
 * para forzar desplazamiento + montaje del golpe. Las componentes vz/vy están
 * calibradas (contra el integrador) para botar en cancha; vx añade el barrido
 * lateral hacia el cuadrante objetivo. Determinista: sin Math.random.
 *
 * Cuadrantes (vistos desde el jugador sur):
 *   z grande = profundo (cerca de su baseline) · z chico = corto (cerca de red)
 *   x>0 / x<0 = lados opuestos
 */
const FEED_PROFILES: ShotProfile[] = [
  { name: 'Deep Ad',    velocity: [ 2.2, 5, 16.5], spin: [350, 0, 0] },  // profundo, lado +x
  { name: 'Short Deuce',velocity: [-2.0, 7,  8.5], spin: [300, 0, 0] },  // corto, lado −x
  { name: 'Deep Deuce', velocity: [-2.5, 8, 22],   spin: [350, 0, 0] },  // medio-profundo, −x
  { name: 'Short Ad',   velocity: [ 2.0, 7,  8.5], spin: [300, 0, 0] },  // corto, +x
]

const INTERVAL = 3.5   // segundos entre alimentaciones (tiempo para correr y golpear)

/**
 * Banco de alimentación de la cancha. Dispara un perfil hacia un cuadrante
 * distinto cada INTERVAL s, ciclando para obligar al jugador a moverse.
 */
export class BallMachine {
  private timer = INTERVAL   // alimenta en el primer update (t = 0)
  private index = 0

  constructor(
    private readonly ball: Ball,
    private readonly trail: Trail,
    private readonly onFire?: (profile: ShotProfile) => void,
  ) {}

  update(dt: number): void {
    this.timer += dt
    if (this.timer >= INTERVAL) {
      this.timer = 0
      this.fire()
    }
  }

  private fire(): void {
    const profile = FEED_PROFILES[this.index]
    this.index = (this.index + 1) % FEED_PROFILES.length

    this.ball.reset(LAUNCH.x, LAUNCH.y, LAUNCH.z)
    this.ball.applyImpulse(profile)
    this.trail.clear()
    this.onFire?.(profile)
  }
}
