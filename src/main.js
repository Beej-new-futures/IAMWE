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
renderer.outputColorSpace = THREE.SRGBColorSpace // updated from outputEncoding
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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
scene.add(ambientLight)

const lights = [
  { color: 0xff3366, pos: [15, 10, 8],    intensity: 3.5 },
  { color: 0x3366ff, pos: [-15, -8, 6],   intensity: 3.5 },
  { color: 0x00ffcc, pos: [0, 15, -5],    intensity: 2.5 },
  { color: 0xff9900, pos: [-10, -12, 10], intensity: 2.0 },
  { color: 0xaa44ff, pos: [12, -10, 4],   intensity: 2.0 },
]

const pointLights = lights.map((l) => {
  const pl = new THREE.PointLight(l.color, l.intensity, 60)
  pl.position.set(...l.pos)
  scene.add(pl)
  return pl
})

// ─── MATERIALS ───────────────────────────────────────────────────────────────
function makeMetalMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.95,
    roughness: 0.05,
    envMapIntensity: 1.0,
  })
}

function makeGlassMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.1,
    roughness: 0.0,
    transparent: true,
    opacity: 0.55,
  })
}

// ─── PHYSICS HELPERS ─────────────────────────────────────────────────────────
const DAMPING = 0.998
let BOUNDARY_X = 13
let BOUNDARY_Y = 13

function updateBoundaries() {
  const camZ = 22
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camZ
  const halfW = halfH * camera.aspect
  BOUNDARY_X = halfW * 0.9
  BOUNDARY_Y = halfH * 0.9
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

// ─── BACKGROUND PRIMITIVES ───────────────────────────────────────────────────
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

for (let i = 0; i < 8; i++) {
  const geom = bgGeometries[i % bgGeometries.length]()

  let mat
  const r = Math.random()
  if (r < 0.6) {
    mat = new THREE.MeshStandardMaterial({
      metalness: 1.0,
      roughness: 0.05,
      envMapIntensity: 1.8,
      color: 0xffffff,
    })
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
const MODEL_TARGET_SIZE = 3.5
const loader = new GLTFLoader()
const texLoader = new THREE.TextureLoader()

const frostedPerspex = new THREE.MeshStandardMaterial({
  color:             0xffff00,
  emissive:          0xffff00,
  emissiveIntensity: 1.2,
  transparent:       true,
  opacity:           0.6,
  side:              THREE.DoubleSide,
  depthWrite:        false,
  envMapIntensity:   1.2,
})

const darkRod = new THREE.MeshStandardMaterial({
  color:           0x111111,
  metalness:       0.9,
  roughness:       0.1,
  envMapIntensity: 1.2,
})

function applyPictureOneMaterials(model) {
  const PERSPEX_MESHES = new Set(['Plane1-Mat1', 'Plane1-Mat2'])
  const PICTURE_NAME   = 'Plane1 Mat'

  texLoader.load('/models/pic_image_1.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace // updated from tex.encoding
    tex.flipY = false

    const pictureMat = new THREE.MeshStandardMaterial({
      map:             tex,
      metalness:       0,
      roughness:       0.8,
      side:            THREE.DoubleSide,
      envMapIntensity: 1.2,
    })

    model.traverse((child) => {
      if (!child.isMesh) return
      if (child.name === PICTURE_NAME) {
        child.material = pictureMat
      } else if (PERSPEX_MESHES.has(child.name)) {
        child.material = frostedPerspex
      } else {
        child.material = darkRod
      }
    })
  })
}

function loadModel(path) {
  loader.load(
    path,
    (gltf) => {
      const model = gltf.scene

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
          if (child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace
          }
          child.material.envMapIntensity = 1.2
          child.material.needsUpdate = true
        }
      })

      if (path.includes('IAMWE_PICTURE_ONE.glb')) {
        applyPictureOneMaterials(model)
      }

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
    },
    undefined,
    (err) => console.warn('Could not load', path, err),
  )
}

fetch('/models/models.json')
  .then((r) => r.json())
  .then((files) => files.forEach((name) => loadModel(`/models/${name}`)))
  .catch((err) => console.warn('Could not load models.json', err))

