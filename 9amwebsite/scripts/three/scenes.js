import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ACCENT = { morning: '#1c93d6', moving: '#ef8443', probate: '#8f68c4', business: '#2fa9bd', planning: '#3f9d78', tenders: '#5f6ad0', post: '#2f95cd', map: '#2f95cd', connect: '#6f7ad8' };

function mat(color, o = {}) { return new THREE.MeshPhysicalMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.42, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.5 }, o)); }
function flat(color, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.5, metalness: 0.0 }, o)); }
function rb(w, h, d, r) { return new RoundedBoxGeometry(w, h, d, 3, Math.max(0.01, Math.min(r, Math.min(w, h, d) / 2.05))); }
function box(w, h, d, r, color, o) { const m = new THREE.Mesh(rb(w, h, d, r ?? 0.06), mat(color, o)); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(rt, rb2, h, color, o, seg = 40) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb2, h, seg), mat(color, o)); m.castShadow = true; m.receiveShadow = true; return m; }
function at(a, x, y, z) { a.position.set(x, y, z); return a; }
function grp(...c) { const g = new THREE.Group(); c.forEach(x => g.add(x)); return g; }

function clock(accent) {
  const g = new THREE.Group();
  const body = cyl(1.05, 1.05, 0.3, '#eef4f9', { roughness: 0.3, clearcoat: 0.7 }); body.rotation.x = Math.PI / 2; g.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.99, 48), flat('#ffffff', { roughness: 0.6 })); face.position.z = 0.16; g.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 18, 72), mat(accent, { roughness: 0.32, clearcoat: 0.8 })); g.add(ring);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const t = new THREE.Mesh(rb(0.055, 0.13, 0.03, 0.015), flat('#93aabc')); t.position.set(Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0.18); t.rotation.z = -a; g.add(t); }
  const hour = new THREE.Mesh(rb(0.08, 0.44, 0.06, 0.035), flat('#22384f')); hour.position.set(-0.21, 0, 0.2); hour.rotation.z = Math.PI / 2; g.add(hour);
  const min = new THREE.Mesh(rb(0.07, 0.66, 0.06, 0.035), flat('#22384f')); min.position.set(0, 0.32, 0.22); g.add(min);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 16), mat(accent)); cap.position.z = 0.24; g.add(cap);
  return g;
}
function envelope(accent, s = 1) {
  const g = new THREE.Group();
  g.add(box(1.9, 1.28, 0.1, 0.04, '#f7fbff', { roughness: 0.5 }));
  const a = box(1.02, 0.075, 0.03, 0.015, accent); at(a, -0.47, 0.3, 0.07); a.rotation.z = -0.62; g.add(a);
  const b = box(1.02, 0.075, 0.03, 0.015, accent); at(b, 0.47, 0.3, 0.07); b.rotation.z = 0.62; g.add(b);
  const stamp = box(0.34, 0.24, 0.02, 0.01, accent); at(stamp, 0.64, -0.42, 0.07); g.add(stamp);
  g.scale.setScalar(s); return g;
}
function pin(accent, s = 1, stretch = 1) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 36, 26), mat(accent, { roughness: 0.26, clearcoat: 0.9 })); head.castShadow = true; at(head, 0, 0.34, 0); g.add(head);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.74, 40), mat(accent, { roughness: 0.26, clearcoat: 0.9 })); at(cone, 0, -0.02, 0); cone.rotation.z = Math.PI; cone.castShadow = true; g.add(cone);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.12, 28), flat('#eaf6ff')); at(hole, 0, 0.34, 0.39); g.add(hole);
  g.scale.set(s, s * stretch, s); return g;
}
function parcel(s = 1, color = '#e8c48f') {
  const g = new THREE.Group();
  g.add(box(0.74, 0.74, 0.74, 0.05, color, { roughness: 0.65 }));
  const t1 = box(0.78, 0.1, 0.16, 0.02, '#f7e6c6'); at(t1, 0, 0.38, 0); g.add(t1);
  const t2 = box(0.16, 0.1, 0.78, 0.02, '#f7e6c6'); at(t2, 0, 0.38, 0); g.add(t2);
  g.scale.setScalar(s); return g;
}
function house(accent) {
  const g = new THREE.Group();
  const body = box(1.9, 1.25, 1.55, 0.09, '#f3f8fc', { roughness: 0.5 }); at(body, 0, 0.63, 0); g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.95, 4), mat(accent, { roughness: 0.4 })); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.84; at(roof, 0, 1.72, 0); roof.castShadow = true; g.add(roof);
  const door = box(0.42, 0.72, 0.07, 0.03, '#1d3b52'); at(door, -0.4, 0.36, 0.8); g.add(door);
  const w1 = box(0.46, 0.4, 0.06, 0.02, '#8fc7e6', { roughness: 0.15, metalness: 0.08 }); at(w1, 0.42, 0.8, 0.8); g.add(w1);
  const w2 = box(0.42, 0.4, 0.06, 0.02, '#8fc7e6', { roughness: 0.15, metalness: 0.08 }); at(w2, -0.4, 0.8, 0.8); g.add(w2);
  return g;
}
function truck(accent) {
  const g = new THREE.Group();
  const cargo = box(2.05, 1.45, 1.55, 0.1, '#f8fbff', { roughness: 0.45 }); at(cargo, -0.5, 1.05, 0); g.add(cargo);
  const stripe = box(2.06, 0.22, 1.57, 0.02, accent); at(stripe, -0.5, 1.05, 0); g.add(stripe);
  const cab = box(1.05, 1.15, 1.55, 0.14, accent, { roughness: 0.38 }); at(cab, 1.2, 0.85, 0); g.add(cab);
  const wind = box(0.14, 0.62, 1.18, 0.03, '#26425a', { roughness: 0.15 }); at(wind, 1.7, 1.02, 0); g.add(wind);
  const base = box(1.1, 0.5, 1.5, 0.1, '#dfeaf2'); at(base, 1.2, 0.35, 0); g.add(base);
  for (const [x, z] of [[-1.05, 0.82], [-1.05, -0.82], [1.45, 0.82], [1.45, -0.82]]) {
    const w = cyl(0.4, 0.4, 0.3, '#22384f', { roughness: 0.7 }, 28); w.rotation.x = Math.PI / 2; at(w, x, 0.4, z); g.add(w);
    const hub = cyl(0.16, 0.16, 0.34, '#9fb4c4', {}, 20); hub.rotation.x = Math.PI / 2; at(hub, x, 0.4, z); g.add(hub);
  }
  return g;
}
function document(accent, s = 1) {
  const g = new THREE.Group();
  g.add(box(1.32, 1.72, 0.08, 0.03, '#ffffff', { roughness: 0.5 }));
  const bar = box(0.86, 0.11, 0.02, 0.01, accent); at(bar, -0.06, 0.64, 0.06); g.add(bar);
  for (let i = 0; i < 4; i++) { const l = box(0.92 - i * 0.13, 0.06, 0.02, 0.01, '#c6d5df'); at(l, -0.03 + i * 0.035, 0.32 - i * 0.24, 0.06); g.add(l); }
  const c = new THREE.Mesh(new THREE.CircleGeometry(0.19, 28), mat(accent, { roughness: 0.35 })); at(c, -0.42, -0.55, 0.07); g.add(c);
  const tick = box(0.1, 0.22, 0.02, 0.01, '#ffffff'); at(tick, -0.42, -0.53, 0.09); tick.rotation.z = 0.5; g.add(tick);
  g.scale.setScalar(s); return g;
}
function folder(accent) {
  const g = new THREE.Group();
  g.add(box(1.55, 1.95, 0.16, 0.05, accent, { roughness: 0.42 }));
  const front = box(1.45, 1.7, 0.09, 0.04, '#eef4fa', { roughness: 0.5 }); at(front, 0.06, -0.05, 0.5); g.add(front);
  const tab = box(0.5, 0.16, 0.17, 0.04, '#ffffff'); at(tab, -0.5, 1.0, 0.05); g.add(tab);
  return g;
}
function key() {
  const g = new THREE.Group(); const gold = { metalness: 0.72, roughness: 0.24, clearcoat: 0.6 };
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.085, 20, 40), mat('#e7cd8c', gold)); bow.castShadow = true; at(bow, -0.55, 0, 0); g.add(bow);
  const shaft = cyl(0.075, 0.075, 0.95, '#e7cd8c', gold, 24); shaft.rotation.z = Math.PI / 2; at(shaft, 0.1, 0, 0); g.add(shaft);
  const t1 = box(0.09, 0.26, 0.12, 0.02, '#e7cd8c', gold); at(t1, 0.45, -0.15, 0); g.add(t1);
  const t2 = box(0.09, 0.18, 0.12, 0.02, '#e7cd8c', gold); at(t2, 0.28, -0.12, 0); g.add(t2);
  return g;
}
function building(accent) {
  const g = new THREE.Group();
  const base = box(2.0, 1.7, 1.7, 0.1, '#f3f8fc', { roughness: 0.5 }); at(base, 0, 0.85, 0); g.add(base);
  const band = box(2.02, 0.3, 1.72, 0.02, accent); at(band, 0, 0.5, 0); g.add(band);
  const glass = box(1.7, 0.66, 0.06, 0.02, '#8fc7e6', { roughness: 0.12, metalness: 0.1 }); at(glass, 0, 1.15, 0.86); g.add(glass);
  const mull = box(0.06, 0.68, 0.08, 0.01, '#ffffff'); at(mull, 0, 1.15, 0.87); g.add(mull);
  const door = box(0.5, 1.0, 0.08, 0.03, '#1d3b52'); at(door, -0.55, 0.5, 0.86); g.add(door);
  const sign = box(0.9, 0.34, 0.06, 0.02, accent, { clearcoat: 0.8 }); at(sign, 0.45, 1.62, 0.86); g.add(sign);
  const roof = box(1.5, 0.22, 1.3, 0.06, '#dbe7ef'); at(roof, 0, 1.76, 0); g.add(roof);
  return g;
}
function blueprint(accent) {
  const g = new THREE.Group();
  const sheet = box(2.3, 1.75, 0.05, 0.02, '#2f6f68', { roughness: 0.62 }); g.add(sheet);
  const lines = '#bfe6dd';
  for (let i = 0; i < 6; i++) { const l = box(1.85, 0.025, 0.02, 0.01, lines); at(l, 0, 0.6 - i * 0.24, 0.04); g.add(l); }
  for (let i = 0; i < 5; i++) { const l = box(0.025, 1.32, 0.02, 0.01, lines); at(l, -0.76 + i * 0.38, 0, 0.04); g.add(l); }
  const zone = box(0.66, 0.5, 0.03, 0.02, accent); at(zone, 0.42, 0.16, 0.045); g.add(zone);
  const dim = box(1.85, 0.05, 0.03, 0.01, accent); at(dim, 0, -0.72, 0.045); g.add(dim);
  return g;
}
function ruler(accent) {
  const g = new THREE.Group();
  const b = box(0.5, 2.0, 0.09, 0.03, accent, { roughness: 0.45 }); g.add(b);
  for (let i = 0; i < 8; i++) { const l = box(i % 2 ? 0.16 : 0.28, 0.035, 0.02, 0.01, '#f2f8fb'); at(l, 0, 0.82 - i * 0.23, 0.06); g.add(l); }
  return g;
}
function clipboard(accent) {
  const g = new THREE.Group();
  g.add(box(1.35, 1.8, 0.1, 0.04, '#eef4fa', { roughness: 0.45 }));
  const clip = box(0.5, 0.24, 0.18, 0.05, '#9fb4c4', { metalness: 0.3, roughness: 0.3 }); at(clip, 0, 0.9, 0); g.add(clip);
  for (let i = 0; i < 3; i++) { const l = box(0.95, 0.07, 0.02, 0.01, '#c6d5df'); at(l, -0.05, 0.42 - i * 0.4, 0.07); g.add(l); }
  const c = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), mat(accent)); at(c, 0.4, -0.55, 0.07); g.add(c);
  const tick = box(0.1, 0.2, 0.02, 0.01, '#ffffff'); at(tick, 0.4, -0.53, 0.09); tick.rotation.z = 0.5; g.add(tick);
  return g;
}
function postbox(accent) {
  const g = new THREE.Group();
  const body = cyl(0.62, 0.62, 1.5, accent, { roughness: 0.35, clearcoat: 0.6 }, 40); at(body, 0, 0.75, 0); g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat(accent, { roughness: 0.35, clearcoat: 0.6 })); at(dome, 0, 1.5, 0); dome.castShadow = true; g.add(dome);
  const slot = box(0.6, 0.12, 0.2, 0.04, '#1d3b52'); at(slot, 0, 1.28, 0.52); g.add(slot);
  const band = box(1.32, 0.1, 1.32, 0.02, '#1d3b52'); at(band, 0, 0.12, 0); g.add(band);
  return g;
}
function mapPlate(accent) {
  const g = new THREE.Group();
  g.add(box(2.7, 0.2, 2.1, 0.08, '#e9f2f8', { roughness: 0.6 }));
  const road = '#c3d7e4';
  const r1 = box(2.3, 0.02, 0.16, 0.01, road); at(r1, 0, 0.11, 0.2); g.add(r1);
  const r2 = box(0.16, 0.02, 1.8, 0.01, road); at(r2, -0.4, 0.11, 0); g.add(r2);
  const r3 = box(0.16, 0.02, 1.4, 0.01, road); at(r3, 0.7, 0.11, -0.1); g.add(r3);
  const dash = box(1.6, 0.02, 0.05, 0.01, accent); at(dash, 0.2, 0.12, 0.2); g.add(dash);
  g.add(at(pin(accent, 0.95, 1.75), -0.78, 0.12, 0.5));
  g.add(at(pin(accent, 0.68, 1.7), 0.74, 0.12, -0.52));
  g.add(at(pin(accent, 0.54, 1.65), 0.4, 0.12, 0.68));
  return g;
}
function connect(accent) {
  const g = new THREE.Group();
  const device = box(1.3, 2.25, 0.2, 0.17, '#eef4fa', { roughness: 0.38 }); at(device, 0, 1.12, 0); g.add(device);
  const screen = box(1.08, 1.96, 0.05, 0.13, '#f8fcff'); at(screen, 0, 1.12, 0.11); g.add(screen);
  const rows = [accent, '#d7e6ef', '#e4eef4'];
  rows.forEach((c, i) => { const r = box(0.8, 0.44, 0.04, 0.08, c); at(r, 0, 1.7 - i * 0.52, 0.15); g.add(r); });
  const tileA = box(1.05, 1.05, 0.22, 0.2, accent, { roughness: 0.3 }); at(tileA, -1.85, 1.9, 0.5); g.add(tileA);
  const glyphA = box(0.42, 0.42, 0.04, 0.04, '#eaf6ff'); at(glyphA, -1.85, 1.9, 0.62); g.add(glyphA);
  const tileB = box(1.05, 1.05, 0.22, 0.2, '#ffffff', { roughness: 0.4 }); at(tileB, 1.85, 1.62, 0.45); g.add(tileB);
  const glyphB = box(0.44, 0.44, 0.04, 0.04, accent); at(glyphB, 1.85, 1.62, 0.57); glyphB.rotation.z = Math.PI / 4; g.add(glyphB);
  const tube = (p1, p2) => { const dir = new THREE.Vector3().subVectors(p2, p1); const len = dir.length(); const m = cyl(0.045, 0.045, len, '#bed3df', { roughness: 0.5 }, 14); m.position.copy(p1).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); g.add(m); };
  tube(new THREE.Vector3(-0.65, 1.75, 0.1), new THREE.Vector3(-1.55, 1.9, 0.4));
  tube(new THREE.Vector3(0.65, 1.55, 0.1), new THREE.Vector3(1.5, 1.62, 0.36));
  const n1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), mat(accent)); at(n1, -0.65, 1.75, 0.1); g.add(n1);
  const n2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), mat('#9fc2d6')); at(n2, 0.65, 1.55, 0.1); g.add(n2);
  return g;
}

