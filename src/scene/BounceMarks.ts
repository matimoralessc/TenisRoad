import * as THREE from 'three'

/**
 * Marcas de bote en la arcilla (Fase 9). Pool fijo de discos planos que se
 * tiñen al botar la pelota y se desvanecen con el tiempo, como las marcas reales
 * sobre el polvo de ladrillo. Cero asignaciones por bote (reutiliza el pool) y
 * una sola geometría compartida; cada marca varía escala/rotación para realismo.
 */
export class BounceMarks {
  private readonly meshes: THREE.Mesh[] = []
  private readonly mats: THREE.MeshBasicMaterial[] = []
  private readonly ages: number[] = []
  private idx = 0

  private readonly life: number
  private readonly peak: number

  constructor(
    scene: THREE.Scene,
    max = 14,
    color = 0x3a1608,   // arcilla oscura removida
    life = 9,
    peak = 0.55,
  ) {
    this.life = life
    this.peak = peak

    const geo = new THREE.CircleGeometry(0.085, 14)
    geo.rotateX(-Math.PI / 2)   // tendido en el plano XZ

    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false,
      })
      const m = new THREE.Mesh(geo, mat)
      m.position.y = 0.0025      // justo sobre las líneas (evita z-fighting)
      m.visible = false
      m.renderOrder = 1
      scene.add(m)
      this.meshes.push(m)
      this.mats.push(mat)
      this.ages.push(Infinity)
    }
  }

  /** Estampa una marca en (x,z), con forma elíptica orientada al azar. */
  add(x: number, z: number): void {
    const m = this.meshes[this.idx]
    m.position.set(x, 0.0025, z)
    m.visible = true
    const sc = 0.85 + Math.random() * 0.7
    m.scale.set(sc, 1, sc * (1.1 + Math.random() * 0.5))  // alargada (deslizamiento)
    m.rotation.y = Math.random() * Math.PI
    this.mats[this.idx].opacity = this.peak
    this.ages[this.idx] = 0
    this.idx = (this.idx + 1) % this.meshes.length
  }

  /** Avanza el desvanecimiento de todas las marcas activas. */
  update(dt: number): void {
    for (let i = 0; i < this.meshes.length; i++) {
      if (this.ages[i] === Infinity) continue
      this.ages[i] += dt
      const t = this.ages[i] / this.life
      if (t >= 1) {
        this.meshes[i].visible = false
        this.ages[i] = Infinity
      } else {
        this.mats[i].opacity = this.peak * (1 - t)
      }
    }
  }

  /** Borra todas las marcas (inicio de partido / cambio de escena). */
  clear(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].visible = false
      this.mats[i].opacity = 0
      this.ages[i] = Infinity
    }
  }
}
