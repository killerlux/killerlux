export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_POINTS = 20000;
export const MAX_RENDER_POINTS = 2000;
export const PNG_WIDTH = 3543;
export const PNG_HEIGHT = 4724;
export const PALETTES = {
  forest: { name: 'Forêt', paper: '#f4f0e6', ink: '#183c35', accent: '#ae6947', muted: '#61746b' },
  midnight: { name: 'Minuit', paper: '#172a3a', ink: '#f2dfb9', accent: '#d69775', muted: '#b4c0c6' },
  clay: { name: 'Argile', paper: '#f5ebe4', ink: '#a4412c', accent: '#6a4a40', muted: '#85685c' }
};
const rad = value => value * Math.PI / 180;
const wrap = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;

export function haversine(a, b) {
  const lat = rad(b.lat - a.lat), lon = rad(wrap(b.lon - a.lon));
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

export function routeDistance(segments) {
  return segments.reduce((sum, segment) => sum + segment.reduce((km, point, i) => i ? km + haversine(segment[i - 1], point) : km, 0), 0);
}

function children(element, name) {
  return [...element.children].filter(child => child.localName === name);
}

export function parseGPX(text, Parser = globalThis.DOMParser) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('Le fichier dépasse 2 Mo. Exportez une trace plus légère.');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('Ce GPX contient une déclaration XML non prise en charge.');
  const xml = new Parser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagNameNS('*', 'parsererror').length || xml.documentElement?.localName !== 'gpx') throw new Error('Ce fichier ne contient pas un GPX valide.');
  const root = xml.documentElement;
  const nodes = children(root, 'trk').flatMap(track => children(track, 'trkseg').map(segment => children(segment, 'trkpt')));
  nodes.push(...children(root, 'rte').map(route => children(route, 'rtept')));
  const count = nodes.reduce((sum, segment) => sum + segment.length, 0);
  if (count > MAX_POINTS) throw new Error('Cette trace dépasse 20 000 points. Simplifiez-la avant de l’importer.');
  if (!nodes.some(segment => segment.length >= 2)) throw new Error('Le GPX doit contenir au moins un segment de deux points.');
  if (nodes.filter(segment => segment.length >= 2).length > MAX_RENDER_POINTS / 2) throw new Error('Cette trace dépasse 1 000 segments distincts. Exportez un parcours moins fragmenté.');
  const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  const segments = nodes.filter(segment => segment.length).map(segment => segment.map(node => {
    const latitude = node.getAttribute('lat')?.trim() ?? '';
    const longitude = node.getAttribute('lon')?.trim() ?? '';
    const lat = Number(latitude), lon = Number(longitude);
    if (!numeric.test(latitude) || !numeric.test(longitude) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Une coordonnée GPS est manquante ou hors limites.');
    return { lat, lon };
  }));
  return { segments, count, distance: routeDistance(segments), demo: false };
}

export const EXAMPLES = Object.freeze({
  run: { category: 'Course', title: 'LE TOUR DES QUAIS', description: 'Les rues encore calmes. Le fleuve pour repère.', palette: 'forest', scale: 0.017,
    waypoints: [[-.7,-.85],[-.65,-.3],[-.52,.05],[-.32,.3],[-.18,.65],[.05,.95],[.34,1.03],[.57,.88],[.59,.64],[.3,.64],[.3,.43],[.7,.43],[.7,.11],[.35,.11],[.35,-.1],[.85,-.1],[.85,-.4],[.5,-.4],[.5,-.63],[.83,-.63],[.83,-.91],[.3,-.91],[.3,-.72],[-.05,-.72],[-.05,-1],[-.53,-1],[-.7,-.85]] },
  trail: { category: 'Trail', title: 'LÀ-HAUT, LES CRÊTES', description: 'Des lacets, des détours, puis la ligne des crêtes.', palette: 'clay', scale: 0.035,
    waypoints: [[-.6,-1],[-.72,-.84],[-.47,-.75],[-.66,-.61],[-.38,-.56],[-.6,-.42],[-.25,-.36],[-.48,-.2],[-.08,-.1],[-.34,.04],[.08,.15],[-.09,.3],[.28,.36],[.16,.52],[.47,.62],[.3,.77],[.64,.86],[.58,1.02],[.83,.92],[.95,.68],[.77,.56],[.91,.34],[.62,.21],[.7,.02],[.48,-.06],[.67,-.26],[.37,-.4],[.49,-.59],[.16,-.7],[.08,-.91],[-.2,-1.04],[-.6,-1]] },
  ride: { category: 'Vélo', title: 'LA GRANDE ÉCHAPPÉE', description: 'Une journée à tourner les jambes et la tête ailleurs.', palette: 'midnight', scale: 0.1,
    waypoints: [[-.88,-.44],[-1,-.13],[-.91,.19],[-.62,.31],[-.52,.63],[-.22,.77],[-.02,1.02],[.26,.9],[.4,.65],[.72,.63],[.92,.4],[.73,.14],[.88,-.06],[.62,-.3],[.5,-.62],[.17,-.74],[-.03,-1],[-.36,-.84],[-.51,-.59],[-.88,-.44]] }
});

