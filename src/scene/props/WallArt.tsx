import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { ROOM } from '../../config';

/** Two framed prints on the right wall, painted procedurally. */

function paint(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sunsetPrint() {
  return paint(
    (g, w, h) => {
      g.fillStyle = '#F2E8D7';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#E9A64C';
      g.beginPath();
      g.arc(w * 0.58, h * 0.42, w * 0.2, 0, Math.PI * 2);
      g.fill();
      const hill = (color: string, base: number, amp: number, phase: number) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) g.lineTo(x, h * base - Math.sin((x / w) * Math.PI * 1.2 + phase) * h * amp);
        g.lineTo(w, h);
        g.fill();
      };
      hill('#C9775A', 0.62, 0.08, 0.4);
      hill('#9DB08F', 0.72, 0.07, 2.1);
      hill('#6F8A6A', 0.84, 0.05, 1.2);
    },
    320,
    420,
  );
}

function archPrint() {
  return paint(
    (g, w, h) => {
      g.fillStyle = '#EDE3D2';
      g.fillRect(0, 0, w, h);
      const arch = (color: string, r: number) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(w / 2 - r, h * 0.86);
        g.lineTo(w / 2 - r, h * 0.55);
        g.arc(w / 2, h * 0.55, r, Math.PI, 0);
        g.lineTo(w / 2 + r, h * 0.86);
        g.fill();
      };
      arch('#C9775A', w * 0.36);
      arch('#EDE3D2', w * 0.27);
      arch('#D9A44E', w * 0.2);
      arch('#EDE3D2', w * 0.11);
      g.fillStyle = '#7F9A78';
      g.beginPath();
      g.arc(w * 0.74, h * 0.2, w * 0.07, 0, Math.PI * 2);
      g.fill();
    },
    300,
    400,
  );
}

function Frame({ z, y, w, h, art }: { z: number; y: number; w: number; h: number; art: CanvasTexture }) {
  const oak = useMemo(() => new MeshStandardMaterial({ color: '#C89463', roughness: 0.6 }), []);
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#FAF6EF', roughness: 0.9 }), []);
  const print = useMemo(() => new MeshStandardMaterial({ map: art, roughness: 0.85 }), [art]);
  const x = ROOM.halfWidth - 0.025;
  return (
    <group position={[x, y, z]} rotation={[0, -Math.PI / 2, 0]}>
      <RoundedBox args={[w, h, 0.04]} radius={0.012} smoothness={2} material={oak} castShadow receiveShadow />
      <mesh position={[0, 0, 0.021]} material={mat}>
        <planeGeometry args={[w - 0.07, h - 0.07]} />
      </mesh>
      <mesh position={[0, 0, 0.022]} material={print}>
        <planeGeometry args={[w * 0.66, h * 0.7]} />
      </mesh>
    </group>
  );
}

export function WallArt() {
  const a = useMemo(sunsetPrint, []);
  const b = useMemo(archPrint, []);
  return (
    <group>
      <Frame z={-3.05} y={2.05} w={0.86} h={1.12} art={a} />
      <Frame z={-1.85} y={1.85} w={0.68} h={0.9} art={b} />
    </group>
  );
}
