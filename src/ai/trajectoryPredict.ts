import * as THREE from 'three'
import { PhysicsEngine } from '../physics/PhysicsEngine'
import { STRIKE_HEIGHT } from '../physics/constants'
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

/**
 * Punto de CONTACTO ideal de la IA: proyecta la física exacta y devuelve dónde
 * la IA debe PLANTARSE para golpear, no dónde bota la pelota. A diferencia de
 * `predictLanding` (primer bote), distingue dos casos tras el primer bote en el
 * lado de la IA (z < 0):
 *
 *   · Bola que sube (topspin/globo): se toma en su DESCENSO por la altura de
 *     golpeo (STRIKE_HEIGHT) — la pelota "baja a la mano".
 *   · Bola rasa (saque que patina, slice bajo): nunca vuelve a subir hasta la
 *     altura de golpeo, así que se intercepta en su SEGUNDO bote, profundo,
 *     cerca de la línea de fondo de la IA — exactamente donde está plantada.
 *
 * Esto es lo que arregla la devolución del saque: el bote del saque es corto
 * (en el cuadro), pero el punto de golpeo queda atrás, y antes la IA corría
 * hacia el bote corto y dejaba pasar la pelota.
 */
export function predictContact(state: BallState, surface: Surface): LandingPrediction | null {
  const sim: BallState = {
    position: new THREE.Vector3().copy(state.position),
    velocity: new THREE.Vector3().copy(state.velocity),
    angularVelocity: new THREE.Vector3().copy(state.angularVelocity),
  }

  let bounces = 0
  let firstBounce: LandingPrediction | null = null
  let prevY = sim.position.y

  for (let i = 0; i < MAX_STEPS; i++) {
    const events = predEngine.step(sim, FIXED_DT, surface)
    for (const e of events) {
      if (e.type !== 'bounce') continue
      bounces++
      if (bounces === 1) {
        firstBounce = { x: e.position.x, z: e.position.z }
      } else if (e.position.z < 0) {
        // Bola rasa: tómala profunda en su 2º bote (donde la IA llega a tiempo)
        return { x: e.position.x, z: e.position.z }
      }
    }
    // Bola que sube: tómala en el descenso por la altura de golpeo
    if (
      firstBounce && sim.position.z < 0 &&
      prevY > STRIKE_HEIGHT && sim.position.y <= STRIKE_HEIGHT
    ) {
      return { x: sim.position.x, z: sim.position.z }
    }
    prevY = sim.position.y
  }
  return firstBounce
}
