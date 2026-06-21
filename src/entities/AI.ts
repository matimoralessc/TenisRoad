import * as THREE from 'three'
import { COURT } from '../data/courtDimensions'
import { Character } from './Character'
import type { MovementParams } from '../player/movement'

/**
 * Oponente IA (norte): cápsula roja con acento mirando hacia el jugador (+z).
 * Usa idéntica física inercial que el humano; solo cambian color, orientación
 * y la mitad de cancha (parámetros de límites en MovementParams).
 */
export class AI extends Character {
  constructor(scene: THREE.Scene, params?: MovementParams) {
    super(scene, {
      color: 0xff3b30,
      accentColor: 0xffe0a0,
      accentZ: +1,
      spawn: new THREE.Vector3(0, 0, -COURT.halfLength),  // baseline norte
      params,
    })
  }
}
