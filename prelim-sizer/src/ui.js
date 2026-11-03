// ===== UI =====
const E_ = ENGINE;
const FIRE = [['none', 'None'], ['1', '1 hr'], ['1.5', '1.5 hr'], ['2', '2 hr'], ['3', '3 hr']];
const YN = [['1', 'Yes'], ['0', 'No']];
const CONT = [['simple', 'Simple span'], ['oneEnd', 'End span'], ['both', 'Interior span'], ['cant', 'Cantilever']];
const CONT_PT = [['both', 'Interior span'], ['oneEnd', 'End span'], ['simple', 'Simple span']];
const TD = [
  { k: 'AT', l: 'Tributary area', u: 'ft²', d: 600, g: 'Load', show: v => v.mode === 'td' },
  { k: 'nFl', l: 'Floors supported', u: '', d: 8, g: 'Load', show: v => v.mode === 'td' },
  { k: 'Dfl', l: 'Floor dead (incl. slab)', u: 'psf', d: 130, g: 'Load', show: v => v.mode === 'td' },
  { k: 'Lfl', l: 'Floor live', u: 'psf', d: 40, g: 'Load', show: v => v.mode === 'td' },
  { k: 'Droof', l: 'Roof dead', u: 'psf', d: 100, g: 'Load', show: v => v.mode === 'td' },
  { k: 'Lroof', l: 'Roof live', u: 'psf', d: 20, g: 'Load', show: v => v.mode === 'td' },
  { k: 'llr', l: 'Live load reduction', t: 's', o: YN, d: '1', g: 'Load', show: v => v.mode === 'td' },
  { k: 'PuIn', l: 'Factored axial Pu', u: 'k', d: 800, g: 'Load', show: v => v.mode === 'direct' }
];
const TABS = [
  { id: 'rc-slab', name: 'RC slab', grp: 'Slabs', inputs: [
    { k: 'mode', l: 'System', t: 's', o: [['two', 'Two-way flat plate'], ['drop', 'Two-way + drop panels'], ['one', 'One-way slab']], d: 'two', g: 'Geometry', w: 2 },
    { k: 'ln', l: 'Clear span', u: 'ft', d: 14, g: 'Geometry', show: v => v.mode === 'one' },
    { k: 'cont', l: 'Continuity', t: 's', o: CONT, d: 'both', g: 'Geometry', show: v => v.mode === 'one' },
    { k: 'L1', l: 'Span L1 (c/c)', u: 'ft', d: 24, g: 'Geometry', show: v => v.mode !== 'one' },
    { k: 'L2', l: 'Span L2 (c/c)', u: 'ft', d: 24, g: 'Geometry', show: v => v.mode !== 'one' },
    { k: 'c', l: 'Column size', u: 'in', d: 20, g: 'Geometry', show: v => v.mode !== 'one' },
    { k: 'panel', l: 'Panel', t: 's', o: [['int', 'Interior'], ['ext', 'Exterior, no edge beam'], ['extEB', 'Exterior + edge beam']], d: 'int', g: 'Geometry', show: v => v.mode !== 'one' },
    { k: 'loc', l: 'Punching at', t: 's', o: [['int', 'Interior column'], ['edge', 'Edge column'], ['corner', 'Corner column']], d: 'int', g: 'Geometry', show: v => v.mode !== 'one' },
    { k: 'studs', l: 'Punching reinf.', t: 's', o: [['0', 'None'], ['1', 'Headed shear studs']], d: '0', g: 'Geometry', show: v => v.mode !== 'one' },
    { k: 'SDL', l: 'Superimposed dead', u: 'psf', d: 20, g: 'Load' }, { k: 'LL', l: 'Live load', u: 'psf', d: 40, g: 'Load' },
    { k: 'fc', l: "f'c", u: 'psi', d: 5000, g: 'Material' }, { k: 'fy', l: 'fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'fire', l: 'Fire rating', t: 's', o: FIRE, d: '2', g: 'Material' },
    { k: 'hTrial', l: 'Check a thickness', u: 'in', d: 0, g: 'Check', help: '0 = size automatically' }],
    run: v => v.mode === 'one' ? E_.rcOneWay(v) : E_.rcTwoWay({ ...v, drop: v.mode === 'drop', studs: v.studs === '1' }) },
  { id: 'pt-slab', name: 'PT slab', grp: 'Slabs', inputs: [
    { k: 'sys', l: 'System', t: 's', o: [['two', 'Two-way flat plate'], ['one', 'One-way slab']], d: 'two', g: 'Geometry', w: 2 },
    { k: 'L1', l: 'Span L1 (c/c)', u: 'ft', d: 30, g: 'Geometry' },
    { k: 'L2', l: 'Span L2 (c/c)', u: 'ft', d: 28, g: 'Geometry', show: v => v.sys === 'two' },
    { k: 'cont', l: 'Continuity', t: 's', o: CONT_PT, d: 'both', g: 'Geometry' },
    { k: 'use', l: 'Level', t: 's', o: [['floor', 'Floor'], ['roof', 'Roof']], d: 'floor', g: 'Geometry' },
    { k: 'c', l: 'Column size', u: 'in', d: 24, g: 'Geometry', show: v => v.sys === 'two' },
    { k: 'loc', l: 'Punching at', t: 's', o: [['int', 'Interior column'], ['edge', 'Edge column'], ['corner', 'Corner column']], d: 'int', g: 'Geometry', show: v => v.sys === 'two' },
    { k: 'studs', l: 'Punching reinf.', t: 's', o: [['0', 'None'], ['1', 'Headed shear studs']], d: '0', g: 'Geometry', show: v => v.sys === 'two' },
    { k: 'SDL', l: 'Superimposed dead', u: 'psf', d: 20, g: 'Load' }, { k: 'LL', l: 'Live load', u: 'psf', d: 40, g: 'Load' },
    { k: 'bal', l: 'Self-weight balanced', u: '%', d: 75, g: 'Load', help: 'Typical 60–100%' },
    { k: 'fc', l: "f'c", u: 'psi', d: 5000, g: 'Material' }, { k: 'fy', l: 'Mild steel fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'fire', l: 'Fire rating', t: 's', o: FIRE, d: '2', g: 'Material' },
    { k: 'hTrial', l: 'Check a thickness', u: 'in', d: 0, g: 'Check', help: '0 = size automatically' }],
    run: v => E_.ptSlab({ ...v, studs: v.studs === '1' }) },
  { id: 'system', name: 'PT vs RC', grp: 'Slabs', inputs: [
    { k: 'L1', l: 'Span L1 (c/c)', u: 'ft', d: 30, g: 'Geometry' }, { k: 'L2', l: 'Span L2 (c/c)', u: 'ft', d: 28, g: 'Geometry' },
    { k: 'c', l: 'Column size', u: 'in', d: 24, g: 'Geometry' },
    { k: 'SDL', l: 'Superimposed dead', u: 'psf', d: 20, g: 'Load' }, { k: 'LL', l: 'Live load', u: 'psf', d: 40, g: 'Load' },
    { k: 'fc', l: "f'c (RC)", u: 'psi', d: 5000, g: 'Material', help: 'PT uses ≥ 5000' }, { k: 'fy', l: 'fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'fire', l: 'Fire rating', t: 's', o: FIRE, d: '2', g: 'Material' }],
    run: v => E_.systemCompare(v) },
  { id: 'rc-beam', name: 'RC beam', grp: 'Beams', inputs: [
    { k: 'L', l: 'Span (c/c)', u: 'ft', d: 28, g: 'Geometry' }, { k: 'cont', l: 'Continuity', t: 's', o: CONT, d: 'oneEnd', g: 'Geometry' },
    { k: 'trib', l: 'Tributary width', u: 'ft', d: 20, g: 'Geometry' }, { k: 'ts', l: 'Slab thickness', u: 'in', d: 8, g: 'Geometry', help: 'Slab self-weight over tributary' },
    { k: 'b', l: 'Beam width', u: 'in', d: 0, g: 'Geometry', help: '0 = auto (≈ ½h, min 12")' },
    { k: 'SDL', l: 'Superimposed dead', u: 'psf', d: 20, g: 'Load' }, { k: 'LL', l: 'Live load', u: 'psf', d: 50, g: 'Load' },
    { k: 'wDadd', l: 'Extra dead line load', u: 'klf', d: 0, g: 'Load', help: 'Walls, cladding' }, { k: 'wLadd', l: 'Extra live line load', u: 'klf', d: 0, g: 'Load' },
    { k: 'llr', l: 'Live load reduction', t: 's', o: YN, d: '1', g: 'Load' },
    { k: 'fc', l: "f'c", u: 'psi', d: 5000, g: 'Material' }, { k: 'fy', l: 'fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'hTrial', l: 'Check a depth', u: 'in', d: 0, g: 'Check', help: '0 = size automatically' }],
    run: v => E_.rcBeam({ ...v, llrOn: v.llr === '1' }) },
  { id: 'pt-beam', name: 'PT beam', grp: 'Beams', inputs: [
    { k: 'L', l: 'Span (c/c)', u: 'ft', d: 45, g: 'Geometry' }, { k: 'cont', l: 'Continuity', t: 's', o: CONT_PT, d: 'both', g: 'Geometry' },
    { k: 'trib', l: 'Tributary width', u: 'ft', d: 25, g: 'Geometry' }, { k: 'ts', l: 'Slab thickness', u: 'in', d: 7, g: 'Geometry' },
    { k: 'b', l: 'Beam width', u: 'in', d: 24, g: 'Geometry' }, { k: 'use', l: 'Level', t: 's', o: [['floor', 'Floor'], ['roof', 'Roof']], d: 'floor', g: 'Geometry' },
    { k: 'SDL', l: 'Superimposed dead', u: 'psf', d: 20, g: 'Load' }, { k: 'LL', l: 'Live load', u: 'psf', d: 40, g: 'Load' },
    { k: 'wDadd', l: 'Extra dead line load', u: 'klf', d: 0, g: 'Load' }, { k: 'wLadd', l: 'Extra live line load', u: 'klf', d: 0, g: 'Load' },
    { k: 'llr', l: 'Live load reduction', t: 's', o: YN, d: '1', g: 'Load' },
    { k: 'bal', l: 'Dead load balanced', u: '%', d: 80, g: 'Load', help: 'Typical 70–100%' },
    { k: 'fc', l: "f'c", u: 'psi', d: 5000, g: 'Material' }, { k: 'fy', l: 'Mild steel fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'hTrial', l: 'Check a depth', u: 'in', d: 0, g: 'Check', help: '0 = size automatically' }],
    run: v => E_.ptBeam({ ...v, llrOn: v.llr === '1' }) },
  { id: 'steel-beam', name: 'Steel beam', grp: 'Beams', inputs: [
    { k: 'L', l: 'Span', u: 'ft', d: 30, g: 'Geometry' }, { k: 'trib', l: 'Tributary width', u: 'ft', d: 10, g: 'Geometry' },
    { k: 'brace', l: 'Compression flange', t: 's', o: [['cont', 'Braced by deck'], ['pts', 'Braced at points']], d: 'cont', g: 'Geometry' },
    { k: 'Lb', l: 'Unbraced length Lb', u: 'ft', d: 10, g: 'Geometry', show: v => v.brace === 'pts' },
    { k: 'Cb', l: 'Cb', u: '', d: 1.0, g: 'Geometry', show: v => v.brace === 'pts' },
    { k: 'SDL', l: 'Dead (incl. slab)', u: 'psf', d: 75, g: 'Load' }, { k: 'LL', l: 'Live load', u: 'psf', d: 50, g: 'Load' },
    { k: 'wDadd', l: 'Extra dead line load', u: 'klf', d: 0, g: 'Load' }, { k: 'wLadd', l: 'Extra live line load', u: 'klf', d: 0, g: 'Load' },
    { k: 'llr', l: 'Live load reduction', t: 's', o: YN, d: '1', g: 'Load' },
    { k: 'Fy', l: 'Fy', u: 'ksi', d: 50, g: 'Material' },
    { k: 'dLL', l: 'LL deflection L/', u: '', d: 360, g: 'Limits' }, { k: 'dTot', l: 'Total deflection L/', u: '', d: 240, g: 'Limits' },
    { k: 'maxD', l: 'Max depth', u: 'in', d: 0, g: 'Limits', help: '0 = no limit' }, { k: 'maxLd', l: 'Max span/depth', u: '', d: 0, g: 'Limits', help: '0 = no limit' }],
    run: v => E_.steelBeam({ ...v, llrOn: v.llr === '1' }) },
  { id: 'composite', name: 'Composite', grp: 'Beams', inputs: [
    { k: 'L', l: 'Span', u: 'ft', d: 30, g: 'Geometry' }, { k: 's', l: 'Beam spacing', u: 'ft', d: 10, g: 'Geometry' },
    { k: 'orient', l: 'Deck direction', t: 's', o: [['perp', 'Deck ⟂ beam (filler)'], ['par', 'Deck ∥ beam (girder)']], d: 'perp', g: 'Geometry' },
    { k: 'hr', l: 'Deck', t: 's', o: [['2', '2" composite deck'], ['3', '3" composite deck'], ['1.5', '1½" composite deck']], d: '2', g: 'Deck & slab' },
    { k: 'conc', l: 'Concrete', t: 's', o: [['LW', 'Lightweight 115 pcf'], ['NW', 'Normal weight 145 pcf']], d: 'LW', g: 'Deck & slab' },
    { k: 'fire', l: 'Fire rating', t: 's', o: FIRE, d: '2', g: 'Deck & slab', help: 'Sets topping for unprotected deck' },
    { k: 'tOver', l: 'Total slab thickness', u: 'in', d: 0, g: 'Deck & slab', help: '0 = from fire rating' },
    { k: 'fc', l: "f'c", u: 'psi', d: 4000, g: 'Deck & slab' },
    { k: 'SDL', l: 'Superimposed dead', u: 'psf', d: 20, g: 'Load', help: 'Excludes slab & deck' }, { k: 'LL', l: 'Live load', u: 'psf', d: 50, g: 'Load' },
    { k: 'llr', l: 'Live load reduction', t: 's', o: YN, d: '1', g: 'Load' },
    { k: 'Fy', l: 'Fy', u: 'ksi', d: 50, g: 'Material' },
    { k: 'studD', l: 'Stud diameter', t: 's', o: [['0.75', '¾"'], ['0.625', '⅝"']], d: '0.75', g: 'Material' },
    { k: 'perRib', l: 'Studs per rib', t: 's', o: [['1', '1'], ['2', '2'], ['3', '3']], d: '1', g: 'Material' },
    { k: 'dLL', l: 'LL deflection L/', u: '', d: 360, g: 'Limits' }, { k: 'dTot', l: 'SDL+LL deflection L/', u: '', d: 240, g: 'Limits' },
    { k: 'maxLd', l: 'Max span/depth', u: '', d: 28, g: 'Limits', help: '0 = no limit' }, { k: 'maxD', l: 'Max depth', u: 'in', d: 0, g: 'Limits', help: '0 = no limit' }],
    run: v => E_.compositeBeam({ ...v, hr: +v.hr, studD: +v.studD, perRib: +v.perRib, llrOn: v.llr === '1' }) },
  { id: 'rc-column', name: 'RC column', grp: 'Columns', inputs: [
    { k: 'mode', l: 'Axial load', t: 's', o: [['td', 'Tributary takedown'], ['direct', 'Enter Pu']], d: 'td', g: 'Load', w: 2 }, ...TD,
    { k: 'Mu', l: 'First-order Mu', u: 'k-ft', d: 0, g: 'Load', help: 'From frame; 0 = gravity only' },
    { k: 'shape', l: 'Shape', t: 's', o: [['square', 'Square, tied'], ['circle', 'Circular, spiral']], d: 'square', g: 'Geometry' },
    { k: 'lu', l: 'Clear height ℓu', u: 'ft', d: 10, g: 'Geometry' }, { k: 'k', l: 'Effective length k', u: '', d: 1.0, g: 'Geometry' },
    { k: 'frame', l: 'Frame', t: 's', o: [['braced', 'Braced (walls/cores)'], ['sway', 'Sway (moment frame)']], d: 'braced', g: 'Geometry' },
    { k: 'curv', l: 'End moments', t: 's', o: [['single', 'Single curvature'], ['zero', 'M1/M2 = 0'], ['double', 'Double curvature']], d: 'single', g: 'Geometry' },
    { k: 'fc', l: "f'c", u: 'psi', d: 6000, g: 'Material' }, { k: 'fy', l: 'fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'rhoPct', l: 'Steel ratio ρg', u: '%', d: 2, g: 'Material', help: '1–4%; 1.5–2% economical' },
    { k: 'fireMin', l: 'Fire min. dimension', t: 's', o: [['0', 'None'], ['8', '1 hr (8")'], ['10', '2 hr (10")'], ['12', '3 hr (12")']], d: '0', g: 'Material' },
    { k: 'hTrial', l: 'Check a size', u: 'in', d: 0, g: 'Check', help: '0 = size automatically' }],
    run: v => E_.rcColumn({ ...v, llrOn: v.llr === '1', fireMin: +v.fireMin }) },
  { id: 'steel-column', name: 'Steel column', grp: 'Columns', inputs: [
    { k: 'mode', l: 'Axial load', t: 's', o: [['td', 'Tributary takedown'], ['direct', 'Enter Pu']], d: 'direct', g: 'Load', w: 2 }, ...TD,
    { k: 'Mux', l: 'Mux', u: 'k-ft', d: 0, g: 'Load' }, { k: 'Muy', l: 'Muy', u: 'k-ft', d: 0, g: 'Load' },
    { k: 'KLx', l: 'KLx', u: 'ft', d: 14, g: 'Geometry' }, { k: 'KLy', l: 'KLy', u: 'ft', d: 14, g: 'Geometry' },
    { k: 'Cb', l: 'Cb (for Mux)', u: '', d: 1.0, g: 'Geometry' },
    { k: 'fams', l: 'Shapes', t: 's', o: [['8,10,12,14', 'W8–W14'], ['14', 'W14 only'], ['12', 'W12 only'], ['10', 'W10 only'], ['8,10,12,14,16,18,21,24', 'W8–W24']], d: '8,10,12,14', g: 'Material' },
    { k: 'Fy', l: 'Fy', u: 'ksi', d: 50, g: 'Material' }],
    run: v => E_.steelColumn({ ...v, llrOn: v.llr === '1', fams: v.fams.split(',').map(Number) }) },
  { id: 'walls', name: 'Shear walls', grp: 'Lateral', inputs: [
    { k: 'V', l: 'Basic wind speed V', u: 'mph', d: 160, g: 'Wind' }, { k: 'exp', l: 'Exposure', t: 's', o: [['C', 'C'], ['B', 'B'], ['D', 'D']], d: 'C', g: 'Wind' },
    { k: 'Kzt', l: 'Kzt', u: '', d: 1.0, g: 'Wind' }, { k: 'Ke', l: 'Ke', u: '', d: 1.0, g: 'Wind' },
    { k: 'nSt', l: 'Stories', u: '', d: 10, g: 'Building' }, { k: 'h1', l: 'First story height', u: 'ft', d: 14, g: 'Building' },
    { k: 'hTyp', l: 'Typical story height', u: 'ft', d: 10, g: 'Building' },
    { k: 'BX', l: 'Plan length (X)', u: 'ft', d: 150, g: 'Building' }, { k: 'BY', l: 'Plan width (Y)', u: 'ft', d: 70, g: 'Building' },
    { k: 'nX', l: 'Walls parallel to X', u: '', d: 2, g: 'Walls' }, { k: 'nY', l: 'Walls parallel to Y', u: '', d: 4, g: 'Walls' },
    { k: 't', l: 'Wall thickness', u: 'in', d: 12, g: 'Walls' },
    { k: 'bN', l: 'Boundary bars (each end)', u: 'qty', d: 6, g: 'Walls' }, { k: 'bS', l: 'Boundary bar size', t: 's', o: [['8', '#8'], ['9', '#9'], ['10', '#10'], ['11', '#11']], d: '9', g: 'Walls' },
    { k: 'rhoLp', l: 'Distributed vertical ρ', u: '%', d: 0.25, g: 'Walls' },
    { k: 'Dfl', l: 'Dead load on wall / floor', u: 'k', d: 30, g: 'Walls', help: 'Per wall per floor; resists overturning (0.9D)' },
    { k: 'fc', l: "f'c", u: 'psi', d: 5000, g: 'Material' }, { k: 'fy', l: 'fy', u: 'ksi', d: 60, g: 'Material' },
    { k: 'amp', l: 'Torsion allowance', u: '×', d: 1.15, g: 'Limits', help: 'ASCE 7 Case 2 eccentricity' },
    { k: 'svc', l: 'Drift wind factor', u: '×W', d: 0.7, g: 'Limits' }, { k: 'drift', l: 'Drift limit H/', u: '', d: 400, g: 'Limits' }],
    run: v => E_.shearWalls({ ...v, bS: +v.bS, rhoL: v.rhoLp / 100 }) },
  { id: 'transfer', name: 'Transfer', grp: 'Transfer', inputs: [
    { k: 'mat', l: 'Material', t: 's', o: [['rc', 'Reinforced concrete'], ['steel', 'Steel W-shape']], d: 'rc', g: 'Geometry', w: 2 },
    { k: 'L', l: 'Span', u: 'ft', d: 40, g: 'Geometry' },
    { k: 'supp', l: 'Supports', t: 's', o: [['simple', 'Simple span'], ['propped', 'Fixed–pinned'], ['fixed', 'Fixed–fixed'], ['cant', 'Cantilever']], d: 'simple', g: 'Geometry' },
    { k: 'P1D', l: 'Column 1 dead', u: 'k', d: 300, g: 'Column loads' }, { k: 'P1L', l: 'Column 1 live', u: 'k', d: 100, g: 'Column loads' },
    { k: 'x1', l: 'Column 1 at x', u: 'ft', d: 20, g: 'Column loads' },
    { k: 'P2D', l: 'Column 2 dead', u: 'k', d: 0, g: 'Column loads' }, { k: 'P2L', l: 'Column 2 live', u: 'k', d: 0, g: 'Column loads' },
    { k: 'x2', l: 'Column 2 at x', u: 'ft', d: 30, g: 'Column loads' },
    { k: 'wD', l: 'Uniform dead', u: 'klf', d: 2, g: 'Column loads', help: 'Excludes girder self-weight' }, { k: 'wL', l: 'Uniform live', u: 'klf', d: 0.5, g: 'Column loads' },
    { k: 'b', l: 'Width', u: 'in', d: 36, g: 'Material', show: v => v.mat === 'rc' },
    { k: 'fc', l: "f'c", u: 'psi', d: 6000, g: 'Material', show: v => v.mat === 'rc' }, { k: 'fy', l: 'fy', u: 'ksi', d: 60, g: 'Material', show: v => v.mat === 'rc' },
    { k: 'Fy', l: 'Fy', u: 'ksi', d: 50, g: 'Material', show: v => v.mat === 'steel' }, { k: 'Lb', l: 'Unbraced length Lb', u: 'ft', d: 10, g: 'Material', show: v => v.mat === 'steel' },
    { k: 'maxD', l: 'Max depth', u: 'in', d: 0, g: 'Material', show: v => v.mat === 'steel', help: '0 = no limit' },
    { k: 'dlim', l: 'Deflection limit L/', u: '', d: 600, g: 'Material' }],
    run: v => E_.transfer(v) }
];

// ---------- state ----------
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};
const vals = {};
TABS.forEach(t => { const saved = store.get('ps:' + t.id) || {}; vals[t.id] = {}; t.inputs.forEach(i => { vals[t.id][i.k] = saved[i.k] !== undefined ? saved[i.k] : i.d; }); });
let cur = TABS[0].id;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function buildNav() {
  const nav = $('#tabs');
  let html = '', g = null;
  TABS.forEach(t => {
    if (t.grp !== g) { if (g) html += '</div>'; g = t.grp; html += `<div class="tgrp" role="group" aria-label="${g}">`; }
    html += `<button class="tab" data-id="${t.id}" id="tab-${t.id}" type="button">${t.name}</button>`;
  });
  html += '</div>';
  nav.innerHTML = html;
  nav.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) { location.hash = b.dataset.id; } });
}
function buildForm() {
  const t = TABS.find(x => x.id === cur), v = vals[cur];
  const groups = [];
  t.inputs.forEach(i => { if (!groups.includes(i.g)) groups.push(i.g); });
  let html = '';
  groups.forEach(g => {
    const items = t.inputs.filter(i => i.g === g && (!i.show || i.show(v)));
    if (!items.length) return;
    html += `<fieldset><legend>${g}</legend><div class="fgrid">`;
    items.forEach(i => {
      const id = `in-${cur}-${i.k}`;
      html += `<label class="fld${i.w === 2 ? ' w2' : ''}" for="${id}"><span class="fl">${i.l}</span>`;
      if (i.t === 's') html += `<select id="${id}" data-k="${i.k}">${i.o.map(o => `<option value="${o[0]}"${String(v[i.k]) === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
      else html += `<span class="nin"><input id="${id}" data-k="${i.k}" type="number" inputmode="decimal" step="any" value="${v[i.k]}">${i.u ? `<span class="un">${i.u}</span>` : ''}</span>`;
      if (i.help) html += `<span class="hp">${i.help}</span>`;
      html += '</label>';
    });
    html += '</div></fieldset>';
  });
  html += `<button type="button" class="reset" id="reset">Reset to defaults</button>`;
  $('#form').innerHTML = html;
}
function onInput(e) {
  const el = e.target; if (!el.dataset || !el.dataset.k) return;
  const t = TABS.find(x => x.id === cur);
  const def = t.inputs.find(i => i.k === el.dataset.k);
  vals[cur][el.dataset.k] = def.t === 's' ? el.value : (el.value === '' ? 0 : parseFloat(el.value));
  store.set('ps:' + cur, vals[cur]);
  if (e.type === 'change' && def.t === 's') { const f = el.id; buildForm(); const n = document.getElementById(f); if (n) n.focus(); }
  if (e.type === 'input' || def.t === 's') compute();
}
let last = null;
function compute() {
  const t = TABS.find(x => x.id === cur);
  const v = {}; t.inputs.forEach(i => { v[i.k] = i.t === 's' ? String(vals[cur][i.k]) : +vals[cur][i.k]; });
  let r;
  try { r = t.run(v); } catch (err) { r = { headline: 'Check inputs', sub: 'These inputs could not be solved: ' + err.message, gov: '—', checks: [] }; console.error(err); }
  last = { t, r };
  render(r, t);
}
function ratioBar(c) {
  const r = Number(c.r);
  const w = isFinite(r) ? Math.max(0, Math.min(r, 1.25)) / 1.25 * 100 : 100;
  const cls = c.info ? 'info' : !isFinite(r) || r > 1.0001 ? 'fail' : r > 0.9 ? 'warn' : 'ok';
  return `<div class="bar ${cls}"><i style="width:${w}%"></i><b style="left:${100 / 1.25}%"></b></div><span class="rv ${cls}">${isFinite(r) ? r.toFixed(2) : '∞'}</span>`;
}
function render(r, t) {
  const real = (r.checks || []).filter(c => !c.info);
  const worst = Math.max(0, ...real.map(c => isFinite(c.r) ? c.r : 99));
  const fails = (r.flags || []).some(f => f.lvl === 'fail') || r.status === 'fail' || worst > 1.0001;
  const st = fails ? 'fail' : worst > 0.9 ? 'warn' : 'ok';
  const stTxt = { ok: 'Works', warn: 'Works, tight', fail: 'Does not work' }[st];
  let h = `<section class="verdict ${st}"><div class="vtop"><span class="eyebrow">${t.name} · preliminary size</span><span class="pill ${st}">${stTxt}</span></div>`;
  h += `<h2 class="hl">${esc(r.headline)}</h2><p class="sub">${esc(r.sub || '')}</p>`;
  h += `<div class="gov"><span>Governs</span><strong>${esc(r.gov || '—')}</strong></div>`;
  h += `<button type="button" class="copy" id="copy">Copy summary</button></section>`;
  if (r.flags && r.flags.length) h += `<ul class="flags">${r.flags.map(f => `<li class="${f.lvl}">${esc(f.msg)}</li>`).join('')}</ul>`;
  if (r.checks && r.checks.length) {
    h += `<section class="blk"><h3>Checks</h3><div class="checks">`;
    r.checks.forEach(c => {
      h += `<div class="ck${c.info ? ' isinfo' : ''}"><div class="ckn">${esc(c.name)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</div><div class="ckv"><span>${esc(c.d)}</span><span class="vs">vs</span><span>${esc(c.c)}</span></div><div class="ckr">${ratioBar(c)}</div></div>`;
    });
    h += `</div></section>`;
  }
  if (r.tables) r.tables.forEach(tb => {
    if (!tb.rows.length) return;
    h += `<section class="blk"><h3>${esc(tb.title)}</h3><div class="tw"><table><thead><tr>${tb.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
    tb.rows.forEach(row => { h += `<tr${row[0] === tb.hl ? ' class="sel"' : ''}>${row.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`; });
    h += `</tbody></table></div></section>`;
  });
  if (r.details && r.details.length) h += `<section class="blk"><h3>${esc(r.detailsTitle || 'Numbers')}</h3><dl class="dl">${r.details.map(d => `<div><dt>${esc(d[0])}</dt><dd>${esc(d[1])}</dd></div>`).join('')}</dl></section>`;
  if (r.notes && r.notes.length) h += `<section class="blk notes"><h3>Basis and rules of thumb</h3><ul>${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>`;
  $('#result').innerHTML = h;
  $('#mini').innerHTML = `<span class="pill ${st}">${stTxt}</span><strong>${esc(r.headline)}</strong><span class="mg">${esc(r.gov || '')}</span>`;
  $('#mini').className = 'mini ' + st;
}
function summaryText() {
  if (!last) return '';
  const { t, r } = last;
  let s = `${t.name}: ${r.headline}\n${r.sub || ''}\nGoverns: ${r.gov}\n`;
  (r.checks || []).forEach(c => { s += `- ${c.name}: ${c.d} vs ${c.c} (${isFinite(c.r) ? Number(c.r).toFixed(2) : '∞'})${c.info ? ' [info]' : ''}\n`; });
  (r.flags || []).forEach(f => { s += `! ${f.msg}\n`; });
  s += 'Preliminary sizing only — ACI 318-19 / AISC 360-22 / ASCE 7-22.';
  return s;
}
function show(id) {
  if (!TABS.find(t => t.id === id)) id = TABS[0].id;
  cur = id;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.id === id ? 'page' : 'false'));
  const btn = document.getElementById('tab-' + id); if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  buildForm(); compute();
}
function init() {
  buildNav();
  $('#form').addEventListener('input', onInput);
  $('#form').addEventListener('change', onInput);
  $('#form').addEventListener('click', e => {
    if (e.target.id === 'reset') { const t = TABS.find(x => x.id === cur); t.inputs.forEach(i => vals[cur][i.k] = i.d); store.set('ps:' + cur, vals[cur]); buildForm(); compute(); }
  });
  $('#result').addEventListener('click', e => {
    if (e.target.id !== 'copy') return;
    const txt = summaryText(), b = e.target;
    const done = ok => { b.textContent = ok ? 'Copied' : 'Select and copy below'; setTimeout(() => b.textContent = 'Copy summary', 1600); };
    try { navigator.clipboard.writeText(txt).then(() => done(true), () => { fallback(txt); done(false); }); } catch (err) { fallback(txt); done(false); }
  });
  $('#mini').addEventListener('click', () => $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || TABS[0].id);
}
function fallback(txt) {
  let ta = $('#cpy'); if (!ta) { ta = document.createElement('textarea'); ta.id = 'cpy'; ta.className = 'cpy'; $('#result').prepend(ta); }
  ta.value = txt; ta.select();
}
document.addEventListener('DOMContentLoaded', init);
