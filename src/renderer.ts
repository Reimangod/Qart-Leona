const FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FEEDBACK_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPrevious;
uniform sampler2D uField;
uniform vec2 uFieldScale;
uniform float uTime;
uniform float uFade;
uniform float uPulse;

float inside(vec2 p) {
  return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
}

void main() {
  vec2 fieldUv = (vUv - 0.5) * uFieldScale + 0.5;
  vec2 texel = vec2(1.0 / 161.0);
  float mask = inside(fieldUv);
  vec4 core = texture(uField, fieldUv) * mask;
  vec4 nearGlow = vec4(0.0);
  vec4 farGlow = vec4(0.0);
  vec2 drift = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 d = vec2(cos(a), sin(a));
    nearGlow += texture(uField, fieldUv + d * texel * 1.5 + drift);
    farGlow += texture(uField, fieldUv + d * texel * 4.5 - drift);
  }
  nearGlow *= 0.125 * mask;
  farGlow *= 0.125 * mask;
  vec3 previous = texture(uPrevious, vUv).rgb * uFade;
  float interferenceVoid = max(0.0, farGlow.a - core.a * 1.7);
  // Keep the existing wave shape: continuous contrast, without contour lines or a cutoff.
  float coreLight = pow(core.a, 1.25);
  vec3 quantumLight = core.rgb * coreLight * 0.31;
  quantumLight += nearGlow.rgb * nearGlow.a * (0.04 + uPulse * 0.014);
  quantumLight += farGlow.rgb * farGlow.a * 0.0045;
  vec3 color = (previous + quantumLight) * (1.0 - interferenceVoid * 0.08);
  outColor = vec4(min(color, vec3(5.0)), 1.0);
}`;

const PRESENT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uTime;
uniform int uCavityCount;
uniform vec3 uCavities[8];

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  vec3 color = texture(uScene, vUv).rgb;
  float darkness = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uCavityCount) break;
    vec3 cavity = uCavities[i];
    vec2 delta = vUv - cavity.xy;
    float radius = 0.025 + cavity.z * 0.065;
    float hole = 1.0 - smoothstep(0.0, radius, length(delta));
    darkness *= 1.0 - hole * min(0.72, 0.24 + cavity.z * 0.46);
  }
  color *= darkness;
  color = vec3(1.0) - exp(-color * 1.24);
  color = pow(color, vec3(0.88));
  float vignette = 1.0 - smoothstep(0.18, 0.92, length((vUv - 0.5) * vec2(1.0, 0.78)));
  float grain = (hash(gl_FragCoord.xy + uTime * 17.0) - 0.5) * 0.012;
  color *= 0.24 + vignette * 0.76;
  color += grain;
  color = mix(vec3(0.003, 0.012, 0.016), color, 0.96);
  outColor = vec4(color, 1.0);
}`;

const LINE_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec4 aColor;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vColor; }`;

const BLOOM_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aSize;
layout(location = 2) in float aPhase;
layout(location = 3) in float aPetals;
layout(location = 4) in vec3 aColor;
out float vPhase;
out float vPetals;
out vec3 vColor;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  gl_PointSize = aSize;
  vPhase = aPhase;
  vPetals = aPetals;
  vColor = aColor;
}`;

