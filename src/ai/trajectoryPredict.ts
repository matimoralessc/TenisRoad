import * as THREE from 'three'
import { PhysicsEngine } from '../physics/PhysicsEngine'
import type { BallState } from '../physics/types'
import type { Surface } from '../data/courtDimensions'

// Motor dedicado a la predicción (single-thread: corre a término dentro de una
// llamada, sin interleave con el motor principal).
const predEngine = new PhysicsEngine()
const FIXED_DT = 1 / 120
const MAX_STEPS = 1200   // hasta 10 s de vuelo

export interface LandingPrediction {
  x: number
  z: number
}

/**
 * Clona el estado activo de la pelota y proyecta la física EXACTA (gravedad +
 * drag + Magnus + red) hacia adelante hasta detectar el primer bote, devolviendo
 * sus coordenadas (x, z). Devuelve null si la pelota no bota (p. ej. va a la red).
 */
export function predictLanding(state: BallState, surface: Surface): LandingPrediction | null {
  const sim: BallState = {
    position: new THREE.Vector3().copy(state.position),
    velocity: new THREE.Vector3().copy(state.velocity),
    angularVelocity: new THREE.Vector3().copy(state.angularVelocity),
  }

  for (let i = 0; i < MAX_STEPS; i++) {
    const events = predEngine.step(sim, FIXED_DT, surface)
    for (const e of events) {
      if (e.type === 'bounce') {
        return { x: e.position.x, z: e.position.z }
      }
    }
  }
  return null
}
