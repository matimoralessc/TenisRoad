import { Ball } from '../entities/Ball'
import { Trail } from '../scene/Trail'
import { COURT } from '../data/courtDimensions'
import type { ShotProfile } from '../physics/types'

/** Lanza desde la baseline norte (z<0) hacia +z (hacia la cámara), altura de golpe ~0.9m. */
const LAUNCH = { x: 0, y: 0.9, z: -COURT.halfLength } as const

/**
 * Los 4 perfiles deterministas, en orden de ciclo.
 * Valores calibrados para que las 4 curvas pasen la red y boten dentro de cancha,
 * con su firma característica (verificado contra el integrador).
 */
export const SHOT_PROFILES: ShotProfile[] = [
  { name: 'Heavy Topspin', velocity: [0, 8, 22],   spin: [400, 0, 0] },   // clears 1.83m, kick explosivo, bota z≈4.8
  { name: 'Skidding Slice', velocity: [0, 5, 16.5], spin: [-250, 0, 0] },  // flota, bote bajo, profundo z≈10.4
  { name: 'Flat Bullet',    velocity: [0, 3.2, 33], spin: [40, 0, 0] },    // arco bajo, rápido, z≈8.3
  { name: 'Drop Shot',      velocity: [0, 7, 8.5],  spin: [-300, 0, 0] },  // arco empinado, muere corto z≈1.0
]

const INTERVAL = 4   // segundos entre lanzamientos

/**
 * Lanzapelotas de prueba (Fase 2). Dispara un perfil cada 4 s, ciclando.
 * Determinista: sin Math.random.
 */
export class BallMachine {
  private timer = INTERVAL   // dispara en el primer update (t = 0)
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
    const profile = SHOT_PROFILES[this.index]
    this.index = (this.index + 1) % SHOT_PROFILES.length

    this.ball.reset(LAUNCH.x, LAUNCH.y, LAUNCH.z)
    this.ball.applyImpulse(profile)
    this.trail.clear()
    this.onFire?.(profile)
  }
}
