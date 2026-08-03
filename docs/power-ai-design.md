---
version: 1.0.0
name: Power AI Visual Language
description: A premium cinematic UI system characterized by ultra-large typography, fluid video backgrounds, and liquid glass surfaces.
colors:
  background: "hsl(260, 87%, 3%)"
  foreground: "hsl(40, 6%, 95%)"
  hero-sub: "hsl(40, 6%, 82%)"
  indigo-accent: "#6366f1"
  purple-accent: "#a855f7"
  gold-accent: "#fcd34d"
  glass-border: "rgba(255, 255, 255, 0.15)"
  overlay-blur: "rgba(3, 7, 18, 0.9)"
typography:
  display:
    family: "General Sans"
    weight: "400"
    size: "220px"
    lineHeight: "1.02"
    letterSpacing: "-0.024em"
  body:
    family: "Geist Sans"
    weight: "400"
    size: "18px"
    lineHeight: "2rem"
  nav:
    family: "Geist Sans"
    weight: "500"
    size: "14px"
  brand:
    family: "Geist Sans"
    weight: "500"
    size: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  hero-gap: "25px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "999px"
components:
  navbar:
    position: "relative"
    z-index: "20"
    layout: "flex-between"
    divider: "gradient-border"
  hero-button:
    rounding: "full"
    background: "rgba(255, 255, 255, 0.05)"
    blur: "8px"
    padding: "24px 29px"
  liquid-glass-icon:
    blur: "4px"
    border: "1.4px custom-gradient"
    aspect-ratio: "1/1"
  marquee:
    mask: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)"
    speed: "20s"
motion:
  marquee: "linear infinite scroll"
  video-fade: "0.5s fade-in/out via JS requestAnimationFrame"
  hover-lift: "translateY(-1px) 0.2s ease-in-out"
---
## Overview
The Power AI system uses a deep-space aesthetic to project authority and technological sophistication. It prioritizes motion and depth through background video layers, glassmorphism, and extreme contrast in typography sizing.

## Colors
The palette is rooted in a deep Indigo-Black background (`hsl(260, 87%, 3%)`) with warm, off-white foregrounds. Accents are primarily provided by a tri-color gradient (Indigo to Gold) used exclusively for branding and primary emphasis.

## Typography
- **Display 1**: Used for the 'Power AI' lockup. At 220px, it dominates the viewport. Uses General Sans for a clean, professional finish.
- **Body Text**: Utilizes Geist Sans for readability. Sub-headers use a specific `hero-sub` color to soften contrast and guide visual hierarchy.

## Spacing
A customized 8pt grid is used, with specific deviations like `25px` and `29px` for hero elements to create a bespoke, non-standardized feel that mimics high-end editorial design.

## Layout
- **Layer Stack**:
  1. Background Video (Bottom)
  2. Darkened Blur Overlay (Mid-back)
  3. Main Content (Foreground)
  4. Sticky/Relative Nav (Top)
- **Z-Indexing**: Content is kept at `z-10`, while navigation and interactive elements sit at `z-20` to ensure interaction priority over background effects.

## Elevation & Depth
Depth is achieved through `backdrop-filter: blur(8px)` and a custom `liquid-glass` utility. The system avoids traditional dropshadows in favor of `inner-shadow` and `mask-composite` borders to simulate real glass edges.

## Shapes
- **Interactive Elements**: Buttons and pills use a `rounded-full` (999px) treatment for a modern SaaS look.
- **Structural Elements**: Icon containers and cards use a soft `8px` or `12px` radius.
- **Environmental Shapes**: A large `984px` radial blur shape is used in the background to focus attention on the center of the screen.

## Components
- **Hero Video**: Uses a custom JS-controlled opacity loop to ensure perfectly smooth crossfades between video cycles.
- **Navbar**: Features a gradient-mask divider (`transparent -> foreground/20 -> transparent`) rather than a solid line.
- **Marquee**: An infinite horizontal loop with a CSS linear-gradient mask to fade the edges of the scrolling brand list.
- **Liquid Glass**: A complex utility using `mask-composite: exclude` to create a thin, high-fidelity light-catching border on icons.

## Motion
- **Continuous**: The brand marquee moves at a steady `20s` pace, pausing on hover to allow user inspection.
- **Micro-interactions**: Buttons feature a subtle `translateY(-1px)` lift to indicate interactivity.
- **Atmospheric**: Background video transitions are handled with hardware-accelerated opacity to maintain 60fps.

## Do's and Don'ts
- **Do**: Use high-contrast font sizes (e.g., 220px vs 18px) to create drama.
- **Do**: Use the tri-color gradient strictly for the "AI" mark or primary highlights.
- **Don't**: Use solid borders; always prefer glass effects or gradient dividers.
- **Don't**: Over-saturate the background; keep the primary canvas near-black.

## Accessibility
- **Interactive Targets**: Nav items and buttons maintain a minimum height for touch/click ergonomics.
- **Contrast**: Text uses `foreground/90` and `hero-sub` to maintain WCAG-compliant contrast against the dark background.
- **Reduced Motion**: Marquee animation should respect `prefers-reduced-motion` in future iterations.
