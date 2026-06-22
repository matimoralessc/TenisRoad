import * as THREE from 'three'
import {
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_MAX_SPEED,
  PLAYER_Z_MIN,
  PLAYER_Z_MAX,
  PLAYER_X_LIMIT,
} from '../physics/constants'

/** Estado cinemático mínimo del jugador en el plano XZ. */
export interface MovementState {
  position: THREE.Vector3   // y se mantiene constante (pie en el suelo)
  velocity: THREE.Vector3   // solo componentes x,z son relevantes
}

/**
 * Parámetros de movimiento por personaje (Fase 4): permiten que Player y AI usen
 * el MISMO integrador con atributos distintos (atletismo) y su propia mitad de
 * cancha. Lo no especificado cae a las constantes globales por defecto.
 */
export interface MovementParams {
  accel?: number     // tasa de aceleración hacia la velocidad objetivo (m/s²)
  decel?: number     // tasa de frenado al soltar / cambiar de sentido (m/s²)
  maxSpeed?: number
  xLimit?: number
  zMin?: number
  zMax?: number
}

/**
 * Integrador de velocidad-objetivo a paso fijo (120 Hz). Modelo "plantado"
 * estilo Top Spin: sin derrape exponencial. La velocidad persigue una
 * velocidad objetivo (dir·MAX) a tasa fija, frenando con DECEL al soltar.
 *
 *  1. Objetivo:    target = dir·maxSpeed  (0 si no hay input).
 *  2. Persecución: v se acerca a target a `rate·dt` (accel con input, decel sin).
 *                  Si queda dentro de un paso, ajusta exacto → arranques y
 *                  frenadas nítidas, sin deslizamiento de hielo.
 *  3. Integración: position += v·dt.
 *  4. Límites:     clamp rígido dentro de la cancha jugable.
 *
 * `dir` debe venir ya normalizado (|dir| ∈ {0,1}).
 */
export function stepMovement(
  state: MovementState,
  dir: { x: number; z: number },
  dt: number,
  params: MovementParams = {},
): void {
  const accel = params.accel ?? PLAYER_ACCEL
  const decel = params.decel ?? PLAYER_DECEL
  const maxSpeed = params.maxSpeed ?? PLAYER_MAX_SPEED
  const xLimit = params.xLimit ?? PLAYER_X_LIMIT
  const zMin = params.zMin ?? PLAYER_Z_MIN
  const zMax = params.zMax ?? PLAYER_Z_MAX

  const v = state.velocity
  const hasInput = dir.x !== 0 || dir.z !== 0

  // Velocidad objetivo en el plano XZ
  const targetX = hasInput ? dir.x * maxSpeed : 0
  const targetZ = hasInput ? dir.z * maxSpeed : 0

  // Acelera al pedir movimiento; frena más fuerte al soltar (recuperación atlética)
  const rate = hasInput ? accel : decel
  const maxStep = rate * dt

  // Persigue el objetivo como vector (feel uniforme en cualquier dirección)
  const dvx = targetX - v.x
  const dvz = targetZ - v.z
  const dlen = Math.hypot(dvx, dvz)
  if (dlen <= maxStep || dlen === 0) {
    v.x = targetX
    v.z = targetZ
  } else {
    const s = maxStep / dlen
    v.x += dvx * s
    v.z += dvz * s
  }

  // Integración (posición tras actualizar velocidad)
  const p = state.position
  p.x += v.x * dt
  p.z += v.z * dt

  // Límites rígidos: detiene la componente que choca
  if (p.x < -xLimit) { p.x = -xLimit; if (v.x < 0) v.x = 0 }
  else if (p.x > xLimit) { p.x = xLimit; if (v.x > 0) v.x = 0 }

  if (p.z < zMin) { p.z = zMin; if (v.z < 0) v.z = 0 }
  else if (p.z > zMax) { p.z = zMax; if (v.z > 0) v.z = 0 }
}

/** Rapidez actual en el plano XZ (m/s). */
export function planarSpeed(state: MovementState): number {
  return Math.hypot(state.velocity.x, state.velocity.z)
}
