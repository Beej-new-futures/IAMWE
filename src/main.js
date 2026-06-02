import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'

// ─── SCENE SETUP ────────────────────────────────────────────────────────────
const canvas = document.getElementById('three-canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setClearColor(0xffffff, 1)
renderer.sortObjects = true

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0xffffff, 0.018)

const pmremGenerator = new THREE.PMREMGenerator(renderer)
pmremGenerator.compileEquirectangularShader()

new RGBELoader().load('/models/HDRI_STUDIO_vol2_004.hdr', (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture
  scene.environment = envMap
  texture.dispose()
  pmremGenerator.dispose()
})

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200)
camera.position.set(0, 0, 22)

// ─── LIGHTING ────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)

const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.5)
keyLight.position.set(-8, 12, 8)
keyLight.castShadow = true
keyLight.shadow.mapSize.width = 2048
keyLight.shadow.mapSize.height = 2048
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0xe8f0ff, 1.2)
fillLight.position.set(10, 4, 6)
scene.add(fillLight)

const rimLight = new THREE.DirectionalLight(0xffffff, 1.8)
rimLight.position.set(0, -6, -12)
scene.add(rimLight)

const bounceLight = new THREE.DirectionalLight(0xfff8ee, 0.4)
bounceLight.position.set(0, -10, 4)
scene.add(bounceLight)

const studioPoints = [
  { color: 0xffffff, pos: [-12, 8, 6],  intensity: 1.2, distance: 40 },
  { color: 0xfff5e6, pos: [12, 8, 6],   intensity: 1.2, distance: 40 },
  { color: 0xe8f0ff, pos: [0, -8, 10],  intensity: 0.8, distance: 30 },
]
studioPoints.forEach(l => {
  const pl = new THREE.PointLight(l.color, l.intensity, l.distance)
  pl.position.set(...l.pos)
  scene.add(pl)
})

// ─── MATERIALS ───────────────────────────────────────────────────────────────
function makeMetalMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.95, roughness: 0.05, envMapIntensity: 1.0,
  })
}

function makeGlassMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.1, roughness: 0.0, transparent: true, opacity: 0.55,
  })
}

// ─── IRIDESCENT SHADER ───────────────────────────────────────────────────────
const blobMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime:      { value: 0 },
    uHueOffset: { value: 0 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPos;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uHueOffset;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPos;
    vec3 hsl2rgb(vec3 c) {
      vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
      return c.z+c.y*(rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
    }
    void main() {
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
      float gradientPos = vWorldPos.y*0.08 + vWorldPos.x*0.05 + uTime*0.12;
      float hue = mix(0.88, 0.62, sin(gradientPos)*0.5+0.5);
      hue += fresnel * 0.25;
      hue += uHueOffset;
      hue = mod(hue, 1.0);
      float lightness = mix(0.45, 0.72, fresnel);
      float saturation = mix(0.7, 1.0, fresnel);
      vec3 col = hsl2rgb(vec3(hue, saturation, lightness));
      vec3 halfVec = normalize(vViewDir + normalize(vec3(1.0,2.0,1.0)));
      float spec = pow(max(dot(vNormal,halfVec),0.0),32.0)*0.6;
      col += vec3(spec);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.DoubleSide,
})

// ─── NEON YELLOW PERSPEX ─────────────────────────────────────────────────────
const neonPerspex = new THREE.MeshStandardMaterial({
  color: 0xffff00, emissive: 0xdddd00, emissiveIntensity: 0.5,
  metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.72,
  side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5,
})

const darkRod = new THREE.MeshStandardMaterial({
  color: 0x111111, metalness: 0.9, roughness: 0.1, envMapIntensity: 1.2,
})

// ─── TILT / GRAVITY ──────────────────────────────────────────────────────────
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
let tiltX = 0  // gravity nudge X per frame
let tiltY = 0  // gravity nudge Y per frame
let tiltEnabled = false

// Smooth tilt values to avoid jitter
let rawTiltX = 0
let rawTiltY = 0

function applyDeviceMotion(e) {
  // acceleration includes gravity — gives natural tilt feel
  const acc = e.accelerationIncludingGravity
  if (!acc) return
  // Smooth with lerp
  rawTiltX += ((acc.x || 0) - rawTiltX) * 0.15
  rawTiltY += ((acc.y || 0) - rawTiltY) * 0.15
  // Scale down to gentle nudge
  tiltX =  rawTiltX * 0.00015
  tiltY = -rawTiltY * 0.00015
}

function enableTilt() {
  if (tiltEnabled) return
  // iOS 13+ requires explicit permission
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(state => {
        if (state === 'granted') {
          window.addEventListener('devicemotion', applyDeviceMotion)
          tiltEnabled = true
          hideTiltHint()
        }
      })
      .catch(console.error)
  } else {
    // Android / older iOS — no permission needed
    window.addEventListener('devicemotion', applyDeviceMotion)
    tiltEnabled = true
    hideTiltHint()
  }
}

