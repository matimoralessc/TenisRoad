import * as THREE from 'three'
import { COURT } from '../data/courtDimensions'
import { Character } from './Character'
import type { MovementParams } from '../player/movement'

/**
 * Jugador humano (sur): silueta atlética azul profundo/blanco mirando hacia la
 * red (−z). Reutiliza por completo la base Character (inercia + interpolación).
 */
export class Player extends Character {
  constructor(scene: THREE.Scene, params?: MovementParams) {
    super(scene, {
      color: 0x16317a,        // camiseta azul profundo
      trimColor: 0xeef2f8,    // short blanco
      accentColor: 0xffffff,  // marcador de pecho blanco
      accentZ: -1,
      spawn: new THREE.Vector3(0, 0, COURT.halfLength),  // baseline sur
      params,
    })
  }
}
