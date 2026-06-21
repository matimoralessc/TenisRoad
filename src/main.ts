import * as THREE from 'three'
import { createCourt } from './scene/court'
import { setupCamera } from './camera/setupCamera'
import { startGameLoop } from './engine/gameLoop'
import { Ball } from './entities/Ball'
import { Trail } from './scene/Trail'
import { PhysicsEngine } from './physics/PhysicsEngine'
import { BallMachine } from './test/BallMachine'
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

// ── FÍSICA + ENTIDADES + BANCO DE PRUEBAS (Fase 2) ────────────────────────────
const ball = new Ball(scene)
const trail = new Trail(scene)
const engine = new PhysicsEngine()

const shotLabel = document.getElementById('shot-name')
const machine = new BallMachine(ball, trail, (profile) => {
  if (shotLabel) shotLabel.textContent = profile.name
})

// ── GAME LOOP (timestep fijo 120 Hz + interpolación alpha) ────────────────────
startGameLoop({
  update(dt) {
    machine.update(dt)          // dispara un perfil cada 4 s
    ball.cachePrevious()        // guarda prev para interpolar el render
    engine.step(ball.state, dt, SURFACE)
    trail.push(ball.state.position)
  },
  render(alpha) {
    ball.syncMesh(alpha)        // lerp(prev, curr, alpha) → sin jitter
    renderer.render(scene, camera)
  },
})
