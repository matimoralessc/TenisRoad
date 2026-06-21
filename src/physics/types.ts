import * as THREE from 'three'

/** Vector de estado completo de la pelota en el integrador. */
export interface BallState {
  position: THREE.Vector3        // x  (m)
  velocity: THREE.Vector3        // v  (m/s)
  angularVelocity: THREE.Vector3 // ω  (rad/s)
}

/** Perfil de golpe: velocidad y spin iniciales (base para teclas J/K/L/I en Fase 3). */
export interface ShotProfile {
  name: string
  velocity: [number, number, number]  // v0 (m/s)
  spin: [number, number, number]       // ω0 (rad/s)
}

/** Evento emitido al botar en la superficie. */
export interface BounceEvent {
  type: 'bounce'
  position: THREE.Vector3
  incomingSpeed: number   // |v| antes del impacto (m/s)
  grip: boolean           // true = agarró (rolling), false = patinó (skid)
}

/** Evento emitido al alcanzar el plano de la red (z = 0). */
export interface NetEvent {
  type: 'net'
  position: THREE.Vector3
  passed: boolean   // true = pasó por encima del cordón
  clip: boolean     // true = rozó el cordón (net-cord)
}

export type PhysicsEvent = BounceEvent | NetEvent
