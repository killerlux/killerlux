import {el,loadCampaigns,campaignURL,copyText} from './shared.js';
import {parseMeasurements} from './measurement.js';
const $=id=>document.getElementById(id);
let catalog=[];
const priorities={first:'À tester en premier',second:'Alternative',reserve:'En réserve'};
function renderCatalog(filter='all'){
  const selected=catalog.filter(c=>filter==='all'||c.project===filter);
  $('campaign-list').replaceChildren(...selected.map(c=>{
    const status=el('p',{class:'copy-status',role:'status'});
    const copy=[c.name,'',c.primaryText,'',c.shortHeadline,'CTA : '+c.cta,'Destination de démonstration : '+campaignURL(c)].join('\n');
    const preview=el('a',{href:campaignURL(c),'aria-label':'Voir la page '+c.name},el('img',{class:'campaign-preview',src:`./assets/${c.id}-feed.png`,alt:`${c.headline} ${c.subheadline} ${c.disclosure}`,width:1080,height:1350,loading:'lazy'}));
    const formats=el('div',{class:'asset-links'},...['feed','story'].map(format=>el('a',{href:`./assets/${c.id}-${format}.png`,download:`${c.id}-${format}.png`},format==='feed'?'PNG 4:5':'PNG 9:16')),el('a',{href:`./assets/${c.id}-feed.svg`,download:`${c.id}-feed.svg`},'SVG modifiable'));
    if(c.priority==='first')formats.append(el('a',{href:`./assets/${c.id}-story.mp4`,download:`${c.id}-story.mp4`},'Vidéo 15 s'));
    return el('article',{class:'campaign-card','data-campaign':c.id},preview,el('div',{class:'campaign-body'},el('span',{class:'tag '+c.priority},priorities[c.priority]),el('h3',{},c.name),el('p',{},c.angle),el('div',{class:'actions'},el('a',{class:'button primary',href:campaignURL(c)},'Voir la page →'),el('button',{class:'button',type:'button',onclick:()=>copyText(copy,status)},'Copier les textes')),formats,status,c.priority==='first'?el('details',{},el('summary',{},'Voir la vidéo de 15 secondes'),el('video',{class:'campaign-video',controls:'',preload:'none',playsinline:'',poster:`./assets/${c.id}-story.png`,src:`./assets/${c.id}-story.mp4`,'aria-label':'Vidéo de démonstration : '+c.name}),el('p',{},'Montage de captures réelles · sans audio · textes français intégrés.')):null,el('details',{},el('summary',{},'Texte de la publicité'),el('p',{},c.primaryText),el('p',{},el('strong',{},c.shortHeadline)),el('p',{},'Bouton proposé : '+c.cta)),el('details',{},el('summary',{},'Pourquoi cet angle ?'),el('p',{},c.rationale),el('ul',{},c.risks.map(r=>el('li',{},r))))));
  }));
  $('catalog-status').textContent=selected.length+' concepts disponibles · aucune diffusion ni performance observée.';
}
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));renderCatalog(b.dataset.filter);});
const percent=v=>v==null?'Inconnu':new Intl.NumberFormat('fr-FR',{style:'percent',maximumFractionDigits:1}).format(v);
const money=v=>v==null?'Inconnu':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(v);
function invalidate(){
  $('measure-results').replaceChildren(el('div',{class:'empty'},el('strong',{},'Résultats à calculer.'),el('p',{},'Les entrées ont changé. Examinez à nouveau les chiffres pour afficher les indicateurs correspondants.')));
}
function measurementOptions(){return {mode:$('measure-mode').value,provenance:$('measure-source').value.trim(),startDate:$('measure-start').value,endDate:$('measure-end').value,windowClosed:$('measure-closed').checked,comparableVisitors:$('measure-comparable').checked};}
function renderMetrics(r,options){
  if(r.status!=='ok'){$('measure-status').textContent=r.reason||r.error||r.errors?.join(' ')||r.warnings?.[0]||'Données incohérentes. Vérifiez les colonnes et les compteurs.';$('measure-results').replaceChildren(el('div',{class:'warning'},$('measure-status').textContent));return;}
  const fictional=options.mode==='scenario';
  const top=el('div',{class:fictional?'warning':'empty'},el('strong',{},fictional?'EXEMPLE FICTIF — aucune performance réelle':'Chiffres déclarés — provenance non authentifiée'),el('p',{},'Ces indicateurs concernent une action gratuite. Ils ne sont ni un coût par achat ni un résultat commercial.'));
  const cards=r.rows.map(row=>{
    const m=row.metrics;
    const values=[['Dépense déclarée',money(row.spendEur)],['Clics / impressions',percent(m.ctr)],['Coût par clic',money(m.cpcEur)],['Coût par visiteur éligible',money(m.costPerVisitorEur)],['Actions / visiteurs éligibles',percent(m.actionRate)],['Coût par action',money(m.costPerActionEur)]];
    if(m.actionRateWilson95)values.push(['Intervalle de Wilson à 95 %',percent(m.actionRateWilson95.lower)+' – '+percent(m.actionRateWilson95.upper)]);
    return el('article',{class:'result-card'},el('h3',{},catalog.find(c=>c.id===row.campaignId)?.name||row.campaignId),el('p',{class:'source'},options.provenance||'Provenance inconnue'),el('dl',{},values.map(([name,value])=>el('div',{},el('dt',{},name),el('dd',{},value)))),el('p',{class:'small'},m.actionRateIntervalReason||'Intervalle sous les hypothèses déclarées : visiteurs indépendants, comparables et action dédupliquée. Ce n’est pas une probabilité de réussite du projet.'),row.warnings?.length?el('ul',{},row.warnings.map(w=>el('li',{},w))):null);
  });
  $('measure-results').replaceChildren(top,...cards,...(r.warnings||[]).map(w=>el('p',{class:'small'},w)));
  $('measure-status').textContent=r.rows.length+' ligne(s) examinée(s). Aucun classement automatique ni budget modifié.';
}
function calculate(){try{const options=measurementOptions();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(options.mode==='observations'&&options.endDate>today){renderMetrics({status:'invalid',warnings:['La période d’observation se termine dans le futur. Vérifiez la date ou utilisez un scénario hypothétique.']},options);return;}if(options.mode==='observations'&&options.provenance.startsWith('EXEMPLE FICTIF')){renderMetrics({status:'invalid',warnings:['Cet exemple est fictif. Conservez le mode hypothétique, ou remplacez les chiffres et leur provenance par vos propres observations.']},options);return;}renderMetrics(parseMeasurements($('measure-csv').value,options),options);}catch{$('measure-status').textContent='Ce fichier ne peut pas être examiné. Vérifiez son format CSV.';invalidate();}}
$('measure-form').addEventListener('submit',event=>{event.preventDefault();calculate();});
for(const input of document.querySelectorAll('#measure-form input:not([type=file]), #measure-form select, #measure-form textarea'))input.addEventListener('input',invalidate);
$('measure-file').addEventListener('change',async event=>{const f=event.target.files[0];if(!f)return;invalidate();$('measure-csv').value='';if(f.size>100_000){$('measure-status').textContent='Fichier trop volumineux : 100 Ko maximum.';event.target.value='';return;}try{$('measure-csv').value=await f.text();$('measure-status').textContent='CSV chargé localement. Vérifiez sa provenance et examinez les chiffres.';}catch{$('measure-status').textContent='Lecture du fichier impossible.';}});
$('measure-example').addEventListener('click',()=>{
  $('measure-mode').value='scenario';$('measure-source').value='EXEMPLE FICTIF — aucun trafic ni budget réels';$('measure-start').value='2026-10-22';$('measure-end').value='2026-10-28';$('measure-closed').checked=false;$('measure-comparable').checked=false;
  $('measure-csv').value='campaign_id,spend_eur,impressions,link_clicks,eligible_visitors,unique_completers\ntrace-souvenir,12,1800,60,45,9\ndossier-marge,12,1600,40,30,4';
  $('measure-file').value='';calculate();
});
try{catalog=await loadCampaigns();renderCatalog();for(const b of document.querySelectorAll('[data-filter]'))b.disabled=false;}catch(error){$('catalog-status').textContent=error.message;}
for(const control of document.querySelectorAll('#measure-form input, #measure-form button, #measure-form select, #measure-form textarea'))control.disabled=false;
$('startup-help').hidden=true;
