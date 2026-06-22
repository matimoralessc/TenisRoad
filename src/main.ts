import * as THREE from 'three'
import { createCourt } from './scene/court'
import { setupCamera } from './camera/setupCamera'
import { startGameLoop } from './engine/gameLoop'
import { Ball } from './entities/Ball'
import { Player } from './entities/Player'
import { AI } from './entities/AI'
import { Trail } from './scene/Trail'
import { BounceMarks } from './scene/BounceMarks'
import { PhysicsEngine } from './physics/PhysicsEngine'
import { BallMachine } from './test/BallMachine'
import { InputController } from './input/InputController'
import { ShotController } from './player/ShotController'
import { ShotTimingBar } from './ui/ShotTimingBar'
import { AIController } from './ai/BehaviorTree'
import { MatchStateManager } from './core/MatchStateManager'
import { PointJudge, type JudgeResult } from './core/PointJudge'
import { MatchHUD } from './ui/MatchHUD'
import { buildImpulse } from './player/shotMath'
import { SHOT_PROFILES } from './data/shotProfiles'
import { PLAYERS, shotAttrsFor, movementParamsFor, type PlayerAttributes } from './data/players'
import { BALL_RADIUS } from './physics/constants'
import { COURT, type Surface } from './data/courtDimensions'
import { AudioManager } from './audio/AudioManager'
import { makeSkyTexture } from './scene/textures'

// ── RENDERER ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
document.body.appendChild(renderer.domElement)

// ── ESCENA ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene()

// Cielo procedural como fondo + iluminación basada en imagen (IBL): el mapa de
// entorno prefiltrado (PMREM) da reflejo/ambiente realista a los materiales PBR.
const skyTex = makeSkyTexture()
scene.background = skyTex
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromEquirectangular(skyTex).texture
pmrem.dispose()

scene.fog = new THREE.Fog(0x9aa6b4, 55, 110)  // bruma del horizonte, profundidad

// ── ILUMINACIÓN ──────────────────────────────────────────────────────────────
// Gradiente cielo→suelo: elimina las zonas de sombra negras duras y asienta los
// objetos en el espacio (cielo azulado arriba, rebote cálido de arcilla abajo).
const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a2414, 0.4)
scene.add(hemi)

// Luz direccional principal (sol cálido del estadio): sombras nítidas y baratas.
const sun = new THREE.DirectionalLight(0xfff1d4, 1.85)
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

// Relleno frío tenue desde el otro lado (luz rebotada del estadio)
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.18)
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
const audio = new AudioManager()

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
      ball.applySpinVisual(dt)
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
  const marks = SURFACE === 'clay' ? new BounceMarks(scene) : null   // arcilla guarda marcas

  const aiController = new AIController(
    ai, ball, player, trail, OPP, SURFACE,
    () => {                          // la IA golpeó válidamente
      judge.notifyHit('ai')
      audio.hit()
    },
  )

  const shot = new ShotController(
    ball, player, trail, input, shotAttrsFor(HUMAN), setLabel,
    () => {                          // el jugador golpeó: la IA anticipa
      judge.notifyHit('player')
      aiController.onPlayerStrike()
      audio.hit()
    },
  )

  const POINT_COOLDOWN = 1.2   // s de pausa para leer el anuncio del punto
  let cooldown = 0
  let serveNum: 1 | 2 = 1      // primer o segundo saque del punto

  const restBall = () => ball.reset(0, BALL_RADIUS, 0)

  const resetPositions = () => {
    player.resetTo(0, COURT.halfLength)
    ai.resetTo(0, -COURT.halfLength)
    restBall()
    serveNum = 1
  }

  const servePower = (attr: PlayerAttributes) =>
    Math.max(0.7, Math.min(0.95, 0.8 * attr.flatDepth))

  const serverWho = (): 'player' | 'ai' => (match.servingIndex === 0 ? 'player' : 'ai')

  const serve = () => {
    const srv = match.servingIndex          // 0 = jugador (sur), 1 = IA (norte)
    const sgn = match.servingSide === 'deuce' ? 1 : -1
    const side = match.servingSide
    const powScale = serveNum === 2 ? 0.82 : 1.0   // 2º saque: más seguro

    if (srv === 0) {
      ball.reset(sgn * 1.0, 1.0, COURT.halfLength - 0.2)
      ball.applyImpulse(
        buildImpulse(ball.state.position, -sgn * 2.5, -4, SHOT_PROFILES.topspin, servePower(HUMAN) * powScale, 1.0),
      )
      player.swing()
      audio.hit(1.1)
      judge.beginServe('player', side)      // valida contra el cuadro diagonal
      aiController.onPlayerStrike()          // la IA reacciona al saque
    } else {
      ball.reset(-sgn * 1.0, 1.0, -COURT.halfLength + 0.2)
      ball.applyImpulse(
        buildImpulse(ball.state.position, sgn * 2.5, 4, SHOT_PROFILES.topspin, servePower(OPP) * powScale, 1.0),
      )
      ai.swing()
      audio.hit(1.1)
      judge.beginServe('ai', side)
      aiController.reset()                   // la IA acaba de sacar: espera devolución
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

  /** Vuelve a dejar el saque listo tras falta/let, sin tocar el marcador. */
  const awaitReserve = (label: string) => {
    setLabel(label)
    restBall()
    trail.clear()
    aiController.reset()
    match.returnToServe()
  }

  const handleJudge = (r: JudgeResult) => {
    if (r.kind === 'point') {
      handlePoint(r.winner, r.reason)
    } else if (r.kind === 'let') {
      awaitReserve('LET — repite saque')     // el cordón rozado no cuenta como falta
    } else if (serveNum === 1) {
      serveNum = 2
      awaitReserve('FALTA — 2º saque')
    } else {
      handlePoint(serverWho() === 'player' ? 'ai' : 'player', 'Double Fault')
    }
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
          ball.applySpinVisual(dt)
          for (const e of events) {
            if (e.type === 'bounce') {
              marks?.add(e.position.x, e.position.z)
              audio.bounce(e.incomingSpeed / 20)
            }
          }
          trail.push(ball.state.position)
          const result = judge.process(events)
          if (result) handleJudge(result)
          break
        }

        case 'POINT_SCORED':
          cooldown -= dt
          if (cooldown <= 0) match.nextPoint()
          break
      }

      marks?.update(dt)   // desvanece las marcas de arcilla
    },
    render(alpha) {
      ball.syncMesh(alpha)
      player.syncMesh(alpha)
      ai.syncMesh(alpha)

      // Cámara broadcast: paneo horizontal suave siguiendo la acción,
      // manteniendo el encuadre alto/retrasado que deja ver la baseline sur y su
      // run-back (anclaje idéntico al de setupCamera para no romper el cuadro).
      const camTargetX = Math.max(-3, Math.min(3, ball.state.position.x * 0.35))
      camera.position.x += (camTargetX - camera.position.x) * 0.05
      camera.lookAt(ball.state.position.x * 0.2, 0.4, 7.0)

      timingBar.render(player, camera, shot.getView(), alpha)
      hud.update(match.snapshot())
      renderer.render(scene, camera)
    },
  })
}
