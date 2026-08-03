import { PowerTubes } from "./PowerTubes";

/* Power AI deep-space layer stack (docs/power-ai-design.md):
   1. base canvas — near-black indigo with ambient glows + 984px halo
   2. tube scene — glossy winding "snake" strands, the motion layer
   3. darkening veil — pushes the motion layer back behind content
   All three are fixed, z-index 0; DOM order controls the stacking. */
export function PowerBackdrop() {
  return (
    <>
      <div className="power-backdrop" aria-hidden="true" />
      <PowerTubes />
      <div className="power-veil" aria-hidden="true" />
    </>
  );
}
