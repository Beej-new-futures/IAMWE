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

// ─── BLOB IRIDESCENT SHADER ──────────────────────────────────────────────────
const blobMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
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
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPos;

    vec3 hsl2rgb(vec3 c) {
      vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
    }

    void main() {
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
      float gradientPos = vWorldPos.y * 0.08 + vWorldPos.x * 0.05 + uTime * 0.12;
      float hue = mix(0.88, 0.62, sin(gradientPos) * 0.5 + 0.5);
      hue += fresnel * 0.25;
      hue = mod(hue, 1.0);
      float lightness = mix(0.45, 0.72, fresnel);
      float saturation = mix(0.7, 1.0, fresnel);
      vec3 col = hsl2rgb(vec3(hue, saturation, lightness));
      vec3 halfVec = normalize(vViewDir + normalize(vec3(1.0, 2.0, 1.0)));
      float spec = pow(max(dot(vNormal, halfVec), 0.0), 32.0) * 0.6;
      col += vec3(spec);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.DoubleSide,
})

// ─── NEON YELLOW PERSPEX ─────────────────────────────────────────────────────
const neonPerspex = new THREE.MeshStandardMaterial({
  color:             0xffff00,
  emissive:          0xdddd00,
  emissiveIntensity: 0.5,
  metalness:         0.0,
  roughness:         0.05,
  transparent:       true,
  opacity:           0.72,
  side:              THREE.DoubleSide,
  depthWrite:        false,
  envMapIntensity:   1.5,
})

// ─── DARK ROD MATERIAL ───────────────────────────────────────────────────────
const darkRod = new THREE.MeshStandardMaterial({
  color:           0x111111,
  metalness:       0.9,
  roughness:       0.1,
  envMapIntensity: 1.2,
})

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
  loader.load(
    path,
    (gltf) => {
      const model = gltf.scene

      model.traverse((child) => {
        if (!child.isMesh) return
        child.castShadow = true
        child.receiveShadow = true

        if (path.includes('BLOB_02.glb')) {
          // Iridescent pink/blue shader
          child.material = blobMaterial.clone()

        } else if (path.includes('IAMWE_PICTURE_ONE.glb')) {
          const matName = child.material ? child.material.name : ''

          if (matName === 'Mat' || matName === 'Mat.1') {
            // Neon yellow perspex panels
            child.material = neonPerspex
          } else if (matName === 'Mat.2') {
            // Picture plane — keep GLB texture, show both sides
            child.material.side = THREE.DoubleSide
            if (child.material.map) {
              child.material.map.colorSpace = THREE.SRGBColorSpace
            }
            child.material.needsUpdate = true
          } else {
            // Rods — dark metal
            child.material = darkRod
          }

        } else {
          if (child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace
          }
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

  // Update blob shader time
  blobMaterial.uniforms.uTime.value = t

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