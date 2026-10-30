import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { alignSceneMeshes } from "./antvla-scene";

type Pose = { position: [number, number, number]; orientation_xyzw: [number, number, number, number] };
type Frame = { t: number; joints: number[]; object: Pose; target: Pose };
type Trajectory = { duration: number; joint_names: string[]; frames: Frame[] };
type Joint = { name: string; type: "revolute" | "prismatic"; axis: [number, number, number]; node: string };
type Policy = "baseline" | "antvla";

const policies = {
  baseline: "Baseline rollout: attempts to grasp the avocado at its outdated position and misses.",
  antvla: "AntVLA rollout: anticipates the moving avocado and places it in the box.",
};

async function loadJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}

export async function initRolloutViewer(root: HTMLElement) {
  const element = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = element<HTMLCanvasElement>("[data-rollout-canvas]");
  const viewport = element<HTMLElement>("[data-rollout-viewport]");
  const message = element<HTMLElement>("[data-rollout-message]");
  const assetURL = (name: string) => `${root.dataset.assets}${name}`;
  let renderer: THREE.WebGLRenderer | undefined;

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const loader = new GLTFLoader();
    const [robot, avocado, box, table, kinematics, cameraData, antvla, baseline] = await Promise.all([
      loader.loadAsync(assetURL("robot.glb")),
      loader.loadAsync(assetURL("avocado.glb")),
      loader.loadAsync(assetURL("paper_box.glb")),
      loader.loadAsync(assetURL("table.glb")),
      loadJSON<{ joints: Joint[] }>(assetURL("kinematics.json")),
      loadJSON<{ browser_camera: { position_isaac_robot_root: [number, number, number]; look_at_isaac_robot_root: [number, number, number]; vertical_fov_degrees: number } }>(assetURL("camera.json")),
      loadJSON<Trajectory>(assetURL("antvla.json")),
      loadJSON<Trajectory>(assetURL("baseline.json")),
    ]);
    const trajectories = { antvla, baseline };
    alignSceneMeshes(avocado.scene, box.scene, table.scene, baseline.frames.at(-1)!.target.position[2]);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(root).getPropertyValue("--surface-light").trim());

    // All exported GLBs and poses are Z-up, in the robot base frame. Convert ONCE.
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2;
    world.add(robot.scene, avocado.scene, box.scene, table.scene);
    scene.add(world);
    world.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    // Soft studio reflections make the supplied white/metallic robot readable.
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmrem.fromScene(environment, 0.04);
    scene.environment = environmentMap.texture;
    scene.environmentIntensity = 0.65;
    environment.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xe1efff, 0x67604c, 1.5));
    const light = new THREE.DirectionalLight(0xfff5df, 3);
    light.position.set(1.5, 3, 1);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = light.shadow.camera.bottom = -1.5;
    light.shadow.camera.right = light.shadow.camera.top = 1.5;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 8;
    light.shadow.normalBias = 0.002;
    light.target.position.set(0.35, 0, -0.1);
    scene.add(light, light.target);

    const cameraSpec = cameraData.browser_camera;
    const toBrowser = ([x, y, z]: [number, number, number]) => new THREE.Vector3(x, z, -y);
    const camera = new THREE.PerspectiveCamera(cameraSpec.vertical_fov_degrees, 16 / 9, 0.01, 20);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minDistance = 0.45;
    controls.maxDistance = 4;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // A slightly wider, centred view keeps the whole arm visible throughout both
    // rollouts. The source camera intentionally crops the initial avocado.
    const target = new THREE.Vector3(0.3, 0.25, -0.12);
    const viewDirection = toBrowser(cameraSpec.position_isaac_robot_root)
      .sub(toBrowser(cameraSpec.look_at_isaac_robot_root)).normalize();
    controls.target.copy(target);
    const distance = viewport.clientWidth / viewport.clientHeight < 1.5 ? 1.65 : 1.5;
    camera.position.copy(target).addScaledVector(viewDirection, distance);
    controls.update();

    // GLB joint nodes contain each fixed URDF origin, with all joint values zero.
    // Always compose from that origin rather than accumulating rotations.
    const bindings = kinematics.joints.map((joint) => {
      const node = robot.scene.getObjectByName(joint.node);
      if (!node) throw new Error(`Robot model is missing ${joint.node}`);
      return {
        ...joint,
        node,
        axisVector: new THREE.Vector3(...joint.axis),
        originPosition: node.position.clone(),
        originRotation: node.quaternion.clone(),
      };
    });
    let selectedPolicy: Policy = "antvla";
    let time = 0;
    let previousTime: number | undefined;
    const rotation = new THREE.Quaternion();
    const nextRotation = new THREE.Quaternion();
    const nextPosition = new THREE.Vector3();

    const applyPose = (object: THREE.Object3D, start: Pose, end: Pose, alpha: number) => {
      object.position.fromArray(start.position).lerp(nextPosition.fromArray(end.position), alpha);
      object.quaternion.fromArray(start.orientation_xyzw).normalize()
        .slerp(nextRotation.fromArray(end.orientation_xyzw).normalize(), alpha);
    };

    const applyFrame = () => {
      const trajectory = trajectories[selectedPolicy];
      const frames = trajectory.frames;
      // Binary search also supports scrubbing backwards and non-uniform samples.
      let low = 0;
      let high = frames.length - 1;
      while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (frames[middle].t <= time) low = middle;
        else high = middle;
      }
      const start = frames[low];
      const end = frames[high];
      const alpha = THREE.MathUtils.clamp((time - start.t) / (end.t - start.t), 0, 1);
      for (const joint of bindings) {
        const index = trajectory.joint_names.indexOf(joint.name);
        if (index < 0) throw new Error(`Trajectory is missing ${joint.name}`);
        const value = THREE.MathUtils.lerp(start.joints[index], end.joints[index], alpha);
        if (joint.type === "revolute") {
          joint.node.quaternion.copy(joint.originRotation)
            .multiply(rotation.setFromAxisAngle(joint.axisVector, value));
        } else {
          // These exported prismatic axes are expressed in the parent frame.
          joint.node.position.copy(joint.originPosition).addScaledVector(joint.axisVector, value);
        }
      }
      applyPose(avocado.scene, start.object, end.object, alpha);
      applyPose(box.scene, start.target, end.target, alpha);
      root.dataset.time = String(time);
    };

    const selectPolicy = (policy: Policy) => {
      selectedPolicy = policy;
      time = 0;
      previousTime = undefined;
      canvas.setAttribute("aria-label", `${policies[policy]} Drag to rotate; scroll or pinch to zoom.`);
      root.querySelectorAll<HTMLButtonElement>("[data-policy]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.policy === policy));
      });
      root.dataset.selectedPolicy = policy;
      applyFrame();
    };

    root.querySelectorAll<HTMLButtonElement>("[data-policy]").forEach((button) => {
      button.addEventListener("click", () => selectPolicy(button.dataset.policy as Policy));
    });
    const resize = () => {
      const { width, height } = viewport.getBoundingClientRect();
      renderer!.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(viewport);
    resize();
    selectPolicy("antvla");

    const tick = (timestamp: number) => {
      const delta = previousTime === undefined ? 0 : (timestamp - previousTime) / 1000;
      previousTime = timestamp;
      time += delta;
      const duration = trajectories[selectedPolicy].duration;
      if (time >= duration) time %= duration;
      applyFrame();
      controls.update();
      renderer!.render(scene, camera);
    };

    // Suspend GPU work and the playback clock when offscreen or in another tab.
    let visible = false;
    const updateVisibility = () => {
      previousTime = undefined;
      const active = visible && !document.hidden;
      root.dataset.playback = active ? "playing" : "paused";
      renderer!.setAnimationLoop(active ? tick : null);
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateVisibility();
    });
    visibilityObserver.observe(viewport);
    document.addEventListener("visibilitychange", updateVisibility);

    root.querySelectorAll<HTMLButtonElement>("[data-policy]")
      .forEach((control) => { control.disabled = false; });
    message.hidden = true;
    viewport.setAttribute("aria-busy", "false");
    root.dataset.ready = "true";

    // Also release resources during Vite HMR or a future Astro client navigation.
    const dispose = () => {
      renderer!.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      environmentMap.dispose();
      light.shadow.dispose();
      renderer!.dispose();
    };
    document.addEventListener("astro:before-swap", dispose, { once: true });
    if (import.meta.hot) import.meta.hot.dispose(dispose);
  } catch (error) {
    console.error("Could not initialise the robot rollout", error);
    renderer?.dispose();
    message.textContent = "Could not load the 3D scene. Check your connection and that WebGL 2 is enabled, then refresh.";
    viewport.setAttribute("aria-busy", "false");
    root.dataset.ready = "error";
  }
}
