/**
 * Perfiles base de golpe (Fase 3, refinado en Fase 4).
 *
 * Definen la *firma* del golpe (rapidez, ángulo, spin) de forma independiente
 * de la dirección. `spin` es una MAGNITUD CON SIGNO sobre el "eje de topspin":
 *   spin > 0  → topspin (Magnus hacia abajo, cae/kickea)
 *   spin < 0  → backspin/slice (Magnus hacia arriba, flota)
 *
 * shotMath.buildImpulse() deriva el vector de spin real a partir de la dirección
 * de viaje, por lo que el mismo perfil sirve para el jugador (golpea hacia −z)
 * y para la IA (golpea hacia +z) sin invertir signos a mano.
 */

export type ShotKey = 'flat' | 'topspin' | 'slice' | 'drop'

export interface BaseShotProfile {
  name: string
  /** Rapidez total inicial del golpe perfecto (m/s) */
  speed: number
  /** Ángulo de lanzamiento sobre la horizontal (grados) */
  launchAngle: number
  /** Magnitud de spin con signo sobre el eje de topspin (rad/s) */
  spin: number
}

export const SHOT_PROFILES: Record<ShotKey, BaseShotProfile> = {
  // J — plano y penetrante: arco bajo, mínimo topspin de control
  flat:    { name: 'Flat Drive',     speed: 33, launchAngle: 6,  spin: 40 },
  // K — topspin pesado: arco alto, cae con kick explosivo
  topspin: { name: 'Heavy Topspin',  speed: 26, launchAngle: 19, spin: 400 },
  // L — slice: flota, bote bajo y deslizado (backspin)
  slice:   { name: 'Backhand Slice', speed: 19, launchAngle: 12, spin: -250 },
  // I — drop/lob corto: arco empinado, muere cerca de la red (backspin)
  drop:    { name: 'Drop Shot',      speed: 9,  launchAngle: 30, spin: -300 },
}

/** Profundidad Z objetivo por defecto en el lado rival (norte, z<0). */
export const TARGET_DEPTH_Z = -7