// ─── RAYCASTER HELPER ────────────────────────────────────────────────────────
function findRootObject(mesh) {
  for (const obj of objects) {
    if (obj === mesh) return obj
    let p = mesh.parent
    while (p && p !== container) {
      if (p === obj) return obj
      p = p.parent
    }
  }
  return null
}

// ─── PHYSICS ─────────────────────────────────────────────────────────────────
function physicsStep() {
  for (const obj of objects) {
    const v  = obj.userData.vel
    const av = obj.userData.angVel

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

// ─── SCROLL ──────────────────────────────────────────────────────────────────
let scrollY = 0
let targetScrollY = 0
const MAX_SCROLL = 2000

window.addEventListener('wheel', (e) => {
  targetScrollY = Math.max(0, Math.min(MAX_SCROLL, targetScrollY + e.deltaY))
}, { passive: true })

let touchStartY = 0
window.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY }, { passive: true })
window.addEventListener('touchmove', (e) => {
  const delta = touchStartY - e.touches[0].clientY
  touchStartY = e.touches[0].clientY
  targetScrollY = Math.max(0, Math.min(MAX_SCROLL, targetScrollY + delta * 1.5))
}, { passive: true })

// ─── RESIZE ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  updateBoundaries()
})

// ─── MOUSE INTERACTION ───────────────────────────────────────────────────────
const mouse = new THREE.Vector2(9999, 9999)
const raycaster = new THREE.Raycaster()

window.addEventListener('mousemove', (e) => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
})

window.addEventListener('click', (e) => {
  const clickMouse = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  )
  raycaster.setFromCamera(clickMouse, camera)
  const hits = raycaster.intersectObjects(objects, true)

  if (hits.length > 0) {
    const hit = hits[0]
    const obj = findRootObject(hit.object) || hit.object

    const hitNormal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0)
    const rayDir = raycaster.ray.direction.clone()

    const impulse = rayDir.clone().multiplyScalar(1.2).add(hitNormal.multiplyScalar(0.5))
    const localImpulse = impulse.clone().transformDirection(container.matrixWorld.clone().invert())
    obj.userData.vel.add(localImpulse)
    obj.userData.angVel.add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.25,
      (Math.random() - 0.5) * 0.25,
      (Math.random() - 0.5) * 0.25,
    ))

    for (const other of objects) {
      if (other === obj) continue
      const diff = new THREE.Vector3().subVectors(other.position, obj.position)
      const dist = diff.length()
      if (dist < 9) {
        const splash = diff.normalize().multiplyScalar((9 - dist) / 9 * 0.5)
        other.userData.vel.add(splash)
        other.userData.angVel.add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ))
      }
    }
  } else {
    const clickPoint = new THREE.Vector3()
    raycaster.ray.at(20, clickPoint)
    const localClick = container.worldToLocal(clickPoint.clone())
    for (const obj of objects) {
      const diff = new THREE.Vector3().subVectors(obj.position, localClick)
      const dist = diff.length()
      if (dist < 16) {
        const force = (16 - dist) / 16 * 0.45
        obj.userData.vel.addScaledVector(diff.normalize(), force)
        obj.userData.angVel.add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.12,
        ))
      }
    }
  }
})

// ─── ANIMATION LOOP ──────────────────────────────────────────────────────────
const clock = new THREE.Clock()
let frame = 0

function animate() {
  requestAnimationFrame(animate)
  frame++

  const t = clock.getElapsedTime()

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

  pointLights.forEach((pl, i) => {
    const angle = t * 0.2 + i * (Math.PI * 2 / lights.length)
    const r = 16
    pl.position.x = Math.cos(angle) * r
    pl.position.y = Math.sin(angle * 0.7) * 10
    pl.position.z = Math.sin(angle) * r * 0.5 + 4
  })

  if (frame % 3 === 0) {
    raycaster.setFromCamera(mouse, camera)
    const repulseWorld = new THREE.Vector3()
    raycaster.ray.at(22, repulseWorld)
    const repulseLocal = container.worldToLocal(repulseWorld.clone())

    for (const obj of objects) {
      const diff = new THREE.Vector3().subVectors(obj.position, repulseLocal)
      const dist = diff.length()
      if (dist < 4.5) {
        const force = (4.5 - dist) / 4.5 * 0.02
        obj.userData.vel.addScaledVector(diff.normalize(), force)
      }
    }
  }

  physicsStep()
  renderer.render(scene, camera)
}

animate()
