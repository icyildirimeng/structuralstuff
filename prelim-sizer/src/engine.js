// ===== Preliminary sizing engine =====
// Units: lengths ft (spans) / in (sections), loads psf / klf / kips, f'c psi, fy & Fy ksi.
// Codes: ACI 318-19, AISC 360-22, ASCE 7-22. Preliminary only.

const ES = 29000; // ksi
const SQ = Math.sqrt;
const PI = Math.PI;

// ---------- shapes ----------
const SHAPES = (typeof W_RAW !== 'undefined' ? W_RAW : []).map(r => ({
  name: r[0], W: r[1], A: r[2], d: r[3], bf: r[4], tw: r[5], tf: r[6], bf2tf: r[7], htw: r[8],
  Ix: r[9], Zx: r[10], Sx: r[11], rx: r[12], Iy: r[13], Zy: r[14], Sy: r[15], ry: r[16],
  J: r[17], Cw: r[18], rts: r[19], ho: r[20], nom: parseInt(r[0].slice(1))
}));

// ---------- helpers ----------
const fx = (x, dp = 1) => (x === Infinity || isNaN(x)) ? '—' : Number(x).toFixed(dp);
const fk = (x, dp = 0) => fx(x, dp);
const ceilTo = (x, s) => Math.ceil(x / s - 1e-9) * s;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(x, xs[i - 1], xs[i], ys[i - 1], ys[i]);
  return ys[ys.length - 1];
}
function inchStr(h) { // 8.5 -> 8½"
  const w = Math.floor(h + 1e-9), fr = h - w;
  const m = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };
  const k = Math.round(fr * 4) / 4;
  return (m[k] !== undefined ? ((w === 0 && m[k]) ? m[k] : w + m[k]) : fx(h, 2)) + '"';
}
function ftin(inches) {
  const ft = Math.floor(inches / 12 + 1e-9); const i = Math.round(inches - ft * 12);
  return i === 12 ? `${ft + 1}'-0"` : `${ft}'-${i}"`;
}
const beta1 = fc => clamp(0.85 - 0.05 * (fc - 4000) / 1000, 0.65, 0.85);
const EcKsi = (fc, wc = 145) => 33 * Math.pow(wc, 1.5) * SQ(fc) / 1000;
const rhoTC = (fc, fy) => 0.85 * beta1(fc) * fc / (fy * 1000) * 0.003 / 0.008;
function rhoReq(Mu, b, d, fc, fy) { // Mu kip-ft, b,d in -> rho (phi 0.9)
  const Rn = Mu * 12000 / (0.9 * b * d * d);
  const x = 1 - 2 * Rn / (0.85 * fc);
  if (x < 0) return Infinity;
  return 0.85 * fc / (fy * 1000) * (1 - SQ(x));
}
const BARS = { 3: [0.11, 0.375], 4: [0.20, 0.5], 5: [0.31, 0.625], 6: [0.44, 0.75], 7: [0.60, 0.875], 8: [0.79, 1.0], 9: [1.00, 1.128], 10: [1.27, 1.27], 11: [1.56, 1.41] };

// ASCE 7-22 4.7 live load reduction
function llr(Lo, KLL, AT, multi, on) {
  if (!on || !Lo || Lo > 100) return { L: Lo, f: 1 };
  const KA = KLL * AT;
  if (KA < 400) return { L: Lo, f: 1 };
  let f = 0.25 + 15 / SQ(KA);
  f = clamp(f, multi ? 0.4 : 0.5, 1);
  return { L: Lo * f, f };
}
function status(ratio) { return ratio <= 1.0001 ? 'ok' : 'fail'; }
function chk(name, demand, capacity, ratio, note, info) { return { name, d: demand, c: capacity, r: ratio, note, info: !!info }; }
function fireMinSlab(r) { return { none: 0, '1': 3.5, '1.5': 4.3, '2': 5.0, '3': 6.2 }[r] || 0; } // IBC 722.2.2.1 siliceous

// ACI one-way coefficient sets
const COEF = {
  simple: { pos: 8, neg: 0, V: 1.0, label: 'simple span' },
  oneEnd: { pos: 11, neg: 10, V: 1.15, label: 'end span (one end continuous)' },
  both: { pos: 16, neg: 11, V: 1.0, label: 'interior span (both ends continuous)' },
  cant: { pos: 0, neg: 2, V: 2.0, label: 'cantilever' }
};
function coefM(cont) { const c = COEF[cont]; return Math.max(c.pos ? 1 / c.pos : 0, c.neg ? 1 / c.neg : 0); }

// ============ 1. RC ONE-WAY SLAB ============
function rcOneWay(p) {
  const { ln, cont, SDL, LL, fc, fy, fire, hTrial } = p;
  const div = { simple: 20, oneEnd: 24, both: 28, cant: 10 }[cont];
  const hmin = ln * 12 / div * (0.4 + fy / 100);
  const hFire = fireMinSlab(fire);
  const k = coefM(cont);
  const asMinR = Math.max(0.0014, 0.0018 * 60 / fy);
  function run(h) {
    const sw = 150 * h / 12;
    const wu = Math.max(1.2 * (sw + SDL) + 1.6 * LL, 1.4 * (sw + SDL));
    const w = wu / 1000;
    const Mu = w * ln * ln * k;
    const d = h - 0.75 - 0.3125;
    const rho = rhoReq(Mu, 12, d, fc, fy);
    const As = Math.max(rho * 12 * d, asMinR * 12 * h);
    const rtc = rhoTC(fc, fy);
    let Vu = cont === 'cant' ? w * (ln - d / 12) : COEF[cont].V * w * ln / 2 - w * d / 12;
    const rhow = As / (12 * d);
    const ls = Math.min(1, SQ(2 / (1 + d / 10)));
    const vc = Math.min(8 * ls * Math.cbrt(rhow), 5) * SQ(fc);
    const phiVc = 0.75 * vc * 12 * d / 1000;
    return { h, sw, wu, Mu, d, rho, As, rtc, Vu, phiVc, rFlex: rho / rtc, rShear: Vu / phiVc };
  }
  let h, gov;
  const h0 = ceilTo(Math.max(hmin, hFire, 3.5), 0.5);
  if (hTrial > 0) { h = hTrial; }
  else {
    h = h0; gov = hFire > hmin ? 'Fire rating min. thickness' : 'Deflection (ACI Table 7.3.1.1 min h)';
    for (let i = 0; i < 80; i++) {
      const r = run(h);
      if (r.rFlex <= 1 && r.rShear <= 1) break;
      gov = r.rFlex > 1 ? 'Flexure (tension-controlled limit)' : 'One-way shear (no stirrups)';
      h += 0.5;
    }
  }
  const r = run(h);
  const checks = [
    chk('Min. thickness for deflection', inchStr(hmin) + ' req.', inchStr(h) + ' provided', hmin / h, 'ACI 318-19 Table 7.3.1.1 (no deflection calc needed if met)'),
    chk('Flexure', `ρ = ${fx(r.rho * 100, 2)}%`, `ρ(εt=.005) = ${fx(r.rtc * 100, 2)}%`, r.rFlex),
    chk('One-way shear', fk(r.Vu, 2) + ' k/ft', fk(r.phiVc, 2) + ' k/ft', r.rShear, 'φVc per Table 22.5.5.1(c) with size effect λs')
  ];
  if (hFire) checks.push(chk('Fire rating', inchStr(hFire) + ' min', inchStr(h), hFire / h, 'IBC Table 722.2.2.1, siliceous aggregate'));
  const sp = (n) => Math.min(BARS[n][0] * 12 / r.As, 3 * h, 18);
  return {
    h, headline: inchStr(h) + ' one-way slab', sub: `${COEF[cont].label}, clear span ${fx(ln, 1)} ft`,
    gov: hTrial > 0 ? 'Trial thickness check' : gov,
    checks,
    details: [['Self-weight', fx(r.sw, 0) + ' psf'], ['Factored load wu', fx(r.wu, 0) + ' psf'], ['Design Mu', fx(r.Mu, 2) + ' k-ft/ft'], ['d (#5)', fx(r.d, 2) + ' in'],
      ['As req.', fx(r.As, 3) + ' in²/ft'], ['Bars', `#4 @ ${fx(Math.floor(sp(4)), 0)}" or #5 @ ${fx(Math.floor(sp(5)), 0)}" o.c.`], ['Span / depth', fx(ln * 12 / h, 1)]],
    notes: ['Moments by ACI 6.5 coefficients (uniform load, L ≤ 3D, spans within 20%).', 'Shrinkage/temperature steel 0.0018Ag perpendicular to span.',
      'Rule of thumb: simple L/20, end span L/24, interior L/28, cantilever L/10 (fy 60).']
  };
}

// ============ 2. RC TWO-WAY SLAB (flat plate / drop panels) ============
const LUMBER = [2.25, 4.25, 6.25, 8.25];
function punchGeom(loc, c, d) { // c column (in), d (in)
  if (loc === 'int') return { b0: 4 * (c + d), Acr: (c + d) * (c + d) / 144, as: 40, gam: 1.15, f: 1 };
  if (loc === 'edge') return { b0: 2 * (c + d / 2) + (c + d), Acr: (c + d / 2) * (c + d) / 144, as: 30, gam: 1.30, f: 0.5 };
  return { b0: 2 * (c + d / 2), Acr: (c + d / 2) * (c + d / 2) / 144, as: 20, gam: 1.50, f: 0.25 };
}
function rcTwoWay(p) {
  const { L1, L2, c, panel, loc, drop, SDL, LL, fc, fy, fire, hTrial, studs } = p;
  const Lmax = Math.max(L1, L2), Lmin = Math.min(L1, L2);
  const ln = Lmax * 12 - c;
  const fys = [40, 60, 80];
  const tbl = drop ? { ext: [36, 33, 30], extEB: [40, 36, 33], int: [40, 36, 33] } : { ext: [33, 30, 27], extEB: [36, 33, 30], int: [36, 33, 30] };
  const div = interp(fy, fys, tbl[panel]);
  const hmin = Math.max(ln / div, drop ? 4 : 5);
  const hFire = fireMinSlab(fire);
  const lsf = d => Math.min(1, SQ(2 / (1 + d / 10)));
  function run(h) {
    const sw = 150 * h / 12;
    const hd = drop ? (LUMBER.find(x => x >= h / 4) || 8.25) : 0;
    const wu = Math.max(1.2 * (sw + SDL) + 1.6 * LL, 1.4 * (sw + SDL));
    const d = h - 1.375;
    const dc = d + hd;
    const g = punchGeom(loc, c, dc);
    const Atrib = L1 * L2 * g.f;
    const Vu = wu / 1000 * (Atrib - g.Acr);
    const vc = studs ? 8 * SQ(fc) : lsf(dc) * Math.min(4, 2 + g.as * dc / g.b0) * SQ(fc);
    const phiVc = 0.75 * vc * g.b0 * dc / 1000;
    const rPunch = g.gam * Vu / phiVc;
    let rOut = 0, VuO = 0, phiVcO = 0;
    if (drop) {
      const Ld1 = L1 * 12 / 3, Ld2 = L2 * 12 / 3; // drop panel L/6 each side
      let b0, Acr;
      if (loc === 'int') { b0 = 2 * (Ld1 + d) + 2 * (Ld2 + d); Acr = (Ld1 + d) * (Ld2 + d) / 144; }
      else if (loc === 'edge') { b0 = 2 * (Ld1 / 2 + d / 2) + (Ld2 + d); Acr = (Ld1 / 2 + d / 2) * (Ld2 + d) / 144; }
      else { b0 = (Ld1 / 2 + d / 2) + (Ld2 / 2 + d / 2); Acr = (Ld1 / 2 + d / 2) * (Ld2 / 2 + d / 2) / 144; }
      VuO = wu / 1000 * (Atrib - Acr);
      phiVcO = 0.75 * lsf(d) * Math.min(4, 2 + g.as * d / b0) * SQ(fc) * b0 * d / 1000;
      rOut = VuO / phiVcO;
    }
    // Flexure (DDM, column strip)
    const lnf = ln / 12;
    const Mo = wu / 1000 * Lmin * lnf * lnf / 8;
    const kcs = panel === 'int' ? 0.4875 : 0.525;
    const Mcs = kcs * Mo / (Lmin / 2);
    const rho = rhoReq(Mcs, 12, dc, fc, fy);
    const rtc = rhoTC(fc, fy);
    return { h, hd, sw, wu, d, dc, g, Vu, phiVc, rPunch, VuO, phiVcO, rOut, Mo, Mcs, rho, rtc, rFlex: rho / rtc, As: Math.max(rho * 12 * dc, 0.0018 * 12 * h) };
  }
  let h, gov;
  const h0 = ceilTo(Math.max(hmin, hFire), 0.5);
  if (hTrial > 0) h = hTrial;
  else {
    h = h0; gov = hFire > hmin ? 'Fire rating min. thickness' : 'Deflection (ACI Table 8.3.1.1 min h)';
    for (let i = 0; i < 80; i++) {
      const r = run(h);
      if (r.rPunch <= 1 && r.rOut <= 1 && r.rFlex <= 1) break;
      gov = r.rPunch > 1 ? 'Punching shear at column' : r.rOut > 1 ? 'Punching outside drop panel' : 'Flexure (column strip)';
      h += 0.5;
    }
  }
  const r = run(h);
  const locName = { int: 'interior', edge: 'edge', corner: 'corner' }[loc];
  const checks = [
    chk('Min. thickness for deflection', inchStr(hmin) + ' req.', inchStr(h), hmin / h, `ACI 318-19 Table 8.3.1.1, ln = ${fx(ln / 12, 1)} ft`),
    chk(`Punching, ${locName} column`, `${fk(r.Vu)} k × ${r.g.gam} = ${fk(r.g.gam * r.Vu)} k`, `φVc = ${fk(r.phiVc)} k`, r.rPunch, `Factor ${r.g.gam} is a prelim allowance for unbalanced moment transfer. b0 = ${fx(r.g.b0, 1)}", d = ${fx(r.dc, 2)}"` + (studs ? '. With headed studs: φvn ≤ φ8√f\'c (ACI 22.6.6.3); check outer section.' : '')),
    chk('Flexure, column strip (neg.)', `ρ = ${fx(r.rho * 100, 2)}%`, `ρ(εt=.005) = ${fx(r.rtc * 100, 2)}%`, r.rFlex, `Mu = ${fx(r.Mcs, 1)} k-ft/ft (Direct Design Method)`)
  ];
  if (drop) checks.push(chk('Punching outside drop panel', fk(r.VuO) + ' k', fk(r.phiVcO) + ' k', r.rOut, 'Drop panel L/3 × L/3'));
  if (hFire) checks.push(chk('Fire rating', inchStr(hFire) + ' min', inchStr(h), hFire / h, 'IBC Table 722.2.2.1, siliceous'));
  const flags = [];
  if (r.rPunch > 0.85 && r.rPunch <= 1) flags.push({ lvl: 'warn', msg: 'Punching is close. Options: larger column, shear studs (headed stud rails), drop panels or shear caps.' });
  return {
    h, hd: r.hd, headline: inchStr(h) + (drop ? ` slab + ${inchStr(r.hd)} drop panels` : ' flat plate'),
    sub: `${fx(L1, 0)}×${fx(L2, 0)} ft bay, ${c}" columns, ${panel === 'int' ? 'interior' : 'exterior'} panel`,
    gov: hTrial > 0 ? 'Trial thickness check' : gov, checks, flags,
    details: [['Self-weight', fx(r.sw, 0) + ' psf'], ['wu', fx(r.wu, 0) + ' psf'], ['Total static moment Mo', fx(r.Mo, 0) + ' k-ft'],
      ['Column strip top As', fx(r.As, 2) + ' in²/ft'], ['ln / h', fx(ln / h, 1)], ['Avg d', fx(r.d, 2) + ' in']],
    notes: ['Rule of thumb (fy 60): flat plate ln/30 exterior, ln/33 interior; with drop panels ln/33–ln/36. Practical RC flat plate range up to ~25–28 ft.',
      'Punching uses ACI 318-19 Table 22.6.5.2 with size effect λs. Moment-transfer allowance: interior 1.15, edge 1.30, corner 1.50.',
      'Edge/corner column tributary taken as ½ and ¼ of bay; add cladding loads separately.']
  };
}

