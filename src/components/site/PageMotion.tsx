"use client";

import { useEffect } from "react";

/* BSL 2.0 — page-wide decorative motion, ported 1:1 from js/landing.js:
   animated stat counters, scroll-reveal for card grids, and floating
   AI-signal particles in every section. All three scan the DOM by class
   selector on mount and no-op safely if a page has none of the matching
   elements (same guard behavior as the original script). */
export function PageMotion() {
  useEffect(() => {
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Counters that already animated must not replay when the user
    // toggles reduced-motion (each toggle tears down and re-runs setup).
    const countersSeen = new WeakSet<Element>();
    let cleanups: Array<() => void> = [];

    function setup() {
      const prefersReducedMotion = reduceMq.matches;

      /* ---------- Animated counters (results in numbers) ---------- */
      const counters = document.querySelectorAll<HTMLElement>(".count");

      function animateCounter(el: HTMLElement) {
        const target = parseInt(el.getAttribute("data-count") || "0", 10);
        if (prefersReducedMotion) {
          el.textContent = target.toLocaleString();
          return;
        }
        const duration = 1200;
        let start: number | null = null;

        function tick(ts: number) {
          if (start === null) start = ts;
          const p = Math.min((ts - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString();
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }

      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && !countersSeen.has(entry.target)) {
                countersSeen.add(entry.target);
                animateCounter(entry.target as HTMLElement);
                io.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.4 }
        );
        counters.forEach((c) => {
          if (countersSeen.has(c)) return;
          io.observe(c);
        });
        cleanups.push(() => io.disconnect());
      } else {
        counters.forEach(animateCounter);
      }

      /* ---------- Scroll-reveal for cards (staggered per group) ---------- */
      if (!prefersReducedMotion && "IntersectionObserver" in window) {
        const groups = document.querySelectorAll(
          ".grid-3, .steps, .stats-row, .price-side, .faq-list"
        );

        const observed: HTMLElement[] = [];
        const timeouts: number[] = [];
        // A healthy IntersectionObserver delivers an initial callback for
        // every observed target (intersecting or not). If nothing has
        // fired shortly after setup, assume it's broken and force-show
        // everything — hidden-forever content is worse than no reveal.
        let ioFired = false;
        const revealIo = new IntersectionObserver(
          (entries) => {
            ioFired = true;
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const el = entry.target as HTMLElement;
              el.classList.add("in");
              revealIo.unobserve(el);
              // Once revealed, drop the reveal transition so card hover
              // effects respond instantly (no lingering transition-delay).
              const delay = parseFloat(
                el.style.getPropertyValue("--reveal-delay") || "0"
              );
              const t = window.setTimeout(() => {
                el.classList.remove("reveal", "in");
                el.style.removeProperty("--reveal-delay");
              }, 700 + delay * 1000);
              timeouts.push(t);
            });
          },
          { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
        );

        groups.forEach((group) => {
          const items = Array.prototype.filter.call(
            group.children,
            (child: Element) => child.nodeType === 1
          ) as HTMLElement[];
          items.forEach((item, i) => {
            item.classList.add("reveal");
            item.style.setProperty("--reveal-delay", (i * 0.09).toFixed(2) + "s");
            revealIo.observe(item);
            observed.push(item);
          });
        });

        const priceCard = document.querySelector<HTMLElement>(".price-card");
        if (priceCard) {
          priceCard.classList.add("reveal");
          revealIo.observe(priceCard);
          observed.push(priceCard);
        }

        const failsafe = window.setTimeout(() => {
          if (ioFired) return;
          revealIo.disconnect();
          observed.forEach((el) => {
            el.classList.remove("reveal", "in");
            el.style.removeProperty("--reveal-delay");
          });
        }, 1600);
        timeouts.push(failsafe);

        cleanups.push(() => {
          revealIo.disconnect();
          timeouts.forEach((t) => window.clearTimeout(t));
          observed.forEach((el) => {
            el.classList.remove("reveal", "in");
            el.style.removeProperty("--reveal-delay");
          });
        });
      }

      /* ---------- Floating AI-signal particles in every section ---------- */
      if (!prefersReducedMotion) {
        const sections = document.querySelectorAll(
          ".section, .proof-strip, .hero"
        );
        const mobileMq = window.matchMedia("(max-width: 640px)");

        function buildFields() {
          const isMobile = mobileMq.matches;

          sections.forEach((section, sIdx) => {
            const old = section.querySelector(":scope > .float-field");
            if (old) old.remove();

            const field = document.createElement("div");
            field.className = "float-field";
            field.setAttribute("aria-hidden", "true");

            const count = section.classList.contains("proof-strip")
              ? isMobile
                ? 6
                : 10
              : section.classList.contains("hero")
                ? isMobile
                  ? 16
                  : 28
                : isMobile
                  ? 10
                  : 18;
            for (let i = 0; i < count; i++) {
              const node = document.createElement("span");
              const roll = (sIdx * 7 + i) % 2;
              node.className = "float-node" + (roll === 1 ? " violet" : "");
              const size = (isMobile ? 5 : 6) + ((i * 5 + sIdx * 3) % (isMobile ? 6 : 9));
              node.style.width = size + "px";
              node.style.height = size + "px";
              // Client feedback: particles hug the left/right edges so
              // they never drift over headlines or body copy.
              const spread = (i * 13 + sIdx * 17) % 100;
              const left =
                i % 2 === 0 ? 2 + (spread % 12) : 86 + (spread % 11);
              node.style.left = left + "%";
              const sway = (isMobile ? 12 : 18) + ((i * 9) % (isMobile ? 20 : 34));
              node.style.setProperty(
                "--sway",
                ((i + sIdx) % 2 ? 1 : -1) * sway + "px"
              );
              node.style.animationDuration = 11 + ((i * 3 + sIdx) % 9) + "s";
              node.style.animationDelay =
                "-" + (((i * 2.7 + sIdx * 1.3) % 12)).toFixed(1) + "s";
              field.appendChild(node);
            }
            section.appendChild(field);
          });
        }

        buildFields();
        mobileMq.addEventListener("change", buildFields);
        cleanups.push(() => {
          mobileMq.removeEventListener("change", buildFields);
          sections.forEach((section) => {
            const old = section.querySelector(":scope > .float-field");
            if (old) old.remove();
          });
        });
      }
    }

    function teardown() {
      cleanups.forEach((fn) => fn());
      cleanups = [];
    }

    setup();
    // Live listener: toggling the OS "reduce motion" setting takes effect
    // immediately (previously read once at mount, requiring a reload).
    const onReduceChange = () => {
      teardown();
      setup();
    };
    reduceMq.addEventListener("change", onReduceChange);

    return () => {
      reduceMq.removeEventListener("change", onReduceChange);
      teardown();
    };
  }, []);

  return null;
}