// ─── TILT HINT UI ────────────────────────────────────────────────────────────
function createTiltHint() {
  if (!isMobile) return
  const hint = document.createElement('div')
  hint.id = 'tilt-hint'
  hint.textContent = 'Tap to enable tilt'
  hint.style.cssText = `
    position: fixed;
    bottom: 4rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    color: rgba(0,0,0,0.35);
    font-size: 0.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    pointer-events: none;
    animation: fade-hint 3s ease-in-out infinite;
  `
  document.body.appendChild(hint)
  // Trigger on first touch anywhere
  document.addEventListener('touchstart', () => enableTilt(), { once: true })
}

function hideTiltHint() {
  const hint = document.getElementById('tilt-hint')
  if (hint) {
    hint.style.transition = 'opacity 0.6s'
    hint.style.opacity = '0'
    setTimeout(() => hint.remove(), 700)
  }
}

createTiltHint()

// ─── PHYSICS HELPERS ─────────────────────────────────────────────────────────
const DAMPING = 0.998
let BOUNDARY_X = 13
let BOUNDARY_Y = 13

function updateBoundaries() {
  const camZ = 22
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camZ
  const halfW = halfH * camera.aspect
  BOUNDARY_X = halfW * 0.75
  BOUNDARY_Y = halfH * 0.75
}
updateBoundaries()

function assignPhysics(obj, radius) {
  obj.userData.vel = new THREE.Vector3(
    (Math.random() - 0.5) * 0.04,
    (Math.random() - 0.5) * 0.04,
    (Math.random() - 0.5) * 0.025,
  )
  obj.userData.angVel = new THREE.Vector3(
    (Math.random() - 0.5) * 0.008,
    (Math.random() - 0.5) * 0.008,
    (Math.random() - 0.5) * 0.008,
  )
  obj.userData.radius = radius
}

function randomPosition(obj) {
  obj.position.set(
    (Math.random() - 0.5) * BOUNDARY_X * 2,
    (Math.random() - 0.5) * BOUNDARY_Y * 2,
    (Math.random() - 0.5) * 8 * 1.2,
  )
  obj.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  )
}

// ─── CONTAINER + OBJECTS ─────────────────────────────────────────────────────
const container = new THREE.Group()
scene.add(container)
const objects = []

// ─── BACKGROUND PRIMITIVES (disabled) ────────────────────────────────────────
const bgGeometries = [
  () => new THREE.SphereGeometry(1.8 + Math.random() * 1.5, 32, 32),
  () => new THREE.BoxGeometry(2.4 + Math.random() * 1.8, 2.4 + Math.random() * 1.8, 2.4 + Math.random() * 1.8),
  () => new THREE.TorusGeometry(1.5 + Math.random() * 0.9, 0.54 + Math.random() * 0.3, 24, 64),
  () => new THREE.OctahedronGeometry(2.1 + Math.random() * 1.2),
  () => new THREE.IcosahedronGeometry(1.8 + Math.random() * 1.2),
  () => new THREE.ConeGeometry(1.35 + Math.random() * 0.9, 3.0 + Math.random() * 1.5, 6),
  () => new THREE.CylinderGeometry(0.9, 0.9, 3.6 + Math.random() * 1.5, 32),
  () => new THREE.TetrahedronGeometry(2.1 + Math.random() * 1.2),
]
for (let i = 0; i < 0; i++) {
  const geom = bgGeometries[i % bgGeometries.length]()
  let mat
  const r = Math.random()
  if (r < 0.6) {
    mat = new THREE.MeshStandardMaterial({ metalness: 1.0, roughness: 0.05, envMapIntensity: 1.8, color: 0xffffff })
  } else if (r < 0.8) {
    const cols = [0x111111, 0x1a1a2e, 0x0a0a0a, 0x1c1c1c]
    mat = makeMetalMaterial(cols[Math.floor(Math.random() * cols.length)])
  } else {
    const cols = [0x8888ff, 0xffaacc, 0x88ffdd, 0xffffff]
    mat = makeGlassMaterial(cols[Math.floor(Math.random() * cols.length)])
  }
  const mesh = new THREE.Mesh(geom, mat)
  randomPosition(mesh)
  const bbox = new THREE.Box3().setFromObject(mesh)
  const size = new THREE.Vector3()
  bbox.getSize(size)
  assignPhysics(mesh, size.length() * 0.4)
  container.add(mesh)
  objects.push(mesh)
}

