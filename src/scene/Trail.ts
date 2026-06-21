import * as THREE from 'three'

const MAX_POINTS = 600   // 5 s @ 120 Hz — cubre cualquier trayectoria

/**
 * Estela de trayectoria: una sola THREE.Line con buffer pre-asignado y
 * drawRange dinámico. Cero asignaciones por frame, un único draw call.
 */
export class Trail {
  readonly line: THREE.Line

  private readonly positions = new Float32Array(MAX_POINTS * 3)
  private readonly attr: THREE.BufferAttribute
  private count = 0

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry()
    this.attr = new THREE.BufferAttribute(this.positions, 3)
    this.attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', this.attr)
    geo.setDrawRange(0, 0)

    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffff66, transparent: true, opacity: 0.55 }),
    )
    this.line.frustumCulled = false
    scene.add(this.line)
  }

  /** Vacía la estela (nuevo lanzamiento). */
  clear(): void {
    this.count = 0
    this.line.geometry.setDrawRange(0, 0)
  }

  /** Añade un punto de trayectoria. Se detiene al llenar el buffer. */
  push(p: THREE.Vector3): void {
    if (this.count >= MAX_POINTS) return
    const i = this.count * 3
    this.positions[i] = p.x
    this.positions[i + 1] = p.y
    this.positions[i + 2] = p.z
    this.count++
    this.line.geometry.setDrawRange(0, this.count)
    this.attr.needsUpdate = true
  }
}
