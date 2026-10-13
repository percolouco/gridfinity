// Génération de géométrie Gridfinity (maillages triangulaires bruts, sans dépendance).
// Un maillage = tableau plat de sommets [x,y,z, x,y,z, ...] (3 sommets par triangle).
// Les solides d'un même maillage peuvent se chevaucher : le slicer les fusionne.

export const GF = {
  PITCH: 42,        // pas de la grille (mm)
  UNIT_H: 7,        // hauteur d'une unité (mm)
  CLEAR: 0.5,       // jeu total entre deux bacs voisins (42 - 41.5)
  R_OUT: 3.75,      // rayon des coins extérieurs
  // profil du pied d'un bac : [z, demi-largeur] pour une cellule de 42 mm
  BASE: [[0, 17.8], [0.8, 18.6], [2.6, 18.6], [4.75, 20.75]],
  BASE_H: 4.75,
  PLATE_FLOOR: 0.7, // épaisseur du fond de la plaque de base
  FIT: 0.15,        // jeu radial de la plaque de base
  WALL: 1.2,
  FLOOR: 0.75,
};

const SEG = 5;

// Contour rectangle arrondi, sens anti-horaire, toujours le même nombre de points.
export function roundedRect(cx, cy, hw, hd, r) {
  r = Math.max(0.05, Math.min(r, hw - 0.01, hd - 0.01));
  const pts = [];
  const corners = [[hw - r, hd - r, 0], [-(hw - r), hd - r, 90], [-(hw - r), -(hd - r), 180], [hw - r, -(hd - r), 270]];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i <= SEG; i++) {
      const a = ((a0 + (90 * i) / SEG) * Math.PI) / 180;
      pts.push([cx + ox + r * Math.cos(a), cy + oy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function tri(out, a, b, c) { out.push(...a, ...b, ...c); }
const P = (p, z) => [p[0], p[1], z];

// Bande latérale entre deux contours (A à zA, B à zB). Normales vers l'extérieur si anti-horaire et B au-dessus.
function strip(out, A, zA, B, zB, flip = false) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = P(A[i], zA), a1 = P(A[j], zA), b0 = P(B[i], zB), b1 = P(B[j], zB);
    if (!flip) { tri(out, a0, a1, b1); tri(out, a0, b1, b0); }
    else { tri(out, a0, b1, a1); tri(out, a0, b0, b1); }
  }
}

// Couvercle convexe (éventail depuis le centre). up=true : normale +Z.
function cap(out, pts, z, up) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  const c = [cx / pts.length, cy / pts.length, z];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = P(pts[i], z), b = P(pts[(i + 1) % n], z);
    if (up) tri(out, c, a, b); else tri(out, c, b, a);
  }
}

// Anneau plat (entre contour extérieur et intérieur, même nombre de points) à altitude z.
function annulus(out, outer, inner, z, up) {
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const o0 = P(outer[i], z), o1 = P(outer[j], z), i0 = P(inner[i], z), i1 = P(inner[j], z);
    if (up) { tri(out, o0, o1, i1); tri(out, o0, i1, i0); }
    else { tri(out, o0, i1, o1); tri(out, o0, i0, i1); }
  }
}

// Solide plein : loft entre profils successifs [[z, hw, hd, r], ...] autour de (cx,cy).
function solidLoft(out, cx, cy, prof) {
  const outl = prof.map(([z, hw, hd, r]) => roundedRect(cx, cy, hw, hd, r));
  cap(out, outl[0], prof[0][0], false);
  for (let k = 0; k < prof.length - 1; k++) strip(out, outl[k], prof[k][0], outl[k + 1], prof[k + 1][0]);
  const last = prof.length - 1;
  cap(out, outl[last], prof[last][0], true);
}

