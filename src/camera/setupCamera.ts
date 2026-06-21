import * as THREE from 'three'
import { COURT, NET } from '../data/courtDimensions'

export interface CameraConfig {
  fov: number
  height: number        // altura de la cámara (m)
  distanceBehind: number // distancia detrás de la baseline sur (m)
  lookAtZ: number       // punto de mira en Z
}

/** Vista por defecto estilo transmisión TV, detrás del jugador sur. */
export const DEFAULT_CAMERA: CameraConfig = {
  fov: 50,
  height: 9,
  distanceBehind: 5,
  lookAtZ: -2,
}

export function setupCamera(
  renderer: THREE.WebGLRenderer,
  cfg: CameraConfig = DEFAULT_CAMERA,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    cfg.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  )

  camera.position.set(0, cfg.height, COURT.halfLength + cfg.distanceBehind)
  // Mira hacia la red, a la altura del cordón → encuadre de simulador
  camera.lookAt(0, NET.height_center, cfg.lookAtZ)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return camera
}