const BLOOM_FRAGMENT = `#version 300 es
precision highp float;
in float vPhase;
in float vPetals;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float outerDistance = 10.0;
  float innerDistance = 10.0;
  float outerFiber = 0.0;
  float outerTip = 0.0;
  float rotation = vPhase * 0.16;
  for (int i = 0; i < 8; i++) {
    float angle = rotation + float(i) * 0.7853981634;
    vec2 radial = vec2(cos(angle), sin(angle));
    vec2 tangent = vec2(-radial.y, radial.x);
    float u = dot(p, radial);
    float v = dot(p, tangent);
    float along = clamp((u - 0.13) / 0.77, 0.0, 1.0);
    float halfWidth = 0.205 * pow(max(0.0, sin(along * 3.1415926536)), 0.72);
    float radialEdge = max(0.13 - u, u - 0.9);
    float petalDistance = max(radialEdge, abs(v) - halfWidth);
    if (petalDistance < outerDistance) {
      outerDistance = petalDistance;
      outerFiber = pow(0.5 + 0.5 * cos(v * 175.0), 22.0);
      outerTip = smoothstep(0.73, 0.9, u);
    }

    float innerAngle = angle + 0.3926990817;
    vec2 innerRadial = vec2(cos(innerAngle), sin(innerAngle));
    vec2 innerTangent = vec2(-innerRadial.y, innerRadial.x);
    float innerU = dot(p, innerRadial);
    float innerV = dot(p, innerTangent);
    float innerAlong = clamp((innerU - 0.15) / 0.52, 0.0, 1.0);
    float innerHalfWidth = 0.112 * pow(max(0.0, sin(innerAlong * 3.1415926536)), 0.78);
    float innerRadialEdge = max(0.15 - innerU, innerU - 0.67);
    innerDistance = min(innerDistance, max(innerRadialEdge, abs(innerV) - innerHalfWidth));
  }

  float outerBody = 1.0 - smoothstep(-0.004, 0.022, outerDistance);
  float outerRim = 1.0 - smoothstep(0.008, 0.034, abs(outerDistance));
  float innerBody = 1.0 - smoothstep(-0.003, 0.018, innerDistance);
  float innerRim = 1.0 - smoothstep(0.006, 0.028, abs(innerDistance));
  float centerDisc = 1.0 - smoothstep(0.205, 0.225, r);
  float innerRing = 1.0 - smoothstep(0.01, 0.032, abs(r - 0.225));
  float outerRing = 1.0 - smoothstep(0.012, 0.036, abs(r - 0.335));
  float centerGlow = exp(-r * r * 58.0);
  float alpha = outerBody * 0.028 + outerRim * 0.2 + outerFiber * outerBody * 0.026;
  alpha += innerBody * 0.035 + innerRim * 0.13;
  alpha += centerDisc * 0.05 + innerRing * 0.2 + outerRing * 0.15 + centerGlow * 0.28;
  if (alpha < 0.008) discard;
  vec3 warmCenter = vec3(1.0, 0.73, 0.32);
  float warmAmount = outerTip * outerRim * 0.65 + outerRing * 0.28 + centerGlow * 0.24;
  vec3 color = mix(vColor, warmCenter, clamp(warmAmount, 0.0, 0.72));
  color *= 0.6 + outerRim * 0.58 + innerRim * 0.4 + centerGlow * 1.45;
  outColor = vec4(color, alpha);
}`;

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const result = gl.createShader(type)!;
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(result) || 'Shader compilation failed');
  }
  return result;
}

