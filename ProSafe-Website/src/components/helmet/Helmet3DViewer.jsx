import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { HelmetModel } from './HelmetModel.jsx';
import { INTERIOR, placeComponent } from './helmetGeometry.js';

const HOME_POSITION = new THREE.Vector3(2.25, 1.3, 2.75);
const HOME_TARGET = new THREE.Vector3(0, 0.3, 0);
const MIN_DISTANCE = 1.8;
const MAX_DISTANCE = 7;

/** Direction from which a component is best seen. Interior parts are viewed from below. */
function viewDirection(component) {
  const normal = new THREE.Vector3(...component.normal).normalize();
  if (INTERIOR.has(component.id)) return normal.multiplyScalar(1.1).add(new THREE.Vector3(0, -0.85, 0.35)).normalize();
  return placeComponent(component, false).normal.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
}

/** Animates the camera towards a goal; any user drag cancels the animation. */
function CameraRig({ controlsRef, goalRef, animatingRef, autoRotate, inView }) {
  const { camera, invalidate } = useThree();
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (animatingRef.current && goalRef.current) {
      const t = 1 - Math.exp(-delta * 5);
      camera.position.lerp(goalRef.current.position, t);
      controls.target.lerp(goalRef.current.target, t);
      controls.update();
      const done = camera.position.distanceTo(goalRef.current.position) < 0.01 && controls.target.distanceTo(goalRef.current.target) < 0.01;
      if (done) animatingRef.current = false;
      else invalidate();
    }
    // Keep frames flowing only while auto-rotating and visible.
    if (autoRotate && inView) invalidate();
  });
  return null;
}

/** Numbered marker for each component; fades when its side faces away. */
function Hotspot({ component, selected, onSelect }) {
  const ref = useRef(null);
  const { camera } = useThree();
  const { point, normal } = useMemo(() => placeComponent(component, INTERIOR.has(component.id)), [component]);
  const markerPos = useMemo(() => point.clone().addScaledVector(normal, 0.1), [point, normal]);
  const toCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!ref.current) return;
    toCamera.copy(camera.position).sub(markerPos).normalize();
    const facing = toCamera.dot(normal);
    ref.current.style.opacity = selected ? '1' : facing > 0.05 ? '1' : '0.3';
  });

  return (
    <Html position={markerPos} center zIndexRange={[30, 0]}>
      <button
        ref={ref}
        type="button"
        // Pointer shortcut only: the component list beside the viewer is the
        // keyboard- and screen-reader-accessible equivalent.
        tabIndex={-1}
        onClick={() => onSelect(component.id)}
        title={`${component.name} (${component.part})`}
        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[0.7rem] font-extrabold shadow-card transition-[transform,background-color] duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          selected ? 'scale-110 border-white bg-brand text-[#06210f]' : 'border-brand/70 bg-bg/85 text-brand'
        }`}
      >
        {String(component.n).padStart(2, '0')}
      </button>
    </Html>
  );
}

function Scene({ components, inactive, selectedId, onSelect, ledState, autoRotate, onUserInteract, zoomEnabled, inView, apiRef }) {
  const controlsRef = useRef(null);
  const goalRef = useRef(null);
  const animatingRef = useRef(false);
  const { camera, invalidate } = useThree();

  const flyTo = (position, target) => {
    goalRef.current = { position, target };
    animatingRef.current = true;
    invalidate();
  };

  useImperativeHandle(apiRef, () => ({
    reset() {
      flyTo(HOME_POSITION.clone(), HOME_TARGET.clone());
    },
    zoom(factor) {
      const controls = controlsRef.current;
      if (!controls) return;
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * factor, MIN_DISTANCE, MAX_DISTANCE);
      flyTo(controls.target.clone().add(offset.setLength(distance)), controls.target.clone());
    },
  }));

  useEffect(() => {
    if (!selectedId) return;
    const component = components.find((c) => c.id === selectedId);
    if (!component) return;
    const { point } = placeComponent(component, INTERIOR.has(component.id));
    const target = point.clone().multiplyScalar(0.45).add(HOME_TARGET.clone().multiplyScalar(0.55));
    const distance = INTERIOR.has(component.id) ? 3.6 : 2.9;
    flyTo(target.clone().addScaledVector(viewDirection(component), distance), target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (inView) invalidate();
  }, [inView, autoRotate, ledState, invalidate]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#e8fff4', '#0b1418', 0.6]} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} />
      <directionalLight position={[-4, 2, -3]} intensity={0.55} color="#7dd3fc" />
      <directionalLight position={[0, -4, 2]} intensity={0.35} />

      <HelmetModel components={components} inactive={inactive} selectedId={selectedId} ledState={ledState} />
      {components.map((c) => (
        <Hotspot key={c.id} component={c} selected={c.id === selectedId} onSelect={onSelect} />
      ))}

      <ContactShadows position={[0, -0.78, 0]} opacity={0.45} scale={6} blur={2.4} far={2} frames={1} color="#000000" />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={HOME_TARGET.toArray()}
        enablePan={false}
        enableZoom={zoomEnabled}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.8}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
        autoRotate={autoRotate && inView}
        autoRotateSpeed={0.9}
        onStart={() => {
          animatingRef.current = false;
          onUserInteract();
        }}
      />
      <CameraRig controlsRef={controlsRef} goalRef={goalRef} animatingRef={animatingRef} autoRotate={autoRotate} inView={inView} />
    </>
  );
}

/**
 * Interactive WebGL helmet. Rendering is on demand: frames are drawn only
 * while the user interacts, the camera animates or auto-rotation is active
 * and the viewer is on screen.
 */
const Helmet3DViewer = forwardRef(function Helmet3DViewer(props, ref) {
  const { onContextLost, ...sceneProps } = props;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ position: HOME_POSITION.toArray(), fov: 38, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost?.();
        });
      }}
      style={{ touchAction: 'none' }}
      aria-hidden="true"
    >
      <Scene {...sceneProps} apiRef={ref} />
    </Canvas>
  );
});

export default Helmet3DViewer;
