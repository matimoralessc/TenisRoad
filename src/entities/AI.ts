import * as THREE from 'three'
import { COURT } from '../data/courtDimensions'
import { Character } from './Character'
import type { MovementParams } from '../player/movement'

/**
 * Oponente IA (norte): silueta atlética rojo profundo/carbón mirando hacia el
 * jugador (+z). Usa idéntica física inercial que el humano; solo cambian color,
 * orientación y la mitad de cancha (parámetros de límites en MovementParams).
 */
export class AI extends Character {
  constructor(scene: THREE.Scene, params?: MovementParams) {
    super(scene, {
      color: 0x8c1818,        // camiseta rojo profundo
      trimColor: 0x2a2a30,    // short carbón
      accentColor: 0x16161c,  // marcador de pecho carbón
      accentZ: +1,
      spawn: new THREE.Vector3(0, 0, -COURT.halfLength),  // baseline norte
      params,
    })
  }
}
