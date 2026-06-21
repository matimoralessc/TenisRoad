import type { ShotKey } from '../data/shotProfiles'

/**
 * Capa de entrada (Fase 3).
 * Escucha keydown/keyup en el documento y mantiene un Set de teclas activas,
 * sin contaminar el scope global. La lógica de juego *consulta* (polling) este
 * estado cada tick; el controlador nunca decide reglas, solo reporta teclas.
 *
 * Mapeo:
 *   Movimiento : W/A/S/D + Flechas
 *   Apuntado   : A/D + Flechas ←/→  (eje horizontal, reutilizado al cargar)
 *   Golpes     : J=Flat  K=Topspin  L=Slice  I=Drop
 */

const SHOT_KEYS: Record<string, ShotKey> = {
  KeyJ: 'flat',
  KeyK: 'topspin',
  KeyL: 'slice',
  KeyI: 'drop',
}

// Códigos cuyo comportamiento por defecto (scroll) conviene anular.
const PREVENT_DEFAULT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
])

export class InputController {
  private readonly held = new Set<string>()
  private serveQueued = false   // flanco de Space, consumido una sola vez
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onKeyUp: (e: KeyboardEvent) => void

  constructor(private readonly target: Window = window) {
    this.onKeyDown = (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault()
      if (e.code === 'Space' && !this.held.has('Space')) this.serveQueued = true
      this.held.add(e.code)
    }
    this.onKeyUp = (e) => {
      this.held.delete(e.code)
    }
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
  }

  /** Devuelve true una única vez por pulsación de Space (saque). */
  pollServe(): boolean {
    if (this.serveQueued) {
      this.serveQueued = false
      return true
    }
    return false
  }

  /** Vector de movimiento normalizado en el plano XZ (mundo). */
  movementVector(): { x: number; z: number } {
    let x = 0
    let z = 0
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) x -= 1
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) x += 1
    // W/↑ avanza hacia la red (−z); S/↓ retrocede (+z)
    if (this.held.has('KeyW') || this.held.has('ArrowUp')) z -= 1
    if (this.held.has('KeyS') || this.held.has('ArrowDown')) z += 1

    if (x !== 0 && z !== 0) {
      const inv = 1 / Math.SQRT2
      x *= inv
      z *= inv
    }
    return { x, z }
  }

  /** Eje horizontal de apuntado: −1 (izq) / +1 (der) / 0. */
  aimAxis(): number {
    let a = 0
    if (this.held.has('KeyA') || this.held.has('ArrowLeft')) a -= 1
    if (this.held.has('KeyD') || this.held.has('ArrowRight')) a += 1
    return a
  }

  /** Primer tipo de golpe actualmente presionado, o null. */
  pressedShot(): ShotKey | null {
    for (const code in SHOT_KEYS) {
      if (this.held.has(code)) return SHOT_KEYS[code]
    }
    return null
  }

  /** ¿Sigue presionada la tecla de un tipo de golpe concreto? */
  isShotHeld(type: ShotKey): boolean {
    for (const code in SHOT_KEYS) {
      if (SHOT_KEYS[code] === type && this.held.has(code)) return true
    }
    return false
  }

  /** Quita los listeners (limpieza). */
  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('keyup', this.onKeyUp)
    this.held.clear()
  }
}