// ============ 3. PT SLAB ============
const FSE = 175; // ksi effective after losses
const STRAND = 0.153 * FSE; // 26.8 k per 0.5" strand
function ptFps(fse, fc, rp, Lh) {
  return Lh > 35 ? Math.min(fse + 10 + fc / (300 * rp) / 1000, fse + 30, 243) : Math.min(fse + 10 + fc / (100 * rp) / 1000, fse + 60, 243);
}
function solveMild(Mu, Fps, dp, ds, b, fc, fy) { // returns As needed (in2) so phiMn >= Mu; Fps = Aps*fps kips
  const Mn = As => { const T = Fps + As * fy; const a = T / (0.85 * fc / 1000 * b); return 0.9 * (Fps * (dp - a / 2) + As * fy * (ds - a / 2)) / 12; };
  if (Mn(0) >= Mu) return { As: 0, a: Fps / (0.85 * fc / 1000 * b) };
  let lo = 0, hi = Math.max(0, (0.85 * fc / 1000 * b * ds - Fps) / fy);
  if (Mn(hi) < Mu) return { As: Infinity };
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Mn(m) >= Mu) hi = m; else lo = m; }
  return { As: hi, a: (Fps + hi * fy) / (0.85 * fc / 1000 * b) };
}
function ptSlab(p) {
  const { sys, L1, L2, cont, use, SDL, LL, fc, fy, c, loc, bal, fire, hTrial, studs } = p;
  const two = sys === 'two';
  const ratio = two ? (use === 'roof' ? 48 : 45) : (use === 'roof' ? 52 : 48);
  const spans = two ? [L1, L2] : [L1];
  const Lmax = Math.max(...spans);
  const hFire = fireMinSlab(fire);
  const hPrac = two ? 7 : 5;
  const ftLim = (two ? 6 : 7.5) * SQ(fc);
  const PAmin = two ? 125 : 100, PAmax = 300;
  const cc = two ? 1.25 : 1.0;
  const kN = { both: 11, oneEnd: 10, simple: 0 }[cont], kP = { both: 16, oneEnd: 14, simple: 8 }[cont];
  function drape(h) { return cont === 'both' ? h - 2 * cc : cont === 'oneEnd' ? (h / 2 + h - cc) / 2 - cc : h / 2 - cc; }
  function run(h) {
    const sw = 150 * h / 12, D = sw + SDL;
    const a = drape(h);
    const dirs = spans.map((Ls, i) => {
      let F = bal / 100 * sw * Ls * Ls / (8 * a / 12); // lb/ft
      let PA = F / (12 * h);
      if (PA < PAmin) { PA = PAmin; F = PA * 12 * h; }
      const wb = 8 * F * (a / 12) / (Ls * Ls);
      const wnet = D + LL - wb;
      const S = 12 * h * h / 6;
      const Mneg = kN ? wnet * Ls * Ls / kN : 0, Mpos = wnet * Ls * Ls / kP; // lb-ft/ft
      const fTop = -PA + Mneg * 12 / S, fBot = -PA + Mpos * 12 / S;
      const fComp = PA + Math.max(Mneg, Mpos) * 12 / S;
      const wu = Math.max(1.2 * D + 1.6 * LL, 1.4 * D);
      const Mu = wu / 1000 * Ls * Ls * (kN ? 1 / kN : 1 / 8); // kip-ft/ft
      const Aps = F / 1000 / FSE; // in2/ft
      const dp = h - cc;
      const rp = Aps / (12 * dp);
      const fps = ptFps(FSE, fc, rp, Ls * 12 / h);
      const Lperp = two ? spans[1 - i] : 1;
      const AsMinCol = two && kN ? 0.00075 * h * Lperp * 12 / Lperp : 0; // in2 per ft avg (concentrated at column)
      const ms = solveMild(Mu, Aps * fps, dp, h - 1.0, 12, fc, fy);
      const AsTop = Math.max(ms.As, AsMinCol);
      const T = Aps * fps + AsTop * fy; const aa = T / (0.85 * fc / 1000 * 12); const cN = aa / beta1(fc);
      const et = 0.003 * (h - 1.0 - cN) / cN;
      const nBot = fBot > 2 * SQ(fc) ? 'bottom bonded bars req.' : 'none req. (ft ≤ 2√f\'c)';
      return { Ls, F, PA, wb, wnet, fTop, fBot, fComp, Mu, Aps, fps, AsTop, et, nBot, balPct: wb / sw * 100 };
    });
    const PAavg = dirs.reduce((s, x) => s + x.PA, 0) / dirs.length;
    let punch = null;
    if (two) {
      const wu = Math.max(1.2 * D + 1.6 * LL, 1.4 * D);
      const d = Math.max(0.8 * h, h - cc);
      const g = punchGeom(loc, c, d);
      const Vu = wu / 1000 * (L1 * L2 * g.f - g.Acr);
      let vc;
      if (loc === 'int') { const fpc = clamp(PAavg, 125, 500); const rf = SQ(Math.min(fc, 5000)); vc = Math.min(3.5 * rf, (g.as * d / g.b0 + 1.5) * rf) + 0.3 * fpc; }
      else vc = Math.min(1, SQ(2 / (1 + d / 10))) * Math.min(4, 2 + g.as * d / g.b0) * SQ(fc);
      if (studs) vc = 8 * SQ(fc);
      const phiVc = 0.75 * vc * g.b0 * d / 1000;
      punch = { Vu, phiVc, r: g.gam * Vu / phiVc, g, d };
    }
    const rStress = Math.max(...dirs.map(x => Math.max(x.fTop, x.fBot) / ftLim));
    const rComp = Math.max(...dirs.map(x => x.fComp / (0.6 * fc)));
    const rPA = Math.max(...dirs.map(x => x.PA / PAmax));
    const rStr = Math.max(...dirs.map(x => x.et >= 0.005 ? 0.5 : 0.005 / Math.max(x.et, 1e-6)));
    return { h, sw, a, dirs, punch, rStress, rComp, rPA, rStr, rPunch: punch ? punch.r : 0 };
  }
  let h, gov;
  const h0 = ceilTo(Math.max(Lmax * 12 / ratio, hFire, hPrac), 0.5);
  if (hTrial > 0) h = hTrial;
  else {
    h = h0; gov = `Span/depth L/${ratio} (PTI typical)`;
    if (hPrac >= Lmax * 12 / ratio) gov = 'Practical minimum';
    for (let i = 0; i < 60; i++) {
      const r = run(h);
      if (r.rStress <= 1 && r.rComp <= 1 && r.rPA <= 1 && r.rStr <= 1 && r.rPunch <= 1) break;
      gov = r.rPunch > 1 ? 'Punching shear' : r.rStress > 1 ? 'Service tensile stress (Class U)' : r.rPA > 1 ? 'Precompression P/A > 300 psi' : r.rComp > 1 ? 'Service compression' : 'Strength (not tension-controlled)';
      h += 0.5;
    }
  }
  const r = run(h);
  const checks = [];
  r.dirs.forEach((x, i) => {
    const lab = two ? ` (${fx(x.Ls, 0)} ft dir.)` : '';
    checks.push(chk('Tensile stress' + lab, fk(Math.max(x.fTop, x.fBot)) + ' psi', fk(ftLim) + ' psi', Math.max(x.fTop, x.fBot) / ftLim, two ? '6√f\'c two-way (ACI 24.5.2)' : '7.5√f\'c Class U'));
    checks.push(chk('Precompression P/A' + lab, fk(x.PA) + ' psi', `${PAmin}–${PAmax} psi`, x.PA / PAmax, x.PA <= PAmin + 0.5 ? 'At ACI/practical minimum; balance exceeds target' : 'Practical upper bound 300 psi (restraint cracking)'));
  });
  checks.push(chk('Service compression', fk(Math.max(...r.dirs.map(x => x.fComp))) + ' psi', fk(0.6 * fc) + ' psi', r.rComp));
  if (r.punch) checks.push(chk(`Punching, ${loc} column`, `${fk(r.punch.Vu)} k × ${r.punch.g.gam}`, `φVc = ${fk(r.punch.phiVc)} k`, r.rPunch, loc === 'int' ? 'vc = 3.5√f\'c + 0.3fpc (ACI 22.6.5.5)' : 'Non-prestressed formula used at edge/corner'));
  checks.push(chk('Strength, tension-controlled', `εt = ${fx(Math.min(...r.dirs.map(x => x.et)), 4)}`, '≥ 0.005', r.rStr));
  if (hFire) checks.push(chk('Fire rating', inchStr(hFire) + ' min', inchStr(h), hFire / h));
  const details = [['Self-weight', fx(r.sw, 0) + ' psf'], ['Tendon drape (avg)', fx(r.a, 2) + ' in']];
  let strandPsf = 0;
  r.dirs.forEach((x, i) => {
    const lab = two ? `Dir. ${fx(x.Ls, 0)} ft: ` : '';
    details.push([lab + 'Effective force', `${fx(x.F / 1000, 1)} k/ft (${fx(x.balPct, 0)}% SW balanced)`]);
    if (two && i === 0) details.push([lab + 'Banded tendons', `${Math.ceil(x.F / 1000 * L2 / STRAND)} strands per column line`]);
    else details.push([lab + 'Spacing (½" strand)', `${fx(Math.min(STRAND / (x.F / 1000) * 12, 99), 0)}" o.c. (max ${fx(Math.min(8 * h, 60), 0)}")`]);
    details.push([lab + 'Top mild steel', fx(x.AsTop, 2) + ' in²/ft avg at supports']);
    details.push([lab + 'Bottom mild steel', x.nBot]);
    strandPsf += x.F / 1000 / STRAND * 0.52;
  });
  details.push(['Strand weight', fx(strandPsf, 2) + ' psf']);
  details.push(['Span / depth', fx(Lmax * 12 / h, 1)]);
  return {
    h, headline: `${inchStr(h)} PT ${two ? 'two-way flat plate' : 'one-way slab'}`,
    sub: two ? `${fx(L1, 0)}×${fx(L2, 0)} ft bay, ${COEF[cont].label}` : `${fx(L1, 0)} ft span, ${COEF[cont].label}`,
    gov: hTrial > 0 ? 'Trial thickness check' : gov, checks, details,
    notes: ['Load balancing; ½" unbonded strands at fse = 175 ksi (26.8 k each). CGS 1–1¼" from faces.',
      'Span/depth (PTI): two-way flat plate L/45 floor, L/48 roof; one-way L/48 floor, L/52 roof. Practical PT flat plate range 25–35 ft.',
      'Secondary (hyperstatic) moments ignored. Check restraint (long walls/stiff cores) and pour-strip layout.']
  };
}

