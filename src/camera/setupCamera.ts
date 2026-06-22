import * as THREE from 'three'

export interface CameraConfig {
  fov: number
  position: [number, number, number]  // posición de la cámara (m)
  lookAt: [number, number, number]    // punto de mira (m)
}

/**
 * Vista por defecto estilo transmisión TV: cámara alta y retrasada tras la
 * baseline sur, con suficiente espacio de "run-back" para que el jugador y su
 * barra de timing queden completamente encuadrados en la parte baja del cuadro.
 * Mira ligeramente por encima de la red hacia el lado del rival.
 */
export const DEFAULT_CAMERA: CameraConfig = {
  fov: 46,
  position: [0, 8.5, 22.0],
  lookAt: [0, 0.4, 7.0],
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

  camera.position.set(...cfg.position)
  camera.lookAt(...cfg.lookAt)

  // La matriz de proyección se reajusta dinámicamente: así el jugador en primer
  // plano nunca se sale del cuadro en viewports más anchos o más estrechos.
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return camera
}
