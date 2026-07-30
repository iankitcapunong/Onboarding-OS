"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/* BSL 2.0 — noise-distorted particle sphere background (Three.js)
   Ported 1:1 from js/bg-globe.js: an icosahedron rendered as GPU-displaced
   points (simplex noise vertex shader, soft circular sprites in the
   fragment shader), with mouse parallax and a responsive position/scale
   so it doesn't collide with centered hero text on narrow viewports. */

const VERTEX_SHADER = `
uniform float uTime;
uniform float uDistortion;
uniform float uSize;
uniform float uDetail;
uniform vec2 uMouse;
varying float vNoise;
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
void main() {
    vec3 pos = position;
    float noise = snoise(vec3(pos.x * uDetail + uTime * 0.1, pos.y * uDetail, pos.z * uDetail));
    vNoise = noise;
    vec3 newPos = pos + (normalize(pos) * noise * uDistortion);
    float dist = distance(uMouse * 10.0, newPos.xy);
    float interaction = smoothstep(5.0, 0.0, dist);
    newPos += normalize(pos) * interaction * 0.5;
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * (24.0 / -mvPosition.z) * (1.0 + noise * 0.5);
    vNoise = noise;
}
`;

const FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vNoise;
void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.2, dist) * uOpacity;
    vec3 darkColor = uColor * 0.3;
    vec3 lightColor = uColor;
    vec3 finalColor = mix(darkColor, lightColor, vNoise * 0.5 + 0.5);
    gl_FragColor = vec4(finalColor, alpha);
}
`;

export function BgGlobe() {
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
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.035);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 18);

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const systemsGroup = new THREE.Group();
    scene.add(systemsGroup);

    // Mobile GPUs choke on the full-detail point cloud (a common cause of
    // context loss → permanently frozen frame); halve the subdivision.
    const geometry = new THREE.IcosahedronGeometry(
      5.0,
      window.innerWidth < 640 ? 16 : 30
    );

    const uniforms = {
      uTime: { value: 0 },
      uDistortion: { value: 0.9 },
      uSize: { value: 2.4 },
      uDetail: { value: 0.8 },
      uColor: { value: new THREE.Color(0xfafafa) },
      uOpacity: { value: 0.8 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const particles = new THREE.Points(geometry, material);
    systemsGroup.add(particles);

    let time = 0;
    let mouseX = 0;
    let mouseY = 0;
    let rafId: number | null = null;

    function onMouseMove(e: MouseEvent) {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
      uniforms.uMouse.value.x += (mouseX - uniforms.uMouse.value.x) * 0.05;
      uniforms.uMouse.value.y += (mouseY - uniforms.uMouse.value.y) * 0.05;
    }

    function adjustLayout() {
      if (window.innerWidth < 1024) {
        systemsGroup.position.set(0, 0, -6);
        systemsGroup.scale.set(0.8, 0.8, 0.8);
      } else {
        systemsGroup.position.set(0, 0, -2);
        systemsGroup.scale.set(1, 1, 1);
      }
    }
    adjustLayout();

    function onScroll() {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      systemsGroup.position.y = scrollY * 0.002;
    }

    function frame() {
      rafId = requestAnimationFrame(frame);
      time += 0.01;

      systemsGroup.rotation.y = time * 0.05;
      systemsGroup.rotation.z = Math.sin(time * 0.1) * 0.05;

      camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
      camera.position.y += (mouseY * 0.5 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      uniforms.uTime.value = time;
      renderer.render(scene, camera);
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
      renderer.render(scene, camera); // single static frame, no ongoing animation
    } else {
      startMotion();
    }

    // Live listener — toggling the OS "reduce motion" setting takes
    // effect without a reload (previously read once at mount).
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

    // A lost WebGL context leaves the last frame frozen on screen with no
    // recovery — tear the canvas down instead so the CSS backdrop shows.
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
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="page-scene" ref={containerRef} aria-hidden="true" />;
}
