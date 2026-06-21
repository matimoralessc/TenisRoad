import * as THREE from 'three'
import { COURT } from '../data/courtDimensions'
import { Character } from './Character'
import type { MovementParams } from '../player/movement'

/**
 * Jugador humano (sur): cápsula azul con acento ámbar mirando hacia la red (−z).
 * Reutiliza por completo la base Character (inercia + interpolación).
 */
export class Player extends Character {
  constructor(scene: THREE.Scene, params?: MovementParams) {
    super(scene, {
      color: 0x1e6fff,
      accentColor: 0xffd54a,
      accentZ: -1,
      spawn: new THREE.Vector3(0, 0, COURT.halfLength),  // baseline sur
      params,
    })
  }
}
