import { createPointDeformer } from './fitting.mjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function disposeObject(root) {
  const textures = new Set();
  root.traverse(object => {
    object.geometry?.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

// Body and garments share the MakeHuman rest coordinates (metres). Bake the
// static fit into vertices so it survives export and is identical on every page.
function armInfluence(object) {
  const painted = object.geometry.getAttribute('_arm_weight');
  if (painted) return i => painted.getX(i);
  if (!object.isSkinnedMesh) return () => 0;
  const armBones = object.skeleton.bones.map(bone => {
    for (let parent = bone; parent; parent = parent.parent) {
      if (parent.name === 'upperarm_l' || parent.name === 'upperarm_r') return true;
    }
    return false;
  });
  const joints = object.geometry.getAttribute('skinIndex'), weights = object.geometry.getAttribute('skinWeight');
  return i => {
    let sum = 0;
    for (let k = 0; k < 4; k++) if (armBones[joints.getComponent(i, k)]) sum += weights.getComponent(i, k);
    return Math.min(1, sum);
  };
}

function fitTemplate(source, profile) {
  const fitted = new THREE.Group();
  const deform = createPointDeformer(profile);
  source.traverse(object => {
    if (!object.isMesh) return;
    const geometry = new THREE.BufferGeometry();
    const position = object.geometry.attributes.position.clone();
    const armWeight = profile.tier === 'quick' ? () => 0 : armInfluence(object);
    for (let i = 0; i < position.count; i++) {
      position.setXYZ(i, ...deform(position.getX(i), position.getY(i), position.getZ(i), armWeight(i)));
    }
    geometry.setAttribute('position', position);
    for (const key of ['uv', 'color']) {
      const attribute = object.geometry.getAttribute(key);
      if (attribute) geometry.setAttribute(key, attribute.clone());
    }
    if (object.geometry.index) geometry.setIndex(object.geometry.index.clone());
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, object.material);
    mesh.name = object.name;
    fitted.add(mesh);
    object.geometry.dispose();
    object.skeleton?.dispose();
  });
  return fitted;
}

export function createModelViewer(container) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '3D 人物模型。拖动旋转，滚轮缩放；聚焦后可用方向键旋转、加减键缩放、Home 键复位。');
  container.append(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.minDistance = 1.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI * .9;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 1.35, 0);

  scene.add(new THREE.HemisphereLight(0xfff8e8, 0x77776b, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.1);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdde7ff, 1.3);
  fill.position.set(-4, 3, -3);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  let model = null;
  let localProfile = null;
  let displayHeight = 2.7;
  let bodyCoverage = 'full';
  const clothing = new Map();
  const clothingRequests = new Map();
  let clothingVersion = 0;
  let loadVersion = 0;
  let disposed = false;
  let frame = 0;

  function reset() {
    camera.position.set(.12, displayHeight * .55, displayHeight * 2.04);
    controls.target.set(0, displayHeight * .5, 0);
    controls.update();
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  reset();

  function animate() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  animate();

  renderer.domElement.addEventListener('keydown', event => {
    const offset = camera.position.clone().sub(controls.target);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? .12 : -.12);
      } else {
        offset.y = THREE.MathUtils.clamp(offset.y + (event.key === 'ArrowUp' ? .25 : -.25), -.5, 6);
      }
      camera.position.copy(controls.target).add(offset);
      controls.update();
    } else if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      offset.multiplyScalar(event.key === '-' ? 1.1 : .9);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    } else if (event.key === 'Home') {
      event.preventDefault();
      reset();
    }
  });

  return {
    async exportModel() {
      if (!model) throw new Error('请先生成分身。');
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const bytes = await new GLTFExporter().parseAsync(model, { binary: true });
      return new Blob([bytes], { type: 'model/gltf-binary' });
    },
    async load(url, options = {}) {
      const version = ++loadVersion;
      bodyCoverage = options.bodyCoverage === 'cropped' ? 'cropped' : 'full';
      clothingVersion++;
      for (const { root } of clothing.values()) {
        scene.remove(root);
        disposeObject(root);
      }
      clothing.clear();
      clothingRequests.clear();
      const gltf = await new GLTFLoader().loadAsync(options.kind === 'local' ? '/assets/3d/fitting-body.glb' : url);
      if (disposed || version !== loadVersion) {
        disposeObject(gltf.scene);
        throw new Error('模型加载已取消。');
      }
      if (model) {
        scene.remove(model);
        disposeObject(model);
      }
      localProfile = options.kind === 'local' ? options : null;
      displayHeight = localProfile ? options.heightCm / 100 : 2.7;
      model = localProfile ? fitTemplate(gltf.scene, localProfile) : gltf.scene;
      let triangles = 0;
      model.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      });
      const initial = new THREE.Box3().setFromObject(model);
      const size = initial.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('GLB 中没有可显示的网格。');
      // Tripo 多视图结果可能以 X 为前后轴；统一为 X 肩宽、Z 前后，与服装网格一致。
      if (!localProfile) {
        if (size.z > size.x) model.rotateY(Math.PI / 2);
        model.scale.setScalar(2.7 / size.y);
        const scaled = new THREE.Box3().setFromObject(model);
        const center = scaled.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= scaled.min.y;
      }
      scene.add(model);
      reset();
      return { triangles: Math.round(triangles) };
    },
    async wear(garment) {
      if (!model) throw new Error('请先加载 3D 人物，再选择服装。');
      const version = loadVersion;
      const garmentVersion = clothingVersion;
      const request = Symbol(garment.id);
      clothingRequests.set(garment.slot, request);
      const gltf = await new GLTFLoader().loadAsync(garment.url);
      if (disposed || version !== loadVersion || garmentVersion !== clothingVersion || clothingRequests.get(garment.slot) !== request) {
        disposeObject(gltf.scene);
        return null;
      }
      const previous = clothing.get(garment.slot);
      if (previous) {
        scene.remove(previous.root);
        disposeObject(previous.root);
      }
      const root = localProfile ? fitTemplate(gltf.scene, localProfile) : gltf.scene;
      const transform = localProfile ? {} : (bodyCoverage === 'cropped' ? garment.croppedTransform : null) || garment.transform || {};
      const scale = transform.scale ?? 1;
      if (Array.isArray(scale)) root.scale.fromArray(scale);
      else root.scale.setScalar(scale);
      root.position.fromArray(transform.position || [0, 0, 0]);
      if (transform.rotation) root.rotation.set(...transform.rotation);
      let triangles = 0;
      root.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      });
      root.name = garment.id;
      scene.add(root);
      clothing.set(garment.slot, { id: garment.id, root });
      return { triangles: Math.round(triangles) };
    },
    removeGarment(slot) {
      clothingRequests.delete(slot);
      const previous = clothing.get(slot);
      if (!previous) return;
      scene.remove(previous.root);
      disposeObject(previous.root);
      clothing.delete(slot);
    },
    clear() {
      loadVersion++;
      clothingVersion++;
      clothingRequests.clear();
      for (const { root } of clothing.values()) {
        scene.remove(root);
        disposeObject(root);
      }
      clothing.clear();
      if (!model) return;
      scene.remove(model);
      disposeObject(model);
      model = null;
    },
    reset,
    setAutoRotate(value) {
      controls.autoRotate = Boolean(value);
    },
    dispose() {
      disposed = true;
      loadVersion++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      if (model) disposeObject(model);
      for (const { root } of clothing.values()) disposeObject(root);
      clothing.clear();
      clothingRequests.clear();
      disposeObject(ground);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
