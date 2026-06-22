import * as THREE from 'three'
import { NET, SURFACES, netCordHeight, type Surface } from '../data/courtDimensions'
import type { BallState, PhysicsEvent, BounceEvent, NetEvent } from './types'
import {
  G, K_DRAG, C_MAGNUS, BALL_MASS, BALL_RADIUS, INERTIA,
  STICK_FACTOR, SPIN_DECAY, NET_RESTITUTION, TOPSPIN_KICK,
  WIND_X, WIND_Y, WIND_Z,
} from './constants'

// Vectores de trabajo reutilizados (cero asignaciones por tick).
const _acc = new THREE.Vector3()
const _drag = new THREE.Vector3()
const _magnus = new THREE.Vector3()
const _prev = new THREE.Vector3()
const _vrel = new THREE.Vector3()
const _wind = new THREE.Vector3(WIND_X, WIND_Y, WIND_Z)

/**
 * Motor determinista de balística + colisiones.
 * Una llamada a step() = un tick de física a dt fijo (1/120 s).
 */
export class PhysicsEngine {
  /** Integra un tick y resuelve colisiones; devuelve los eventos ocurridos. */
  step(state: BallState, dt: number, surface: Surface): PhysicsEvent[] {
    const events: PhysicsEvent[] = []
    const { position, velocity, angularVelocity } = state

    _prev.copy(position)

    // ── Acumulador de fuerzas → aceleración ─────────────────────────────────
    // a = g + a_drag(v_rel) + (C_m/m)(ω × v_rel),  con v_rel = v − viento
    _acc.set(0, -G, 0)

    _vrel.copy(velocity).sub(_wind)
    const airSpeed = _vrel.length()
    if (airSpeed > 1e-6) {
      _drag.copy(_vrel).multiplyScalar(-K_DRAG * airSpeed)
      _acc.add(_drag)
    }

    _magnus.copy(angularVelocity).cross(_vrel).multiplyScalar(C_MAGNUS / BALL_MASS)
    _acc.add(_magnus)

    // ── Euler semi-implícito (simpléctico) ──────────────────────────────────
    velocity.addScaledVector(_acc, dt)
    position.addScaledVector(velocity, dt)

    // Decaimiento de spin por aire
    angularVelocity.multiplyScalar(1 - SPIN_DECAY * dt)

    // ── Colisión con la red (plano z = 0) ───────────────────────────────────
    const net = this.checkNet(_prev, position, velocity)
    if (net) events.push(net)

    // ── Colisión con la superficie (plano y = r) ────────────────────────────
    if (position.y <= BALL_RADIUS && velocity.y < 0) {
      events.push(this.resolveGround(_prev, state, surface, dt))
    }

    return events
  }

  /** Evalúa el cruce del plano de la red usando la altura dinámica del cordón. */
  private checkNet(
    prev: THREE.Vector3,
    curr: THREE.Vector3,
    vel: THREE.Vector3,
  ): NetEvent | null {
    const crossed =
      (prev.z < 0 && curr.z >= 0) || (prev.z > 0 && curr.z <= 0)
    if (!crossed) return null

    // Interpolación lineal al plano z = 0
    const t = prev.z / (prev.z - curr.z)
    const xc = prev.x + t * (curr.x - prev.x)
    const yc = prev.y + t * (curr.y - prev.y)

    // Fuera de los postes → pasa ancho, sin interacción con la red
    if (Math.abs(xc) > NET.postOffset) return null

    const cord = netCordHeight(xc)
    const pos = new THREE.Vector3(xc, yc, 0)

    if (yc >= cord) {
      // Pasa por encima; marca net-cord si roza dentro de un radio
      if (yc - cord < BALL_RADIUS) {
        vel.multiplyScalar(0.6)
        vel.y -= 1.0
        return { type: 'net', position: pos, passed: true, clip: true }
      }
      return { type: 'net', position: pos, passed: true, clip: false }
    }

    // Golpea la malla por debajo del cordón → caída muerta
    vel.z *= -NET_RESTITUTION
    vel.x *= 0.3
    vel.y *= 0.3
    curr.set(xc, yc, 0)
    return { type: 'net', position: pos, passed: false, clip: false }
  }

  /**
   * Rebote con root-finding sub-tick (anti-tunneling) y modelo de fricción
   * Coulomb agarre-vs-patinaje con intercambio spin↔velocidad.
   */
  private resolveGround(
    prev: THREE.Vector3,
    state: BallState,
    surface: Surface,
    dt: number,
  ): BounceEvent {
    const { position, velocity, angularVelocity } = state
    const cfg = SURFACES[surface]

    // Tiempo exacto de impacto dentro del tick: y cruza y = r
    const denom = prev.y - position.y
    const tStar = denom > 1e-9
      ? Math.min(Math.max((prev.y - BALL_RADIUS) / denom, 0), 1)
      : 0
    const cx = prev.x + (position.x - prev.x) * tStar
    const cz = prev.z + (position.z - prev.z) * tStar

    const incomingSpeed = velocity.length()
    const vyIn = velocity.y
    const omegaXin = angularVelocity.x   // capturado antes de modificar ω
    const e = cfg.restitution

    // ── Velocidad tangencial del punto de contacto (fondo de la bola) ───────
    // u_x = v_x + r·ω_z ;  u_z = v_z − r·ω_x
    const ux = velocity.x + BALL_RADIUS * angularVelocity.z
    const uz = velocity.z - BALL_RADIUS * angularVelocity.x
    const uMag = Math.hypot(ux, uz)

    // ── Impulsos: normal y fricción de Coulomb ──────────────────────────────
    const Jn = BALL_MASS * (1 + e) * Math.abs(vyIn)
    let grip = false

    if (uMag > 1e-6) {
      const Jstick = STICK_FACTOR * BALL_MASS * uMag
      grip = Jstick <= cfg.friction * Jn
      const Jt = Math.min(Jstick, cfg.friction * Jn)

      const tx = ux / uMag
      const tz = uz / uMag

      // v_t⁺ = v_t − (Jt/m)·t̂
      velocity.x -= (Jt / BALL_MASS) * tx
      velocity.z -= (Jt / BALL_MASS) * tz

      // ω⁺ = ω + (Jt·r/I)·(ŷ × t̂),  con ŷ × t̂ = (tz, 0, −tx)
      const coef = (Jt * BALL_RADIUS) / INERTIA
      angularVelocity.x += coef * tz
      angularVelocity.z += coef * (-tx)

      // La superficie retiene/amplifica el spin resultante (clay agarra, grass patina)
      angularVelocity.multiplyScalar(cfg.spinMultiplier)
    }

    // ── Restitución normal + kick vertical por topspin agarrado ─────────────
    velocity.y = -e * vyIn
    if (grip && omegaXin > 0) {
      velocity.y += omegaXin * BALL_RADIUS * cfg.spinMultiplier * TOPSPIN_KICK
    }

    // Reposiciona en la superficie y avanza el sub-tick restante
    position.set(cx, BALL_RADIUS, cz)
    position.addScaledVector(velocity, (1 - tStar) * dt)

    return {
      type: 'bounce',
      position: new THREE.Vector3(cx, BALL_RADIUS, cz),
      incomingSpeed,
      grip,
    }
  }
}
