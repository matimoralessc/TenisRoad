import * as THREE from 'three'
import { createCourt } from './scene/court'
import { setupCamera } from './camera/setupCamera'
import { startGameLoop } from './engine/gameLoop'
import { Ball } from './entities/Ball'
import { Player } from './entities/Player'
import { AI } from './entities/AI'
import { Trail } from './scene/Trail'
import { PhysicsEngine } from './physics/PhysicsEngine'
import { BallMachine } from './test/BallMachine'
import { InputController } from './input/InputController'
import { ShotController } from './player/ShotController'
import { ShotTimingBar } from './ui/ShotTimingBar'
import { AIController } from './ai/BehaviorTree'
import { MatchStateManager } from './core/MatchStateManager'
import { PointJudge } from './core/PointJudge'
import { MatchHUD } from './ui/MatchHUD'
import { buildImpulse } from './player/shotMath'
import { SHOT_PROFILES } from './data/shotProfiles'
import { PLAYERS, shotAttrsFor, movementParamsFor, type PlayerAttributes } from './data/players'
import { BALL_RADIUS } from './physics/constants'
import { COURT, type Surface } from './data/courtDimensions'

// ── RENDERER ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setClearColor(0x111111)
document.body.appendChild(renderer.domElement)

// ── ESCENA ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x111111, 40, 80)  // niebla sutil para profundidad

// ── ILUMINACIÓN ──────────────────────────────────────────────────────────────
// Luz ambiental suave (simula el cielo difuso)
const ambient = new THREE.AmbientLight(0xffffff, 0.55)
scene.add(ambient)

// Luz direccional principal (sol/estadio)
const sun = new THREE.DirectionalLight(0xfff8e7, 1.2)
sun.position.set(6, 18, 10)
sun.castShadow = true
sun.shadow.mapSize.width  = 2048
sun.shadow.mapSize.height = 2048
sun.shadow.camera.near = 1
sun.shadow.camera.far  = 60
sun.shadow.camera.left   = -16
sun.shadow.camera.right  =  16
sun.shadow.camera.top    =  30
sun.shadow.camera.bottom = -30
sun.shadow.bias = -0.0005
scene.add(sun)

// Relleno suave desde el otro lado (simula luz rebotada en el estadio)
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.30)
fill.position.set(-4, 8, -8)
scene.add(fill)

// ── CÁMARA ───────────────────────────────────────────────────────────────────
const camera = setupCamera(renderer)

// ── CANCHA ───────────────────────────────────────────────────────────────────
const SURFACE: Surface = 'clay'
createCourt(scene, SURFACE)

// ── MODO ──────────────────────────────────────────────────────────────────────
// PRACTICE_MODE = true  → banco de práctica (feeder de Fase 3, sin IA ni reglas)
// PRACTICE_MODE = false → partido completo vs IA con reglas y marcador ATP
const PRACTICE_MODE = false

// Perfiles ATP: humano (sur) vs IA (norte)
const HUMAN: PlayerAttributes = PLAYERS.alcaraz
const OPP: PlayerAttributes = PLAYERS.djokovic

// ── FÍSICA + ENTIDADES ────────────────────────────────────────────────────────
const ball = new Ball(scene)
const trail = new Trail(scene)
const engine = new PhysicsEngine()

const player = new Player(scene, movementParamsFor(HUMAN, 'south'))
const input = new InputController()
const timingBar = new ShotTimingBar()

const shotLabel = document.getElementById('shot-name')
const setLabel = (text: string) => { if (shotLabel) shotLabel.textContent = text }

if (PRACTICE_MODE) {
  startPracticeMode()
} else {
  startMatchMode()
}

// ── MODO PRÁCTICA (Fase 3) ────────────────────────────────────────────────────
function startPracticeMode(): void {
  const shot = new ShotController(
    ball, player, trail, input, shotAttrsFor(HUMAN), setLabel,
  )
  const machine = new BallMachine(ball, trail, (p) => setLabel(`Feed: ${p.name}`))

  startGameLoop({
    update(dt) {
      const dir = input.movementVector()
      player.cachePrevious()
      player.step(dir, dt)
      shot.update(dt)
      machine.update(dt)
      ball.cachePrevious()
      engine.step(ball.state, dt, SURFACE)
      trail.push(ball.state.position)
    },
    render(alpha) {
      ball.syncMesh(alpha)
      player.syncMesh(alpha)
      timingBar.render(player, camera, shot.getView(), alpha)
      renderer.render(scene, camera)
    },
  })
}

