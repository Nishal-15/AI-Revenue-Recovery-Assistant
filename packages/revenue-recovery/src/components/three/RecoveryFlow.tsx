import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/*
 * At-risk bookings (coral / amber orbs) drift in from the left, converge,
 * turn emerald and pass through the teal "recovered" ring.
 * Rendered with one instanced mesh, so it stays cheap next to the dashboard.
 */

const ORB_COUNT = 70;
const START_X = -4.6;
const RING_X = 2.4;
const TRAVEL = RING_X - START_X;

const MISSED = new THREE.Color("#f26b5b");
const RISK = new THREE.Color("#f59e0b");
const RECOVERED = new THREE.Color("#10b981");

type Orb = { progress: number; speed: number; laneY: number; laneZ: number; phase: number; startColor: THREE.Color };

const createOrbs = (): Orb[] =>
  Array.from({ length: ORB_COUNT }, (_, index) => ({
    progress: Math.random(),
    speed: 0.07 + Math.random() * 0.06,
    laneY: (Math.random() - 0.5) * 2.6,
    laneZ: (Math.random() - 0.5) * 1.6,
    phase: Math.random() * Math.PI * 2,
    startColor: index % 3 === 0 ? RISK : MISSED,
  }));

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

const Orbs = ({ animate }: { animate: boolean }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const orbs = useMemo(createOrbs, []);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const step = animate ? Math.min(delta, 0.05) : 0;
    const time = state.clock.elapsedTime;

    orbs.forEach((orb, index) => {
      orb.progress = (orb.progress + step * orb.speed) % 1;
      const converge = 1 - easeInOut(orb.progress);
      const wobble = Math.sin(time * 1.4 + orb.phase) * 0.06 * converge;

      transform.position.set(
        START_X + orb.progress * TRAVEL,
        orb.laneY * converge + wobble,
        orb.laneZ * converge,
      );
      const fadeIn = smoothstep(0, 0.08, orb.progress);
      const fadeOut = 1 - smoothstep(0.93, 1, orb.progress);
      transform.scale.setScalar(0.11 * fadeIn * fadeOut + 0.0001);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);

      color.copy(orb.startColor).lerp(RECOVERED, smoothstep(0.5, 0.82, orb.progress));
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, ORB_COUNT]}>
      <sphereGeometry args={[1, 20, 20]} />
      <meshStandardMaterial roughness={0.35} metalness={0.05} />
    </instancedMesh>
  );
};

const RecoveredRing = ({ animate }: { animate: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current || !animate) return;
    const time = state.clock.elapsedTime;
    groupRef.current.rotation.x = Math.sin(time * 0.5) * 0.12;
    groupRef.current.rotation.z = time * 0.25;
  });

  return (
    <group position={[RING_X, 0, 0]} rotation={[0, Math.PI / 2.3, 0]}>
      <group ref={groupRef}>
        <mesh>
          <torusGeometry args={[0.85, 0.075, 32, 96]} />
          <meshStandardMaterial color="#0e9f9a" emissive="#0e9f9a" emissiveIntensity={0.25} roughness={0.25} />
        </mesh>
        <mesh>
          <torusGeometry args={[1.12, 0.018, 16, 96]} />
          <meshStandardMaterial color="#9fe3d6" transparent opacity={0.8} />
        </mesh>
      </group>
      <mesh>
        <circleGeometry args={[0.8, 48]} />
        <meshBasicMaterial color="#ddf4f1" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const RecoveryFlow = () => {
  const animate = !prefersReducedMotion();

  return (
    <Canvas
      camera={{ position: [-0.6, 0.4, 6.2], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={animate ? "always" : "demand"}
      aria-hidden
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <directionalLight position={[-4, -2, 2]} intensity={0.35} color="#bdeee6" />
      <Orbs animate={animate} />
      <RecoveredRing animate={animate} />
    </Canvas>
  );
};

export default RecoveryFlow;
