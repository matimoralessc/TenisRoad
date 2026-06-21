import * as THREE from 'three'
import {
  PLAYER_ACCEL,
  PLAYER_MAX_SPEED,
  PLAYER_FRICTION,
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
 * Parámetros de inercia por personaje (Fase 4): permiten que Player y AI usen
 * el MISMO integrador con atributos distintos (atletismo) y su propia mitad de
 * cancha. Lo no especificado cae a las constantes globales por defecto.
 */
export interface MovementParams {
  accel?: number
  maxSpeed?: number
  friction?: number
  xLimit?: number
  zMin?: number
  zMax?: number
}

/**
 * Integrador inercial a paso fijo (120 Hz).
 *
 *  1. Aceleración: si hay dirección de input, v += dir·ACCEL·dt (clamp a MAX).
 *  2. Fricción:    si no hay input, v *= FRICTION^dt → desaceleración con peso.
 *  3. Integración: position += v·dt.
 *  4. Límites:     clamp rígido dentro de la cancha jugable (no cruza la red
 *                  ni se sale del encuadre); al chocar un borde se anula esa
 *                  componente de velocidad (no rebota).
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
  const maxSpeed = params.maxSpeed ?? PLAYER_MAX_SPEED
  const friction = params.friction ?? PLAYER_FRICTION
  const xLimit = params.xLimit ?? PLAYER_X_LIMIT
  const zMin = params.zMin ?? PLAYER_Z_MIN
  const zMax = params.zMax ?? PLAYER_Z_MAX

  const v = state.velocity
  const hasInput = dir.x !== 0 || dir.z !== 0

  if (hasInput) {
    v.x += dir.x * accel * dt
    v.z += dir.z * accel * dt

    // Clamp de rapidez en el plano XZ
    const speed = Math.hypot(v.x, v.z)
    if (speed > maxSpeed) {
      const s = maxSpeed / speed
      v.x *= s
      v.z *= s
    }
  } else {
    const decay = Math.pow(friction, dt)
    v.x *= decay
    v.z *= decay
    // Corta residuales imperceptibles para detenerse limpio
    if (Math.abs(v.x) < 1e-3) v.x = 0
    if (Math.abs(v.z) < 1e-3) v.z = 0
  }

  // Integración semi-implícita (posición tras actualizar velocidad)
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
