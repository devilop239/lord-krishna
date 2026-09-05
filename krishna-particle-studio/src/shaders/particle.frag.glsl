uniform float uGlow;
uniform float uOpacity;

varying vec3 vColor;
varying float vBrightness;
varying float vShimmer;
varying float vOpacity;
varying float vLum;
varying float vImportance;
varying float vProximityGlow;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float m = max(abs(c.x), abs(c.y));
  if (m > 0.5) discard;

  // Glowing particle fragment profile synced with official source image
  float square = 1.0 - smoothstep(0.35, 0.50, m);
  
  // Dynamic glow halo boosting brightness & radiant aura when particles come close
  float activeGlow = uGlow + vProximityGlow * 1.25;
  float halo = pow(1.0 - smoothstep(0.12, 0.75, length(c)), 1.8) * (0.35 + activeGlow * 0.65) * (vLum + vImportance * 0.4);

  float alpha = clamp(square * 0.70 + halo, 0.0, 1.0) * vOpacity * uOpacity * vShimmer;
  
  // Warm golden luminous bloom during particle assembly convergence
  vec3 colorBoost = vColor * (vBrightness + vProximityGlow * 0.45) + vec3(0.15, 0.12, 0.05) * vProximityGlow * (vLum + 0.2);

  gl_FragColor = vec4(colorBoost, alpha);
}
