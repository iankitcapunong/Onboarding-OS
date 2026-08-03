import { BgGlobe } from "./BgGlobe";

/* Power AI deep-space layer stack (docs/power-ai-design.md):
   1. base canvas — near-black indigo with ambient glows + 984px halo
   2. particle scene — the motion layer, tinted luminous indigo
   3. darkening veil — pushes the motion layer back behind content
   All three are fixed, z-index 0; DOM order controls the stacking. */
export function PowerBackdrop() {
  return (
    <>
      <div className="power-backdrop" aria-hidden="true" />
      <BgGlobe color={0x8f9bff} />
      <div className="power-veil" aria-hidden="true" />
    </>
  );
}