// ============ 4. RC BEAM ============
function rcBeamCore(p) {
  // p: L(ft), cont, wD (klf, excl. stem), wL (klf), ts (in slab, for stem self-wt deduction), b (in, 0=auto), fc, fy, hTrial, hMax
  const { L, cont, fc, fy } = p;
  const div = { simple: 16, oneEnd: 18.5, both: 21, cant: 8 }[cont];
  const hmin = L * 12 / div * (0.4 + fy / 100);
  const k = coefM(cont);
  const Vk = cont === 'cant' ? 1 : COEF[cont].V / 2;
  const rtc = rhoTC(fc, fy);
  const defCoef = { simple: 5 / 384, oneEnd: 2.08 / 384, both: 1 / 384, cant: 1 / 8 }[cont];
  function run(h, bIn) {
    const b = bIn || Math.max(12, ceilTo(0.5 * h, 2));
    const stem = 0.15 * b * Math.max(h - (p.ts || 0), 0) / 144;
    const wD = p.wD + stem, wL = p.wL;
    const wu = Math.max(1.2 * wD + 1.6 * wL, 1.4 * wD);
    const Mu = wu * L * L * k;
    let d = h - 2.5;
    let rho = rhoReq(Mu, b, d, fc, fy);
    let As = rho * b * d;
    const bar = 9; const nPer = Math.max(2, Math.floor((b - 2 * 1.5 - 2 * 0.5 + 1.128) / (1.128 + 1.128)));
    let n = Math.ceil(As / BARS[bar][0]); let layers = 1;
    if (n > nPer) { layers = 2; d = h - 3.75; rho = rhoReq(Mu, b, d, fc, fy); As = rho * b * d; n = Math.ceil(As / BARS[bar][0]); }
    const AsMin = Math.max(3 * SQ(fc), 200) / (fy * 1000) * b * d;
    As = Math.max(As, AsMin);
    const Vu = wu * (Vk * L - (cont === 'cant' ? 0 : d / 12));
    const Vc = 2 * SQ(fc) * b * d / 1000;
    const VsReq = Math.max(0, Vu / 0.75 - Vc);
    const VsMax = 8 * SQ(fc) * b * d / 1000, Vs4 = 4 * SQ(fc) * b * d / 1000;
    const sMax = VsReq > Vs4 ? Math.min(d / 4, 12) : Math.min(d / 2, 24);
    const s = VsReq > 0 ? Math.min(2 * 0.2 * fy * d / VsReq, sMax) : sMax;
    // deflection info (Bischoff), service
    const Ec = EcKsi(fc) * 1000; const Ig = b * h ** 3 / 12; const fr = 7.5 * SQ(fc);
    const Mcr = fr * Ig / (h / 2) / 12000;
    const n_ = 29000 / (Ec / 1000); const rr = As / (b * d);
    const kk = SQ(2 * rr * n_ + (rr * n_) ** 2) - rr * n_;
    const Icr = b * (kk * d) ** 3 / 3 + n_ * As * (d - kk * d) ** 2;
    const Ie = Ma => Ma <= 2 / 3 * Mcr ? Ig : Math.min(Ig, Icr / (1 - ((2 / 3 * Mcr / Ma) ** 2) * (1 - Icr / Ig)));
    const MaD = wD * L * L * k, MaT = (wD + wL) * L * L * k;
    const dl = (w, I) => defCoef * (w / 12) * (L * 12) ** 4 / (Ec / 1000 * I);
    const dD = dl(wD, Ie(MaD)), dT = dl(wD + wL, Ie(MaT)), dL = dT - dD;
    const dLT = 2 * dD + dL;
    return { h, b, wD, wL, wu, Mu, d, rho, As, n, bar, layers, nPer, Vu, Vc, VsReq, VsMax, Vs4, s, rFlex: rho / rtc, rShear: VsReq / VsMax, dL, dLT, stem };
  }
  return { hmin, run, rtc };
}
function rcBeam(p) {
  const { L, cont, trib, ts, SDL, LL, llrOn, fc, fy, b, hTrial } = p;
  const lr = llr(LL, cont === 'cant' ? 1 : 2, L * trib, false, llrOn);
  const wD = (150 * ts / 12 + SDL) * trib / 1000 + (p.wDadd || 0);
  const wL = lr.L * trib / 1000 + (p.wLadd || 0);
  const core = rcBeamCore({ L, cont, wD, wL, ts, fc, fy });
  let h, gov;
  const h0 = Math.max(ceilTo(core.hmin, 2), ceilTo(ts + 6, 2), 12);
  if (hTrial > 0) h = hTrial;
  else {
    h = h0; gov = 'Deflection (ACI Table 9.3.1.1 min h)';
    for (let i = 0; i < 60; i++) {
      const r = core.run(h, b);
      if (r.rFlex <= 1 && r.rShear <= 1) break;
      gov = r.rFlex > 1 ? 'Flexure (tension-controlled limit)' : 'Shear (Vs ≤ 8√f\'c bd)';
      h += 2;
    }
  }
  const r = core.run(h, b);
  const checks = [
    chk('Min. depth for deflection', inchStr(core.hmin), inchStr(h), core.hmin / h, 'ACI Table 9.3.1.1 (members not supporting partitions likely damaged)'),
    chk('Flexure', `ρ = ${fx(r.rho * 100, 2)}%`, `ρ(εt=.005) = ${fx(core.rtc * 100, 2)}%`, r.rFlex, `Mu = ${fk(r.Mu)} k-ft`),
    chk('Shear (section limit)', `Vs req = ${fk(r.VsReq)} k`, `Vs,max = ${fk(r.VsMax)} k`, r.rShear, `Vu = ${fk(r.Vu)} k at d`),
    chk('Live load deflection', fx(r.dL, 2) + ' in', fx(L * 12 / 360, 2) + ' in (L/360)', r.dL / (L * 12 / 360), 'Info only: Ie per ACI 24.2.3.5, rectangular section', true),
    chk('Long-term + LL deflection', fx(r.dLT, 2) + ' in', fx(L * 12 / 480, 2) + ' in (L/480)', r.dLT / (L * 12 / 480), 'Info only (L/480 applies where partitions likely damaged): λΔ = 2.0 on dead', true)
  ];
  const flags = [];
  if (r.VsReq > r.Vs4) flags.push({ lvl: 'warn', msg: 'Vs > 4√f\'c·bd: stirrup spacing halves to d/4. Consider wider beam.' });
  if (r.layers === 2) flags.push({ lvl: 'info', msg: `Bars need 2 layers in ${r.b}" width.` });
  if (L * 12 / h < 10 && cont !== 'cant') flags.push({ lvl: 'warn', msg: 'Span/depth < 10 — deep for a floor beam; check headroom, consider PT or steel.' });
  return {
    h, b: r.b, headline: `${r.b}" × ${h}" RC beam`, sub: `${fx(L, 0)} ft span, ${COEF[cont].label}, trib ${fx(trib, 1)} ft`,
    gov: hTrial > 0 ? 'Trial depth check' : gov, checks, flags,
    details: [['wD / wL (svc)', `${fx(r.wD, 2)} / ${fx(r.wL, 2)} klf` + (lr.f < 1 ? ` (LL red. ${fx(lr.f, 2)})` : '')], ['wu', fx(r.wu, 2) + ' klf'],
      ['Mu / Vu', `${fk(r.Mu)} k-ft / ${fk(r.Vu)} k`], ['As req.', `${fx(r.As, 2)} in² → ${r.n}-#${r.bar}` + (r.layers > 1 ? ' (2 layers)' : '')],
      ['Stirrups', `#4 @ ${fx(Math.floor(r.s), 0)}" (2 legs) near support`], ['Span / depth', fx(L * 12 / h, 1)]],
    notes: ['Moments by ACI 6.5 coefficients. Rectangular section (T-beam flange ignored: conservative for +M).', 'Rule of thumb: depth L/16 simple, L/18.5 end, L/21 interior, L/8 cantilever; width ≈ ½–⅔ depth.',
      'Practical RC beam spans 20–35 ft; beyond ~35 ft consider PT beams.']
  };
}