function build(name) {
  const a = ACCENT[name] || ACCENT.morning;
  const g = new THREE.Group();
  switch (name) {
    case 'moving': { g.add(at(house(a), 0.95, 0, -0.35)); g.add(at(truck(a), -1.05, 0, 0.55)); g.add(at(parcel(0.7), 1.75, 0, 1.0)); g.add(at(pin(a, 0.7), -1.75, 1.5, -0.9)); break; }
    case 'probate': { g.add(at(folder(a), -0.35, 1.05, -0.2)); g.add(at(document(a, 0.92), 0.25, 1.1, 0.45)); g.add(at(key(), 0.35, 0.25, 1.0)); g.add(at(pin(a, 0.5), 1.35, 1.7, -0.5)); break; }
    case 'business': { g.add(at(building(a), 0, 0, -0.1)); g.add(at(document(a, 0.62), 1.65, 0.65, 0.8)); g.add(at(pin(a, 0.62), -1.6, 1.75, 0.4)); break; }
    case 'planning': {
      const bp = blueprint(a); bp.rotation.x = -Math.PI / 2; at(bp, -0.15, 0.05, 0.05); g.add(bp);
      const h = house(a); h.scale.setScalar(0.66); at(h, 1.0, 0.0, 0.75); g.add(h);
      const r = ruler(a); r.scale.setScalar(0.72); r.rotation.x = -Math.PI / 2; r.rotation.z = 0.35; at(r, -1.55, 0.06, -0.75); g.add(r);
      g.add(at(pin(a, 0.6), 1.5, 0.15, -1.0));
      break;
    }
    case 'tenders': { g.add(at(clipboard(a), -0.6, 1.05, -0.1)); g.add(at(document(a, 0.85), 0.6, 1.05, 0.5)); g.add(at(pin(a, 0.55), 1.55, 1.75, -0.5)); break; }
    case 'post': { g.add(at(postbox(a), -1.15, 0, 0)); g.add(at(envelope(a, 1.0), 1.15, 0.7, 0.5)); g.add(at(parcel(0.6), 1.6, 0.3, -0.8)); break; }
    case 'map': { g.add(mapPlate(a)); break; }
    case 'connect': { g.add(connect(a)); break; }
    default: { g.add(at(clock(a), -1.1, 1.15, -0.2)); g.add(at(envelope(a, 0.95), 1.35, 0.68, 0.55)); g.add(at(pin(a, 0.72), 1.15, 1.95, -1.0)); g.add(at(parcel(0.58), -0.05, 0.29, 1.05)); }
  }
  return g;
}

