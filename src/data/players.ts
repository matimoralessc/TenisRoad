import type { MovementParams } from '../player/movement'
import {
  PLAYER_ACCEL,
  PLAYER_X_LIMIT,
  PLAYER_Z_MIN,
  PLAYER_Z_MAX,
} from '../physics/constants'

/**
 * Perfiles ATP (Fase 4). Cada atributo ESCALA parámetros físicos ya existentes;
 * no introduce números mágicos en la lógica de juego.
 *
 *  maxSpeed     → rapidez máxima de desplazamiento (m/s)
 *  decel        → tasa de frenado/cambio de sentido (m/s²; mayor = recupera mejor)
 *  topspinPower → multiplicador de la magnitud de spin en golpes de topspin
 *  flatDepth    → multiplicador de rapidez en golpes planos (profundidad)
 *  mental       → 0..1: resistencia de la ventana Perfect a encogerse al correr
 */
export interface PlayerAttributes {
  id: string
  name: string         // formato marcador ATP (ej. "C. Alcaraz")
  maxSpeed: number
  decel: number
  topspinPower: number
  flatDepth: number
  mental: number
}

export type PlayerId = 'alcaraz' | 'djokovic'

export const PLAYERS: Record<PlayerId, PlayerAttributes> = {
  // Velocidad explosiva + topspin pesado; frenado algo más suelto (juego en carrera).
  alcaraz: {
    id: 'alcaraz',
    name: 'C. Alcaraz',
    maxSpeed: 6.0,
    decel: 40,
    topspinPower: 1.25,
    flatDepth: 1.0,
    mental: 0.5,
  },
  // Recuperación de élite (frenado más alto), profundidad plana suprema, mental impecable.
  djokovic: {
    id: 'djokovic',
    name: 'N. Djokovic',
    maxSpeed: 5.9,
    decel: 53,
    topspinPower: 1.1,
    flatDepth: 1.32,
    mental: 0.95,
  },
}

/** Atributos relevantes para la mecánica de golpe (timing + escalas de impulso). */
export interface ShotAttributes {
  topspinPower: number
  flatDepth: number
  mental: number
}

export function shotAttrsFor(attr: PlayerAttributes): ShotAttributes {
  return {
    topspinPower: attr.topspinPower,
    flatDepth: attr.flatDepth,
    mental: attr.mental,
  }
}

/**
 * Construye los parámetros de movimiento para un personaje según su lado de cancha.
 * Sur (jugador) usa z ∈ [ZMIN, ZMAX]; Norte (IA) refleja a z negativo.
 */
export function movementParamsFor(
  attr: PlayerAttributes,
  side: 'south' | 'north',
): MovementParams {
  const base: MovementParams = {
    accel: PLAYER_ACCEL,
    decel: attr.decel,
    maxSpeed: attr.maxSpeed,
    xLimit: PLAYER_X_LIMIT,
  }
  if (side === 'south') {
    base.zMin = PLAYER_Z_MIN
    base.zMax = PLAYER_Z_MAX
  } else {
    base.zMin = -PLAYER_Z_MAX
    base.zMax = -PLAYER_Z_MIN
  }
  return base
}
