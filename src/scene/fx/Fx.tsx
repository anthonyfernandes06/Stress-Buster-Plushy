import { FluffParticles } from './FluffParticles';
import { FireParticles } from './FireParticles';
import { SmokeParticles } from './SmokeParticles';
import { ImpactRings } from './ImpactRings';

export function Fx() {
  return (
    <>
      <SmokeParticles />
      <FluffParticles />
      <FireParticles />
      <ImpactRings />
    </>
  );
}
