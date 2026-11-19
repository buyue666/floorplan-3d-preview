"use client";

import { ContactShadows, Edges, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getSurfaceMaterial } from "@/lib/materials/surfaces";
import type { ValidatedFloorPlan } from "@/lib/geometry/types";
import { useActiveRoom, useFloorPlanStore, type RoomDraft } from "@/lib/store/useFloorPlanStore";
import { useRoomAnalysis } from "@/lib/store/useRoomAnalysis";
import { createFloorGeometry, createWallBoxes, createWallGeometry, type WallBox } from "@/lib/three/roomMesh";

export default function ViewerCanvas() {
  const room = useActiveRoom();
  const analysis = useRoomAnalysis(room);
  const select = useFloorPlanStore((state) => state.select);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [12, 14, 12], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => select(null)}
      className="absolute inset-0"
    >
      <color attach="background" args={["#060a12"]} />
      <fog attach="fog" args={["#060a12", 45, 95]} />

      <hemisphereLight args={["#dbe8ff", "#161d2b", 0.85]} />
      <directionalLight
        position={[14, 20, 10]}
        intensity={2.1}
        color="#fff4e2"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <directionalLight position={[-12, 8, -14]} intensity={0.55} color="#8fb2ff" />

      {analysis.ok ? <RoomView room={room} plan={analysis.plan} /> : null}

      <Ground />
      <CameraRig plan={analysis.ok ? analysis.plan : null} />
    </Canvas>
  );
}

function Ground() {
  return (
    <group>
      <Grid
        position={[0, -0.012, 0]}
        args={[60, 60]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#1a2740"
        sectionSize={2.5}
        sectionThickness={1.1}
        sectionColor="#2b4468"
        fadeDistance={50}
        fadeStrength={1.4}
        infiniteGrid
      />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.45} scale={40} blur={2.4} far={9} color="#000000" />
    </group>
  );
}

function CameraRig({ plan }: { plan: ValidatedFloorPlan | null }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (!plan) return;
    const { centroid, boundingBox } = plan.metrics;
    const span = Math.max(boundingBox.maxX - boundingBox.minX, boundingBox.maxY - boundingBox.minY, 3);

    camera.position.set(centroid[0] + span * 0.9, span * 1.05, centroid[1] + span * 1.1);
    camera.updateProjectionMatrix();

    if (controls.current) {
      controls.current.target.set(centroid[0], 0, centroid[1]);
      controls.current.update();
    }
  }, [plan, camera]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={2}
      maxDistance={80}
      maxPolarAngle={Math.PI / 2 - 0.04}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

function RoomView({ room, plan }: { room: RoomDraft; plan: ValidatedFloorPlan }) {
  const floorGeometry = useMemo(() => createFloorGeometry(plan), [plan]);
  useEffect(() => () => floorGeometry.dispose(), [floorGeometry]);

  const floorMaterial = getSurfaceMaterial(room.floorMaterial);
  const wallMaterial = getSurfaceMaterial(room.wallMaterial);
  const walls = useMemo(
    () => createWallBoxes(plan, room.wallHeight, 0.12),
    [plan, room.wallHeight],
  );

  const selection = useFloorPlanStore((state) => state.selection);
  const select = useFloorPlanStore((state) => state.select);

  const floorSelected = selection?.roomId === room.id && selection.surface === "floor";

  return (
    <group position={[0, 0, 0]}>
      <mesh
        geometry={floorGeometry}
        material={floorMaterial}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          select({ roomId: room.id, surface: "floor" });
        }}
      >
        {floorSelected ? <Edges color="#f59e0b" threshold={20} /> : null}
      </mesh>

      {floorSelected ? (
        <mesh geometry={floorGeometry} position={[0, 0.004, 0]}>
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ) : null}

      {walls.map((box) => (
        <WallPanel
          key={box.key}
          box={box}
          material={wallMaterial}
          selected={selection?.wallKey === box.key}
          onSelect={() => select({ roomId: room.id, surface: "wall", wallKey: box.key })}
        />
      ))}
    </group>
  );
}

function WallPanel({
  box,
  material,
  selected,
  onSelect,
}: {
  box: WallBox;
  material: THREE.MeshStandardMaterial;
  selected: boolean;
  onSelect: () => void;
}) {
  const geometry = useMemo(() => createWallGeometry(box), [box]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={box.center}
      rotation={[0, box.rotationY, 0]}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {selected ? <Edges color="#f59e0b" threshold={20} /> : null}
    </mesh>
  );
}