let renderer, scene, camera, ground;
function shadowTexture() {
  const S = 128; const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
    const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const alpha = Math.pow(1 - r, 2.1) * 0.6; const i = (y * S + x) * 4;
    data[i] = 9; data[i + 1] = 24; data[i + 2] = 40; data[i + 3] = Math.round(alpha * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.needsUpdate = true; return t;
}
function fit(group) {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  const foot = Math.max(size.x, size.z) * 0.5;
  ground.scale.set(foot * 2.5, 1, foot * 2.2);
  ground.position.set(0, -size.y * 0.5 + 0.02, 0);
  const dir = new THREE.Vector3(0.76, 0.58, 1.5).normalize();
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const margin = 1.24;
  const dist = (radius * margin) / Math.tan(vFov / 2);
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
}
export async function renderScene(name, w = 1400, h = 1220) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.75;
    camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 200);
    const hemi = new THREE.HemisphereLight(0xdff0ff, 0x93a9bd, 1.15); scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 2.1); dir.position.set(6, 11, 7); dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048); dir.shadow.radius = 4; dir.shadow.bias = -0.0008;
    const cam = dir.shadow.camera; cam.near = 1; cam.far = 60; cam.left = cam.bottom = -10; cam.right = cam.top = 10;
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xbfe0ff, 0.55); fill.position.set(-7, 4, -5); scene.add(fill);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
  }
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  while (scene.children.filter(o => o.userData.sceneRoot).length) scene.remove(scene.children.find(o => o.userData.sceneRoot));
  const group = build(name); group.userData.sceneRoot = true;
  scene.add(group);
  fit(group);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}