// ============ 5. PT BEAM ============
function tSection(b, h, bf, ts) {
  const Aw = b * (h - ts), Af = bf * ts;
  const A = Aw + Af;
  const yb = (Aw * (h - ts) / 2 + Af * (h - ts / 2)) / A;
  const I = b * (h - ts) ** 3 / 12 + Aw * (yb - (h - ts) / 2) ** 2 + bf * ts ** 3 / 12 + Af * (h - ts / 2 - yb) ** 2;
  return { A, yb, I, St: I / (h - yb), Sb: I / yb };
}
function ptBeam(p) {
  const { L, cont, trib, ts, SDL, LL, llrOn, fc, fy, b, use, bal, hTrial } = p;
  const ratio = use === 'roof' ? 28 : 24;
  const lr = llr(LL, 2, L * trib, false, llrOn);
  const ftLim = 7.5 * SQ(fc);
  const kN = { both: 11, oneEnd: 10, simple: 0 }[cont], kP = { both: 16, oneEnd: 14, simple: 8 }[cont];
  const cT = 3, cB = 3;
  function run(h) {
    const bf = Math.min(trib * 12, b + 16 * ts, L * 12 / 4);
    const s = tSection(b, h, bf, ts);
    const slab = 150 * ts / 12 * trib / 1000, stem = 0.15 * b * (h - ts) / 144;
    const D = slab + stem + SDL * trib / 1000 + (p.wDadd || 0), Lw = lr.L * trib / 1000 + (p.wLadd || 0);
    const a = cont === 'both' ? h - cT - cB : cont === 'oneEnd' ? (s.yb + h - cT) / 2 - cB : s.yb - cB;
    let P = bal / 100 * D * L * L / (8 * a / 12);
    let PA = P / s.A * 1000;
    if (PA < 125) { PA = 125; P = PA * s.A / 1000; }
    const wb = 8 * P * (a / 12) / (L * L);
    const wnet = D + Lw - wb;
    const Mn_ = kN ? wnet * L * L / kN : 0, Mp_ = wnet * L * L / kP;
    const fTop = -PA + Mn_ * 12000 / s.St, fBotC = PA + Mn_ * 12000 / s.Sb;
    const fBot = -PA + Mp_ * 12000 / s.Sb, fTopC = PA + Mp_ * 12000 / s.St;
    const fT = Math.max(fTop, fBot), fC = Math.max(fBotC, fTopC);
    const wu = Math.max(1.2 * D + 1.6 * Lw, 1.4 * D);
    const MuN = kN ? wu * L * L / kN : 0, MuP = wu * L * L / (kN ? kP : 8);
    const Aps = P / FSE;
    const dp = h - cT;
    const fpsN = ptFps(FSE, fc, Aps / (b * dp), L * 12 / h);
    const fpsP = ptFps(FSE, fc, Aps / (bf * dp), L * 12 / h);
    const mN = kN ? solveMild(MuN, Aps * fpsN, dp, h - 2.5, b, fc, fy) : { As: 0, a: 0 };
    const mP = solveMild(MuP, Aps * fpsP, h - cB, h - 2.5, bf, fc, fy);
    const AsMinN = kN ? 0.004 * (bf * ts + b * Math.max(0, h - s.yb - ts)) : 0;
    const AsMinP = 0.004 * b * s.yb;
    const etN = kN && isFinite(mN.As) ? 0.003 * (h - 2.5 - mN.a / beta1(fc)) / (mN.a / beta1(fc)) : 1;
    const etP = isFinite(mP.As) ? 0.003 * (h - 2.5 - mP.a / beta1(fc)) / (mP.a / beta1(fc)) : 0;
    const et = Math.min(etN, etP);
    const d = Math.max(0.8 * h, dp);
    const Vu = wu * ((cont === 'oneEnd' ? 1.15 : 1) * L / 2 - d / 12);
    const Vc = 2 * SQ(fc) * b * d / 1000;
    const VsReq = Math.max(0, Vu / 0.75 - Vc), VsMax = 8 * SQ(fc) * b * d / 1000;
    return { h, bf, s, D, Lw, a, P, PA, wb, fT, fC, MuN, MuP, Aps, AsN: Math.max(mN.As, AsMinN), AsP: Math.max(mP.As, AsMinP), et, Vu, VsReq, VsMax,
      rT: fT / ftLim, rC: fC / (0.6 * fc), rPA: PA / 500, rStr: et >= 0.005 ? 0.5 : 0.005 / Math.max(et, 1e-6), rV: VsReq / VsMax, n: Math.ceil(P / STRAND) };
  }
  let h, gov;
  const h0 = Math.max(ceilTo(L * 12 / ratio, 1), ceilTo(ts + 8, 1));
  if (hTrial > 0) h = hTrial;
  else {
    h = h0; gov = `Span/depth L/${ratio} (typical PT beam)`;
    for (let i = 0; i < 60; i++) {
      const r = run(h);
      if (r.rT <= 1 && r.rC <= 1 && r.rPA <= 1 && r.rStr <= 1 && r.rV <= 1) break;
      gov = r.rT > 1 ? 'Service tensile stress (Class U)' : r.rV > 1 ? 'Shear (Vs ≤ 8√f\'c bd)' : r.rPA > 1 ? 'Precompression P/A > 500 psi' : r.rC > 1 ? 'Service compression' : 'Strength (not tension-controlled)';
      h += 1;
    }
  }
  const r = run(h);
  const checks = [
    chk('Tensile stress (Class U)', fk(r.fT) + ' psi', fk(ftLim) + ' psi', r.rT, '7.5√f\'c, T-section'),
    chk('Service compression', fk(r.fC) + ' psi', fk(0.6 * fc) + ' psi', r.rC),
    chk('Precompression P/A', fk(r.PA) + ' psi', '125–500 psi', r.rPA),
    chk('Strength, tension-controlled', `εt = ${fx(r.et, 4)}`, '≥ 0.005', r.rStr, `Mu− ${fk(r.MuN)} / Mu+ ${fk(r.MuP)} k-ft`),
    chk('Shear (section limit)', `Vs req = ${fk(r.VsReq)} k`, `Vs,max = ${fk(r.VsMax)} k`, r.rV, `Vu = ${fk(r.Vu)} k (Vc = 2√f'c bd, conservative)`)
  ];
  return {
    h, b, headline: `${b}" × ${h}" PT beam`, sub: `${fx(L, 0)} ft span, ${COEF[cont].label}, trib ${fx(trib, 1)} ft`,
    gov: hTrial > 0 ? 'Trial depth check' : gov, checks,
    details: [['Effective force P', `${fk(r.P)} k → ${r.n} × ½" strands`], ['Drape', fx(r.a, 1) + ' in'], ['Balanced load', `${fx(r.wb, 2)} klf (${fx(r.wb / r.D * 100, 0)}% of dead)`],
      ['wD / wL (svc)', `${fx(r.D, 2)} / ${fx(r.Lw, 2)} klf`], ['Effective flange', fx(r.bf, 0) + ' in'], ['Mild steel top / bottom', `${fx(r.AsN, 2)} / ${fx(r.AsP, 2)} in²`], ['Span / depth', fx(L * 12 / h, 1)]],
    notes: ['Load balancing, unbonded ½" strands (fse 175 ksi). CGS 3" from top at supports, 3" from bottom at midspan.', 'Typical PT beam depth L/20–L/28 (floor ≈ L/24); width 18–36". Practical spans 30–60 ft.',
      'Min bonded steel 0.004·Act included. Secondary moments ignored.']
  };
}

// ============ 6. STEEL ============
function steelFlex(s, Fy, Lb, Cb) { // Lb in inches -> phiMn kip-ft
  const E = ES, Mp = Fy * s.Zx;
  const lp = 0.38 * SQ(E / Fy), lrf = 1.0 * SQ(E / Fy);
  let Mflb = Mp;
  if (s.bf2tf > lp) Mflb = Mp - (Mp - 0.7 * Fy * s.Sx) * (s.bf2tf - lp) / (lrf - lp);
  const Lp = 1.76 * s.ry * SQ(E / Fy);
  const Jc = s.J / (s.Sx * s.ho);
  const Lr = 1.95 * s.rts * E / (0.7 * Fy) * SQ(Jc + SQ(Jc * Jc + 6.76 * (0.7 * Fy / E) ** 2));
  let Mltb = Mp;
  if (Lb > Lp && Lb <= Lr) Mltb = Math.min(Mp, Cb * (Mp - (Mp - 0.7 * Fy * s.Sx) * (Lb - Lp) / (Lr - Lp)));
  else if (Lb > Lr) { const Fcr = Cb * PI * PI * E / (Lb / s.rts) ** 2 * SQ(1 + 0.078 * Jc * (Lb / s.rts) ** 2); Mltb = Math.min(Mp, Fcr * s.Sx); }
  return { phiMn: 0.9 * Math.min(Mflb, Mltb) / 12, Lp: Lp / 12, Lr: Lr / 12, phiMp: 0.9 * Math.min(Mp, Mflb) / 12 };
}
function steelShear(s, Fy) {
  const E = ES; let phi = 0.9, Cv1 = 1;
  if (s.htw <= 2.24 * SQ(E / Fy)) phi = 1.0;
  else { const lim = 1.10 * SQ(5.34 * E / Fy); Cv1 = s.htw <= lim ? 1 : lim / s.htw; }
  return phi * 0.6 * Fy * s.d * s.tw * Cv1;
}
// generic selection: demand = applied + 1.2*selfweight*unit
function steelSelect(o) {
  // o: {Mu, Vu, Mu1, Vu1 (per klf), defl:[{name, A (kip-in3 numerator for applied), A1 (per klf self wt), sw:bool, lim (in)}], Lb (ft), Cb, Fy, maxD, minD}
  const out = [];
  for (const s of SHAPES) {
    if (o.maxD && s.d > o.maxD + 0.01) continue;
    if (o.minD && s.d < o.minD - 0.01) continue;
    if (o.nomSet && !o.nomSet.includes(s.nom)) continue;
    const w = s.W / 1000;
    const Mu = o.Mu + 1.2 * w * o.Mu1, Vu = o.Vu + 1.2 * w * o.Vu1;
    const fl = steelFlex(s, o.Fy, o.Lb * 12, o.Cb);
    const phiVn = steelShear(s, o.Fy);
    const rM = Mu / fl.phiMn, rV = Vu / phiVn;
    const dfl = o.defl.map(x => { const D = (x.A + (x.sw ? w * x.A1 : 0)) / (ES * s.Ix); return { name: x.name, D, lim: x.lim, r: D / x.lim }; });
    const rD = Math.max(0, ...dfl.map(x => x.r));
    const rmax = Math.max(rM, rV, rD);
    out.push({ s, Mu, Vu, phiMn: fl.phiMn, phiVn, rM, rV, dfl, rD, rmax, pass: rmax <= 1, Lp: fl.Lp, Lr: fl.Lr });
  }
  out.sort((a, b) => a.s.W - b.s.W || a.s.d - b.s.d);
  const best = out.find(x => x.pass);
  const byDepth = {};
  for (const x of out) if (x.pass && !byDepth[x.s.nom]) byDepth[x.s.nom] = x;
  const shallow = Object.values(byDepth).sort((a, b) => a.s.d - b.s.d)[0];
  return { all: out, best, byDepth, shallow };
}
function govSteel(x) {
  const m = { rM: 'Flexure', rV: 'Shear', rD: 'Deflection' };
  let k = 'rM'; for (const kk of ['rV', 'rD']) if (x[kk] > x[k]) k = kk;
  if (k === 'rD') { const d = x.dfl.reduce((a, b) => b.r > a.r ? b : a); return 'Deflection — ' + d.name; }
  if (k === 'rM' && x.Lb > x.Lp) return 'Flexure (LTB)';
  return m[k];
}
function depthTable(sel, extra) {
  const rows = Object.keys(sel.byDepth).map(Number).sort((a, b) => a - b).map(nom => {
    const x = sel.byDepth[nom];
    return [x.s.name, fx(x.s.d, 1) + '"', fx(x.rM, 2), fx(x.rV, 2), fx(x.rD, 2), extra ? extra(x) : ''];
  });
  return rows;
}
function steelBeam(p) {
  const { L, trib, SDL, LL, llrOn, Fy, brace, Lb, Cb, dLL, dTot, maxD, maxLd } = p;
  const lr = llr(LL, 2, L * trib, false, llrOn);
  const wD = SDL * trib / 1000 + (p.wDadd || 0), wL = lr.L * trib / 1000 + (p.wLadd || 0);
  const wu = 1.2 * wD + 1.6 * wL;
  const Lin = L * 12, k5 = 5 * Lin ** 4 / 384 / 12; // per klf
  const sel = steelSelect({
    Mu: Math.max(wu, 1.4 * wD) * L * L / 8, Vu: Math.max(wu, 1.4 * wD) * L / 2, Mu1: L * L / 8, Vu1: L / 2,
    defl: [{ name: `LL ≤ L/${dLL}`, A: wL * k5, A1: 0, sw: false, lim: Lin / dLL }, { name: `Total ≤ L/${dTot}`, A: (wD + wL) * k5, A1: k5, sw: true, lim: Lin / dTot }],
    Lb: brace === 'cont' ? 0 : Lb, Cb: brace === 'cont' ? 1 : Cb, Fy, maxD, minD: maxLd ? Lin / maxLd : 0
  });
  if (!sel.best) return { headline: 'No W-shape works', sub: 'Reduce span/tributary, add bracing, or use plate girder', gov: '—', checks: [], status: 'fail' };
  const x = sel.best; x.Lb = brace === 'cont' ? 0 : Lb;
  const IreqLL = wL * k5 / (ES * Lin / dLL);
  return {
    headline: x.s.name, sub: `${fx(L, 0)} ft simple span, trib ${fx(trib, 1)} ft, Fy ${Fy} ksi` + (brace === 'cont' ? ', top flange braced' : `, Lb = ${Lb} ft`),
    gov: govSteel(x),
    checks: [chk('Flexure', fk(x.Mu) + ' k-ft', fk(x.phiMn) + ' k-ft', x.rM, `Lp = ${fx(x.Lp, 1)} ft, Lr = ${fx(x.Lr, 1)} ft`), chk('Shear', fk(x.Vu) + ' k', fk(x.phiVn) + ' k', x.rV),
      ...x.dfl.map(d => chk('Deflection ' + d.name, fx(d.D, 2) + ' in', fx(d.lim, 2) + ' in', d.r))],
    details: [['wD / wL (svc)', `${fx(wD, 2)} / ${fx(wL, 2)} klf` + (lr.f < 1 ? ` (LL red. ${fx(lr.f, 2)})` : '')], ['Shallowest that works', sel.shallow.s.name], ['Ix req. (LL defl.)', fx(IreqLL, 0) + ' in⁴'], ['Span / depth', fx(Lin / x.s.d, 1)]],
    tables: [{ title: 'Lightest by nominal depth', cols: ['Shape', 'd', 'M', 'V', 'Δ', ''], rows: depthTable(sel), hl: x.s.name }],
    notes: ['AISC 360-22 F2/F3, G2. Self-weight included. Non-composite.', 'Rule of thumb: non-composite floor beam depth ≈ L/20 (in ≈ 0.6 × span in ft); roof L/24.']
  };
}