// ─── GLB MODELS ──────────────────────────────────────────────────────────────
const MODEL_TARGET_SIZE = 6
const loader = new GLTFLoader()

function loadModel(path) {
  loader.load(path, (gltf) => {
    const model = gltf.scene
    model.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
      if (path.includes('BLOB_02.glb')) {
        child.material = blobMaterial.clone()
      } else if (path.includes('IAMWE_PICTURE_ONE.glb')) {
        const matName = child.material ? child.material.name : ''
        if (matName === 'Mat' || matName === 'Mat.1') {
          child.material = neonPerspex
        } else if (matName === 'Mat.2') {
          child.material.side = THREE.DoubleSide
          if (child.material.map) child.material.map.colorSpace = THREE.SRGBColorSpace
          child.material.needsUpdate = true
        } else {
          child.material = darkRod
        }
      } else {
        if (child.material.map) child.material.map.colorSpace = THREE.SRGBColorSpace
        child.material.envMapIntensity = 1.2
        child.material.needsUpdate = true
      }
    })
    const bboxRaw = new THREE.Box3().setFromObject(model)
    const sizeRaw = new THREE.Vector3()
    bboxRaw.getSize(sizeRaw)
    const maxDim = Math.max(sizeRaw.x, sizeRaw.y, sizeRaw.z)
    if (maxDim > 0) model.scale.setScalar(MODEL_TARGET_SIZE / maxDim)
    const wrapper = new THREE.Group()
    const bboxScaled = new THREE.Box3().setFromObject(model)
    const center = new THREE.Vector3()
    bboxScaled.getCenter(center)
    model.position.sub(center)
    wrapper.add(model)
    randomPosition(wrapper)
    assignPhysics(wrapper, MODEL_TARGET_SIZE * 0.55)
    container.add(wrapper)
    objects.push(wrapper)
  }, undefined, (err) => console.warn('Could not load', path, err))
}

fetch('/models/models.json')
  .then((r) => r.json())
  .then((files) => files.forEach((name) => loadModel(`/models/${name}`)))
  .catch((err) => console.warn('Could not load models.json', err))

// ─── WORM DRAWING ────────────────────────────────────────────────────────────
const MAX_WORMS = 6
const WORM_RADIUS = 0.4
const WORM_SEGMENTS = 8
const WORM_Z_SPEED = 0.006
const MIN_POINT_DIST = 0.15
let wormHueOffset = 0

const drawnWorms = []
let isDrawing = false
let drawPoints = []
let currentDrawZ = 0
let previewMesh = null
const drawMouse = new THREE.Vector2()

function mouseToWorld(mx, my, z) {
  const ndc = new THREE.Vector3(mx, my, 0.5)
  ndc.unproject(camera)
  const dir = ndc.sub(camera.position).normalize()
  const t = (z - camera.position.z) / dir.z
  return new THREE.Vector3(
    camera.position.x + t * dir.x,
    camera.position.y + t * dir.y,
    z,
  )
}

function buildTubeMesh(points, hueOffset = 0) {
  if (points.length < 2) return null
  const curve = new THREE.CatmullRomCurve3(points)
  const segments = Math.max(points.length * 4, 12)
  const geom = new THREE.TubeGeometry(curve, segments, WORM_RADIUS, WORM_SEGMENTS, false)
  const mat = blobMaterial.clone()
  mat.uniforms.uHueOffset.value = hueOffset
  return new THREE.Mesh(geom, mat)
}

function startDraw(mx, my) {
  isDrawing = true
  drawPoints = []
  currentDrawZ = 14
  drawMouse.set(mx, my)
  drawPoints.push(mouseToWorld(mx, my, currentDrawZ))
}

function updateDraw(mx, my) {
  drawMouse.set(mx, my)
}

