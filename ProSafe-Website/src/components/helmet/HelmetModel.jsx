import { useMemo } from 'react';
import * as THREE from 'three';
import { createBrimGeometry, createRidgeGeometry, createShellGeometry, faceQuaternion, INTERIOR, placeComponent, SHELL } from './helmetGeometry.js';

const LED_COLORS = { SAFE: '#22c55e', WARNING: '#f59e0b', CRITICAL: '#ef4444', UNCERTAIN: '#3b82f6' };

function Pcb({ size = [0.2, 0.14, 0.02], color = '#1d4ed8', children, highlighted }) {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} emissive={highlighted ? '#22c55e' : '#000000'} emissiveIntensity={highlighted ? 0.45 : 0} />
      </mesh>
      {children}
    </group>
  );
}

/** Small visual models of each module, built from primitives. */
function ComponentMesh({ id, highlighted, ledState }) {
  switch (id) {
    case 'esp32':
      return (
        <Pcb size={[0.36, 0.2, 0.025]} color="#1f2937" highlighted={highlighted}>
          <mesh position={[0.04, 0, 0.022]}>
            <boxGeometry args={[0.16, 0.12, 0.02]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.35} />
          </mesh>
        </Pcb>
      );
    case 'dht11':
      return (
        <Pcb size={[0.16, 0.12, 0.02]} color="#1e40af" highlighted={highlighted}>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[0.1, 0.09, 0.05]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.6} />
          </mesh>
        </Pcb>
      );
    case 'guva':
      return (
        <Pcb size={[0.11, 0.17, 0.02]} color="#6d28d9" highlighted={highlighted}>
          <mesh position={[0, 0.03, 0.02]}>
            <boxGeometry args={[0.035, 0.035, 0.02]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
        </Pcb>
      );
    case 'mq2':
      return (
        <Pcb size={[0.2, 0.13, 0.02]} color="#1e3a8a" highlighted={highlighted}>
          <mesh position={[0.02, 0, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.07, 24]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.3} />
          </mesh>
        </Pcb>
      );
    case 'inmp441':
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.02, 32]} />
            <meshStandardMaterial color="#111827" roughness={0.5} emissive={highlighted ? '#22c55e' : '#000000'} emissiveIntensity={highlighted ? 0.45 : 0} />
          </mesh>
          <mesh position={[0, 0, 0.015]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.012, 16]} />
            <meshStandardMaterial color="#d4d4d8" metalness={0.6} />
          </mesh>
        </group>
      );
    case 'lm35':
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.06, 16, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#0f172a" emissive={highlighted ? '#22c55e' : '#000000'} emissiveIntensity={highlighted ? 0.6 : 0} />
          </mesh>
          <mesh position={[0, -0.02, -0.05]}>
            <boxGeometry args={[0.1, 0.05, 0.08]} />
            <meshStandardMaterial color="#27272a" />
          </mesh>
        </group>
      );
    case 'max30102':
      return (
        <Pcb size={[0.11, 0.09, 0.018]} color="#7c3aed" highlighted={highlighted}>
          <mesh position={[0, 0, 0.014]}>
            <boxGeometry args={[0.04, 0.03, 0.012]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        </Pcb>
      );
    case 'led': {
      const color = LED_COLORS[ledState] ?? LED_COLORS.SAFE;
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 24]} />
            <meshStandardMaterial color="#d4d4d8" />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <sphereGeometry args={[0.035, 24, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0, 0.12]} color={color} intensity={0.6} distance={0.8} />
        </group>
      );
    }
    case 'button':
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.025, 32]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
          <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.055, 0.04, 32]} />
            <meshStandardMaterial color="#dc2626" roughness={0.35} emissive={highlighted ? '#ef4444' : '#7f1d1d'} emissiveIntensity={highlighted ? 0.8 : 0.25} />
          </mesh>
        </group>
      );
    case 'gps':
      return (
        <Pcb size={[0.2, 0.2, 0.02]} color="#1e3a8a">
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.13, 0.13, 0.02]} />
            <meshStandardMaterial color="#d6d3d1" roughness={0.7} />
          </mesh>
        </Pcb>
      );
    default:
      return null;
  }
}

export function HelmetModel({ components, inactive, selectedId, ledState }) {
  const shell = useMemo(createShellGeometry, []);
  const brim = useMemo(createBrimGeometry, []);
  const ridge = useMemo(createRidgeGeometry, []);
  const placed = useMemo(
    () =>
      [...components, ...inactive].map((c) => {
        const { point, normal } = placeComponent(c, INTERIOR.has(c.id));
        return { id: c.id, point, quaternion: faceQuaternion(normal) };
      }),
    [components, inactive],
  );

  const harnessY = SHELL.center.y - 0.06;

  return (
    <group>
      {/* Shell, brim and ridge */}
      <mesh geometry={shell} castShadow receiveShadow>
        <meshPhysicalMaterial color="#f3f4f1" roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={brim} castShadow receiveShadow>
        <meshPhysicalMaterial color="#eceee9" roughness={0.42} clearcoat={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={ridge} castShadow>
        <meshPhysicalMaterial color="#f7f8f5" roughness={0.35} clearcoat={0.6} />
      </mesh>

      {/* Accessory band around the lower shell */}
      <mesh position={[0, SHELL.center.y + 0.1, 0]} scale={[1, 1, SHELL.radii.z / SHELL.radii.x]}>
        <cylinderGeometry args={[1.012, 1.02, 0.14, 96, 1, true]} />
        <meshStandardMaterial color="#e4e6e1" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Suspension harness, crown straps and chin strap (interior) */}
      <mesh position={[0, harnessY, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.86, 1, 1]}>
        <torusGeometry args={[0.9, 0.035, 12, 96]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.8} />
      </mesh>
      {[0, Math.PI / 2].map((rot) => (
        <mesh key={rot} position={[0, harnessY + 0.02, 0]} rotation={[0, rot, 0]} scale={[0.78, 0.62, 0.9]}>
          <torusGeometry args={[0.9, 0.02, 8, 64, Math.PI]} />
          <meshStandardMaterial color="#52525b" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, harnessY, 0.12]} rotation={[0, 0, Math.PI]} scale={[0.8, 0.72, 1]}>
        <torusGeometry args={[0.85, 0.022, 8, 64, Math.PI]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} />
      </mesh>

      {/* Components */}
      {placed.map((p) => (
        <group key={p.id} position={p.point} quaternion={p.quaternion} scale={1.35}>
          <ComponentMesh id={p.id} highlighted={p.id === selectedId} ledState={ledState} />
        </group>
      ))}
    </group>
  );
}
