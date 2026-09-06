export const logoIntroVertShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const logoIntroFragShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSymbolIllum;      // 0.0 -> 1.0 center symbol illumination front
  uniform float uFeatherSway;      // Subtle feather micro-motion (0..1)
  uniform float uFluteSweepPos;    // Flute sweep X position (0..1)
  uniform float uFluteSweepActive; // 0..1
  uniform float uTextSweepPos;     // Text sweep X position (0..1)
  uniform float uTextSweepActive;  // 0..1
  uniform float uTextRevealed;     // 0..1 overall text reveal
  uniform float uAmbientGlow;      // Divine breathing aura intensity

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 symbolCenter = vec2(0.50, 0.53);

    // 1. Gentle Peacock Feather Micro-Motion (upper section only)
    float featherMask = smoothstep(0.46, 0.88, uv.y) * (1.0 - smoothstep(0.38, 0.50, abs(uv.x - 0.5)));
    float swayX = sin(uTime * 1.4 + uv.y * 8.0) * 0.0018 * featherMask * uFeatherSway;
    float swayY = cos(uTime * 1.1 + uv.x * 6.0) * 0.0009 * featherMask * uFeatherSway;
    vec2 sampleUv = uv + vec2(swayX, swayY);

    // Sample logo artwork texture cleanly (NO mandala rotation warp)
    vec4 texColor = texture2D(uTexture, sampleUv);
    if (texColor.a < 0.005 || uOpacity < 0.001) discard;

    // Luminance & color channels
    float lum = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));

    // 2. Central Symbol Radial Illumination Front (center outwards)
    float symbolDist = length(uv - symbolCenter) * 2.1;
    float illumFront = clamp((uSymbolIllum - symbolDist * 0.50) / 0.50, 0.0, 1.0);
    illumFront = smoothstep(0.0, 1.0, illumFront);

    // 3. RADHE RADHE Lettering Region & Golden Sweep Reveal
    float isTextRegion = (1.0 - smoothstep(0.12, 0.38, uv.y)) * (1.0 - smoothstep(0.32, 0.46, abs(uv.x - 0.5)));
    
    // Smooth reveal mask from left-to-right sweep beam
    float textSweepEdge = uTextSweepPos;
    float textRevealedVal = mix(
      smoothstep(uv.x - 0.12, uv.x + 0.02, textSweepEdge),
      1.0,
      uTextRevealed
    );

    // Combine symbol and text visibility masks
    float visibility = mix(illumFront, textRevealedVal, isTextRegion);
    visibility = clamp(visibility, 0.0, 1.0);

    // 4. Golden Flute Specular Traveling Reflection
    float fluteYMask = smoothstep(0.42, 0.46, uv.y) * (1.0 - smoothstep(0.54, 0.58, uv.y)) * (1.0 - smoothstep(0.32, 0.42, abs(uv.x - 0.5)));
    float fluteDist = abs(uv.x - uFluteSweepPos);
    float fluteSpecular = exp(-pow(fluteDist * 14.0, 2.0)) * fluteYMask * uFluteSweepActive;
    vec3 fluteGleam = vec3(1.35, 1.15, 0.65) * fluteSpecular * (0.6 + lum * 0.8);

    // 5. RADHE RADHE Text Golden Sweep Beam Edge Shimmer
    float beamDist = abs(uv.x - uTextSweepPos);
    float textBeamEdge = exp(-pow(beamDist * 18.0, 2.0)) * isTextRegion * uTextSweepActive;
    vec3 textBeamGleam = vec3(1.45, 1.25, 0.70) * textBeamEdge * (0.8 + lum * 0.6);

    // 6. Divine Spiritual Aura Bloom (Warm Golden & Krishna Sapphire Glow)
    vec3 divineGold  = vec3(1.25, 1.08, 0.72);
    vec3 krishnaBlue = vec3(0.30, 0.55, 1.10);
    float auraPulse = sin(uTime * 0.75) * 0.5 + 0.5;
    vec3 auraColor = mix(divineGold, krishnaBlue, auraPulse * 0.35) * uAmbientGlow * 0.18 * lum;

    // Soft luminous gold highlight boost on detailed accents
    float goldHighlight = pow(max(0.0, lum - 0.20), 2.2) * uAmbientGlow * 0.28;

    // Blend base image color with specular sweeps and illumination front
    vec3 illuminatedRgb = texColor.rgb * visibility + fluteGleam + textBeamGleam + auraColor + divineGold * goldHighlight;

    float finalAlpha = texColor.a * uOpacity * max(0.001, visibility);

    gl_FragColor = vec4(illuminatedRgb, finalAlpha);
  }
`;