// ---- composite ----
const DECKS = { 1.5: { pitch: 6, uns: '6–8 ft' }, 2: { pitch: 12, uns: '8–11 ft' }, 3: { pitch: 12, uns: '10–14 ft' } };
const FIRE_TOP = { none: { NW: 2, LW: 2 }, '1': { NW: 3.5, LW: 2.5 }, '1.5': { NW: 4, LW: 3 }, '2': { NW: 4.5, LW: 3.25 }, '3': { NW: 5.25, LW: 4.1875 } };
function compMn(s, Fy, Q, beff, tTot, tc, fck) {
  const AsFy = s.A * Fy;
  if (Q >= AsFy) { const a = AsFy / (0.85 * fck * beff); return AsFy * (s.d / 2 + tTot - a / 2); }
  const C = Q, a = C / (0.85 * fck * beff);
  const Cs = (AsFy - C) / 2, Ac = Cs / Fy;
  let yc;
  if (Ac <= s.bf * s.tf) yc = Ac / s.bf / 2;
  else { const x = s.tf + (Ac - s.bf * s.tf) / s.tw; yc = (s.bf * s.tf * s.tf / 2 + s.tw * (x - s.tf) * (s.tf + (x - s.tf) / 2)) / Ac; }
  const T = AsFy - Cs, yt = (s.A * s.d / 2 - Ac * yc) / (s.A - Ac);
  return T * yt - Cs * yc + C * (tTot - a / 2);
}
function compItr(s, beff, tTot, tc, n) {
  const Acn = beff * tc / n, yc = -(tTot - tc / 2);
  const ybar = (s.A * s.d / 2 + Acn * yc) / (s.A + Acn);
  if (ybar >= -(tTot - tc)) return s.Ix + s.A * (s.d / 2 - ybar) ** 2 + beff * tc ** 3 / 12 / n + Acn * (yc - ybar) ** 2;
  const bn = beff / n; const x = (-s.A + SQ(s.A ** 2 + 2 * bn * s.A * (s.d / 2 + tTot))) / bn;
  return bn * x ** 3 / 3 + s.Ix + s.A * (s.d / 2 + tTot - x) ** 2;
}
function compositeDeck(p) {
  const { hr, conc, fire, tOver } = p;
  const top = FIRE_TOP[fire][conc];
  const tTot = tOver > 0 ? tOver : hr + Math.max(top, 2);
  const tc = tTot - hr;
  const wc = conc === 'NW' ? 145 : 115;
  const psf = wc * (tc + 0.5 * hr) / 12 + 2.5;
  const stud = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7].find(x => x >= hr + 1.5 && x <= tTot - 0.5) || null;
  return { tTot, tc, top, psf, wc, stud, fireOK: tc >= top - 1e-6, uns: DECKS[hr].uns, pitch: DECKS[hr].pitch };
}
function compositeBeam(p) {
  const { L, s: sp, hr, conc, fc, fire, tOver, SDL, LL, llrOn, Fy, studD, perRib, orient, dLL, dTot, maxD, maxLd } = p;
  const dk = compositeDeck({ hr, conc, fire, tOver });
  const { tTot, tc, psf: slabPsf, wc } = dk;
  const fck = fc / 1000, Ec = Math.pow(wc, 1.5) * SQ(fck), n = ES / Ec;
  const beff = Math.min(L * 12 / 4, sp * 12);
  const Asa = PI * studD * studD / 4;
  const Rg = orient === 'perp' ? ({ 1: 1.0, 2: 0.85, 3: 0.7 }[perRib]) : 1.0, Rp = orient === 'perp' ? 0.6 : 0.75;
  const Qn = Math.min(0.5 * Asa * SQ(fck * Ec), Rg * Rp * Asa * 65);
  const maxHalf = orient === 'perp' ? Math.floor(L * 12 / 2 / dk.pitch) * perRib : Math.floor(L * 12 / 2 / (6 * studD)) * 2;
  const lr = llr(LL, 2, L * sp, false, llrOn);
  const wSlab = slabPsf * sp / 1000, wSDL = SDL * sp / 1000, wLL = lr.L * sp / 1000, wCon = 20 * sp / 1000;
  const Lin = L * 12, k5 = 5 * Lin ** 4 / 384 / 12;
  const res = [];
  for (const s of SHAPES) {
    if (maxD && s.d > maxD + 0.01) continue;
    if (s.d < 8 || (maxLd && L * 12 / s.d > maxLd + 0.01) || s.d > L * 12 / 12) continue;
    const w = s.W / 1000;
    const D = wSlab + w + wSDL;
    const Mu = Math.max(1.2 * D + 1.6 * wLL, 1.4 * D) * L * L / 8;
    const Vu = Math.max(1.2 * D + 1.6 * wLL, 1.4 * D) * L / 2;
    const MuC = (1.2 * (wSlab + w) + 1.6 * wCon) * L * L / 8;
    const fl = steelFlex(s, Fy, 0, 1);
    const phiVn = steelShear(s, Fy);
    const Cf = Math.min(s.A * Fy, 0.85 * fck * beff * tc);
    const phiMnQ = Q => 0.9 * compMn(s, Fy, Q, beff, tTot, tc, fck) / 12;
    const phiMnFull = phiMnQ(Cf);
    let Qreq = 0.25 * Cf;
    if (phiMnQ(Qreq) < Mu) { let lo = Qreq, hi = Cf; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (phiMnQ(m) >= Mu) hi = m; else lo = m; } Qreq = hi; }
    const nHalf = Math.ceil(Qreq / Qn - 1e-9);
    const Qprov = Math.min(nHalf * Qn, Cf);
    const phiMn = phiMnQ(Qprov);
    const Itr = compItr(s, beff, tTot, tc, n);
    const Ieq = 0.75 * (s.Ix + SQ(Qprov / Cf) * (Itr - s.Ix));
    const dL = wLL * k5 / (ES * Ieq), dSL = (wLL + wSDL) * k5 / (ES * Ieq);
    const dWet = (wSlab + w) * k5 / (ES * s.Ix);
    const camber = dWet >= 0.75 && L >= 20 ? Math.floor(0.8 * dWet * 4) / 4 : 0;
    const wj = ((slabPsf + Math.min(SDL, 10) + 11) * sp / 1000 + w);
    const dj = wj * k5 / (ES * Itr);
    const fn = 0.18 * SQ(386 / dj);
    const rM = phiMnFull >= Mu ? Mu / phiMn : Mu / phiMnFull;
    const rC = MuC / fl.phiMp, rV = Vu / phiVn, rS = nHalf / maxHalf;
    const rD = Math.max(dL / (Lin / dLL), dSL / (Lin / dTot));
    const rmax = Math.max(rM, rC, rV, rS, rD);
    res.push({ s, Mu, Vu, MuC, phiMn, phiMnFull, phiMp: fl.phiMp, phiVn, Cf, Qreq, nHalf, Qprov, pct: Qprov / Cf, Itr, Ieq, dL, dSL, dWet, camber, fn, rM, rC, rV, rS, rD, rmax, pass: rmax <= 1 });
  }
  res.sort((a, b) => a.s.W - b.s.W || a.s.d - b.s.d);
  const best = res.find(x => x.pass);
  const byDepth = {}; for (const x of res) if (x.pass && !byDepth[x.s.nom]) byDepth[x.s.nom] = x;
  const deckDetails = [['Slab', `${inchStr(hr)} deck + ${inchStr(tc)} ${conc} topping = ${inchStr(tTot)} total`], ['Slab weight', fx(slabPsf, 0) + ' psf (incl. deck)'],
    ['Fire rating topping (unprotected deck)', fire === 'none' ? '2" min (AISC I3.2c)' : `${inchStr(dk.top)} ${conc} for ${fire}-hr` + (dk.fireOK ? '' : ' ✗ NOT MET')],
    ['Stud', dk.stud ? `${studD}" × ${dk.stud}" (≥ deck + 1½", ½" cover)` : 'Slab too thin for studs'], ['Typical unshored deck span', dk.uns + ' (verify mfr. tables)'],
    ['Qn per stud', `${fx(Qn, 1)} k (Rg ${Rg}, Rp ${Rp})`], ['beff', fx(beff, 0) + ' in']];
  if (!best) return { headline: 'No W-shape works', sub: 'Reduce span or spacing, or relax depth limits', gov: '—', checks: [], details: deckDetails, status: 'fail' };
  const x = best;
  const govMap = { rM: 'Composite flexure', rC: 'Construction (wet concrete, steel alone)', rV: 'Shear', rS: 'Stud count (rib spacing)', rD: 'Deflection (composite)' };
  let g = 'rM'; for (const k of ['rC', 'rV', 'rS', 'rD']) if (x[k] > x[g]) g = k;
  const flags = [];
  if (x.fn < 5) flags.push({ lvl: 'warn', msg: `Beam frequency ≈ ${fx(x.fn, 1)} Hz — run AISC DG11 walking vibration check.` });
  if (!dk.fireOK) flags.push({ lvl: 'fail', msg: 'Topping below fire-rating minimum for unprotected deck. Increase slab or spray-fireproof deck.' });
  return {
    headline: `${x.s.name} [${2 * x.nHalf}]` + (x.camber ? ` c=${inchStr(x.camber)}` : ''),
    sub: `${fx(L, 0)} ft span @ ${fx(sp, 1)} ft o.c., ${inchStr(tTot)} slab on ${hr}" deck`,
    gov: govMap[g], flags,
    checks: [chk('Composite flexure', fk(x.Mu) + ' k-ft', fk(x.phiMn) + ' k-ft', x.rM, `${fx(x.pct * 100, 0)}% composite, ΣQn = ${fk(x.Qprov)} k`),
      chk('Construction stage', fk(x.MuC) + ' k-ft', fk(x.phiMp) + ' k-ft', x.rC, 'Unshored; wet concrete + 20 psf, deck braces flange'),
      chk('Shear', fk(x.Vu) + ' k', fk(x.phiVn) + ' k', x.rV), chk('Studs per half span', `${x.nHalf}`, `${maxHalf} max`, x.rS, `${perRib} per rib, ${orient === 'perp' ? 'deck ⟂ beam' : 'deck ∥ beam'}`),
      chk('Deflection LL', fx(x.dL, 2) + ' in', fx(Lin / dLL, 2) + ` in (L/${dLL})`, x.dL / (Lin / dLL), 'Ieff = 0.75·Iequiv (AISC Commentary I3.2)'),
      chk('Deflection SDL+LL', fx(x.dSL, 2) + ' in', fx(Lin / dTot, 2) + ` in (L/${dTot})`, x.dSL / (Lin / dTot))],
    details: [...deckDetails, ['Wet concrete deflection', fx(x.dWet, 2) + ' in' + (x.camber ? ` → camber ${inchStr(x.camber)}` : ' (no camber)')], ['Beam frequency (info)', fx(x.fn, 1) + ' Hz'], ['Span / depth', fx(Lin / x.s.d, 1)]],
    tables: [{ title: 'Lightest by nominal depth', cols: ['Shape', 'd', 'Studs', '% comp', 'Camber', 'Gov. ratio'], rows: Object.keys(byDepth).map(Number).sort((a, b) => a - b).map(k => { const y = byDepth[k]; return [y.s.name, fx(y.s.d, 1) + '"', String(2 * y.nHalf), fx(y.pct * 100, 0) + '%', y.camber ? inchStr(y.camber) : '—', fx(y.rmax, 2)]; }), hl: x.s.name }],
    notes: ['AISC 360-22 I3; plastic stress distribution, studs per I8.2a. Min 25% composite.', 'Rule of thumb: composite beam depth ≈ L/24–L/28; filler beams 8–10 ft o.c. for 2" deck, 10–15 ft for 3" deck.',
      'Deck parallel to girders: concrete in ribs ignored (conservative).']
  };
}

