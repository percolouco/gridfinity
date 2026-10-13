import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GF, buildBin, buildBaseplate, toSTL, translate } from './geometry.js';

const $ = (id) => document.getElementById(id);
const st = { dw: 420, dd: 294, bins: [], sel: null, next: 1 };
const gridW = () => Math.max(1, Math.floor(st.dw / GF.PITCH));
const gridD = () => Math.max(1, Math.floor(st.dd / GF.PITCH));

// ---------- persistance ----------
function save() { try { localStorage.setItem('gf-layout', JSON.stringify(st)); } catch (e) { /* ignore */ } }
function restore() {
  let data = null;
  try {
    if (location.hash.startsWith('#d=')) data = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3)))));
    else data = JSON.parse(localStorage.getItem('gf-layout') || 'null');
  } catch (e) { data = null; }
  if (data && Array.isArray(data.bins)) Object.assign(st, data, { sel: null });
}

// ---------- logique de placement ----------
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d; }
function fits(b, ignore) {
  if (b.x < 0 || b.y < 0 || b.x + b.w > gridW() || b.y + b.d > gridD()) return false;
  return !st.bins.some((o) => o !== ignore && overlap(b, o));
}
function findSpot(w, d) {
  for (let y = 0; y + d <= gridD(); y++) for (let x = 0; x + w <= gridW(); x++) if (fits({ x, y, w, d })) return { x, y };
  return null;
}
function newBinFromForm() {
  return { id: st.next++, w: +$('bw').value || 1, d: +$('bd').value || 1, h: +$('bh').value || 1, label: $('bl').value.trim(), color: $('bc').value, solid: $('bs').checked, vw: [], hw: [], x: 0, y: 0 };
}
function addBin() {
  const b = newBinFromForm();
  let spot = findSpot(b.w, b.d);
  if (!spot) { spot = findSpot(b.d, b.w); if (spot) [b.w, b.d] = [b.d, b.w]; }
  if (!spot) { alert('Pas de place pour ce bac.'); return; }
  Object.assign(b, spot); st.bins.push(b); st.sel = b; refresh();
}
function fillFree() {
  const t = newBinFromForm(); let n = 0;
  for (let y = 0; y + t.d <= gridD(); y++) for (let x = 0; x + t.w <= gridW(); x++) {
    if (fits({ x, y, w: t.w, d: t.d })) { st.bins.push({ ...t, id: st.next++, x, y }); n++; }
  }
  if (!n) alert('Aucune place libre pour cette taille.');
  refresh();
}
function rotateSel() {
  const b = st.sel; if (!b) return;
  const r = { ...b, w: b.d, d: b.w };
  if (fits(r, b)) { b.w = r.w; b.d = r.d; b.vw = []; b.hw = []; refresh(); }
}
function dupSel() {
  const b = st.sel; if (!b) return;
  const spot = findSpot(b.w, b.d); if (!spot) { alert('Pas de place.'); return; }
  const c = { ...b, id: st.next++, ...spot }; st.bins.push(c); st.sel = c; refresh();
}
function delSel() { if (!st.sel) return; st.bins = st.bins.filter((b) => b !== st.sel); st.sel = null; refresh(); }

