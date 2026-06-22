import * as THREE from 'three'
import { Ball } from '../entities/Ball'
import { AI } from '../entities/AI'
import { Player } from '../entities/Player'
import { Trail } from '../scene/Trail'
import { PhysicsEngine } from '../physics/PhysicsEngine'
import { AIController } from '../ai/BehaviorTree'
import { buildImpulse } from '../player/shotMath'
import { SHOT_PROFILES } from '../data/shotProfiles'
import { PLAYERS, movementParamsFor } from '../data/players'
import { COURT, type Surface } from '../data/courtDimensions'

/**
 * Regresión de la devolución de la IA (Fase 4/8). Replica un saque real del
 * jugador y un groundstroke profundo, y comprueba que la IA llega a golpear
 * (onStrike). El bug que cubre: la IA corría hacia el bote corto del saque y lo
 * dejaba pasar; ahora predice el punto de CONTACTO profundo y lo intercepta.
 */
const SURFACE: Surface = 'clay'
const DT = 1 / 120
const HUMAN = PLAYERS.alcaraz
const OPP = PLAYERS.djokovic

function makeRig(): { ball: Ball; ai: AI; aiCtl: AIController; engine: PhysicsEngine; returned: () => boolean } {
  const scene = new THREE.Scene()
  const ball = new Ball(scene)
  const trail = new Trail(scene)
  const engine = new PhysicsEngine()
  const player = new Player(scene, movementParamsFor(HUMAN, 'south'))
  const ai = new AI(scene, movementParamsFor(OPP, 'north'))
  let hit = false
  const aiCtl = new AIController(ai, ball, player, trail, OPP, SURFACE, () => { hit = true })
  return { ball, ai, aiCtl, engine, returned: () => hit }
}

function play(rig: ReturnType<typeof makeRig>): boolean {
  for (let i = 0; i < 600 && !rig.returned(); i++) {
    rig.ai.cachePrevious()
    rig.aiCtl.update(DT)
    rig.ball.cachePrevious()
    rig.engine.step(rig.ball.state, DT, SURFACE)
    if (rig.ball.state.position.z < -COURT.halfLength - 3) break
  }
  return rig.returned()
}

function serveReturned(side: 'deuce' | 'ad'): boolean {
  const rig = makeRig()
  rig.ai.resetTo(0, -COURT.halfLength)
  const sgn = side === 'deuce' ? 1 : -1
  const power = Math.max(0.7, Math.min(0.95, 0.8 * HUMAN.flatDepth))
  rig.ball.reset(sgn * 1.0, 1.0, COURT.halfLength - 0.2)
  rig.ball.applyImpulse(
    buildImpulse(rig.ball.state.position, -sgn * 2.5, -4, SHOT_PROFILES.topspin, power, 1.0),
  )
  rig.aiCtl.onPlayerStrike()
  return play(rig)
}

function groundstrokeReturned(): boolean {
  const rig = makeRig()
  rig.ai.resetTo(0, -COURT.halfLength + 0.6)
  rig.ball.reset(1, 1.0, COURT.halfLength - 1)
  rig.ball.applyImpulse(buildImpulse(rig.ball.state.position, -2, -8, SHOT_PROFILES.topspin, 0.9, 1.25))
  rig.aiCtl.onPlayerStrike()
  return play(rig)
}

const results = {
  serveDeuce: serveReturned('deuce'),
  serveAd: serveReturned('ad'),
  groundstroke: groundstrokeReturned(),
}

let ok = true
for (const [name, pass] of Object.entries(results)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`)
  if (!pass) ok = false
}
console.log(ok ? '\nAll AI returns OK' : '\nFAILURES present')
if (!ok) process.exit(1)
