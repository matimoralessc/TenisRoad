import * as THREE from 'three'
import { createCourt } from './scene/court'
import { setupCamera } from './camera/setupCamera'
import { startGameLoop } from './engine/gameLoop'
import { Ball } from './entities/Ball'
import { Player } from './entities/Player'
import { Trail } from './scene/Trail'
import { PhysicsEngine } from './physics/PhysicsEngine'
import { BallMachine } from './test/BallMachine'
import { InputController } from './input/InputController'
import { ShotController } from './player/ShotController'
import { ShotTimingBar } from './ui/ShotTimingBar'
import type { Surface } from './data/courtDimensions'

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

// ── FÍSICA + ENTIDADES (Fase 2) ───────────────────────────────────────────────
const ball = new Ball(scene)
const trail = new Trail(scene)
const engine = new PhysicsEngine()

// ── JUGADOR + INPUT + GOLPE + UI (Fase 3) ─────────────────────────────────────
const player = new Player(scene)
const input = new InputController()
const timingBar = new ShotTimingBar()

const shotLabel = document.getElementById('shot-name')
const setLabel = (text: string) => { if (shotLabel) shotLabel.textContent = text }

const shot = new ShotController(ball, player, trail, input, setLabel)

// Alimentador infinito: cicla cuadrantes para forzar el desplazamiento
const machine = new BallMachine(ball, trail, (profile) => setLabel(`Feed: ${profile.name}`))

// ── GAME LOOP (timestep fijo 120 Hz + interpolación alpha) ────────────────────
startGameLoop({
  update(dt) {
    const dir = input.movementVector()
    player.cachePrevious()      // prev del jugador para interpolar
    player.step(dir, dt)        // física inercial (accel/fricción/límites)

    shot.update(dt)             // máquina de estados del golpe (puede impactar)
    machine.update(dt)          // alimenta un cuadrante cada 3.5 s

    ball.cachePrevious()        // prev de la pelota para interpolar
    engine.step(ball.state, dt, SURFACE)
    trail.push(ball.state.position)
  },
  render(alpha) {
    ball.syncMesh(alpha)        // lerp(prev, curr, alpha) → sin jitter
    player.syncMesh(alpha)
    timingBar.render(player, camera, shot.getView(), alpha)
    renderer.render(scene, camera)
  },
})
