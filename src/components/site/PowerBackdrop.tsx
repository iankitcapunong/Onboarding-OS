import { PowerVideo } from "./PowerVideo";

/* Power AI deep-space layer stack (docs/power-ai-design.md):
   1. base canvas — near-black indigo, shows until the video fades in
   2. hero video — the template's fluid-tube footage, JS-driven fades
   3. occlusion — 984×527 blurred pill darkening the focal center
   4. darkening veil — keeps scrolled content readable over the video
   All fixed, z-index 0; DOM order controls the stacking. */
export function PowerBackdrop() {
  return (
    <>
      <div className="power-backdrop" aria-hidden="true" />
      <PowerVideo />
      <div className="power-occlusion" aria-hidden="true" />
      <div className="power-veil" aria-hidden="true" />
    </>
  );
}
