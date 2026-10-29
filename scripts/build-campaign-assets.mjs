import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {demoRoute, posterModel, svgPoster, escapeXML} from '../route-poster/core.js';

const root = new URL('../', import.meta.url);
const campaigns = JSON.parse(await readFile(new URL('campaigns/campaigns.json', root), 'utf8'));
const out = new URL('campaigns/assets/', root);
await mkdir(out, {recursive:true});
const e = escapeXML;
const text = (x,y,value,size=28,fill='#153c32',extra='') => `<text x="${x}" y="${y}" ${extra.includes('font-family=')?'':'font-family="Arial,sans-serif"'} font-size="${size}" fill="${fill}" ${extra}>${e(value)}</text>`;
const rect = (x,y,w,h,fill,rx=20,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const headlineLines = {
  'trace-souvenir':['Votre parcours','mérite une affiche.'],
  'trace-cadeau':['Un souvenir à composer','et à partager.'],
  'trace-local':['Votre parcours','reste avec vous.'],
  'dossier-marge':['Combien reste-t-il','après les frais ?'],
  'dossier-preuves':['Gardez les sources','de vos chiffres.'],
  'dossier-comparaison':['Quatre pistes.','Des limites visibles.']
};
function poster(id,x,y,w,h,title) {
  const route=demoRoute(id);
  const model=posterModel(route,{title,palette:id==='ride'?'midnight':id==='trail'?'clay':'forest'});
  return svgPoster(model).replace('width="300mm" height="400mm"',`x="${x}" y="${y}" width="${w}" height="${h}"`);
}
function traceGraphic(id) {
  const frame=rect(0,0,936,600,'#e5e7dc',30)+text(30,45,'trace.  /  aperçu du fichier',23,'#36584b')+text(906,45,'SVG · PNG',20,'#36584b','text-anchor="end"');
  if(id==='trace-cadeau')return frame+poster('run',60,72,333,444,'NOTRE PREMIÈRE BOUCLE')+poster('ride',528,72,333,444,'LES KILOMÈTRES PARTAGÉS')+text(468,545,'Un fichier à composer et à partager.',28,'#36584b','text-anchor="middle"')+text(468,580,'Exemples fictifs',30,'#36584b','text-anchor="middle"');
  if(id==='trace-local')return frame+rect(30,110,370,350,'#f9f8f2',22)+text(60,166,'01  Importer votre GPX',25)+text(60,230,'02  Personnaliser',25)+text(60,294,'03  Télécharger',25)+rect(58,340,310,65,'#dbeadc',12)+text(213,381,'Le GPX reste local',22,'#214e3c','text-anchor="middle"')+poster('trail',470,72,333,444,'LÀ-HAUT, LES CRÊTES')+text(468,568,'Exemple fictif · aucun compte nécessaire',30,'#36584b','text-anchor="middle"');
  return frame+poster('run',268,65,350,467,'LE TOUR DES QUAIS')+text(48,185,'Une sortie.',29,'#36584b')+text(48,232,'Une ligne.',29,'#36584b')+text(658,387,'Un souvenir',29,'#36584b')+text(658,434,'à garder.',29,'#36584b')+text(468,570,'Parcours de démonstration fictif',30,'#36584b','text-anchor="middle"');
}
function commerceGraphic(id) {
  const ink='#153c32', muted='#526b5c';
  let b=rect(0,0,936,600,'#f7f8f2',30);
  if(id==='dossier-marge') {
    b+=text(40,60,'EXEMPLE DOCUMENTÉ · AFFICHE 30 × 40 CM',23,muted);
    [['Impression','3,80 €'],['Port vers la France','10,75 €'],['Traitement','0,40 €']].forEach((r,i)=>{const y=135+i*75;b+=text(40,y,r[0],30)+text(885,y,r[1],34,ink,'text-anchor="end"')+`<path d="M40 ${y+24} H886" stroke="#d6dfcf"/>`;});
    b+=rect(26,353,884,155,'#deeddc',20)+text(52,405,'TOTAL INDICATIF LIVRÉ',23,muted)+text(876,465,'14,95 € HT',70,ink,'text-anchor="end" font-weight="700"');
    b+=text(40,557,'Print API · 1 unité · France · relevé du 29/10/2026',22,muted);
  } else if(id==='dossier-preuves') {
    b+=text(40,63,'UNE OFFRE, SES SOURCES, SES LIMITES',24,muted);
    const rows=[['Référence','poster_30x40 · 30 × 40 cm'],['Source','Calculateur public Print API'],['Relevé','29 octobre 2026'],['Coût livré','14,95 € HT indicatifs'],['Qualité réelle','À vérifier']];
    rows.forEach((r,i)=>{const y=135+i*74;b+=text(40,y,r[0],25,muted)+text(886,y,r[1],27,ink,'text-anchor="end"')+`<path d="M40 ${y+23} H886" stroke="#d6dfcf"/>`;});
    b+=rect(40,515,856,57,'#e8ede1',12)+text(468,551,'Exportez le dossier avec ses hypothèses.',24,ink,'text-anchor="middle"');
  } else {
    b+=text(40,63,'COÛT FOURNISSEUR LIVRÉ EN FRANCE',23,muted);
    const rows=[['Sac de crochet','Inconnu'],['Affiche 30 × 40','14,95 € HT*'],['Porte-clé gravé','Inconnu'],['Puzzle GPX','Inconnu']];
    rows.forEach((r,i)=>{const y=115+i*96;b+=rect(28,y-31,880,76,i===1?'#deeddc':'#edf0e7',14)+text(48,y+17,r[0],29)+text(880,y+17,r[1],31,ink,'text-anchor="end"');});
    b+=text(40,535,'* Indication publique Print API, 29/10/2026.',22,muted)+text(40,572,'Quatre études · aucun lancement commercial validé.',22,muted);
  }
  return b;
}
function art(c,format) {
  const story=format==='story', h=story?1920:1350, offset=story?220:0;
  const trace=c.project==='trace', bg=trace?'#f5f0e5':'#143c33', ink=trace?'#193d33':'#f6f6ed', muted=trace?'#5b7160':'#c3d6c5';
  const title=headlineLines[c.id], size=c.id==='trace-cadeau'?68:78;
  let body=rect(0,0,1080,h,bg,0);
  body+=text(72,77+offset,trace?'trace.':'Dossier Commerce',trace?39:30,ink,trace?'font-family="Georgia,serif" font-weight="700"':'font-weight="700"');
  body+=text(1008,74+offset,trace?'GPX → AFFICHE':'LES PREUVES AVANT LA DÉCISION',trace?22:17,muted,'text-anchor="end" letter-spacing="1"');
  title.forEach((line,i)=>{body+=text(72,183+offset+i*89,line,size,ink,trace?'font-family="Georgia,serif"':'font-weight="700"');});
  body+=text(72,337+offset,c.subheadline,29,muted);
  body+=`<g transform="translate(72 ${390+offset})">${trace?traceGraphic(c.id):commerceGraphic(c.id)}</g>`;
  const buttonY=1040+offset+(story?85:0);
  body+=rect(72,buttonY,936,95,trace?'#224e3c':'#dceccc',18)+text(540,buttonY+60,trace?'Créer mon fichier gratuitement  →':'Essayer l’outil gratuit  →',32,trace?'#fff':'#143c33','text-anchor="middle" font-weight="700"');
  body+=text(540,buttonY+150,c.disclosure,30,muted,'text-anchor="middle"');
  body+=text(540,buttonY+195,trace?'GPX requis pour votre parcours · impression non proposée':'Sources et hypothèses à vérifier · aucune vente prédite',30,muted,'text-anchor="middle"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}" role="img" aria-label="${e(c.name+' — création publicitaire pour un outil gratuit')}"><title>${e(c.name)}</title>${body}</svg>`;
}
for(const c of campaigns)for(const f of ['feed','story'])await writeFile(new URL(`${c.id}-${f}.svg`,out),art(c,f));
for(const [id,title] of [['run','LE TOUR DES QUAIS'],['trail','LÀ-HAUT, LES CRÊTES'],['ride','LA GRANDE ÉCHAPPÉE']])await writeFile(new URL(`poster-${id}.svg`,out),svgPoster(posterModel(demoRoute(id),{title,palette:id==='ride'?'midnight':id==='trail'?'clay':'forest'})));
console.log(`Created ${campaigns.length*2} original SVG creatives in ${fileURLToPath(out)}. No customer route, paid order or photographic product mockup used.`);