// ---------- affichage 2D ----------
const cv = $('c2d'), ctx = cv.getContext('2d');
let view = { s: 1, ox: 0, oy: 0 };
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function layout2d() {
  const r = cv.parentElement.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const pad = 30, gw = gridW(), gd = gridD();
  const s = Math.min((r.width - pad * 2) / (st.dw), (r.height - pad * 2) / (st.dd));
  view = { s, ox: (r.width - st.dw * s) / 2, oy: (r.height - st.dd * s) / 2, dpr, cell: GF.PITCH * s, gw, gd };
}
function draw2d() {
  layout2d();
  const { s, ox, oy, dpr, cell, gw, gd } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = css('--panel'); ctx.fillRect(ox, oy, st.dw * s, st.dd * s);
  ctx.strokeStyle = css('--line'); ctx.lineWidth = 1; ctx.strokeRect(ox, oy, st.dw * s, st.dd * s);
  // zone couverte par la grille (centrée dans le tiroir)
  const gx = ox + (st.dw * s - gw * cell) / 2, gy = oy + (st.dd * s - gd * cell) / 2;
  view.gx = gx; view.gy = gy;
  ctx.fillStyle = css('--cell'); ctx.fillRect(gx, gy, gw * cell, gd * cell);
  ctx.strokeStyle = css('--grid');
  for (let i = 0; i <= gw; i++) { ctx.beginPath(); ctx.moveTo(gx + i * cell, gy); ctx.lineTo(gx + i * cell, gy + gd * cell); ctx.stroke(); }
  for (let j = 0; j <= gd; j++) { ctx.beginPath(); ctx.moveTo(gx, gy + j * cell); ctx.lineTo(gx + gw * cell, gy + j * cell); ctx.stroke(); }
  for (const b of st.bins) {
    const x = gx + b.x * cell + 1.5, y = gy + b.y * cell + 1.5, w = b.w * cell - 3, d = b.d * cell - 3;
    ctx.fillStyle = b.color; ctx.globalAlpha = b === st.sel ? 1 : 0.85;
    rr(x, y, w, d, Math.min(8, cell / 5)); ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = b === st.sel ? 3 : 1; ctx.strokeStyle = b === st.sel ? css('--ink') : 'rgba(0,0,0,.35)'; ctx.stroke();
    if (!b.solid && ((b.vw && b.vw.length) || (b.hw && b.hw.length))) {
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.beginPath();
      const u = view.cell, ox0 = x - 1.5, oy0 = y - 1.5;
      for (const k of b.vw) { const [wx, wy] = k.split(',').map(Number); ctx.moveTo(ox0 + wx * u, oy0 + wy * u); ctx.lineTo(ox0 + wx * u, oy0 + (wy + 1) * u); }
      for (const k of b.hw) { const [wx, wy] = k.split(',').map(Number); ctx.moveTo(ox0 + wx * u, oy0 + wy * u); ctx.lineTo(ox0 + (wx + 1) * u, oy0 + wy * u); }
      ctx.stroke();
    }
    ctx.fillStyle = luminance(b.color) > 0.55 ? '#111' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(10, Math.min(14, cell / 4))}px system-ui`;
    ctx.fillText(`${b.w}×${b.d}×${b.h}`, x + w / 2, y + d / 2 - (b.label ? 8 : 0));
    if (b.label) { ctx.font = `${Math.max(9, Math.min(12, cell / 5))}px system-ui`; ctx.fillText(b.label, x + w / 2, y + d / 2 + 8, w - 6); }
  }
  ctx.fillStyle = css('--mute'); ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${st.dw} mm`, ox + st.dw * s / 2, oy - 8); ctx.save(); ctx.translate(ox - 10, oy + st.dd * s / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${st.dd} mm`, 0, 0); ctx.restore();
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function luminance(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

// ---------- interactions 2D ----------
let drag = null;
function cellAt(ev) { const r = cv.getBoundingClientRect(); return { cx: Math.floor((ev.clientX - r.left - view.gx) / view.cell), cy: Math.floor((ev.clientY - r.top - view.gy) / view.cell) }; }
function binAt(cx, cy) { return st.bins.find((b) => cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.d); }
cv.addEventListener('pointerdown', (ev) => {
  const { cx, cy } = cellAt(ev); const b = binAt(cx, cy);
  if (b) { st.sel = b; drag = { b, dx: cx - b.x, dy: cy - b.y, moved: false }; cv.setPointerCapture(ev.pointerId); }
  else st.sel = null;
  refresh(false);
});
cv.addEventListener('dblclick', (ev) => {
  const { cx, cy } = cellAt(ev); if (binAt(cx, cy)) return;
  const t = newBinFromForm(); const cand = { x: cx, y: cy, w: t.w, d: t.d };
  if (cx >= 0 && cy >= 0 && fits(cand)) { Object.assign(t, cand); st.bins.push(t); st.sel = t; refresh(); }
});
cv.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const { cx, cy } = cellAt(ev); const c = { ...drag.b, x: cx - drag.dx, y: cy - drag.dy };
  if ((c.x !== drag.b.x || c.y !== drag.b.y) && fits(c, drag.b)) { drag.b.x = c.x; drag.b.y = c.y; drag.moved = true; refresh(false); }
});
cv.addEventListener('pointerup', () => { drag = null; save(); });
addEventListener('keydown', (ev) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (ev.key === 'r' || ev.key === 'R') rotateSel();
  if (ev.key === 'Delete' || ev.key === 'Backspace') delSel();
});

// ---------- 3D ----------
let three = null;
function init3d() {
  const host = $('c3d');
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio);
  host.appendChild(renderer.domElement); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(matchMedia('(prefers-color-scheme:dark)').matches ? 0x14171d : 0xe9ecf1);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000); camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(200, -300, 500); scene.add(dl);
  const controls = new OrbitControls(camera, renderer.domElement);
  three = { renderer, scene, camera, controls, group: new THREE.Group() }; scene.add(three.group);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(three.group.children, false).find((h) => h.object.userData.bin);
    st.sel = hit ? hit.object.userData.bin : null; refresh();
  });
  (function loop() { requestAnimationFrame(loop); if ($('c3d').style.display !== 'none') { size3d(); controls.update(); renderer.render(scene, camera); } })();
}
function size3d() {
  const h = $('c3d'); const w = h.clientWidth, ht = h.clientHeight;
  if (three.renderer.domElement.width !== w * devicePixelRatio || three.renderer.domElement.height !== ht * devicePixelRatio) {
    three.renderer.setSize(w, ht, false); three.camera.aspect = w / ht; three.camera.updateProjectionMatrix();
  }
}
function geo(mesh) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(mesh, 3)); g.computeVertexNormals(); return g; }
const meshCache = new Map();
function binMesh(b) { const k = `${b.w}|${b.d}|${b.h}|${b.solid ? 1 : 0}|${(b.vw || []).join(';')}|${(b.hw || []).join(';')}`; if (!meshCache.has(k)) meshCache.set(k, buildBin(b.w, b.d, b.h, { solid: b.solid, vw: b.vw || [], hw: b.hw || [] })); return meshCache.get(k); }
function binPos(b) { return [(b.x + b.w / 2 - gridW() / 2) * GF.PITCH, -((b.y + b.d / 2) - gridD() / 2) * GF.PITCH]; }
function rebuild3d() {
  if (!three) return; const g = three.group;
  while (g.children.length) { const c = g.children.pop(); c.geometry.dispose(); c.material.dispose(); }
  const plate = new THREE.Mesh(geo(buildBaseplate(gridW(), gridD())), new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.7, side: THREE.DoubleSide }));
  g.add(plate);
  for (const b of st.bins) {
    const m = new THREE.Mesh(geo(binMesh(b)), new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.55, side: THREE.DoubleSide }));
    const [x, y] = binPos(b); m.position.set(x, y, GF.PLATE_FLOOR); m.userData.bin = b;
    if (b === st.sel) { m.material.emissive = new THREE.Color(0xffffff); m.material.emissiveIntensity = 0.35; }
    g.add(m);
  }
}
function fitCamera() {
  const r = Math.max(gridW(), gridD()) * GF.PITCH;
  three.camera.position.set(r * 0.5, -r * 0.9, r * 0.8); three.controls.target.set(0, 0, 0); three.controls.update();
}
let mode = '2d';
function setMode(m) {
  mode = m; $('v2').classList.toggle('on', m === '2d'); $('v3').classList.toggle('on', m === '3d');
  cv.style.display = m === '2d' ? 'block' : 'none'; $('c3d').style.display = m === '3d' ? 'block' : 'none';
  if (m === '3d') { if (!three) { init3d(); fitCamera(); } rebuild3d(); } else draw2d();
}

// ---------- exports ----------
function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
$('xplate').onclick = () => download(`gridfinity-plaque-${gridW()}x${gridD()}.stl`, toSTL([buildBaseplate(gridW(), gridD())]), 'model/stl');
$('xsel').onclick = () => { const b = st.sel; if (!b) return alert('Sélectionne un bac.'); download(`gridfinity-bac-${b.w}x${b.d}x${b.h}.stl`, toSTL([binMesh(b)]), 'model/stl'); };
$('xall').onclick = () => { if (!st.bins.length) return alert('Aucun bac.'); download('gridfinity-bacs.stl', toSTL(st.bins.map((b) => { const [x, y] = binPos(b); return translate(binMesh(b), x, y, GF.PLATE_FLOOR); })), 'model/stl'); };
$('save').onclick = () => download('gridfinity-layout.json', JSON.stringify(st, null, 1), 'application/json');
$('load').onclick = () => $('file').click();
$('file').onchange = async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); Object.assign(st, d, { sel: null }); syncInputs(); refresh(); } catch (err) { alert('Fichier invalide.'); } };
$('share').onclick = async () => {
  const url = location.origin + location.pathname + '#d=' + btoa(unescape(encodeURIComponent(JSON.stringify({ dw: st.dw, dd: st.dd, bins: st.bins, next: st.next }))));
  try { await navigator.clipboard.writeText(url); alert('Lien copié.'); } catch (e) { prompt('Copie le lien :', url); }
};

// ---------- UI ----------
function syncInputs() { $('dw').value = st.dw; $('dd').value = st.dd; }
function refresh(redraw = true) {
  for (const q of st.bins) { q.vw = q.vw || []; q.hw = q.hw || []; }
  $('info').textContent = `Grille : ${gridW()} × ${gridD()} cases (${gridW() * GF.PITCH} × ${gridD() * GF.PITCH} mm), reste ${st.dw - gridW() * GF.PITCH} × ${st.dd - gridD() * GF.PITCH} mm`;
  const b = st.sel;
  $('nosel').hidden = !!b; $('seled').hidden = !b;
  if (b) {
    $('sw').value = b.w; $('sd').value = b.d; $('sh').value = b.h; $('sx').value = b.x; $('sy').value = b.y;
    if (document.activeElement !== $('sl')) $('sl').value = b.label;
    $('sc').value = b.color; $('ss').checked = !!b.solid; drawCedit();
  }
  const L = $('binlist'); L.innerHTML = '';
  for (const x of st.bins) {
    const row = document.createElement('div'); row.className = 'bi' + (x === b ? ' on' : '');
    const nc = x.solid ? 1 : compCount(x); const comp = nc > 1 ? ` · ${nc} compart.` : '';
    row.innerHTML = `<i style="background:${x.color}"></i><span>${esc(x.label || 'Bac sans nom')} <small>${x.w}×${x.d}×${x.h}${comp}</small></span>`;
    const rm = document.createElement('button'); rm.textContent = '✕'; rm.title = 'Supprimer';
    rm.onclick = (e) => { e.stopPropagation(); st.bins = st.bins.filter((q) => q !== x); if (st.sel === x) st.sel = null; refresh(); };
    row.appendChild(rm); row.onclick = () => { st.sel = x; refresh(); }; L.appendChild(row);
  }
  if (!st.bins.length) L.innerHTML = '<div style="font-size:12px;color:var(--mute)">Aucun bac pour l\'instant.</div>';
  const used = st.bins.reduce((a, x) => a + x.w * x.d, 0);
  $('info3').textContent = `${st.bins.length} bac(s) · occupation ${used}/${gridW() * gridD()} cases`;
  save(); if (mode === '3d') rebuild3d(); else draw2d();
}
function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// édition du bac sélectionné : valide l'état avant de l'appliquer
function edit(patch) {
  const b = st.sel; if (!b) return;
  const c = { ...b, ...patch };
  if (!fits(c, b)) { alert('Ça ne rentre pas à cet endroit (hors grille ou chevauchement).'); refresh(); return; }
  Object.assign(b, patch);
  b.vw = (b.vw || []).filter((k) => { const [x, y] = k.split(',').map(Number); return x >= 1 && x < b.w && y < b.d; });
  b.hw = (b.hw || []).filter((k) => { const [x, y] = k.split(',').map(Number); return y >= 1 && y < b.d && x < b.w; });
  refresh();
}
const num = (id, min = 1) => Math.max(min, Math.floor(+$(id).value || min));
$('sw').onchange = () => edit({ w: num('sw') }); $('sd').onchange = () => edit({ d: num('sd') }); $('sh').onchange = () => edit({ h: num('sh') });
$('sx').onchange = () => edit({ x: num('sx', 0) }); $('sy').onchange = () => edit({ y: num('sy', 0) });
$('ss').onchange = () => edit({ solid: $('ss').checked });
$('perCell').onclick = () => { const b = st.sel; if (!b) return; b.solid = false; b.vw = []; b.hw = []; for (let x = 1; x < b.w; x++) for (let y = 0; y < b.d; y++) b.vw.push(`${x},${y}`); for (let y = 1; y < b.d; y++) for (let x = 0; x < b.w; x++) b.hw.push(`${x},${y}`); refresh(); };
$('noDiv').onclick = () => { if (st.sel) { st.sel.vw = []; st.sel.hw = []; refresh(); } };

// ---- éditeur de compartiments (grille d'unités du bac sélectionné) ----
const ce = $('cedit'); let cg = null;
function compCount(b) {
  const seen = new Set(); let n = 0; const V = new Set(b.vw || []), H = new Set(b.hw || []);
  for (let sx = 0; sx < b.w; sx++) for (let sy = 0; sy < b.d; sy++) {
    if (seen.has(`${sx},${sy}`)) continue; n++; const q = [[sx, sy]]; seen.add(`${sx},${sy}`);
    while (q.length) {
      const [x, y] = q.pop();
      const nb = [[x + 1, y, V.has(`${x + 1},${y}`)], [x - 1, y, V.has(`${x},${y}`)], [x, y + 1, H.has(`${x},${y + 1}`)], [x, y - 1, H.has(`${x},${y}`)]];
      for (const [nx, ny, wall] of nb) if (!wall && nx >= 0 && ny >= 0 && nx < b.w && ny < b.d && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); }
    }
  }
  return n;
}
function drawCedit() {
  const b = st.sel; if (!b) return;
  const W = ce.clientWidth, Hh = ce.clientHeight, dpr = devicePixelRatio || 1; if (!W) return;
  ce.width = W * dpr; ce.height = Hh * dpr; const c = ce.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 14, u = Math.min((W - pad * 2) / b.w, (Hh - pad * 2) / b.d), ox = (W - u * b.w) / 2, oy = (Hh - u * b.d) / 2;
  cg = { u, ox, oy, pad };
  c.fillStyle = b.color; c.globalAlpha = 0.25; c.fillRect(ox, oy, u * b.w, u * b.d); c.globalAlpha = 1;
  c.strokeStyle = css('--line'); c.lineWidth = 1; c.beginPath();
  for (let x = 0; x <= b.w; x++) { c.moveTo(ox + x * u, oy); c.lineTo(ox + x * u, oy + b.d * u); }
  for (let y = 0; y <= b.d; y++) { c.moveTo(ox, oy + y * u); c.lineTo(ox + b.w * u, oy + y * u); }
  c.stroke(); c.strokeStyle = css('--ink'); c.lineWidth = 2; c.strokeRect(ox, oy, u * b.w, u * b.d);
  c.lineWidth = 4; c.beginPath();
  for (const k of b.vw) { const [x, y] = k.split(',').map(Number); c.moveTo(ox + x * u, oy + y * u); c.lineTo(ox + x * u, oy + (y + 1) * u); }
  for (const k of b.hw) { const [x, y] = k.split(',').map(Number); c.moveTo(ox + x * u, oy + y * u); c.lineTo(ox + (x + 1) * u, oy + y * u); }
  c.stroke(); c.fillStyle = css('--mute');
  for (let x = 1; x < b.w; x++) { c.beginPath(); c.moveTo(ox + x * u - 5, oy - 3); c.lineTo(ox + x * u + 5, oy - 3); c.lineTo(ox + x * u, oy + 5 - 3 + 4); c.fill(); }
  for (let y = 1; y < b.d; y++) { c.beginPath(); c.moveTo(ox - 3, oy + y * u - 5); c.lineTo(ox - 3, oy + y * u + 5); c.lineTo(ox + 5 - 3 + 4, oy + y * u); c.fill(); }
}
function toggle(arr, key) { const i = arr.indexOf(key); if (i >= 0) arr.splice(i, 1); else arr.push(key); }
ce.addEventListener('pointerdown', (ev) => {
  const b = st.sel; if (!b || !cg) return; const r = ce.getBoundingClientRect();
  const px = ev.clientX - r.left - cg.ox, py = ev.clientY - r.top - cg.oy, u = cg.u, tol = Math.max(8, u * 0.2);
  const lx = Math.round(px / u), ly = Math.round(py / u); b.solid = false;
  const inX = px > 0 && px < b.w * u, inY = py > 0 && py < b.d * u;
  if (py < 2 && py > -cg.pad && lx >= 1 && lx < b.w && Math.abs(px - lx * u) < tol) {            // triangle haut : toute la ligne verticale
    const keys = Array.from({ length: b.d }, (_, y) => `${lx},${y}`); const all = keys.every((k) => b.vw.includes(k));
    b.vw = b.vw.filter((k) => !keys.includes(k)); if (!all) b.vw.push(...keys);
  } else if (px < 2 && px > -cg.pad && ly >= 1 && ly < b.d && Math.abs(py - ly * u) < tol) {    // triangle gauche : toute la ligne horizontale
    const keys = Array.from({ length: b.w }, (_, x) => `${x},${ly}`); const all = keys.every((k) => b.hw.includes(k));
    b.hw = b.hw.filter((k) => !keys.includes(k)); if (!all) b.hw.push(...keys);
  } else if (inX && inY && lx >= 1 && lx < b.w && Math.abs(px - lx * u) < tol && Math.abs(px - lx * u) <= Math.abs(py - ly * u) + (ly < 1 || ly >= b.d ? 1e9 : 0)) {
    toggle(b.vw, `${lx},${Math.floor(py / u)}`);
  } else if (inX && inY && ly >= 1 && ly < b.d && Math.abs(py - ly * u) < tol) {
    toggle(b.hw, `${Math.floor(px / u)},${ly}`);
  } else return;
  refresh();
});
$('dw').onchange = $('dd').onchange = () => { st.dw = Math.max(42, +$('dw').value || 42); st.dd = Math.max(42, +$('dd').value || 42); st.bins = st.bins.filter((b) => fits(b, b)); st.sel = null; if (three) { fitCamera(); } refresh(); };
$('add').onclick = addBin; $('fill').onclick = fillFree; $('rot').onclick = rotateSel; $('dup').onclick = dupSel; $('del').onclick = delSel;
$('sl').oninput = () => { if (st.sel) { st.sel.label = $('sl').value; refresh(); } };
$('sc').oninput = () => { if (st.sel) { st.sel.color = $('sc').value; refresh(); } };
$('v2').onclick = () => setMode('2d'); $('v3').onclick = () => setMode('3d');
addEventListener('resize', () => { if (mode === '2d') draw2d(); });
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => draw2d());

restore(); syncInputs(); setMode(new URLSearchParams(location.search).get('view') === '3d' ? '3d' : '2d'); refresh();