// ── MODO PARTIDO (Fase 4) ─────────────────────────────────────────────────────
function startMatchMode(): void {
  const ai = new AI(scene, movementParamsFor(OPP, 'north'))
  const match = new MatchStateManager([HUMAN.name, OPP.name])
  const judge = new PointJudge()
  const hud = new MatchHUD()

  const aiController = new AIController(
    ai, ball, player, trail, OPP, SURFACE,
    () => judge.notifyHit('ai'),     // la IA golpeó válidamente
  )

  const shot = new ShotController(
    ball, player, trail, input, shotAttrsFor(HUMAN), setLabel,
    () => {                          // el jugador golpeó: la IA anticipa
      judge.notifyHit('player')
      aiController.onPlayerStrike()
    },
  )

  const POINT_COOLDOWN = 1.2   // s de pausa para leer el anuncio del punto
  let cooldown = 0

  const restBall = () => ball.reset(0, BALL_RADIUS, 0)

  const resetPositions = () => {
    player.resetTo(0, COURT.halfLength)
    ai.resetTo(0, -COURT.halfLength)
    restBall()
  }

  const servePower = (attr: PlayerAttributes) =>
    Math.max(0.7, Math.min(0.95, 0.8 * attr.flatDepth))

  const serve = () => {
    const srv = match.servingIndex          // 0 = jugador (sur), 1 = IA (norte)
    const sgn = match.servingSide === 'deuce' ? 1 : -1

    if (srv === 0) {
      ball.reset(sgn * 1.0, 1.0, COURT.halfLength - 0.2)
      ball.applyImpulse(
        buildImpulse(ball.state.position, -sgn * 2.5, -4, SHOT_PROFILES.topspin, servePower(HUMAN), 1.0),
      )
      judge.notifyHit('player')
      aiController.onPlayerStrike()         // la IA reacciona al saque
    } else {
      ball.reset(-sgn * 1.0, 1.0, -COURT.halfLength + 0.2)
      ball.applyImpulse(
        buildImpulse(ball.state.position, sgn * 2.5, 4, SHOT_PROFILES.topspin, servePower(OPP), 1.0),
      )
      judge.notifyHit('ai')
      aiController.reset()                  // la IA acaba de sacar: espera devolución
    }
    trail.clear()
    match.serveStarted()
  }

  const handlePoint = (winner: 'player' | 'ai', reason: string) => {
    match.awardPoint(winner === 'player' ? 0 : 1, reason)
    resetPositions()
    judge.reset()
    aiController.reset()
    cooldown = POINT_COOLDOWN
  }

  // Arranque: posiciones y primer saque listo
  resetPositions()
  match.beginMatch()

  startGameLoop({
    update(dt) {
      const dir = input.movementVector()
      player.cachePrevious()
      player.step(dir, dt)
      ai.cachePrevious()
      aiController.update(dt)               // mueve la IA (recupera/anticipa/golpea)

      ball.cachePrevious()

      switch (match.state) {
        case 'SERVICE_READY':
          if (input.pollServe()) serve()
          break

        case 'IN_PLAY': {
          shot.update(dt)                   // golpe humano (puede impactar)
          const events = engine.step(ball.state, dt, SURFACE)
          trail.push(ball.state.position)
          const outcome = judge.process(events)
          if (outcome) handlePoint(outcome.winner, outcome.reason)
          break
        }

        case 'POINT_SCORED':
          cooldown -= dt
          if (cooldown <= 0) match.nextPoint()
          break
      }
    },
    render(alpha) {
      ball.syncMesh(alpha)
      player.syncMesh(alpha)
      ai.syncMesh(alpha)
      timingBar.render(player, camera, shot.getView(), alpha)
      hud.update(match.snapshot())
      renderer.render(scene, camera)
    },
  })
}
