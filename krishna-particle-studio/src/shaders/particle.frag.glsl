uniform float uGlow;
uniform float uOpacity;

varying vec3 vColor;
varying float vBrightness;
varying float vShimmer;
varying float vOpacity;
varying float vLum;
varying float vImportance;
varying float vProximityGlow;
varying float vDepth;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float m = max(abs(c.x), abs(c.y));
  if (m > 0.5) discard;

  // 3D Spherical Normal Calculation for volumetric orb lighting
  float distSq = clamp(dot(c, c) * 4.0, 0.0, 1.0);
  float normalZ = sqrt(max(0.0, 1.0 - distSq));
  vec3 normal = normalize(vec3(c.x * 2.0, -c.y * 2.0, normalZ));

  // Subtle 3D Directional Light (top-left front aesthetic studio key light)
  vec3 lightDir = normalize(vec3(-0.35, 0.55, 0.76));
  float diffuse = mix(0.72, 1.0, max(0.0, dot(normal, lightDir)));

  // Glossy 3D Specular Highlight at particle core
  vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(0.0, dot(normal, halfDir)), 14.0) * (0.3 + vImportance * 0.5);

  // Depth attenuation factor (smooth atmospheric depth perception)
  float depthFactor = mix(1.0, 0.82, vDepth);

  // Glowing particle fragment profile
  float square = 1.0 - smoothstep(0.35, 0.50, m);
  
  // Dynamic glow halo boosting brightness & radiant aura when particles come close
  float activeGlow = uGlow + vProximityGlow * 1.25;
  float halo = pow(1.0 - smoothstep(0.12, 0.75, length(c)), 1.8) * (0.35 + activeGlow * 0.65) * (vLum + vImportance * 0.4);

  float alpha = clamp(square * 0.70 + halo, 0.0, 1.0) * vOpacity * uOpacity * vShimmer * depthFactor;
  
  // Warm golden luminous bloom during particle assembly convergence + 3D specular highlight
  vec3 baseColor = vColor * (vBrightness + vProximityGlow * 0.45) * diffuse;
  vec3 specColor = vec3(0.95, 0.92, 1.0) * spec * (0.4 + vLum * 0.6);
  vec3 colorBoost = baseColor + specColor + vec3(0.15, 0.12, 0.05) * vProximityGlow * (vLum + 0.2);

  gl_FragColor = vec4(colorBoost, alpha);
}