function finaliseWorm() {
  if (drawPoints.length < 2) {
    if (previewMesh) {
      scene.remove(previewMesh)
      previewMesh.geometry.dispose()
      previewMesh = null
    }
    return
  }
  if (previewMesh) {
    scene.remove(previewMesh)
    previewMesh.geometry.dispose()
    previewMesh = null
  }
  const mesh = buildTubeMesh(drawPoints, wormHueOffset)
  if (!mesh) return

  wormHueOffset = (wormHueOffset + 0.25) % 1.0

  const wrapper = new THREE.Group()
  wrapper.add(mesh)

  const bbox = new THREE.Box3().setFromObject(mesh)
  const center = new THREE.Vector3()
  bbox.getCenter(center)
  mesh.position.sub(center)
  wrapper.position.copy(center)

  const lastPt = drawPoints[drawPoints.length - 1]
  const firstPt = drawPoints[0]
  const driftDir = new THREE.Vector3()
    .subVectors(lastPt, firstPt)
    .normalize()
    .multiplyScalar(0.012)

  wrapper.userData.vel = new THREE.Vector3(
    driftDir.x + (Math.random() - 0.5) * 0.004,
    driftDir.y + (Math.random() - 0.5) * 0.004,
    -0.008,
  )
  wrapper.userData.angVel = new THREE.Vector3(
    (Math.random() - 0.5) * 0.003,
    (Math.random() - 0.5) * 0.003,
    (Math.random() - 0.5) * 0.003,
  )
  wrapper.userData.radius = WORM_RADIUS * drawPoints.length * 0.3

  container.add(wrapper)
  objects.push(wrapper)
  drawnWorms.push(wrapper)

  if (drawnWorms.length > MAX_WORMS) {
    const oldest = drawnWorms.shift()
    container.remove(oldest)
    const idx = objects.indexOf(oldest)
    if (idx !== -1) objects.splice(idx, 1)
    oldest.traverse((child) => { if (child.geometry) child.geometry.dispose() })
  }

  drawPoints = []
}

// ─── MOUSE EVENTS (desktop) ──────────────────────────────────────────────────
window.addEventListener('mousemove', (e) => {
  const mx = (e.clientX / window.innerWidth)  * 2 - 1
  const my = -(e.clientY / window.innerHeight) * 2 + 1
  updateDraw(mx, my)
})

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  const mx = (e.clientX / window.innerWidth)  * 2 - 1
  const my = -(e.clientY / window.innerHeight) * 2 + 1
  startDraw(mx, my)
})

canvas.addEventListener('mouseup', () => {
  if (!isDrawing) return
  isDrawing = false
  finaliseWorm()
})

canvas.addEventListener('mouseleave', () => {
  if (!isDrawing) return
  isDrawing = false
  finaliseWorm()
})

// ─── TOUCH EVENTS (mobile) ───────────────────────────────────────────────────
// Touch only draws worms — tilt handles object movement
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  const t = e.touches[0]
  const mx = (t.clientX / window.innerWidth)  * 2 - 1
  const my = -(t.clientY / window.innerHeight) * 2 + 1
  startDraw(mx, my)
}, { passive: false })

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault()
  if (!isDrawing) return
  const t = e.touches[0]
  const mx = (t.clientX / window.innerWidth)  * 2 - 1
  const my = -(t.clientY / window.innerHeight) * 2 + 1
  updateDraw(mx, my)
}, { passive: false })

canvas.addEventListener('touchend', (e) => {
  e.preventDefault()
  if (!isDrawing) return
  isDrawing = false
  finaliseWorm()
}, { passive: false })

// ─── SCROLL (desktop wheel only) ─────────────────────────────────────────────
let scrollY = 0
let targetScrollY = 0
const MAX_SCROLL = 2000

window.addEventListener('wheel', (e) => {
  targetScrollY = Math.max(0, Math.min(MAX_SCROLL, targetScrollY + e.deltaY))
}, { passive: true })

// ─── RESIZE ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  updateBoundaries()
})