// ============ 7. COLUMNS ============
function pmCurve(sec, fc, fy, spiral) {
  // sec: {type:'rect', b, h, layers:[{y, As}]} or {type:'circ', D, layers}
  const fck = fc / 1000, b1 = beta1(fc), H = sec.type === 'rect' ? sec.h : sec.D;
  const width = y => sec.type === 'rect' ? sec.b : 2 * SQ(Math.max(0, (H / 2) ** 2 - (y - H / 2) ** 2));
  const Ag = sec.type === 'rect' ? sec.b * sec.h : PI * H * H / 4;
  const Ast = sec.layers.reduce((s, l) => s + l.As, 0);
  const P0 = 0.85 * fck * (Ag - Ast) + fy * Ast;
  const phiC = spiral ? 0.75 : 0.65;
  const PnMax = (spiral ? 0.85 : 0.80) * P0;
  const ey = fy / ES;
  const dt = Math.max(...sec.layers.map(l => l.y));
  const N = 60;
  const pts = [];
  const cs = [];
  for (let i = 0; i <= 80; i++) cs.push(H * 4 * Math.pow(0.008 / 4, i / 80));
  for (const c of cs) {
    const a = Math.min(b1 * c, H);
    let Cc = 0, Mc = 0;
    for (let j = 0; j < N; j++) { const y = (j + 0.5) * a / N; const dA = width(y) * a / N; Cc += 0.85 * fck * dA; Mc += 0.85 * fck * dA * (H / 2 - y); }
    let P = Cc, M = Mc;
    for (const l of sec.layers) {
      const es = 0.003 * (c - l.y) / c;
      let fs = clamp(es * ES, -fy, fy);
      if (l.y < a && fs > 0) fs -= 0.85 * fck;
      P += l.As * fs; M += l.As * fs * (H / 2 - l.y);
    }
    const et = 0.003 * (dt - c) / c;
    const phi = et <= ey ? phiC : et >= ey + 0.003 ? 0.9 : phiC + (0.9 - phiC) * (et - ey) / 0.003;
    pts.push({ P: phi * Math.min(P, PnMax), M: phi * M / 12 });
  }
  return { pts, phiPnMax: phiC * PnMax, P0 };
}
function pmCapAt(curve, Pu) { // max phiMn at Pu (kips)
  let best = 0;
  const p = curve.pts;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((Pu - a.P) * (Pu - b.P) <= 0 && a.P !== b.P) { const m = a.M + (b.M - a.M) * (Pu - a.P) / (b.P - a.P); best = Math.max(best, m); }
  }
  return best;
}
function colLayers(shape, h, rho) {
  const dc = 2.5;
  if (shape === 'circle') { const As = rho * PI * h * h / 4, nb = 8; const R = h / 2 - dc; return Array.from({ length: nb }, (_, i) => ({ y: h / 2 - R * Math.cos(2 * PI * i / nb), As: As / nb })); }
  const As = rho * h * h, ab = As / 12, z = h - 2 * dc;
  return [{ y: dc, As: 4 * ab }, { y: dc + z / 3, As: 2 * ab }, { y: dc + 2 * z / 3, As: 2 * ab }, { y: h - dc, As: 4 * ab }];
}
function takedown(p) {
  const { AT, nFl, Dfl, Lfl, Droof, Lroof, llrOn } = p;
  const r = llr(Lfl, 4, AT * nFl, nFl > 1, llrOn);
  const D = (Dfl * AT * nFl + Droof * AT) / 1000;
  const L = r.L * AT * nFl / 1000, Lr = Lroof * AT / 1000;
  const Pu = Math.max(1.4 * D, 1.2 * D + 1.6 * L + 0.5 * Lr, 1.2 * D + 1.6 * Lr + 0.5 * L);
  return { Pu, D, L, Lr, f: r.f, beta: 1.2 * D / Pu };
}
function rcColumn(p) {
  const { mode, PuIn, fc, fy, rhoPct, lu, frame, k, curv, Mu, shape, fireMin, hTrial } = p;
  const td = mode === 'td' ? takedown(p) : null;
  const Pu = td ? td.Pu : PuIn;
  const bdns = td ? clamp(td.beta, 0, 1) : 0.6;
  const rho = rhoPct / 100;
  const spiral = shape === 'circle';
  const phiF = spiral ? 0.75 * 0.85 : 0.65 * 0.80;
  const fck = fc / 1000;
  const sizeFor = (rh) => { const Ag = Pu / (phiF * (0.85 * fck * (1 - rh) + fy * rh)); return shape === 'circle' ? SQ(4 * Ag / PI) : SQ(Ag); };
  const hStr = sizeFor(rho);
  const m12 = { single: -1, zero: 0, double: 0.5 }[curv];
  const limit = frame === 'braced' ? Math.min(40, 34 + 12 * m12) : 22;
  const Cm0 = { single: 1.0, zero: 0.6, double: 0.4 }[curv];
  function run(h, rh) {
    const r = shape === 'circle' ? 0.25 * h : 0.3 * h;
    const klr = k * lu * 12 / r;
    const M2min = Pu * (0.6 + 0.03 * h) / 12;
    const M2 = Math.max(Mu, M2min);
    const Ec = 57 * SQ(fc); const Ig = shape === 'circle' ? PI * h ** 4 / 64 : h ** 4 / 12;
    const Pc = PI * PI * 0.4 * Ec * Ig / (1 + bdns) / (k * lu * 12) ** 2;
    let delta = 1, Mc = Mu, slender = klr > limit;
    if (slender) {
      const Cm = Mu <= M2min ? 1.0 : Cm0;
      delta = Pu >= 0.75 * Pc ? Infinity : Math.max(frame === 'braced' ? 1 : 0, Cm / (1 - Pu / (0.75 * Pc)));
      if (frame === 'sway') delta = Pu >= 0.75 * Pc ? Infinity : 1 / (1 - Pu / (0.75 * Pc));
      delta = Math.max(1, delta);
      Mc = delta * M2;
    }
    const curve = pmCurve(shape === 'circle' ? { type: 'circ', D: h, layers: colLayers('circle', h, rh) } : { type: 'rect', b: h, h, layers: colLayers('square', h, rh) }, fc, fy, spiral);
    const rAx = Pu / curve.phiPnMax;
    const cap = pmCapAt(curve, Pu);
    const rPM = Pu > curve.phiPnMax ? Infinity : Mc > 0 ? Mc / Math.max(cap, 1e-6) : 0;
    const rDel = slender ? delta / 1.4 : 0;
    return { h, r, klr, slender, M2min, Pc, delta, Mc, curve, rAx, cap, rPM, rDel };
  }
  const minH = Math.max(12, fireMin || 0);
  let h, gov;
  const h0 = Math.max(ceilTo(hStr, 2), minH);
  if (hTrial > 0) h = hTrial;
  else {
    h = h0; gov = h0 > ceilTo(hStr, 2) ? 'Practical / fire-rating minimum' : 'Axial strength (φPn,max)';
    for (let i = 0; i < 40; i++) {
      const r = run(h, rho);
      if (r.rAx <= 1 && r.rPM <= 1 && r.rDel <= 1) break;
      gov = r.rDel > 1 || !isFinite(r.delta) ? 'Slenderness (δ > 1.4 or Pu ≥ 0.75Pc)' : r.rAx > 1 ? 'Axial strength' : 'P–M interaction (with magnified moment)';
      h += 2;
    }
  }
  const r = run(h, rho);
  const dim = shape === 'circle' ? `${h}" dia.` : `${h}" × ${h}"`;
  const checks = [chk('Axial φPn,max', fk(Pu) + ' k', fk(r.curve.phiPnMax) + ' k', r.rAx, `ρg = ${rhoPct}%, ${spiral ? 'spiral' : 'tied'}`),
    chk('Slenderness kℓu/r', fx(r.klr, 1), `${limit} (${frame})`, r.klr / limit, r.slender ? 'Exceeds limit → moments magnified (ACI 6.6.4)' : 'Slenderness may be neglected'),
    chk('Moment magnifier δ', r.slender ? fx(r.delta, 2) : '1.00', '1.40 max', r.slender ? r.delta / 1.4 : 0, `Pc = ${fk(r.Pc)} k, βdns = ${fx(bdns, 2)}`),
    chk('P–M interaction', `Mc = ${fk(r.Mc)} k-ft`, `φMn = ${fk(r.cap)} k-ft @ Pu`, r.rPM, r.slender ? `M2,min = ${fk(r.M2min)} k-ft` : 'First-order moment only')];
  const rhoTable = [1, 2, 3, 4].map(rp => { const hh = Math.max(ceilTo(sizeFor(rp / 100), 2), minH); return [rp + '%', shape === 'circle' ? `${hh}" dia.` : `${hh}" sq.`]; });
  const hSl = k * lu * 12 / (limit * (shape === 'circle' ? 0.25 : 0.3));
  const details = [['Pu', fk(Pu) + ' k'], ['Size for strength alone', inchStr(ceilTo(hStr, 0.5))], ['Size to avoid slenderness effects', inchStr(ceilTo(hSl, 0.5))]];
  if (td) details.unshift(['Takedown D / L / Lr', `${fk(td.D)} / ${fk(td.L)} / ${fk(td.Lr)} k` + (td.f < 1 ? ` (LL red. ${fx(td.f, 2)})` : '')]);
  return {
    headline: `${dim} column`, sub: `f'c ${fc / 1000} ksi, ℓu = ${lu} ft, k = ${k}, ${frame}`,
    gov: hTrial > 0 ? 'Trial size check' : gov, checks, details,
    tables: [{ title: 'Strength-only size vs. ρg', cols: ['ρg', 'Size'], rows: rhoTable }],
    notes: ['ACI 318-19 22.4 (φPn,max), 6.2.5 slenderness, 6.6.4 moment magnification with EIeff = 0.4EcIg/(1+βdns).', 'Rule of thumb: Ag ≈ Pu / (0.40·f\'c) for ρ ≈ 1–2%. Practical min 12"; 16" for 2–3 story moment frames.',
      'Sway frames: magnifier shown uses this column alone; real δs is a story-level check.']
  };
}
function steelColumn(p) {
  const { mode, PuIn, KLx, KLy, Fy, Mux, Muy, Cb, fams } = p;
  const td = mode === 'td' ? takedown(p) : null;
  const Pu = td ? td.Pu : PuIn;
  const E = ES;
  const out = [];
  for (const s of SHAPES) {
    if (!fams.includes(s.nom)) continue;
    if (s.bf2tf > 0.56 * SQ(E / Fy) || s.htw > 1.49 * SQ(E / Fy)) continue;
    const KLr = Math.max(KLx * 12 / s.rx, KLy * 12 / s.ry);
    const Fe = PI * PI * E / KLr ** 2;
    const Fcr = Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;
    const phiPn = 0.9 * Fcr * s.A;
    const Mcx = steelFlex(s, Fy, KLy * 12, Cb).phiMn;
    const lp = 0.38 * SQ(E / Fy), lrf = SQ(E / Fy);
    const Mpy = Math.min(Fy * s.Zy, 1.6 * Fy * s.Sy);
    const Mny = s.bf2tf > lp ? Mpy - (Mpy - 0.7 * Fy * s.Sy) * (s.bf2tf - lp) / (lrf - lp) : Mpy;
    const Mcy = 0.9 * Mny / 12;
    const Pex = PI * PI * E * s.Ix / (KLx * 12) ** 2, Pey = PI * PI * E * s.Iy / (KLy * 12) ** 2;
    const B1x = Pu < Pex ? Math.max(1, 1 / (1 - Pu / Pex)) : Infinity, B1y = Pu < Pey ? Math.max(1, 1 / (1 - Pu / Pey)) : Infinity;
    const Mrx = Mux * B1x, Mry = Muy * B1y;
    const pr = Pu / phiPn;
    const mm = (Mrx ? Mrx / Mcx : 0) + (Mry ? Mry / Mcy : 0);
    const ratio = pr >= 0.2 ? pr + 8 / 9 * mm : pr / 2 + mm;
    out.push({ s, KLr, phiPn, Mcx, Mcy, Mrx, Mry, pr, ratio, pass: ratio <= 1 && KLr <= 200 });
  }
  out.sort((a, b) => a.s.W - b.s.W);
  const best = out.find(x => x.pass);
  const by = {}; for (const x of out) if (x.pass && !by[x.s.nom]) by[x.s.nom] = x;
  const tdDet = td ? [['Takedown D / L / Lr', `${fk(td.D)} / ${fk(td.L)} / ${fk(td.Lr)} k` + (td.f < 1 ? ` (LL red. ${fx(td.f, 2)})` : '')]] : [];
  if (!best) return { headline: 'No W-shape in selected families', sub: 'Try W14 heavier family, HSS, or built-up', gov: '—', checks: [], details: [['Pu', fk(Pu) + ' k'], ...tdDet], status: 'fail' };
  const x = best;
  return {
    headline: x.s.name + ' column', sub: `Pu ${fk(Pu)} k, KLx ${KLx} ft / KLy ${KLy} ft, Fy ${Fy} ksi`,
    gov: (Mux || Muy) ? 'Combined axial + flexure (H1-1)' : (x.KLr > 4.71 * SQ(E / Fy) ? 'Elastic buckling' : 'Inelastic flexural buckling'),
    checks: [chk('Axial φPn', fk(Pu) + ' k', fk(x.phiPn) + ' k', x.pr, `KL/r = ${fx(x.KLr, 0)}`), ...(Mux || Muy ? [chk('Interaction H1-1', fx(x.ratio, 2), '1.00', x.ratio, `B1 included; Mcx = ${fk(x.Mcx)} k-ft (Lb = KLy)`)] : [])],
    details: [['Pu', fk(Pu) + ' k'], ...tdDet, ['Weight', `${x.s.W} plf`]],
    tables: [{ title: 'Lightest by family', cols: ['Shape', 'φPn (k)', 'KL/r', 'Ratio'], rows: Object.keys(by).map(Number).sort((a, b) => a - b).map(k => { const y = by[k]; return [y.s.name, fk(y.phiPn), fx(y.KLr, 0), fx(y.ratio, 2)]; }), hl: x.s.name }],
    notes: ['AISC 360-22 E3 (shapes with slender elements for compression excluded), H1-1, B1 with Cm = 1.', 'Rule of thumb: W14 most efficient for heavy axial; W10/W12 for lighter loads and to match beam depths.']
  };
}

