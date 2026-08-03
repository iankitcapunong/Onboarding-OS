import { PowerPlasma } from "./PowerPlasma";

/* Tungster background stack: solid black base, WebGL plasma lines,
   then the occlusion pill + veil darkening the focal center so content
   reads clearly over the lines. All fixed at z-index 0; DOM order
   controls the stacking, content sits at z 1+. */
export function PowerBackdrop() {
  return (
    <>
      <div className="power-backdrop" aria-hidden="true" />
      <PowerPlasma />
      <div className="power-occlusion" aria-hidden="true" />
      <div className="power-veil" aria-hidden="true" />
    </>
  );
}