// ─── PHYSICS ─────────────────────────────────────────────────────────────────
function physicsStep() {
  for (const obj of objects) {
    const v  = obj.userData.vel
    const av = obj.userData.angVel

    // Apply tilt gravity on mobile
    if (isMobile && tiltEnabled) {
      v.x += tiltX
      v.y += tiltY
    }

    obj.position.addScaledVector(v, 1)
    obj.rotation.x += av.x
    obj.rotation.y += av.y
    obj.rotation.z += av.z

    v.multiplyScalar(DAMPING)
    av.multiplyScalar(DAMPING)

    v.x += (Math.random() - 0.5) * 0.0008
    v.y += (Math.random() - 0.5) * 0.0008
    v.z += (Math.random() - 0.5) * 0.0004

    const spd = v.length()
    if (spd > 0.4)   v.multiplyScalar(0.4 / spd)
    if (spd < 0.005) v.addScaledVector(v.clone().normalize().negate(), -0.002)

    if (obj.position.x >  BOUNDARY_X) { obj.position.x =  BOUNDARY_X; v.x *= -0.85 }
    if (obj.position.x < -BOUNDARY_X) { obj.position.x = -BOUNDARY_X; v.x *= -0.85 }
    if (obj.position.y >  BOUNDARY_Y) { obj.position.y =  BOUNDARY_Y; v.y *= -0.85 }
    if (obj.position.y < -BOUNDARY_Y) { obj.position.y = -BOUNDARY_Y; v.y *= -0.85 }
    if (obj.position.z >  8)          { obj.position.z =  8;           v.z *= -0.85 }
    if (obj.position.z < -8)          { obj.position.z = -8;           v.z *= -0.85 }
  }

  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i]
      const b = objects[j]
      const diff = new THREE.Vector3().subVectors(b.position, a.position)
      const dist = diff.length()
      const minDist = a.userData.radius + b.userData.radius
      if (dist < minDist && dist > 0.001) {
        const normal  = diff.clone().divideScalar(dist)
        const overlap = minDist - dist
        a.position.addScaledVector(normal, -overlap * 0.5)
        b.position.addScaledVector(normal,  overlap * 0.5)
        const relVel = new THREE.Vector3().subVectors(a.userData.vel, b.userData.vel)
        const dot = relVel.dot(normal)
        if (dot > 0) {
          const impulse = normal.clone().multiplyScalar(dot * 0.85)
          a.userData.vel.sub(impulse)
          b.userData.vel.add(impulse)
          a.userData.angVel.addScaledVector(normal, (Math.random() - 0.5) * 0.015)
          b.userData.angVel.addScaledVector(normal, (Math.random() - 0.5) * 0.015)
        }
      }
    }
  }
}

// ─── ANIMATION LOOP ──────────────────────────────────────────────────────────
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)

  const t = clock.getElapsedTime()

  // Update shader time on all iridescent materials
  blobMaterial.uniforms.uTime.value = t
  objects.forEach(obj => {
    obj.traverse(child => {
      if (child.isMesh && child.material && child.material.uniforms && child.material.uniforms.uTime) {
        child.material.uniforms.uTime.value = t
      }
    })
  })

  // ── WORM DRAWING ──────────────────────────────────────────────────────────
  if (isDrawing) {
    currentDrawZ -= WORM_Z_SPEED
    const pt = mouseToWorld(drawMouse.x, drawMouse.y, currentDrawZ)
    const last = drawPoints[drawPoints.length - 1]
    if (!last || pt.distanceTo(last) > MIN_POINT_DIST) {
      drawPoints.push(pt)
    }
    if (drawPoints.length >= 2) {
      if (previewMesh) {
        scene.remove(previewMesh)
        previewMesh.geometry.dispose()
      }
      previewMesh = buildTubeMesh(drawPoints, wormHueOffset)
      if (previewMesh) scene.add(previewMesh)
    }
  }

  // ── SCROLL (desktop only) ─────────────────────────────────────────────────
  if (!isMobile) {
    scrollY += (targetScrollY - scrollY) * 0.06
    const scrollProgress = scrollY / MAX_SCROLL

    const camX = Math.sin(scrollProgress * Math.PI * 2.5) * 10
    const camY = -scrollProgress * 8 + Math.cos(scrollProgress * Math.PI) * 4
    const camZ = 22 + scrollProgress * 10
    camera.position.x += (camX - camera.position.x) * 0.05
    camera.position.y += (camY - camera.position.y) * 0.05
    camera.position.z += (camZ - camera.position.z) * 0.05
    camera.lookAt(0, camY * 0.3, 0)

    const scrollDelta = targetScrollY - scrollY
    container.rotation.y += scrollDelta * 0.0008
    container.rotation.z += scrollDelta * 0.0003

    if (Math.abs(scrollDelta) > 1) {
      for (const obj of objects) {
        obj.userData.vel.x += (Math.random() - 0.5) * Math.abs(scrollDelta) * 0.0008
        obj.userData.vel.y += (Math.random() - 0.5) * Math.abs(scrollDelta) * 0.0008
        obj.userData.vel.z += (Math.random() - 0.5) * Math.abs(scrollDelta) * 0.0004
        obj.userData.angVel.x += (Math.random() - 0.5) * Math.abs(scrollDelta) * 0.0003
        obj.userData.angVel.y += (Math.random() - 0.5) * Math.abs(scrollDelta) * 0.0003
      }
    }

    container.rotation.x += 0.0036
  }

  physicsStep()
  renderer.render(scene, camera)
}

animate()