// ============ 8. WIND + SHEAR WALLS ============
const EXPO = { B: { a: 7.5, zg: 3280 }, C: { a: 9.8, zg: 2460 }, D: { a: 11.5, zg: 1935 } };
function Kz(z, exp) { const e = EXPO[exp]; return 2.41 * Math.pow(Math.max(z, 15) / e.zg, 2 / e.a); }
function windForces(p) {
  const { V, exp, Kzt, Ke, nSt, h1, hTyp, B, Lp } = p;
  const Kd = 0.85, G = 0.85;
  const z = []; let acc = 0;
  for (let i = 0; i < nSt; i++) { acc += i === 0 ? h1 : hTyp; z.push(acc); }
  const H = acc;
  const q = zz => 0.00256 * Kz(zz, exp) * Kzt * Ke * V * V;
  const qh = q(H);
  const LB = Lp / B;
  const CpL = interp(LB, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
  const pl = qh * Kd * G * Math.abs(CpL);
  const lv = z.map((zi, i) => {
    const below = i === 0 ? h1 : zi - z[i - 1], above = i === nSt - 1 ? 0 : z[i + 1] - zi;
    const th = below / 2 + above / 2;
    const pw = q(zi) * Kd * G * 0.8;
    const F = Math.max((pw + pl) * B * th, 16 * B * th) / 1000;
    return { z: zi, F, pw, pl };
  });
  const Vb = lv.reduce((s, l) => s + l.F, 0), M = lv.reduce((s, l) => s + l.F * l.z, 0);
  return { lv, H, Vb, M, qh, CpL, pl };
}
function wallDir(w, p) {
  const { nW, t, fc, fy, rhoL, bN, bS, Dfl, amp, svc, drift, nSt, Lavail } = p;
  const Asb = bN * BARS[bS][0];
  const Ec = EcKsi(fc);
  const H = w.H;
  function run(lw) {
    const lwi = lw * 12;
    const Mu = w.M * amp / nW, Vu = w.Vb * amp / nW;
    const selfW = 0.15 * t * lwi / 144 * H;
    const Pu = 0.9 * (Dfl * nSt + selfW);
    const layers = [{ y: 6, As: Asb }, { y: lwi - 6, As: Asb }];
    const nl = 20, Ad = rhoL * t * (lwi - 24);
    for (let i = 0; i < nl; i++) layers.push({ y: 12 + (lwi - 24) * (i + 0.5) / nl, As: Ad / nl });
    const curve = pmCurve({ type: 'rect', b: t, h: lwi, layers }, fc, fy, false);
    const phiMn = pmCapAt(curve, Pu);
    const hl = H / lw;
    const ac = hl <= 1.5 ? 3 : hl >= 2 ? 2 : lerp(hl, 1.5, 2, 3, 2);
    const Acv = t * lwi;
    const phiVn = 0.75 * Math.min(ac * SQ(fc) + 0.0025 * fy * 1000, 8 * SQ(fc)) * Acv / 1000;
    const EI = Ec * 0.5 * t * lwi ** 3 / 12 * nW;
    const Hi = H * 12;
    const dTop = svc * w.lv.reduce((s, l) => { const zi = l.z * 12; return s + l.F * zi * zi * (3 * Hi - zi) / (6 * EI); }, 0);
    const dLim = Hi / drift;
    return { lw, Mu, Vu, Pu, phiMn, phiVn, dTop, dLim, rM: Mu / phiMn, rV: Vu / phiVn, rD: dTop / dLim };
  }
  let lw = 4, gov = 'Minimum length';
  for (; lw <= 400; lw++) {
    const r = run(lw);
    if (r.rM <= 1 && r.rV <= 1 && r.rD <= 1) break;
    gov = r.rD > 1 ? 'Drift (H/' + drift + ')' : r.rM > 1 ? 'Overturning flexure' : 'In-plane shear';
  }
  const r = run(lw);
  return { ...r, gov, feasible: lw <= Lavail, total: lw * nW };
}
function shearWalls(p) {
  const { BX, BY } = p;
  // Wind along X: face width = BY, depth = BX
  const wx = windForces({ ...p, B: BY, Lp: BX });
  const wy = windForces({ ...p, B: BX, Lp: BY });
  const rx = wallDir(wx, { ...p, nW: p.nX, Lavail: BX });
  const ry = wallDir(wy, { ...p, nW: p.nY, Lavail: BY });
  const tAlt = [8, 10, 12, 14, 16].map(t => { const ax = wallDir(wx, { ...p, t, nW: p.nX, Lavail: BX }), ay = wallDir(wy, { ...p, t, nW: p.nY, Lavail: BY }); return [t + '"', `${p.nX} × ${ax.lw} ft`, `${p.nY} × ${ay.lw} ft`]; });
  const dirChecks = (r, lab) => [
    chk(`${lab}: overturning`, fk(r.Mu) + ' k-ft', fk(r.phiMn) + ' k-ft', r.rM, `per wall, Pu = 0.9D = ${fk(r.Pu)} k`),
    chk(`${lab}: shear`, fk(r.Vu) + ' k', fk(r.phiVn) + ' k', r.rV, 'ACI 11.5.4, ρt = 0.0025'),
    chk(`${lab}: drift`, fx(r.dTop, 2) + ' in', fx(r.dLim, 2) + ` in (H/${p.drift})`, r.rD, `${p.svc}×W, Ieff = 0.5Ig`)];
  const flags = [];
  if (!rx.feasible) flags.push({ lvl: 'fail', msg: `X: each wall needs ${rx.lw} ft, longer than the ${p.BX} ft building — add walls or use cores/coupled walls.` });
  if (!ry.feasible) flags.push({ lvl: 'fail', msg: `Y: each wall needs ${ry.lw} ft, longer than the ${p.BY} ft building — add walls or use cores/coupled walls.` });
  if (wx.H > 160) flags.push({ lvl: 'warn', msg: 'Height > 160 ft: check building period; G = 0.85 assumes rigid (n1 ≥ 1 Hz).' });
  return {
    headline: `X: ${p.nX} × ${rx.lw} ft   ·   Y: ${p.nY} × ${ry.lw} ft`, sub: `${p.t}" walls, ${p.nSt} stories (${fx(wx.H, 0)} ft), V = ${p.V} mph Exp. ${p.exp}`,
    gov: `X: ${rx.gov}  ·  Y: ${ry.gov}`, flags,
    checks: [...dirChecks(rx, 'X'), ...dirChecks(ry, 'Y')],
    details: [['qh', fx(wx.qh, 1) + ' psf'], ['Wind X: base shear / OTM', `${fk(wx.Vb)} k / ${fk(wx.M)} k-ft`], ['Wind Y: base shear / OTM', `${fk(wy.Vb)} k / ${fk(wy.M)} k-ft`],
      ['Leeward Cp (X / Y)', `${fx(wx.CpL, 2)} / ${fx(wy.CpL, 2)}`], ['Boundary bars each end', `${p.bN}-#${p.bS}`], ['Torsion allowance', fx(p.amp, 2)]],
    tables: [{ title: 'Wall length per wall vs. thickness', cols: ['t', 'X walls', 'Y walls'], rows: tAlt, hl: p.t + '"' }],
    notes: ['ASCE 7-22 Ch. 27 directional MWFRS: Kd 0.85, G 0.85, Cp windward 0.8, Kz per Table 26.10-1 (2.41 multiplier). 16 psf minimum applied.',
      'Equal, uncoupled cantilever walls share load equally; torsion (Case 2) covered by allowance factor. Seismic not checked.',
      'Rule of thumb: total wall length per direction ≈ 1–2% of floor plate area per 10 stories (ft of wall / 100 ft² × stories/10); hw/lw ≤ ~6–8 for efficient cantilever walls.']
  };
}

// ============ 9. FE BEAM + TRANSFER ============
function beamFE(L, sup, w, pts) {
  // L ft, w klf down, pts [{P (k down), x ft}], EI = 1 (kip-ft2). sup: {l:'pin'|'fix'|'free', r:...}
  let xs = []; const n = 60;
  for (let i = 0; i <= n; i++) xs.push(L * i / n);
  for (const p of pts) if (p.x > 0 && p.x < L) xs.push(p.x);
  xs = [...new Set(xs.map(x => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
  const nn = xs.length, nd = 2 * nn;
  const K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
  for (let e = 0; e < nn - 1; e++) {
    const l = xs[e + 1] - xs[e];
    const k = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]].map(r => r.map(v => v / l ** 3));
    const id = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[id[i]][id[j]] += k[i][j];
    const fe = [-w * l / 2, -w * l * l / 12, -w * l / 2, w * l * l / 12];
    for (let i = 0; i < 4; i++) F[id[i]] += fe[i];
  }
  for (const p of pts) { const i = xs.findIndex(x => Math.abs(x - p.x) < 1e-5); if (i >= 0) F[2 * i] -= p.P; }
  const fixed = new Set();
  const bc = (s, i) => { if (s === 'pin') fixed.add(2 * i); if (s === 'fix') { fixed.add(2 * i); fixed.add(2 * i + 1); } };
  bc(sup.l, 0); bc(sup.r, nn - 1);
  const free = [...Array(nd).keys()].filter(i => !fixed.has(i));
  const m = free.length;
  const A = free.map(i => free.map(j => K[i][j])), bvec = free.map(i => F[i]);
  for (let i = 0; i < m; i++) { // gauss
    let piv = i; for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]]; [bvec[i], bvec[piv]] = [bvec[piv], bvec[i]];
    for (let r = i + 1; r < m; r++) { const f = A[r][i] / A[i][i]; if (!f) continue; for (let c = i; c < m; c++) A[r][c] -= f * A[i][c]; bvec[r] -= f * bvec[i]; }
  }
  const u = new Float64Array(nd), sol = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) { let s = bvec[i]; for (let c = i + 1; c < m; c++) s -= A[i][c] * sol[c]; sol[i] = s / A[i][i]; }
  free.forEach((d, i) => u[d] = sol[i]);
  const R = {}; for (const d of fixed) { let s = 0; for (let j = 0; j < nd; j++) s += K[d][j] * u[j]; R[d] = s - F[d]; }
  const reacts = Object.keys(R).map(Number).map(d => ({ x: xs[Math.floor(d / 2)], type: d % 2 ? 'M' : 'V', val: R[d] }));
  let Mpos = 0, Mneg = 0, Vmax = 0;
  const sample = [];
  for (let i = 0; i <= 400; i++) sample.push(L * i / 400);
  for (const p of pts) sample.push(Math.max(0, p.x - 1e-6), Math.min(L, p.x + 1e-6));
  for (const x of sample) {
    let M = 0, V = 0;
    for (const r of reacts) if (r.x <= x + 1e-9) { if (r.type === 'V') { M += r.val * (x - r.x); V += r.val; } else M -= r.val; }
    for (const p of pts) if (p.x < x) { M -= p.P * (x - p.x); V -= p.P; }
    M -= w * x * x / 2; V -= w * x;
    Mpos = Math.max(Mpos, M); Mneg = Math.min(Mneg, M); Vmax = Math.max(Vmax, Math.abs(V));
  }
  let dmax = 0; for (let i = 0; i < nn; i++) dmax = Math.max(dmax, Math.abs(u[2 * i]));
  return { Mpos, Mneg: -Mneg, Mmax: Math.max(Mpos, -Mneg), Vmax, dEI: dmax }; // dEI in ft·(kip-ft2) units → Δft = dEI/EI
}
function transfer(p) {
  const { L, supp, wD, wL, P1D, P1L, x1, P2D, P2L, x2, fc, fy, b, mat, Fy, dlim, maxD } = p;
  const sup = { simple: { l: 'pin', r: 'pin' }, fixed: { l: 'fix', r: 'fix' }, propped: { l: 'fix', r: 'pin' }, cant: { l: 'fix', r: 'free' } }[supp];
  const ptsD = [], ptsL = [];
  if (P1D || P1L) { ptsD.push({ P: P1D, x: x1 }); ptsL.push({ P: P1L, x: x1 }); }
  if (P2D || P2L) { ptsD.push({ P: P2D, x: x2 }); ptsL.push({ P: P2L, x: x2 }); }
  const fac = (f1, f2) => ({ w: f1 * wD + f2 * wL, pts: ptsD.map((q, i) => ({ P: f1 * q.P + f2 * ptsL[i].P, x: q.x })) });
  const u = fac(1.2, 1.6), u14 = fac(1.4, 0);
  const Ru = beamFE(L, sup, u.w, u.pts), Ru14 = beamFE(L, sup, u14.w, u14.pts);
  const Mu = Math.max(Ru.Mmax, Ru14.Mmax), Vu = Math.max(Ru.Vmax, Ru14.Vmax);
  const unit = beamFE(L, sup, 1, []);
  const RD = beamFE(L, sup, wD, ptsD), RL = beamFE(L, sup, wL, ptsL), RT = beamFE(L, sup, wD + wL, ptsD.map((q, i) => ({ P: q.P + ptsL[i].P, x: q.x })));
  const Lin = L * 12;
  const aMin = Math.min(...[...ptsD.map(q => q.x), ...ptsD.map(q => L - q.x)].filter(v => v >= 0), Infinity) * 12;
  const ptLoad = ptsD.reduce((s, q, i) => s + q.P + ptsL[i].P, 0);
  const res = { checks: [], details: [], tables: [], flags: [], notes: [] };
  res.details.push(['Mu / Vu (excl. self-wt)', `${fk(Mu)} k-ft / ${fk(Vu)} k`]);
  res.details.push(['Total column load transferred', fk(ptLoad) + ' k (service)']);
  // ---- RC ----
  const rcRun = (bb, h) => {
    const sw = 0.15 * bb * h / 144;
    const Mt = Mu + 1.2 * sw * unit.Mmax, Vt = Vu + 1.2 * sw * unit.Vmax;
    const d = h - 4;
    const rho = rhoReq(Mt, bb, d, fc, fy), rtc = rhoTC(fc, fy);
    const VsMax = 8 * SQ(fc) * bb * d / 1000, Vc = 2 * SQ(fc) * bb * d / 1000;
    const VsReq = Math.max(0, Vt / 0.75 - Vc);
    const Ec = EcKsi(fc) * 144; // kip/ft2
    const Ig = bb * h ** 3 / 12 / 20736; // ft4
    const As = rho * bb * d;
    const n_ = ES / EcKsi(fc), rr = As / (bb * d);
    const kk = SQ(2 * rr * n_ + (rr * n_) ** 2) - rr * n_;
    const Icr = (bb * (kk * d) ** 3 / 3 + n_ * As * (d - kk * d) ** 2) / 20736;
    const Mcr = 7.5 * SQ(fc) * (bb * h ** 3 / 12) / (h / 2) / 12000;
    const Ie = Ma => Ma <= 2 / 3 * Mcr ? Ig : Math.min(Ig, Icr / (1 - ((2 / 3 * Mcr / Ma) ** 2) * (1 - Icr / Ig)));
    const MaD = RD.Mmax + sw * unit.Mmax, MaT = RT.Mmax + sw * unit.Mmax;
    const dD = (RD.dEI + sw * unit.dEI) / (Ec * Ie(MaD)) * 12, dT = (RT.dEI + sw * unit.dEI) / (Ec * Ie(MaT)) * 12;
    const dLT = 2 * dD + (dT - dD);
    const deep = (supp === 'cant' ? Lin : Lin) / h <= 4 || aMin <= 2 * h;
    return { bb, h, Mt, Vt, rho, rtc, As, VsReq, VsMax, dLT, lim: Lin / dlim, deep, rF: rho / rtc, rV: VsReq / VsMax, rD: dLT / (Lin / dlim) };
  };
  const rcSize = bb => { let h = Math.max(24, ceilTo(Lin / 14, 2)); let gov = 'Starting depth L/14'; for (let i = 0; i < 80; i++) { const r = rcRun(bb, h); if (r.rF <= 1 && r.rV <= 1 && r.rD <= 1) return { ...r, gov }; gov = r.rV > 1 ? 'Shear' : r.rF > 1 ? 'Flexure' : 'Deflection (L/' + dlim + ', long-term)'; h += 2; } return { ...rcRun(bb, h), gov: 'Not feasible' }; };
  // ---- steel ----
  const steel = steelSelect({ Mu, Vu, Mu1: unit.Mmax, Vu1: unit.Vmax, defl: [{ name: `Total ≤ L/${dlim}`, A: RT.dEI * 1728, A1: unit.dEI * 1728, sw: true, lim: Lin / dlim }], Lb: p.Lb, Cb: 1.0, Fy, maxD });
  if (mat === 'rc') {
    const r = rcSize(b);
    res.headline = `${b}" × ${r.h}" RC transfer girder`; res.gov = r.gov;
    res.checks.push(chk('Flexure', `ρ = ${fx(r.rho * 100, 2)}%`, `ρ(εt=.005) = ${fx(r.rtc * 100, 2)}%`, r.rF, `Mu = ${fk(r.Mt)} k-ft incl. self-wt`));
    res.checks.push(chk('Shear (section limit)', `Vs req ${fk(r.VsReq)} k`, `Vs,max ${fk(r.VsMax)} k`, r.rV, `Vu = ${fk(r.Vt)} k`));
    res.checks.push(chk('Long-term deflection', fx(r.dLT, 2) + ' in', fx(r.lim, 2) + ` in (L/${dlim})`, r.rD, 'λΔ = 2.0 on dead, Ie (Bischoff)'));
    res.details.push(['As req.', `${fx(r.As, 1)} in² (~${Math.ceil(r.As / 1.56)}-#11)`]);
    res.details.push(['Span / depth', fx(Lin / r.h, 1)]);
    if (r.gov.startsWith('Deflection')) res.flags.push({ lvl: 'info', msg: 'Cracked-section deflection governs. A PT transfer girder (tendons balancing the column load) or steel/composite girder is usually much shallower.' });
    if (r.deep) res.flags.push({ lvl: 'warn', msg: 'Deep beam (ln/h ≤ 4 or load within 2h of support): design by strut-and-tie (ACI 23); sectional result is indicative only.' });
    res.tables.push({ title: 'Required depth vs. width', cols: ['b', 'h', 'Governs'], rows: [18, 24, 30, 36, 42, 48].map(bb => { const q = rcSize(bb); return [bb + '"', q.h + '"', q.gov]; }), hl: b + '"' });
  } else {
    if (steel.best) {
      const x = steel.best; x.Lb = p.Lb;
      res.headline = x.s.name + ' transfer girder'; res.gov = govSteel(x);
      res.checks.push(chk('Flexure', fk(x.Mu) + ' k-ft', fk(x.phiMn) + ' k-ft', x.rM, `Lb = ${p.Lb} ft`), chk('Shear', fk(x.Vu) + ' k', fk(x.phiVn) + ' k', x.rV), ...x.dfl.map(d => chk('Deflection ' + d.name, fx(d.D, 2) + ' in', fx(d.lim, 2) + ' in', d.r)));
      res.tables.push({ title: 'Lightest by nominal depth', cols: ['Shape', 'd', 'M', 'V', 'Δ', ''], rows: depthTable(steel), hl: x.s.name });
      res.flags.push({ lvl: 'info', msg: 'Check web local yielding / crippling under column (J10) — bearing stiffeners usually required at transfer points.' });
    } else {
      const Zreq = (Mu * 12) / (0.9 * Fy);
      res.headline = 'No rolled W works'; res.gov = 'Plate girder / built-up / double girder required';
      res.details.push(['Zx req. (approx, braced)', fx(Zreq, 0) + ' in³']);
      res.flags.push({ lvl: 'fail', msg: 'Exceeds heaviest W within depth limit. Consider plate girder, box girder, or RC/PT transfer.' });
    }
  }
  res.sub = `${fx(L, 0)} ft ${{ simple: 'simple span', fixed: 'fixed-fixed', propped: 'fixed-pinned', cant: 'cantilever' }[supp]}, ${ptsD.length} column load(s)`;
  res.notes.push('Analysis by 1-D beam FE (prismatic). Self-weight added to max M/V (conservative). Loads: 1.2D+1.6L and 1.4D.',
    'Rule of thumb: transfer girder depth L/8–L/12; steel transfer d ≈ L/12–L/15. Use deflection limit L/600–L/1000 where columns above support masonry/glass.',
    'Supported column load should include all floors above; LL reduction applied before entering.');
  return res;
}

