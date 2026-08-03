import { PowerPlasma } from "./PowerPlasma";

/* Tungster background stack: solid black base with the WebGL plasma
   lines above it (purple/blue, PowerPlasma.tsx). Both fixed at
   z-index 0; DOM order controls the stacking, content sits at z 1+. */
export function PowerBackdrop() {
  return (
    <>
      <div className="power-backdrop" aria-hidden="true" />
      <PowerPlasma />
    </>
  );
}