function program(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const result = gl.createProgram()!;
  gl.attachShader(result, shader(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(result, shader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(result) || 'Program linking failed');
  }
  return result;
}

function texture(gl: WebGL2RenderingContext, width: number, height: number, data: Uint8Array | null = null) {
  const result = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return result;
}

export type RenderFrame = {
  field: Uint8Array;
  lines: Float32Array;
  lineVertices: number;
  blooms: Float32Array;
  bloomCount: number;
  cavities: Float32Array;
  cavityCount: number;
  pulse: number;
  time: number;
};

export class QuantumRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly feedbackProgram: WebGLProgram;
  private readonly presentProgram: WebGLProgram;
  private readonly lineProgram: WebGLProgram;
  private readonly bloomProgram: WebGLProgram;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly lineVao: WebGLVertexArrayObject;
  private readonly lineBuffer: WebGLBuffer;
  private readonly bloomVao: WebGLVertexArrayObject;
  private readonly bloomBuffer: WebGLBuffer;
  private readonly fieldTexture: WebGLTexture;
  private feedbackTextures: WebGLTexture[] = [];
  private feedbackFbos: WebGLFramebuffer[] = [];
  private readIndex = 0;
  private fieldScale = new Float32Array([1, 1]);

  constructor(private readonly canvas: HTMLCanvasElement, private readonly fieldSize: number) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL 2 is required');
    this.gl = gl;
    this.feedbackProgram = program(gl, FULLSCREEN_VERTEX, FEEDBACK_FRAGMENT);
    this.presentProgram = program(gl, FULLSCREEN_VERTEX, PRESENT_FRAGMENT);
    this.lineProgram = program(gl, LINE_VERTEX, LINE_FRAGMENT);
    this.bloomProgram = program(gl, BLOOM_VERTEX, BLOOM_FRAGMENT);
    this.emptyVao = gl.createVertexArray()!;
    this.fieldTexture = texture(gl, fieldSize, fieldSize, new Uint8Array(fieldSize * fieldSize * 4));

    this.lineVao = gl.createVertexArray()!;
    this.lineBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);

    this.bloomVao = gl.createVertexArray()!;
    this.bloomBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.bloomVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bloomBuffer);
    const stride = 32;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 20);
    gl.bindVertexArray(null);
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    const aspect = width / height;
    this.fieldScale[0] = aspect >= 1 ? 1 : aspect;
    this.fieldScale[1] = aspect >= 1 ? 1 / aspect : 1;
    this.feedbackTextures.forEach((item) => this.gl.deleteTexture(item));
    this.feedbackFbos.forEach((item) => this.gl.deleteFramebuffer(item));
    this.feedbackTextures = [texture(this.gl, width, height), texture(this.gl, width, height)];
    this.feedbackFbos = this.feedbackTextures.map((item) => {
      const fbo = this.gl.createFramebuffer()!;
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, item, 0);
      return fbo;
    });
    this.feedbackFbos.forEach((fbo) => {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
      this.gl.clearColor(0.002, 0.008, 0.011, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    });
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.readIndex = 0;
  }

  clearFeedback() {
    const gl = this.gl;
    this.feedbackFbos.forEach((fbo) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.clearColor(0.002, 0.008, 0.011, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.readIndex = 0;
  }

  render(frame: RenderFrame) {
    const gl = this.gl;
    const writeIndex = 1 - this.readIndex;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.fieldSize, this.fieldSize, gl.RGBA, gl.UNSIGNED_BYTE, frame.field);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.feedbackFbos[writeIndex]);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.feedbackProgram);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.feedbackTextures[this.readIndex]);
    gl.uniform1i(gl.getUniformLocation(this.feedbackProgram, 'uPrevious'), 0);
    gl.uniform1i(gl.getUniformLocation(this.feedbackProgram, 'uField'), 1);
    gl.uniform2fv(gl.getUniformLocation(this.feedbackProgram, 'uFieldScale'), this.fieldScale);
    gl.uniform1f(gl.getUniformLocation(this.feedbackProgram, 'uTime'), frame.time);
    gl.uniform1f(gl.getUniformLocation(this.feedbackProgram, 'uFade'), 0.948);
    gl.uniform1f(gl.getUniformLocation(this.feedbackProgram, 'uPulse'), frame.pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (frame.lineVertices > 0) {
      gl.useProgram(this.lineProgram);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.lines, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, frame.lineVertices);
    }
    if (frame.bloomCount > 0) {
      gl.useProgram(this.bloomProgram);
      gl.bindVertexArray(this.bloomVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bloomBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.blooms, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, frame.bloomCount);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(this.presentProgram);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.feedbackTextures[writeIndex]);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, 'uScene'), 0);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, 'uTime'), frame.time);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, 'uCavityCount'), frame.cavityCount);
    gl.uniform3fv(gl.getUniformLocation(this.presentProgram, 'uCavities[0]'), frame.cavities);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    this.readIndex = writeIndex;
  }
}
