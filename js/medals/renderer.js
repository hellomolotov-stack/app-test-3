import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPersonalBack } from './model.js';

let cachedFont = null;
export async function mountMedalScene(host, achievement, { snapshot = false, signal } = {}) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: snapshot });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'medal-canvas'; renderer.domElement.style.touchAction = 'none';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .05, 40);
    camera.position.set(.15, .1, 5.3);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .035);
    room.dispose(); pmrem.dispose(); scene.environment = environment.texture;
    const key = new THREE.DirectionalLight('#ffffff', 2); key.position.set(-3, 4, 6); scene.add(key);
    const fill = new THREE.DirectionalLight('#b0caf9', 1); fill.position.set(4, .5, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 3); rim.position.set(1, 2, -4); scene.add(rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true;
    controls.dampingFactor = .09; controls.rotateSpeed = .7;
    controls.autoRotate = !snapshot && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.autoRotateSpeed = .85;
    controls.addEventListener('start', () => { controls.autoRotate = false; transition = null; });
    let model, frame = 0, disposed = false, observer, transition = null, distance = 5.3;
    const destroyObject = object => object?.traverse(node => {
        node.geometry?.dispose();
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        materials.forEach(material => { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); });
    });
    const dispose = () => {
        if (disposed) return;
        disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); controls.dispose();
        destroyObject(model); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
        document.removeEventListener('visibilitychange', visibility);
    };
    function size() {
        const { width, height } = host.getBoundingClientRect();
        if (!width || !height || disposed) return;
        renderer.setSize(width, height); camera.aspect = width / height;
        // The full model remains visible in both tall mobile and wide desktop canvases.
        camera.fov = 36;
        distance = Math.max(2.55, 2.22/camera.aspect) / (2*Math.tan(camera.fov*Math.PI/360)) * 1.14;
        camera.position.normalize().multiplyScalar(distance);
        camera.updateProjectionMatrix();
    }
    let last = 0;
    function render(time = 0) {
        if (disposed || document.hidden) return;
        frame = requestAnimationFrame(render);
        if (time-last < 1000/30) return;
        const delta = Math.min((time-last)/1000, .05); last = time;
        if (transition) {
            const progress = Math.min(1, (performance.now()-transition.started)/600);
            const eased = progress*progress*(3-2*progress);
            const theta = transition.from + (transition.to-transition.from)*eased;
            camera.position.set(distance*Math.sin(theta), .08, distance*Math.cos(theta));
            if (progress === 1) transition = null;
        }
        controls.update(delta); renderer.render(scene, camera);
    }
    function visibility() { cancelAnimationFrame(frame); if (!document.hidden && !disposed) { last = 0; render(); } }
    try {
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
        cachedFont ||= fetch('/assets/achievements/manrope-cyrillic.json', { signal: requestSignal }).then(response => {
            if (!response.ok) throw new Error('font unavailable');
            return response.json();
        }).then(json => new FontLoader().parse(json)).catch(error => { cachedFont = null; throw error; });
        const font = await cachedFont;
        const response = await fetch(achievement.medal.modelUrl, { signal: requestSignal });
        if (!response.ok) throw new Error('model unavailable');
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/assets/achievements/');
        model = gltf.scene;
        if (signal?.aborted) throw new Error('viewer closed');
        model.add(createPersonalBack(font, achievement.grant.name, achievement.grant.date));
        scene.add(model); host.appendChild(renderer.domElement);
        observer = new ResizeObserver(size); observer.observe(host); size();
        controls.update(); renderer.render(scene, camera);
        document.addEventListener('visibilitychange', visibility);
        render();
        return { dispose, canvas: renderer.domElement, model,
            showSide(side, immediate = false) {
                controls.autoRotate = false;
                const from = Math.atan2(camera.position.x, camera.position.z);
                let to = side === 'back' ? Math.PI : 0;
                while (to-from > Math.PI) to -= 2*Math.PI;
                while (to-from < -Math.PI) to += 2*Math.PI;
                if (immediate) { transition = null; camera.position.set(distance*Math.sin(to), .08, distance*Math.cos(to)); controls.update(); renderer.render(scene, camera); }
                else transition = { from, to, started: performance.now() };
            },
        };
    } catch (error) { dispose(); throw error; }
}
