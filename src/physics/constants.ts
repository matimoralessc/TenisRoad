/**
 * Constantes físicas para la balística de la pelota de tenis.
 * Todas en unidades SI (metros, kilogramos, segundos, radianes).
 */

// ── Fundamentales ─────────────────────────────────────────────────────────────
export const G = 9.81                 // gravedad (m/s²)
export const RHO = 1.21               // densidad del aire a nivel del mar (kg/m³)
export const BALL_MASS = 0.057        // masa ITF (kg)
export const BALL_RADIUS = 0.033      // radio (m)
export const CROSS_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS // área transversal (m²)

// ── Coeficientes aerodinámicos ────────────────────────────────────────────────
export const CD = 0.55                // coeficiente de arrastre
export const CL_PRIME = 1.0           // pendiente de sustentación (régimen lineal, tunable en vivo)

// ── Derivados ─────────────────────────────────────────────────────────────────
/** Coeficiente de arrastre como aceleración: a_d = -K_DRAG·|v|·v  (m⁻¹) */
export const K_DRAG = (RHO * CD * CROSS_AREA) / (2 * BALL_MASS)

/** Coeficiente de Magnus: F_m = C_MAGNUS·(ω × v).  C_m = ½·ρ·A·C_l'·r */
export const C_MAGNUS = 0.5 * RHO * CROSS_AREA * CL_PRIME * BALL_RADIUS

/** Inercia de cascarón hueco: I = (2/3)·m·r² */
export const INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS * BALL_RADIUS

// ── Modelo de rebote / aire ───────────────────────────────────────────────────
/** Factor de impulso tangencial de agarre: β/(1+β) con β = 2/3 → 2/5 */
export const STICK_FACTOR = 2 / 5

/** Decaimiento de spin por fricción del aire (s⁻¹, aproximado) */
export const SPIN_DECAY = 0.05

/** Restitución de la red en una falla (caída muerta) */
export const NET_RESTITUTION = 0.15

/** Empuje vertical extra al botar con topspin agarrado (kick "pesado") */
export const TOPSPIN_KICK = 0.2

// ── Jugador (Fase 3) ──────────────────────────────────────────────────────────
/** Aceleración del jugador cuando hay input de dirección (m/s²) */
export const PLAYER_ACCEL = 30
/** Velocidad máxima de desplazamiento (m/s) */
export const PLAYER_MAX_SPEED = 6.5
/**
 * Fracción de velocidad retenida tras 1 s sin input: v *= FRICTION^dt.
 * 0.05 → derrape con vida media ≈ 0.23 s (peso/inercia realistas).
 */
export const PLAYER_FRICTION = 0.05
/** Radio de golpeo: la pelota debe estar a < 1.5 m para conectar (m) */
export const STRIKE_RADIUS = 1.5
/** Altura del punto de contacto del golpe (m) */
export const STRIKE_HEIGHT = 0.9

// ── Límites de cancha jugables del jugador sur (m) ────────────────────────────
/** No puede cruzar el plano de la red (deja un colchón) */
export const PLAYER_Z_MIN = 0.8
/** No puede correr más profundo que esto (fuera del encuadre de cámara) */
export const PLAYER_Z_MAX = 14.5
/** Margen lateral fuera de la línea de dobles para correr */
export const PLAYER_X_LIMIT = 7.0
