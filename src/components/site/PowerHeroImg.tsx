/* Tungster hero image — the chrome-face asset rendered at 60% opacity
   over the plasma canvas so the shader lines glow through it. Absolute
   inside the hero section, so it scrolls away with the first screen. */

const HERO_IMG =
  "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/5b2b94ae-4a0b-458d-b838-58b0fb5fadfd_3840w.webp";

export function PowerHeroImg() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="power-hero-img" src={HERO_IMG} alt="" aria-hidden="true" />
  );
}