export function demoRoute(id = 'run') {
  const example = EXAMPLES[id] || EXAMPLES.run;
  // Original fictional geometries, rounded like a recorded route. No real
  // activity, map tile, address or third-party course is embedded here.
  let waypoints = example.waypoints.slice(0, -1);
  const round = id === 'run' ? 0.07 : id === 'trail' ? 0.12 : 0.2;
  for (let pass = 0; pass < (id === 'ride' ? 2 : 1); pass++) {
    waypoints = waypoints.flatMap((a, index) => {
      const b = waypoints[(index + 1) % waypoints.length];
      return [round, 1 - round].map(mix => [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix]);
    });
  }
  waypoints.push(waypoints[0]);
  const segment = [];
  waypoints.forEach((point, index) => {
    if (!index) return;
    const previous = waypoints[index - 1];
    for (let step = 0; step < 12; step++) {
      const mix = step / 12;
      segment.push({ lat: 45 + (previous[1] + (point[1] - previous[1]) * mix) * example.scale, lon: 3 + (previous[0] + (point[0] - previous[0]) * mix) * example.scale / Math.cos(rad(45)) });
    }
  });
  segment.push(segment[0]);
  return { segments: [segment], count: segment.length, distance: routeDistance([segment]), demo: true, demoId: EXAMPLES[id] ? id : 'run', category: example.category };
}

export function sampleSegments(segments, limit = MAX_RENDER_POINTS) {
  // Isolated points have no line to draw. Every drawable segment retains both
  // endpoints, so sampling cannot erase a short segment or create a bridge.
  const drawable = segments.filter(segment => segment.length > 1);
  const total = drawable.reduce((sum, segment) => sum + segment.length, 0);
  if (total <= limit) return drawable;
  if (drawable.length * 2 > limit) throw new Error('Trop de segments pour représenter chaque tracé.');
  const spare = limit - drawable.length * 2;
  const capacity = total - drawable.length * 2;
  const allocations = drawable.map((segment, index) => {
    const share = spare * (segment.length - 2) / capacity;
    return { index, count: 2 + Math.floor(share), remainder: share % 1 };
  });
  const left = limit - allocations.reduce((sum, item) => sum + item.count, 0);
  [...allocations].sort((a, b) => b.remainder - a.remainder).slice(0, left).forEach(item => { item.count += 1; });
  return drawable.map((segment, index) => Array.from({ length: allocations[index].count }, (_, i) => segment[Math.round(i * (segment.length - 1) / (allocations[index].count - 1))]));
}

export function projectRoute(segments) {
  const sample = sampleSegments(segments);
  const points = sample.flat();
  const anchor = points[0].lon;
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lonScale = Math.max(0.01, Math.cos(rad(meanLat)));
  const projected = sample.map(segment => {
    let prior = anchor;
    return segment.map(point => {
      const longitude = prior + wrap(point.lon - prior);
      prior = longitude;
      return { x: longitude * lonScale, y: -point.lat };
    });
  });
  const all = projected.flat();
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX, height = maxY - minY;
  const scale = Math.min(690 / Math.max(width, 1e-10), 650 / Math.max(height, 1e-10));
  return projected.map(segment => segment.map(point => ({ x: 450 + (point.x - (minX + maxX) / 2) * scale, y: 570 + (point.y - (minY + maxY) / 2) * scale })));
}

export function escapeXML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

export function cleanText(value, max = 64) {
  return [...String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, max).join('');
}

