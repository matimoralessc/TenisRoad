import * as THREE from 'three'
import { Player } from '../entities/Player'
import type { ChargeView } from '../player/ShotController'

const BAR_WIDTH = 130   // px
const BAR_HEIGHT = 14   // px
const LIFT = 26         // px que se eleva la barra sobre la cabeza

/**
 * Barra de timing (Fase 3): overlay 2D dibujado en un único <canvas> a pantalla
 * completa, sin pointer-events. Proyecta la cabeza del jugador (mundo → NDC →
 * píxeles) y dibuja las zonas de color + el marcador. Solo se renderiza durante
 * el estado CHARGING. Cero geometría 3D, cero asignaciones por frame.
 */
export class ShotTimingBar {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly head = new THREE.Vector3()

  constructor() {
    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '90',
    } as CSSStyleDeclaration)
    document.body.appendChild(this.canvas)

    this.ctx = this.canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2)
    this.canvas.width = Math.floor(window.innerWidth * dpr)
    this.canvas.height = Math.floor(window.innerHeight * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Redibuja la barra para el frame actual (alpha = interpolación de render). */
  render(player: Player, camera: THREE.PerspectiveCamera, view: ChargeView, alpha: number): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    if (!view.active) return

    // Cabeza del jugador → píxeles
    player.headWorldPosition(this.head, alpha)
    this.head.project(camera)
    if (this.head.z > 1) return  // detrás de la cámara

    const cx = (this.head.x * 0.5 + 0.5) * window.innerWidth
    const cy = (-this.head.y * 0.5 + 0.5) * window.innerHeight - LIFT

    const x0 = cx - BAR_WIDTH / 2
    const y0 = cy - BAR_HEIGHT / 2

    // Fondo
    ctx.fillStyle = 'rgba(0,0,0,0.78)'
    ctx.fillRect(x0 - 2, y0 - 2, BAR_WIDTH + 4, BAR_HEIGHT + 4)

    // Zonas: Too Early | Good | Perfect | (Good/Late en bajada se leen por valor)
    // Mapeo de valor [0,1] → x. El pico (1.0) queda a la derecha.
    const good = view.goodLo
    const perf = view.perfectLo

    // Too Early/Late (rojo): 0 .. good
    this.band(x0, y0, 0, good, '#7a2222')
    // Good (ámbar): good .. perf
    this.band(x0, y0, good, perf, '#c8901f')
    // Perfect (verde): perf .. 1
    this.band(x0, y0, perf, 1, view.stretch ? '#1f9e4a' : '#22c55e')

    // Marcador
    const mx = x0 + view.charge * BAR_WIDTH
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(mx - 1.5, y0 - 3, 3, BAR_HEIGHT + 6)

    // Aviso "on the stretch"
    if (view.stretch) {
      ctx.fillStyle = '#ff5555'
      ctx.font = '700 9px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('STRETCH', cx, y0 - 6)
    }
  }

  /** Dibuja una banda entre dos valores normalizados [lo,hi] de la barra. */
  private band(x0: number, y0: number, lo: number, hi: number, color: string): void {
    this.ctx.fillStyle = color
    this.ctx.fillRect(x0 + lo * BAR_WIDTH, y0, (hi - lo) * BAR_WIDTH, BAR_HEIGHT)
  }
}
