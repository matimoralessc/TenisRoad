/**
 * Dimensiones oficiales ITF (metros)
 * Sistema de coordenadas: Y = arriba, Z = largo de la cancha, X = ancho
 * El centro de la cancha (intersección red/centro) = origen (0, 0, 0)
 */

export const COURT = {
  // Largo total: 23.77m → mitad por lado
  halfLength: 11.885,   // m desde el centro hasta la línea de fondo

  // Anchos
  singlesHalfWidth: 4.115,   // 8.23 / 2
  doublesHalfWidth: 5.485,   // 10.97 / 2

  // Línea de saque: 6.40m desde la red
  serviceLineZ: 6.40,

  // Línea central de saque (divide los cuadros de servicio)
  // va de z=0 (red) a z=±6.40
} as const

export const NET = {
  height_center: 0.914,  // m en el centro
  height_post:   1.07,   // m en los postes
  thickness:     0.05,
  // ITF: los postes van 0.914m (3 ft) POR FUERA de la línea de dobles.
  // doublesHalfWidth (5.485) + 0.914 = 6.399m
  postOffset:    6.399,
} as const

/** Mitad del largo del cordón de la red (de poste a poste / 2) */
export const NET_HALF_LENGTH = NET.postOffset  // 6.399m

export const BALL = {
  radius:   0.033,  // radio pelota de tenis ~6.7cm diámetro
  diameter: 0.066,
} as const

/**
 * Altura del cordón de la red en función de X (curvatura/sag real).
 * 1.07m en los postes → 0.914m en el centro. Aproximación parabólica.
 */
export function netCordHeight(x: number): number {
  const t = Math.min(Math.abs(x) / NET.postOffset, 1)
  return NET.height_center + (NET.height_post - NET.height_center) * t * t
}

/** Superficies disponibles y sus propiedades físicas */
export type Surface = 'clay' | 'grass' | 'hard'

export const SURFACES: Record<Surface, {
  name: string
  color: number          // color hex para Three.js
  lineColor: number
  restitution: number    // coeficiente de rebote (0-1)
  friction: number       // fricción (reduce velocidad en rebote)
  spinMultiplier: number // amplificación de efecto de spin
}> = {
  clay: {
    name: 'Polvo de Ladrillo',
    color: 0xB85C2A,
    lineColor: 0xF0E8D0,
    restitution: 0.72,
    friction: 0.82,
    spinMultiplier: 1.4,
  },
  grass: {
    name: 'Césped',
    color: 0x2D6A2D,
    lineColor: 0xFFFFFF,
    restitution: 0.60,
    friction: 0.45,
    spinMultiplier: 0.7,
  },
  hard: {
    name: 'Pista Dura',
    color: 0x2255AA,
    lineColor: 0xFFFFFF,
    restitution: 0.78,
    friction: 0.65,
    spinMultiplier: 1.0,
  },
}