export function exportFilename(title, demo, extension) {
  const name = cleanText(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'mon-parcours';
  const type = extension === 'svg' ? 'svg' : 'png';
  return `trace-${name}${demo ? '-exemple-fictif' : ''}-30x40.${type}`;
}

let measuringContext;
function measure(text, size, family = 'Georgia') {
  if (!measuringContext && globalThis.document) measuringContext = document.createElement('canvas').getContext('2d');
  if (!measuringContext) return [...text].length * size * 0.65;
  measuringContext.font = `${size}px ${family}`;
  return measuringContext.measureText(text).width;
}

function titleLayout(title) {
  let lines = [title], size = 58;
  if (measure(title, size) > 740 && title.includes(' ')) {
    const words = title.split(/\s+/);
    let best = Infinity;
    for (let split = 1; split < words.length; split++) {
      const candidate = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
      const width = Math.max(...candidate.map(line => measure(line, size)));
      if (width < best) { best = width; lines = candidate; }
    }
  }
  const widest = Math.max(...lines.map(line => measure(line, size)));
  size = Math.min(size, size * 740 / Math.max(widest, 1));
  return lines.map((value, i) => ({ value, size, y: lines.length === 1 ? 182 : 157 + i * 65 }));
}

export function posterModel(route, options = {}) {
  const title = cleanText(options.title) || 'MON CHEMIN PARCOURU';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date ?? '') ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${options.date}T12:00:00Z`)) : '';
  return { route, title, date, palette: PALETTES[options.palette] || PALETTES.forest, paths: projectRoute(route.segments), distance: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(route.distance), titleLines: titleLayout(title) };
}

function textLayout(model) {
  const { palette: p, titleLines, distance, date, route } = model;
  return [
    { value: 'UN CHEMIN À GARDER', y: 100, size: 15, family: 'Arial', color: p.ink, tracking: 4 },
    ...titleLines.map(line => ({ ...line, family: 'Georgia', color: p.ink, tracking: 0 })),
    { value: `${distance} km`, y: 1026, size: 46, family: 'Georgia', color: p.ink, tracking: 0 },
    { value: date || 'CHAQUE DÉTOUR COMPTE', y: 1070, size: 17, family: 'Arial', color: p.muted, tracking: date ? 0 : 1 },
    { value: route.demo ? `${route.category?.toUpperCase() || 'EXEMPLE'} · TRACÉ FICTIF` : 'MON PARCOURS · MA TRACE', y: 1126, size: 11, family: 'Arial', color: p.muted, tracking: 2 }
  ];
}

function letterPositions(item) {
  const characters = [...item.value];
  const widths = characters.map(character => measure(character, item.size, item.family));
  let left = 450 - (widths.reduce((sum, width) => sum + width, 0) + item.tracking * (characters.length - 1)) / 2;
  return characters.map((character, index) => { const result = { character, x: left }; left += widths[index] + item.tracking; return result; });
}

export function svgPoster(model) {
  const { palette: p, title, paths } = model;
  const trace = paths.filter(segment => segment.length > 1).map(segment => `<polyline points="${segment.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}"/>`).join('');
  const text = textLayout(model).map(item => item.tracking ? `<text y="${item.y}" fill="${item.color}" font-family="${item.family}" font-size="${item.size}" aria-label="${escapeXML(item.value)}">${letterPositions(item).map(({character, x}) => `<tspan x="${x.toFixed(3)}">${escapeXML(character)}</tspan>`).join('')}</text>` : `<text x="450" y="${item.y}" text-anchor="middle" fill="${item.color}" font-family="${item.family}" font-size="${item.size}">${escapeXML(item.value)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="400mm" viewBox="0 0 900 1200" role="img" aria-label="${escapeXML(title)}"><rect width="900" height="1200" fill="${p.paper}"/><rect x="36" y="36" width="828" height="1128" fill="none" stroke="${p.ink}" stroke-opacity="0.25"/><g fill="none" stroke="${p.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${trace}</g><line x1="405" y1="965" x2="495" y2="965" stroke="${p.accent}" stroke-width="2"/>${text}</svg>`;
}

export function drawPoster(canvas, model) {
  canvas.width = PNG_WIDTH;
  canvas.height = PNG_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.scale(PNG_WIDTH / 900, PNG_HEIGHT / 1200);
  const { palette: p, paths } = model;
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, 900, 1200);
  ctx.strokeStyle = p.ink; ctx.globalAlpha = 0.25; ctx.strokeRect(36, 36, 828, 1128); ctx.globalAlpha = 1;
  ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const segment of paths) {
    if (segment.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(segment[0].x, segment[0].y);
    for (const point of segment.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.strokeStyle = p.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(405, 965); ctx.lineTo(495, 965); ctx.stroke();
  for (const item of textLayout(model)) {
    ctx.fillStyle = item.color; ctx.font = `${item.size}px ${item.family}`;
    if (item.tracking) {
      ctx.textAlign = 'left';
      for (const letter of letterPositions(item)) ctx.fillText(letter.character, letter.x, item.y);
    } else { ctx.textAlign = 'center'; ctx.fillText(item.value, 450, item.y); }
  }
  return canvas;
}
