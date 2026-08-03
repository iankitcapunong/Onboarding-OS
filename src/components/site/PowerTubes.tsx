"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/* Power AI — glossy "snake" tube field (docs/power-ai-design.md).
   Real-time recreation of the reference's pre-rendered look: thick
   CatmullRom tubes in a dark clearcoat material, lit indigo / purple
   with a faint warm accent, drifting slowly with mouse parallax.
   Lifecycle handling (reduced motion, resize, tab visibility, context
   loss) mirrors BgGlobe.tsx. */

/* Hand-composed strands, authored on a ~34×24 grid then compressed to
   the actual frustum (fov 45 @ z16 shows only ~21×13 units at z0, so
   the raw coordinates are scaled down at curve-build time — without
   this the strands sit outside the viewport entirely). */
const SCALE_X = 0.75;
const SCALE_Y = 0.65;
const TUBES: { points: [number, number, number][]; radius: number }[] = [
  {
    // upper-left coil — loops over itself like the reference's donut
    points: [
      [-17, 1, -3],
      [-11, 6.5, -2],
      [-5.5, 5, -1.5],
      [-6, -0.5, -1],
      [-11, -1.5, -2],
      [-13.5, 3, -3.2],
      [-10, 7.5, -4.2],
      [-4, 10, -5],
    ],
    radius: 1.5,
  },
  {
    // big S-curve down the right half
    points: [
      [6, 11, -1],
      [9, 4, -0.6],
      [5, 0, -1.2],
      [8, -4, -2],
      [13, -7, -3],
      [17, -10, -3.6],
    ],
    radius: 1.6,
  },
  {
    // right-edge winding vertical
    points: [
      [12.5, 11, -2.4],
      [14.5, 4, -1.4],
      [11, -1, -1.8],
      [13.5, -6, -2.6],
      [10, -11, -3.2],
    ],
    radius: 1.25,
  },
  {
    // bottom-left diagonal strand
    points: [
      [-17, -3.5, -1.2],
      [-9, -6, -1.6],
      [-3, -9, -2.2],
      [4, -12, -2.8],
    ],
    radius: 1.2,
  },
  {
    // faint background thread along the top
    points: [
      [-5, 11.5, -5.4],
      [2, 8.5, -5.8],
      [9, 10.5, -6.2],
      [16, 8, -6.6],
    ],
    radius: 1.05,
  },
];

