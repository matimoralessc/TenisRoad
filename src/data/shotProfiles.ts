/**
 * Perfiles base de golpe del jugador (Fase 3).
 *
 * A diferencia de los perfiles fijos de la BallMachine (vectores absolutos),
 * estos definen la *firma* del golpe (rapidez, ángulo de lanzamiento y spin)
 * de forma independiente de la dirección. El ShotController construye el vector
 * de velocidad real apuntando desde el contacto hacia el objetivo (lado rival).
 *
 * Convención de spin: el jugador sur golpea hacia −z (hacia la red/norte).
 *   ω en eje +x  → Magnus hacia ARRIBA  (backspin / slice, flota)
 *   ω en eje −x  → Magnus hacia ABAJO   (topspin, cae y kickea)
 */

export type ShotKey = 'flat' | 'topspin' | 'slice' | 'drop'

export interface BaseShotProfile {
  name: string
  /** Rapidez total inicial del golpe perfecto (m/s) */
  speed: number
  /** Ángulo de lanzamiento sobre la horizontal (grados) */
  launchAngle: number
  /** Spin base [ωx, ωy, ωz] (rad/s), calibrado para viaje hacia −z */
  spin: [number, number, number]
}

export const SHOT_PROFILES: Record<ShotKey, BaseShotProfile> = {
  // J — plano y penetrante: arco bajo, mínimo topspin de control
  flat: {
    name: 'Flat Drive',
    speed: 33,
    launchAngle: 6,
    spin: [-40, 0, 0],
  },
  // K — topspin pesado: arco alto, cae con kick explosivo
  topspin: {
    name: 'Heavy Topspin',
    speed: 26,
    launchAngle: 19,
    spin: [-400, 0, 0],
  },
  // L — slice: flota, bote bajo y deslizado (backspin)
  slice: {
    name: 'Backhand Slice',
    speed: 19,
    launchAngle: 12,
    spin: [250, 0, 0],
  },
  // I — drop/lob corto: arco empinado, muere cerca de la red (backspin)
  drop: {
    name: 'Drop Shot',
    speed: 9,
    launchAngle: 30,
    spin: [300, 0, 0],
  },
}

/** Profundidad Z objetivo por defecto en el lado rival (norte, z<0). */
export const TARGET_DEPTH_Z = -7