// ---- Bac ----
// w, d en cellules ; h en unités de 7 mm ; opts.solid : bac plein (sans cavité).
// Le bac est centré en (0,0), posé sur z = 0.
export function buildBin(w, d, h, opts = {}) {
  const out = [];
  const { PITCH, UNIT_H, CLEAR, BASE, BASE_H, WALL, FLOOR } = GF;
  const rIn = GF.R_OUT - 0.8; // rayon du pied
  const x0 = -(w * PITCH) / 2, y0 = -(d * PITCH) / 2;

  // pieds : un par cellule
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const cx = x0 + PITCH * (i + 0.5), cy = y0 + PITCH * (j + 0.5);
      solidLoft(out, cx, cy, BASE.map(([z, hw]) => [z, hw, hw, Math.max(0.6, rIn - (20.75 - hw))]));
    }
  }

  const hwO = (w * PITCH - CLEAR) / 2, hdO = (d * PITCH - CLEAR) / 2;
  const H = Math.max(BASE_H + 2, h * UNIT_H);

  if (opts.solid) {
    // dalle pleine du haut des pieds jusqu'au sommet
    solidLoft(out, 0, 0, [[BASE_H - 0.01, hwO, hdO, GF.R_OUT], [H, hwO, hdO, GF.R_OUT]]);
  } else {
    // plancher + parois creuses
    solidLoft(out, 0, 0, [[BASE_H - 0.01, hwO, hdO, GF.R_OUT], [BASE_H + FLOOR, hwO, hdO, GF.R_OUT]]);
    const outer = roundedRect(0, 0, hwO, hdO, GF.R_OUT);
    const inner = roundedRect(0, 0, hwO - WALL, hdO - WALL, Math.max(0.6, GF.R_OUT - WALL));
    const zb = BASE_H + FLOOR - 0.01;
    strip(out, outer, zb, outer, H);
    strip(out, inner, zb, inner, H, true);
    annulus(out, outer, inner, H, true);
    annulus(out, outer, inner, zb, false);
  }
  return out;
}

// ---- Plaque de base (w×d cellules) ----
export function buildBaseplate(w, d) {
  const out = [];
  const { PITCH, BASE, BASE_H, PLATE_FLOOR, FIT } = GF;
  const x0 = -(w * PITCH) / 2, y0 = -(d * PITCH) / 2;
  const T = PLATE_FLOOR + BASE_H;
  const hwO = (w * PITCH) / 2, hdO = (d * PITCH) / 2;
  const rOut = GF.R_OUT + 0.4;
  // fond plein
  solidLoft(out, 0, 0, [[0, hwO, hdO, rOut], [PLATE_FLOOR, hwO, hdO, rOut]]);
  // cadre ajouré : entre le contour extérieur et les ouvertures
  // On construit, pour chaque cellule, un anneau (carré 42 → ouverture) en 3 paliers + paroi.
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const cx = x0 + PITCH * (i + 0.5), cy = y0 + PITCH * (j + 0.5);
      const hwC = PITCH / 2;
      const rc = GF.R_OUT - 0.8;
      let prevZ = PLATE_FLOOR, prevIn = null;
      const stages = BASE.map(([z, hw]) => [PLATE_FLOOR + z, hw + FIT, Math.max(0.6, rc - (20.75 - hw))]);
      // paroi extérieure carrée de la cellule (jusqu'en haut)
      const sq = (hw) => [[cx + hw, cy + hw], [cx - hw, cy + hw], [cx - hw, cy - hw], [cx + hw, cy - hw]];
      const openings = stages.map(([z, hw, r]) => [z, roundedRect(cx, cy, hw, hw, r)]);
      // surface supérieure + parois intérieures : annulus carré→ouverture au sommet
      const topOpen = openings[openings.length - 1][1];
      // coque extérieure de la cellule sous forme de contour arrondi 'quasi carré' (même nb de points)
      const shell = roundedRect(cx, cy, hwC, hwC, 0.05);
      // paroi intérieure (les ouvertures forment un entonnoir, normales vers l'intérieur de l'ouverture)
      for (let k = 0; k < openings.length - 1; k++) {
        strip(out, openings[k][1], openings[k][0], openings[k + 1][1], openings[k + 1][0], true);
      }
      // dessus : anneau entre coque carrée et ouverture, à T
      const T2 = openings[openings.length - 1][0];
      annulus(out, shell, topOpen, T2, true);
      annulus(out, shell, openings[0][1], PLATE_FLOOR, false);
      // paroi extérieure de la cellule, de PLATE_FLOOR à T2
      strip(out, shell, PLATE_FLOOR, shell, T2);
      void sq; void prevZ; void prevIn; void T;
    }
  }
  return out;
}

// ---- STL binaire ----
export function toSTL(meshes) {
  let tris = 0;
  for (const m of meshes) tris += m.length / 9;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  let off = 84;
  for (const m of meshes) {
    for (let t = 0; t < m.length; t += 9) {
      const ax = m[t + 3] - m[t], ay = m[t + 4] - m[t + 1], az = m[t + 5] - m[t + 2];
      const bx = m[t + 6] - m[t], by = m[t + 7] - m[t + 1], bz = m[t + 8] - m[t + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
      for (let v = 0; v < 9; v++) dv.setFloat32(off + 12 + v * 4, m[t + v], true);
      off += 50;
    }
  }
  return buf;
}

// Translation d'un maillage (copie).
export function translate(m, dx, dy, dz = 0) {
  const o = new Array(m.length);
  for (let i = 0; i < m.length; i += 3) { o[i] = m[i] + dx; o[i + 1] = m[i + 1] + dy; o[i + 2] = m[i + 2] + dz; }
  return o;
}
