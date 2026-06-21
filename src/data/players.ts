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
 *  friction     → retención de velocidad por segundo (menor = frena/recupera mejor)
 *  topspinPower → multiplicador de la magnitud de spin en golpes de topspin
 *  flatDepth    → multiplicador de rapidez en golpes planos (profundidad)
 *  mental       → 0..1: resistencia de la ventana Perfect a encogerse al correr
 */
export interface PlayerAttributes {
  id: string
  name: string         // formato marcador ATP (ej. "C. Alcaraz")
  maxSpeed: number
  friction: number
  topspinPower: number
  flatDepth: number
  mental: number
}

export type PlayerId = 'alcaraz' | 'djokovic'

export const PLAYERS: Record<PlayerId, PlayerAttributes> = {
  // Velocidad explosiva + topspin pesado; agresividad extrema castiga su timing al correr.
  alcaraz: {
    id: 'alcaraz',
    name: 'C. Alcaraz',
    maxSpeed: 7.2,
    friction: 0.05,
    topspinPower: 1.25,
    flatDepth: 1.0,
    mental: 0.5,
  },
  // Recuperación de élite (fricción baja), profundidad plana suprema, mental impecable.
  djokovic: {
    id: 'djokovic',
    name: 'N. Djokovic',
    maxSpeed: 6.6,
    friction: 0.03,
    topspinPower: 1.0,
    flatDepth: 1.2,
    mental: 0.9,
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
    maxSpeed: attr.maxSpeed,
    friction: attr.friction,
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
