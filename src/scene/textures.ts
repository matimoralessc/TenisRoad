import * as THREE from 'three'

/**
 * Texturas procedurales generadas en-código con <canvas> (Fase 11). Cero assets
 * externos: la arcilla, su relieve y el tejido de la red se dibujan a mano para
 * que la escena deje de leerse como un bloque vectorial plano y reaccione a la
 * luz del estadio. Todo se genera una sola vez al construir la cancha.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

/** ¿Hay DOM disponible? (las texturas de canvas solo existen en el navegador). */
export const hasCanvas = (): boolean => typeof document !== 'undefined'

/** Mezcla dos colores hex en t ∈ [0,1] y devuelve un string rgb(). */
function mix(a: number, b: number, t: number): string {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r},${g},${bl})`
}

/**
 * Mapa de color de la arcilla: degradado terracota de fondo + grano fino +
 * parches secos/desgastados concentrados tras ambas líneas de fondo (los
 * extremos v→0 y v→1 del plano de la cancha, donde los jugadores pisan más).
 */
export function makeClayTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S, S)

  const BASE = 0xB85C2A      // polvo de ladrillo
  const DEEP = 0x8f4420      // surcos húmedos
  const DRY = 0xCD7C4A       // zonas resecas/claras

  // Fondo: degradado vertical sutil (más oscuro hacia el centro de la pista)
  const grad = ctx.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0.0, mix(BASE, DRY, 0.25))
  grad.addColorStop(0.5, mix(BASE, DEEP, 0.2))
  grad.addColorStop(1.0, mix(BASE, DRY, 0.25))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)

  // Grano: motas pequeñas de variación de brillo (la "tooth" de la arcilla)
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * S
    const y = Math.random() * S
    const t = Math.random()
    ctx.fillStyle = mix(DEEP, DRY, t)
    ctx.globalAlpha = 0.04 + Math.random() * 0.06
    const r = 0.6 + Math.random() * 1.6
    ctx.fillRect(x, y, r, r)
  }
  ctx.globalAlpha = 1

  // Parches secos tras las baselines (bordes superior e inferior del canvas)
  const drawPatches = (cy: number, spread: number) => {
    for (let i = 0; i < 26; i++) {
      const x = S * (0.5 + (Math.random() - 0.5) * 0.7)   // concentrados al centro
      const y = cy + (Math.random() - 0.5) * spread
      const rx = 30 + Math.random() * 70
      const ry = 14 + Math.random() * 30
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
      g.addColorStop(0, mix(DRY, 0xE0A070, 0.35))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 0.5
      ctx.fillStyle = g
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(1, ry / rx)
      ctx.beginPath()
      ctx.arc(0, 0, rx, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }
  drawPatches(S * 0.06, S * 0.10)   // baseline norte
  drawPatches(S * 0.94, S * 0.10)   // baseline sur

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 8
  return tex
}

/** Desenfoque de caja in-place sobre un campo escalar (para agrupar el grano). */
function blur(field: Float32Array, size: number, passes: number): void {
  const tmp = new Float32Array(field.length)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let s = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = (x + dx + size) % size
            const yy = (y + dy + size) % size
            s += field[yy * size + xx]
          }
        }
        tmp[y * size + x] = s / 9
      }
    }
    field.set(tmp)
  }
}

/**
 * Mapa de normales tangencial de la arcilla: campo de alturas de ruido suavizado
 * convertido a normales por diferencias finitas. Da un microrrelieve granulado
 * que capta la luz direccional sin coste de geometría. Se tilea finamente sobre
 * la pista (espacio lineal, no sRGB).
 */
export function makeClayNormalMap(): THREE.CanvasTexture {
  const S = 256
  const [c, ctx] = canvas(S, S)

  const h = new Float32Array(S * S)
  for (let i = 0; i < h.length; i++) h[i] = Math.random()
  blur(h, S, 2)

  const img = ctx.createImageData(S, S)
  const data = img.data
  const strength = 2.2
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)]
      const r = h[y * S + ((x + 1) % S)]
      const u = h[((y - 1 + S) % S) * S + x]
      const d = h[((y + 1) % S) * S + x]
      let nx = (l - r) * strength
      let ny = (u - d) * strength
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len; ny /= len
      const o = (y * S + x) * 4
      data[o] = (nx * 0.5 + 0.5) * 255
      data[o + 1] = (ny * 0.5 + 0.5) * 255
      data[o + 2] = (1 / len) * 255
      data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 6)
  return tex
}

/**
 * Mapa de opacidad del tejido de la red: rejilla de cordones blancos (opacos)
 * sobre fondo negro (agujeros transparentes). Usado como alphaMap del cuerpo de
 * la red; se repite densamente para formar los huecos físicos del tejido.
 */
export function makeNetAlphaTexture(): THREE.CanvasTexture {
  const W = 64, H = 64
  const [c, ctx] = canvas(W, H)

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  // Cordones: líneas finas blancas formando una malla cuadrada
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.2
  const cells = 8
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * W
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(48, 8)
  return tex
}

/**
 * Cielo equirectangular procedural: degradado de día de estadio (azul cenital →
 * bruma cálida en el horizonte → suelo oscuro). Sirve como fondo de escena y,
 * prefiltrado por PMREM, como mapa de entorno para la iluminación basada en
 * imagen (IBL), que es lo que asienta los materiales y elimina el look plano.
 */
export function makeSkyTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512
  const [c, ctx] = canvas(W, H)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0.00, mix(0x16294f, 0x21407a, 0.0))   // cenit azul profundo
  g.addColorStop(0.35, mix(0x21407a, 0x6f9fd6, 0.5))   // azul medio
  g.addColorStop(0.52, '#bcd0e6')                       // bruma alta
  g.addColorStop(0.58, '#e6dcc4')                       // horizonte cálido
  g.addColorStop(0.62, '#9a8f7c')                       // borde del estadio
  g.addColorStop(1.00, '#1c1812')                       // suelo/sombra
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Nubes suaves dispersas en la franja superior
  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * W
    const y = Math.random() * H * 0.4
    const r = 30 + Math.random() * 90
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r)
    cg.addColorStop(0, 'rgba(255,255,255,0.8)')
    cg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = cg
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.mapping = THREE.EquirectangularReflectionMapping
  return tex
}

/**
 * Textura de público: base oscura con miles de motas de color (ropa + piel) en
 * filas, para poblar las gradas sin coste de geometría. Se tilea sobre planos
 * frente a las gradas.
 */
export function makeCrowdTexture(): THREE.CanvasTexture {
  const W = 512, H = 256
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#0c0e14'
  ctx.fillRect(0, 0, W, H)

  const shirts = [0xd94f4f, 0x4f7fd9, 0xe0c04f, 0x57b06a, 0xd9d9d9, 0x9a5fd0, 0xe09a4f, 0x404048]
  const skins = [0xe9c39a, 0xc99a6e, 0x9a6b45, 0xf0d2b0]
  const rows = 18
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (H / rows)
    for (let x = 4; x < W; x += 7 + Math.random() * 3) {
      // cuerpo (camiseta)
      ctx.fillStyle = '#' + shirts[(Math.random() * shirts.length) | 0].toString(16).padStart(6, '0')
      ctx.globalAlpha = 0.85
      ctx.fillRect(x, y - 2, 4 + Math.random() * 2, 6)
      // cabeza (piel)
      ctx.fillStyle = '#' + skins[(Math.random() * skins.length) | 0].toString(16).padStart(6, '0')
      ctx.fillRect(x + 1, y - 5, 3, 3)
    }
  }
  ctx.globalAlpha = 1

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * Textura de fieltro de la pelota: amarillo-verde con grano fino (pelusa) y la
 * costura blanca curva característica. Da volumen y realismo al material PBR.
 */
export function makeBallTexture(): THREE.CanvasTexture {
  const S = 256
  const [c, ctx] = canvas(S, S)
  ctx.fillStyle = '#c8d83c'
  ctx.fillRect(0, 0, S, S)

  // Pelusa: motas claras/oscuras
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S
    const l = Math.random()
    ctx.fillStyle = l > 0.5 ? 'rgba(225,236,150,0.5)' : 'rgba(150,165,40,0.5)'
    const r = 0.6 + Math.random() * 1.4
    ctx.fillRect(x, y, r, r)
  }

  // Costura: dos curvas blancas sinusoidales (aprox. de la línea del fieltro)
  ctx.strokeStyle = '#f4f6ee'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  for (const off of [0.28, 0.72]) {
    ctx.beginPath()
    for (let i = 0; i <= S; i += 4) {
      const x = i
      const y = off * S + Math.sin((i / S) * Math.PI * 2) * S * 0.16
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