// ============ 10. SYSTEM COMPARISON ============
function trapEq(s, Lb) { // equivalent uniform tributary width for beam of span Lb receiving two-way panel load from short span s, both sides
  if (Lb <= s) return 2 * s / 3; // triangular
  const r = s / Lb; return 2 * (s / 3) * (3 - r * r) / 2;
}
function systemCompare(p) {
  const { L1, L2, SDL, LL, fc, fy, c, fire } = p;
  const Lmax = Math.max(L1, L2), Lmin = Math.min(L1, L2);
  const opts = [];
  // A. RC flat plate
  const a = rcTwoWay({ L1, L2, c, panel: 'int', loc: 'int', drop: false, SDL, LL, fc, fy, fire, hTrial: 0 });
  const ha = a.h;
  opts.push({ name: 'RC flat plate', depth: ha, eq: ha, gov: a.gov, note: 'Simplest formwork, flat soffit, easy penetrations.' });
  // B. RC flat slab with drop panels
  const b = rcTwoWay({ L1, L2, c, panel: 'int', loc: 'int', drop: true, SDL, LL, fc, fy, fire, hTrial: 0 });
  const hb = b.h, hdb = b.hd;
  opts.push({ name: 'RC slab + drop panels', depth: hb + hdb, eq: hb + hdb / 9, gov: b.gov, note: 'Thinner field slab; drops interrupt ceiling.' });
  // C. PT flat plate (fc 5000 min)
  const fcPT = Math.max(fc, 5000);
  const cpt = ptSlab({ sys: 'two', L1, L2, cont: 'both', use: 'floor', SDL, LL, fc: fcPT, fy, c, loc: 'int', bal: 75, fire, hTrial: 0 });
  const hc = cpt.h;
  opts.push({ name: 'PT flat plate', depth: hc, eq: hc, gov: cpt.gov, note: 'Thinnest flat system; needs PT sub, restricts future coring.' });
  // D. RC beams on column lines + two-way slab
  const sClear = Lmin * 12 - 14;
  const hs = Math.max(ceilTo(Math.max(Lmax * 12 - 14, sClear) * (0.8 + fy / 200) / (36 + 9 * (Lmax / Lmin)), 0.5), 5, fireMinSlab(fire));
  const sw = 150 * hs / 12;
  const bmLong = rcBeam({ L: Lmax, cont: 'both', trib: trapEq(Lmin, Lmax), ts: hs, SDL, LL, llrOn: true, fc, fy, b: 0, hTrial: 0 });
  const hdD = bmLong.h, bwD = bmLong.b;
  opts.push({ name: 'RC two-way slab + beams', depth: hdD, eq: hs + bwD * (hdD - hs) * (L1 + L2) / (L1 * L2 * 12), gov: `Slab ${inchStr(hs)} (ACI 8.3.1.2); beam ${bmLong.headline.replace(' RC beam', '')} ${bmLong.gov}`, note: 'Handles irregular grids, transfers, openings; deepest structure.' });
  // E. PT one-way slab + PT beams (beams span long dir, slab spans short)
  const slabE = ptSlab({ sys: 'one', L1: Lmin, L2: 0, cont: 'both', use: 'floor', SDL, LL, fc: fcPT, fy, bal: 75, fire, hTrial: 0 });
  const hsE = slabE.h;
  const bmE = ptBeam({ L: Lmax, cont: 'both', trib: Lmin, ts: hsE, SDL, LL, llrOn: true, fc: fcPT, fy, b: 24, use: 'floor', bal: 80, hTrial: 0 });
  const hE = bmE.h;
  opts.push({ name: 'PT slab + PT beams', depth: hE, eq: hsE + 24 * (hE - hsE) / (Lmin * 12), gov: `Slab ${slabE.headline.replace(' PT one-way slab', '')}; beam 24×${hE}" ${bmE.gov}`, note: 'Long spans (35–60 ft); garages and long-span floors.' });
  opts.forEach(o => { o.psf = 150 * o.eq / 12; });
  // Recommendation (rule-based)
  let rec, why;
  const heavy = LL > 100;
  if (Lmax <= 24 && !heavy) { rec = 'RC flat plate'; why = `Longest span ${Lmax} ft ≤ ~24 ft: a ${inchStr(ha)} RC flat plate is usually cheapest (no PT trade, simple forming).`; }
  else if (Lmax <= 34) { rec = 'PT flat plate'; why = `Span ${Lmax} ft is in the PT flat plate range (25–35 ft): saves ${fx(ha - hc, 1)}" of slab vs RC and controls deflection.`; }
  else { rec = 'PT slab + PT beams'; why = `Span ${Lmax} ft is beyond economical flat plate range; beam-supported PT is typical (or RC slab + beams if PT not available).`; }
  if (heavy && Lmax <= 34) { rec = 'RC slab + drop panels'; why = 'Heavy live load: punching governs flat plates; drop panels or beams are typical.'; }
  return {
    detailsTitle: 'Where each system fits', headline: rec, sub: `${fx(L1, 0)}×${fx(L2, 0)} ft bay, SDL ${SDL} / LL ${LL} psf`, gov: 'Rule-based recommendation', why,
    checks: [],
    tables: [{ title: 'System comparison (interior bay)', cols: ['System', 'Max depth', 'Equiv. thk', 'Concrete psf', 'Governs'], rows: opts.map(o => [o.name, inchStr(ceilTo(o.depth, 0.5)), fx(o.eq, 1) + '"', fx(o.psf, 0), o.gov]), hl: rec }],
    details: opts.map(o => [o.name, o.note]),
    notes: [why, 'Equivalent thickness = concrete volume / floor area (beams and drops spread over the bay). Lower equivalent thickness → less concrete and lighter columns/foundations.',
      'Non-structural drivers often decide: floor-to-floor height, MEP routing under beams, future penetrations (avoid PT in tenant-flexible space), local PT sub availability, garage corrosion (encapsulated tendons).']
  };
}

const ENGINE = { rcOneWay, rcTwoWay, ptSlab, rcBeam, ptBeam, steelBeam, compositeBeam, compositeDeck, rcColumn, steelColumn, shearWalls, transfer, systemCompare, beamFE, steelFlex, steelShear, pmCurve, pmCapAt, windForces, Kz, SHAPES, takedown, compMn, compItr };
if (typeof module !== 'undefined') module.exports = ENGINE;
