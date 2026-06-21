import * as THREE from 'three'
import type { BaseShotProfile } from '../data/shotProfiles'
import type { ShotProfile } from '../physics/types'

/**
 * Construye el impulso real (velocidad + spin vectorial) de un golpe a partir
 * de un perfil base, el punto de contacto y un objetivo en cancha.
 *
 * El eje de spin se deriva de la dirección horizontal de viaje:
 *   axis = up × dir = (dz, 0, −dx)
 * de modo que `spinMag > 0` siempre produce topspin (Magnus hacia abajo),
 * independientemente de si el golpe va hacia −z (jugador) o +z (IA).
 *
 * Pura y determinista: sin estado ni asignaciones globales.
 */
export function buildImpulse(
  from: THREE.Vector3,
  targetX: number,
  targetZ: number,
  base: BaseShotProfile,
  powerMult: number,
  spinMult: number,
): ShotProfile {
  // Dirección horizontal unitaria contacto → objetivo
  let dx = targetX - from.x
  let dz = targetZ - from.z
  const hLen = Math.hypot(dx, dz) || 1
  dx /= hLen
  dz /= hLen

  // Descomposición rapidez/ángulo
  const speed = base.speed * powerMult
  const ang = (base.launchAngle * Math.PI) / 180
  const hSpeed = speed * Math.cos(ang)
  const vy = speed * Math.sin(ang)

  // Eje de spin = up × dir  → (dz, 0, −dx); escalado por la magnitud con signo
  const spinMag = base.spin * spinMult

  return {
    name: base.name,
    velocity: [dx * hSpeed, vy, dz * hSpeed],
    spin: [spinMag * dz, 0, -spinMag * dx],
  }
}