export function PowerTubes() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceMq.matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL unavailable — leave the CSS backdrop as-is
    }

    const scene = new THREE.Scene();
    // Fades far tubes into the backdrop's near-black indigo
    scene.fog = new THREE.FogExp2(0x050112, 0.026);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 16);

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    /* The reference's glossy gradients are reflections, not diffuse
       lighting — a near-black clearcoat shows nothing under plain
       lights. PMREM a tiny room of over-bright colored panels and use
       it as the environment so every tube catches soft indigo/purple
       bands with a white top highlight. */
    const envScene = new THREE.Scene();
    const envMeshes: THREE.Mesh[] = [];
    const addPanel = (
      color: number,
      intensity: number,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number
    ) => {
      const mat = new THREE.MeshBasicMaterial({ color });
      mat.color.multiplyScalar(intensity);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      envScene.add(mesh);
      envMeshes.push(mesh);
    };
    addPanel(0xf4f1ff, 5, 14, 5, 0, 10, 2); // white key, top
    addPanel(0x6366f1, 3.4, 10, 12, 11, 2, 5); // indigo, right
    addPanel(0xa855f7, 2.8, 10, 12, -11, 0, 3); // purple, left
    addPanel(0x312e81, 2.2, 16, 8, 0, -9, -4); // deep blue, below
    addPanel(0xfcd34d, 1.4, 4, 3, -6, -9, 6); // faint gold kick
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
    envMeshes.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });

    const group = new THREE.Group();
    scene.add(group);

    // Same mobile-GPU concern as the globe: keep segment counts modest
    // on small screens so the context never drops.
    const isMobile = window.innerWidth < 640;
    const tubularSegments = isMobile ? 120 : 220;
    const radialSegments = isMobile ? 18 : 28;

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x141026,
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.3,
      sheen: 0.5,
      sheenColor: new THREE.Color(0x8b8cf8),
    });

    const geometries: THREE.TubeGeometry[] = [];
    const meshes: THREE.Mesh[] = [];
    TUBES.forEach((def) => {
      const curve = new THREE.CatmullRomCurve3(
        def.points.map(
          ([x, y, z]) => new THREE.Vector3(x * SCALE_X, y * SCALE_Y, z)
        )
      );
      const geometry = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        def.radius,
        radialSegments,
        false
      );
      const mesh = new THREE.Mesh(geometry, material);
      geometries.push(geometry);
      meshes.push(mesh);
      group.add(mesh);
    });

    // Directional accents on top of the environment reflections
    scene.add(new THREE.AmbientLight(0x241a3e, 0.9));
    const keyLight = new THREE.DirectionalLight(0x8e8bff, 1.2);
    keyLight.position.set(6, 8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xa855f7, 0.7);
    fillLight.position.set(-8, 2, 4);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x4338ca, 1.0);
    rimLight.position.set(2, -6, -8);
    scene.add(rimLight);

    let time = 0;
    let mouseX = 0;
    let mouseY = 0;
    let scrollOffset = 0;
    let rafId: number | null = null;

    function onMouseMove(e: MouseEvent) {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    function adjustLayout() {
      if (window.innerWidth < 1024) {
        group.scale.set(0.8, 0.8, 0.8);
      } else {
        group.scale.set(1, 1, 1);
      }
    }
    adjustLayout();

    function onScroll() {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      scrollOffset = scrollY * 0.0015;
    }

    function frame() {
      rafId = requestAnimationFrame(frame);
      time += 0.005;

      // Composition is hand-placed, so no continuous spin — just a slow
      // breathing drift, each strand slightly out of phase.
      group.rotation.z = Math.sin(time * 0.6) * 0.02;
      group.position.y = scrollOffset + Math.sin(time) * 0.15;
      meshes.forEach((mesh, i) => {
        mesh.position.y = Math.sin(time * 0.7 + i * 2.1) * 0.18;
        mesh.position.x = Math.cos(time * 0.55 + i * 1.3) * 0.12;
        mesh.rotation.z = Math.sin(time * 0.5 + i * 1.7) * 0.012;
      });

      camera.position.x += (mouseX * 0.7 - camera.position.x) * 0.04;
      camera.position.y += (mouseY * 0.5 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      // DEBUG (?tubesdebug): dump the first frame as a plain <img> —
      // headless screenshots hide the page, which stops compositing the
      // GPU canvas, so this is the only way to see the scene there
      if (
        time <= 0.006 &&
        window.location.search.includes("tubesdebug") &&
        !document.getElementById("tubes-debug-shot")
      ) {
        const img = document.createElement("img");
        img.id = "tubes-debug-shot";
        img.src = renderer.domElement.toDataURL("image/png");
        img.style.cssText =
          "position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:hsl(260,87%,3%)";
        document.body.appendChild(img);
      }
    }

    function startMotion() {
      document.addEventListener("mousemove", onMouseMove);
      window.addEventListener("scroll", onScroll);
      if (!rafId) frame();
    }

    function stopMotion() {
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    if (reduced) {
      renderer.render(scene, camera); // single static frame
    } else {
      startMotion();
    }

    function onReduceChange() {
      reduced = reduceMq.matches;
      if (reduced) {
        stopMotion();
        renderer.render(scene, camera);
      } else {
        startMotion();
      }
    }
    reduceMq.addEventListener("change", onReduceChange);

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      adjustLayout();
      if (reduced) renderer.render(scene, camera);
    }
    window.addEventListener("resize", onResize);

    function onVisibilityChange() {
      if (reduced) return;
      if (document.hidden) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      } else if (!rafId) {
        frame();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // A lost WebGL context leaves the last frame frozen with no
    // recovery — tear the canvas down so the CSS backdrop shows.
    function onContextLost(e: Event) {
      e.preventDefault();
      stopMotion();
      renderer.domElement.remove();
    }
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    return () => {
      stopMotion();
      reduceMq.removeEventListener("change", onReduceChange);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.dispose();
      envRT.dispose();
      geometries.forEach((g) => g.dispose());
      material.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="page-scene" ref={containerRef} aria-hidden="true" />;
}
