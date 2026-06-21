/**
 * Game loop con timestep FIJO + acumulador.
 *
 * El motor de físicas (Paso 2) requiere pasos de tiempo deterministas e
 * independientes del framerate. `update(fixedDt)` se ejecuta siempre con el
 * mismo dt (p. ej. 1/120s) — sin importar si el monitor va a 60, 144 o 240Hz —
 * y `render(alpha)` recibe el factor de interpolación [0,1) entre el último
 * paso de física y el siguiente, para suavizar el dibujado.
 */
export interface LoopHandlers {
  update: (fixedDt: number) => void
  render: (alpha: number) => void
}

export interface GameLoop {
  stop(): void
}

const MAX_FRAME = 0.25  // clamp anti "spiral of death" tras un freeze/pestaña inactiva

export function startGameLoop(
  { update, render }: LoopHandlers,
  fixedDt = 1 / 120,
): GameLoop {
  let acc = 0
  let last = performance.now() / 1000
  let rafId = 0
  let running = true

  const frame = (): void => {
    if (!running) return
    rafId = requestAnimationFrame(frame)

    const now = performance.now() / 1000
    let dt = now - last
    last = now
    if (dt > MAX_FRAME) dt = MAX_FRAME

    acc += dt
    while (acc >= fixedDt) {
      update(fixedDt)
      acc -= fixedDt
    }

    render(acc / fixedDt)
  }

  rafId = requestAnimationFrame(frame)

  return {
    stop() {
      running = false
      cancelAnimationFrame(rafId)
    },
  }
}
