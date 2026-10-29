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

export function demoRoute() {
  const segment = Array.from({ length: 361 }, (_, i) => {
    const t = i / 360 * Math.PI * 2;
    const r = 1 + 0.13 * Math.sin(7 * t) + 0.07 * Math.cos(11 * t);
    return { lat: 46 + 0.029 * Math.sin(t) * r, lon: 3 + 0.054 * Math.cos(t) * r + 0.009 * Math.sin(3 * t) };
  });
  return { segments: [segment], count: segment.length, distance: routeDistance([segment]), demo: true };
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
  return [...String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()].slice(0, max).join('');
}

export function posterModel(route, options = {}) {
  const title = cleanText(options.title || 'LE CHEMIN PARCOURU');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date ?? '') ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${options.date}T12:00:00Z`)) : '';
  return { route, title, date, palette: PALETTES[options.palette] || PALETTES.forest, paths: projectRoute(route.segments), distance: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(route.distance), titleSize: Math.min(58, 1100 / Math.max(20, [...title].length)) };
}

export function svgPoster(model) {
  const { palette: p, title, titleSize, paths, distance, date, route } = model;
  const trace = paths.filter(segment => segment.length > 1).map(segment => `<polyline points="${segment.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="400mm" viewBox="0 0 900 1200" role="img" aria-label="${escapeXML(title)}"><rect width="900" height="1200" fill="${p.paper}"/><rect x="36" y="36" width="828" height="1128" fill="none" stroke="${p.ink}" stroke-opacity="0.25"/><g text-anchor="middle" fill="${p.ink}"><text x="450" y="106" font-family="Arial,sans-serif" font-size="15" letter-spacing="5">UN CHEMIN À GARDER</text><text x="450" y="180" font-family="Georgia,serif" font-size="${titleSize}"${title.length > 32 ? ' textLength="740" lengthAdjust="spacingAndGlyphs"' : ''}>${escapeXML(title)}</text></g><g fill="none" stroke="${p.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${trace}</g><line x1="405" y1="965" x2="495" y2="965" stroke="${p.accent}" stroke-width="2"/><g text-anchor="middle"><text x="450" y="1026" fill="${p.ink}" font-family="Georgia,serif" font-size="46">${escapeXML(distance)} km</text><text x="450" y="1068" fill="${p.muted}" font-family="Arial,sans-serif" font-size="17">${escapeXML(date || 'CHAQUE DÉTOUR COMPTE')}</text><text x="450" y="1126" fill="${p.muted}" font-family="Arial,sans-serif" font-size="11" letter-spacing="2">${route.demo ? 'TRACÉ FICTIF · DÉMONSTRATION' : 'MON PARCOURS · MA TRACE'}</text></g></svg>`;
}

export function drawPoster(canvas, model) {
  canvas.width = PNG_WIDTH;
  canvas.height = PNG_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.scale(PNG_WIDTH / 900, PNG_HEIGHT / 1200);
  const { palette: p, title, titleSize, paths, distance, date, route } = model;
  ctx.fillStyle = p.paper; ctx.fillRect(0, 0, 900, 1200);
  ctx.strokeStyle = p.ink; ctx.globalAlpha = 0.25; ctx.strokeRect(36, 36, 828, 1128); ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.fillStyle = p.ink; ctx.font = '15px Arial'; ctx.fillText('UN CHEMIN À GARDER', 450, 106);
  ctx.font = `${titleSize}px Georgia`; ctx.fillText(title, 450, 180, 740);
  ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const segment of paths) {
    if (segment.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(segment[0].x, segment[0].y);
    for (const point of segment.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.strokeStyle = p.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(405, 965); ctx.lineTo(495, 965); ctx.stroke();
  ctx.font = '46px Georgia'; ctx.fillText(`${distance} km`, 450, 1026);
  ctx.fillStyle = p.muted; ctx.font = '17px Arial'; ctx.fillText(date || 'CHAQUE DÉTOUR COMPTE', 450, 1068);
  ctx.font = '11px Arial'; ctx.fillText(route.demo ? 'TRACÉ FICTIF · DÉMONSTRATION' : 'MON PARCOURS · MA TRACE', 450, 1126);
  return canvas;
}
