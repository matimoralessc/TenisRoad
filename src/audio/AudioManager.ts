/**
 * Audio sintetizado por Web Audio (Fase 10). Sin assets externos: cada sonido
 * es una ráfaga de ruido filtrada con envolvente exponencial — un "tock" agudo
 * al golpear y un "thud" grave al botar. El AudioContext se crea y reanuda con
 * el primer gesto del usuario (política de autoplay de los navegadores).
 */
export class AudioManager {
  private ctx: AudioContext | null = null
  private noise: AudioBuffer | null = null

  constructor() {
    const resume = () => {
      this.ensure()
      this.ctx?.resume()
      window.removeEventListener('keydown', resume)
      window.removeEventListener('pointerdown', resume)
    }
    window.addEventListener('keydown', resume)
    window.addEventListener('pointerdown', resume)
  }

  private ensure(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    const len = Math.floor(this.ctx.sampleRate * 0.2)
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noise = buf
  }

  /** Ráfaga de ruido con bandpass + envolvente exponencial de caída. */
  private burst(freq: number, q: number, dur: number, peak: number): void {
    const ctx = this.ctx
    if (!ctx || !this.noise) return

    const src = ctx.createBufferSource()
    src.buffer = this.noise

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = q

    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(peak, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    src.connect(bp).connect(g).connect(ctx.destination)
    src.start(t)
    src.stop(t + dur)
  }

  /** Golpe de raqueta: "tock" agudo y corto, intensidad según potencia. */
  hit(power = 1): void {
    this.ensure()
    this.burst(1500, 1.4, 0.07, Math.min(0.6, 0.35 + 0.25 * power))
  }

  /** Bote en la superficie: "thud" grave, intensidad según rapidez de impacto. */
  bounce(intensity = 1): void {
    this.ensure()
    this.burst(300, 1.1, 0.11, Math.min(0.5, 0.18 + 0.12 * intensity))
  }
}
