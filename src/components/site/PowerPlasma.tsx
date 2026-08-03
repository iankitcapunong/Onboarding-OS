"use client";

import { useEffect, useRef } from "react";

/* Tungster plasma background: a fullscreen WebGL quad running the
   flowing plasma-lines fragment shader — purple/blue lineColor,
   overallSpeed 0.2, iTime-driven lines with drawCircle particles.
   No static gradients; the motion is the background. Lifecycle
   (reduced motion, resize, tab visibility, context loss) mirrors the
   other background scenes in this folder. */

const VERTEX_SHADER = `
attribute vec2 aVertexPosition;
void main() {
  gl_Position = vec4(aVertexPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float iTime;
uniform vec2 iResolution;

#define overallSpeed 0.2
#define gridSmoothWidth 0.015
#define scale 5.0
#define lineColor vec4(0.4, 0.2, 0.8, 1.0)
#define bgColor1 (lineColor * 0.12)
#define bgColor2 (lineColor * 0.03)
#define minLineWidth 0.02
#define maxLineWidth 0.5
#define lineSpeed (1.0 * overallSpeed)
#define lineAmplitude 1.0
#define lineFrequency 0.2
#define warpSpeed (0.2 * overallSpeed)
#define warpFrequency 0.5
#define warpAmplitude 1.0
#define offsetFrequency 0.5
#define offsetSpeed (1.33 * overallSpeed)
#define minOffsetSpread 0.6
#define maxOffsetSpread 2.0
#define linesPerGroup 16

#define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
#define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
#define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))

float random(float t) {
  return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
}

float getPlasmaY(float x, float horizontalFade, float offset) {
  return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 space = (gl_FragCoord.xy - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

  float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
  float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

  space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
  space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

  vec4 lines = vec4(0.0);

  for (int l = 0; l < linesPerGroup; l++) {
    float normalizedLineIndex = float(l) / float(linesPerGroup);
    float offsetTime = iTime * offsetSpeed;
    float offsetPosition = float(l) + space.x * offsetFrequency;
    float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
    float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
    float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
    float linePosition = getPlasmaY(space.x, horizontalFade, offset);
    float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

    float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
    vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
    float circle = drawCircle(circlePosition, 0.01, space) * 4.0;

    line = line + circle;
    lines += line * lineColor * rand;
  }

  gl_FragColor = mix(bgColor1, bgColor2, uv.x);
  gl_FragColor *= verticalFade;
  gl_FragColor += lines;
  gl_FragColor.a = 1.0;
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function PowerPlasma() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return; // WebGL unavailable — the black backdrop stays

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    container.appendChild(canvas);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aVertexPosition = gl.getAttribLocation(program, "aVertexPosition");
    gl.enableVertexAttribArray(aVertexPosition);
    gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "iTime");
    const uResolution = gl.getUniformLocation(program, "iResolution");

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reduceMq.matches;
    let rafId: number | null = null;
    const t0 = performance.now();

    function resize() {
      if (!gl) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    }
    resize();

    function draw(timeSeconds: number) {
      if (!gl) return;
      gl.uniform1f(uTime, timeSeconds);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function frame() {
      rafId = requestAnimationFrame(frame);
      draw((performance.now() - t0) / 1000);
    }

    function startMotion() {
      if (!rafId) frame();
    }

    function stopMotion() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    if (reduced) {
      draw(8.0); // a single, pleasant static frame
    } else {
      startMotion();
    }

    function onReduceChange() {
      reduced = reduceMq.matches;
      if (reduced) {
        stopMotion();
        draw(8.0);
      } else {
        startMotion();
      }
    }
    reduceMq.addEventListener("change", onReduceChange);

    function onResize() {
      resize();
      if (reduced) draw(8.0);
    }
    window.addEventListener("resize", onResize);

    function onVisibilityChange() {
      if (reduced) return;
      if (document.hidden) {
        stopMotion();
      } else {
        startMotion();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // A lost context leaves a frozen frame — drop to the black backdrop
    function onContextLost(e: Event) {
      e.preventDefault();
      stopMotion();
      canvas.remove();
    }
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      stopMotion();
      reduceMq.removeEventListener("change", onReduceChange);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (quad) gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, []);

  return <div className="power-plasma" ref={containerRef} aria-hidden="true" />;
}
