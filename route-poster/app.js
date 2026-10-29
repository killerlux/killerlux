import { MAX_BYTES, demoRoute, parseGPX, posterModel, svgPoster, drawPoster } from './core.js';
const byId = id => document.getElementById(id);
let route = demoRoute(), previewURL;
const controls = { title: byId('title'), date: byId('date') };
const options = () => ({ title: controls.title.value, date: controls.date.value, palette: document.querySelector('input[name="palette"]:checked').value });
function render() {
  let model;
  try { model = posterModel(route, options()); } catch { controls.date.value = ''; model = posterModel(route, options()); }
  const next = URL.createObjectURL(new Blob([svgPoster(model)], { type: 'image/svg+xml' }));
  byId('preview').src = next;
  byId('preview').alt = `${route.demo ? 'Exemple fictif' : 'Affiche de votre parcours'} : ${model.title}, ${model.distance} kilomètres, palette ${model.palette.name}`;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = next;
  byId('preview-label').textContent = route.demo ? 'EXEMPLE FICTIF' : 'VOTRE CRÉATION';
  byId('distance').textContent = `${model.distance} km`;
  byId('points').textContent = new Intl.NumberFormat('fr-FR').format(route.count);
  byId('segments').textContent = route.segments.length;
  byId('download-status').textContent = '';
}
function error(message = '') { byId('error').textContent = message; byId('error').hidden = !message; }
byId('gpx').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  error();
  try {
    if (file.size > MAX_BYTES) throw new Error('Le fichier dépasse 2 Mo. Exportez une trace plus légère.');
    route = parseGPX(await file.text());
    byId('file-status').textContent = `${file.name} · importé dans ce navigateur`;
    render();
  } catch (failure) { error(`${failure.message} L’aperçu précédent est conservé.`); }
  event.target.value = '';
});
byId('demo').addEventListener('click', () => { route = demoRoute(); error(); byId('file-status').textContent = 'Tracé fictif de démonstration'; render(); });
for (const control of Object.values(controls)) control.addEventListener('input', render);
for (const input of document.querySelectorAll('input[name="palette"]')) input.addEventListener('change', render);
function save(blob, extension) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url; link.download = `trace-${route.demo ? 'exemple-fictif' : 'mon-parcours'}-30x40.${extension}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  byId('download-status').textContent = `Fichier ${extension.toUpperCase()} préparé pour le téléchargement.`;
}
byId('svg').addEventListener('click', () => save(new Blob([svgPoster(posterModel(route, options()))], { type: 'image/svg+xml' }), 'svg'));
byId('png').addEventListener('click', async () => {
  const button = byId('png'); button.disabled = true;
  byId('download-status').textContent = 'Préparation du fichier haute définition…';
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    const canvas = drawPoster(document.createElement('canvas'), posterModel(route, options()));
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Le navigateur ne peut pas créer ce PNG. Essayez l’export SVG.');
    save(blob, 'png');
  } catch (failure) { error(failure.message); byId('download-status').textContent = ''; }
  finally { button.disabled = false; }
});
render();
byId('file-status').textContent = 'Tracé fictif de démonstration';
byId('loading-help').hidden = true;
document.querySelectorAll('input, button').forEach(control => { control.disabled = false; });
document.querySelector('main').setAttribute('aria-busy', 'false');
