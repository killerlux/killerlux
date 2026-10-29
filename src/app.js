import {extractOffers, safeSourceURL} from './extract.js';
import {createBookmarklet} from './collector.js';
import {computeEconomics} from './economics.js';
import {assessProbability} from './probability.js';
import {validateProject, PROJECT_LIMITS} from './project.js';
import {assessSensitivity} from './sensitivity.js';

const $=id=>document.getElementById(id);
const MAX_FILE_BYTES=2_000_000;
const money=(value,currency='EUR')=>value===null||value===undefined?'Inconnu':new Intl.NumberFormat('fr-FR',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value));
const decimal=value=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value);
const percent=value=>new Intl.NumberFormat('fr-FR',{style:'percent',maximumFractionDigits:1}).format(value);
const probabilityText=value=>value<0.001?'< 0,1 %':value>0.999?'> 99,9 %':percent(value);
function node(tag,attributes={},...children){const n=document.createElement(tag);for(const [key,value] of Object.entries(attributes)){if(value===null||value===undefined)continue;if(key==='class')n.className=value;else if(key.startsWith('on')&&typeof value==='function')n.addEventListener(key.slice(2),value);else n.setAttribute(key,String(value));}for(const child of children.flat(Infinity)){if(child===null||child===undefined)continue;n.append(child instanceof Node?child:document.createTextNode(String(child)));}return n;}
function externalLink(url,label,trustedCitation=false){let safe=safeSourceURL(url);if(safe&&trustedCitation){const cited=new URL(safe);cited.search=new URL(url).search;safe=cited.href;}return safe?node('a',{href:safe,target:'_blank',rel:'noopener noreferrer'},label):node('span',{},label+' — URL non exploitable');}
function label(text,kind='neutral'){return node('span',{class:'label '+kind},text);}
function row(name,value){return node('div',{class:'data-row'},node('dt',{},name),node('dd',{},value));}
function notice(title,description,kind=''){return node('div',{class:'notice '+kind},node('strong',{},title),node('span',{},description));}
function empty(title,text){return node('div',{class:'empty-state'},node('strong',{},title),node('span',{},text));}
function selectedField(id){const raw=$(id).value.trim();return raw===''?null:raw;}
function numericField(id){const raw=selectedField(id);return raw===null?undefined:Number(raw);}
function setStatus(id,text,isError=false){$(id).textContent=text;$(id).classList.toggle('error',isError);}

let cases=[],currentCase=null,economics=null,probabilityResult=null,probabilityInput=null,sensitivityResult=null;
const importsByCase=new Map();
const customCase={id:'custom',name:'Votre produit à étudier',category:'Dossier personnel local',summary:'Ajoutez des sources et renseignez les coûts vérifiables de cette offre. Les données ne quittent pas ce navigateur.',decision:'hold',blockers:['Aucune référence fournisseur ni demande établie pour ce dossier.'],supplier:null,competitors:[],sources:[],scenario:{salePrice:null,cost:null,costIsVerified:false,vatRate:20}};
const economicIds=['sale-price','vat-mode','vat-rate','landed-cost','payment-rate','payment-fixed','return-reserve','fixed-allocation','desired-profit','assumed-cpc'];
const economicKeys=['price','vatMode','vatRate','landedCost','paymentRate','paymentFixed','returnReserve','fixedAllocation','desiredProfit','assumedCpc'];
const economicLabels={price:'prix total',vatMode:'régime de TVA',vatRate:'taux de TVA',landedCost:'coût produit livré',paymentRate:'frais variables',paymentFixed:'frais fixes de paiement',returnReserve:'provision incidents',fixedAllocation:'allocation des charges fixes',desiredProfit:'contribution souhaitée',assumedCpc:'coût du clic'};
function readEconomics(){return Object.fromEntries(economicKeys.map((key,i)=>[key,selectedField(economicIds[i])]));}
function imports(){return importsByCase.get(currentCase?.id)||[];}
function sourceLinks(ids){return (ids||[]).map(id=>currentCase.sources.find(s=>s.id===id)).filter(Boolean).map(s=>externalLink(s.url,s.label,true));}
function switchPanel(name){for(const button of document.querySelectorAll('.tab')){const active=button.dataset.panel===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}for(const section of document.querySelectorAll('.panel-view'))section.hidden=section.id!=='panel-'+name;}

function renderCase(){
  const c=currentCase;
  $('economics-form').reset();
  $('source-file').value='';$('source-content').value='';$('source-url').value='';
  setStatus('import-status',imports().length?imports().length+' relevé(s) déjà présent(s) dans ce dossier.':'Aucun fichier n’a été analysé dans ce dossier.');
  $('case-overview').replaceChildren(node('div',{class:'case-banner'},node('div',{},node('h3',{},c.name),node('p',{},c.summary),c.id==='poster-gpx'?node('p',{},node('a',{href:'./route-poster/index.html'},'Essayer Trace : créer une affiche GPX gratuitement →')):null,node('div',{class:'blockers'},c.blockers.map(t=>node('span',{},t)))),label('Lancement non validé','hold')));
  $('sale-price').value=c.scenario.salePrice??'';$('landed-cost').value=c.scenario.cost??'';$('vat-mode').value='collect';$('vat-rate').value=c.scenario.vatRate??20;
  $('cost-provenance').textContent=c.scenario.costIsVerified?'Coût catalogue documenté · autres hypothèses':'Coût livré non documenté';
  $('cost-provenance').className='label '+(c.scenario.costIsVerified?'fact':'missing');
  const offers=[];
  if(c.supplier){const s=c.supplier;offers.push(node('article',{class:'offer'},node('div',{class:'offer-heading'},node('h4',{},s.name),node('span',{class:'offer-price'},s.productCost===null?'Prix inconnu':money(s.productCost,s.currency))),node('p',{},s.sku||'Référence non confirmée'),node('div',{class:'badges'},label('Fournisseur'),label(s.costBasis==='unknown'?'Base fiscale inconnue':s.costBasis),label(s.personalizationAutomation==='manual'?'Personnalisation manuelle':s.personalizationAutomation==='documented'?'Fonction documentée':'Automatisation à vérifier','hold')),node('p',{},s.label),node('p',{},'Port France : '+(s.shippingCost===null?'inconnu':money(s.shippingCost,s.currency))+(s.handlingCost===undefined?'':' · traitement : '+money(s.handlingCost,s.currency))+' · origine : '+s.fulfillmentOrigin),node('div',{class:'stack'},sourceLinks(s.sourceIds))));}
  for(const o of c.competitors)offers.push(node('article',{class:'offer'},node('div',{class:'offer-heading'},node('h4',{},o.name),node('span',{class:'offer-price'},money(o.price,o.currency))),node('p',{},o.sku),node('div',{class:'badges'},label('Concurrent'),label(o.shippingIncluded===true?'Port annoncé inclus':o.shippingIncluded===false?'Prix hors port':'Port à vérifier'),o.available===false?label('Épuisé au relevé','hold'):null),node('div',{class:'stack'},sourceLinks(o.sourceIds))));
  $('observed-offers').replaceChildren(...(offers.length?offers:[empty('Dossier vierge','Importez un relevé de page publique pour commencer.')]));
  $('evidence-count').textContent=String(c.sources.length+imports().length);
  resetProbability();renderImports();updateEconomics();
}

function updateEconomics(event){
  const input=readEconomics(),exempt=input.vatMode==='exempt';
  $('vat-field').hidden=exempt;$('vat-rate').disabled=exempt;
  $('landed-label').textContent='Produit + transport fournisseur, '+(exempt?'TTC':'HT');
  $('vat-help').textContent=exempt?'Franchise : renseignez les achats TTC réellement supportés, avec la TVA non récupérable. Un coût de 16 € HT facturé 19,20 € TTC devient 19,20 € ; la bascule ne convertit pas vos montants.':'La TVA d’achat est supposée récupérable. Les montants ne sont pas convertis lors d’un changement de régime : renseignez le coût réellement supporté.';
  if(event&&['landed-cost','vat-mode'].includes(event.target.id)){ $('cost-provenance').textContent='Coût ou régime modifié par vous · à vérifier';$('cost-provenance').className='label neutral'; }
  economics=computeEconomics(input);
  for(let i=0;i<economicIds.length;i++)$(economicIds[i]).setAttribute('aria-invalid',String(economics.status==='incomplete'&&economics.missingOrInvalid.includes(economicKeys[i])));
  if(economics.status!=='calculated'){
    $('economics-results').replaceChildren(empty('Calcul incomplet','À renseigner ou corriger : '+economics.missingOrInvalid.map(k=>economicLabels[k]||k).join(', ')+'. Un coût inconnu ne vaut pas zéro.'));
    invalidateProbability();return;
  }
  const e=economics,metrics=node('div',{class:'metrics'},node('div',{class:'metric'},node('span',{},'Disponible pour acquérir une commande'),node('strong',{},e.margin>=0?money(e.margin):'Déficitaire'),node('small',{},'après allocation des charges fixes')),node('div',{class:'metric accent'},node('span',{},'Acquisition maximale pour votre cible'),node('strong',{},e.targetCAC>=0?money(e.targetCAC):'Impossible'),node('small',{},'pour conserver '+money(Number(input.desiredProfit)))));
  const threshold=value=>value===null?'Non calculable':value>1?'Impossible (> 100 %)':percent(value);
  const resultRows=node('dl',{},row('Recette après TVA collectée',money(e.revenue)),row('Frais d’encaissement',money(e.fees)),row('Marge variable avant acquisition / charges fixes',money(e.variableMargin)),row('Conversion nécessaire à l’équilibre',e.implicitCpc===null?'Coût du clic inconnu':threshold(e.conversionAtBreakEven)),row('Conversion nécessaire à la contribution cible',e.implicitCpc===null?'Coût du clic inconnu':threshold(e.conversionAtTarget)));
  const n=e.margin<=0?notice('Ce scénario perd de l’argent avant publicité.','Une commande supplémentaire ne couvre pas les coûts retenus.','error'):notice('Seuils conditionnels, demande non validée.','Le coût d’acquisition réel reste inconnu. Les frais et provisions doivent être remplacés par vos données.');
  $('economics-results').replaceChildren(metrics,n,resultRows);
  invalidateProbability();
}

function resetProbability(){
  $('probability-form').reset();$('scenario-warning').hidden=true;probabilityInput=null;invalidateProbability();
}
function invalidateProbability(){probabilityResult=null;sensitivityResult=null;$('probability-results').replaceChildren(node('p',{class:'eyebrow dark'},'PAS DE PROBABILITÉ GÉNÉRALE'),empty('Probabilité non estimable','Aucune estimation n’est validée pour ce dossier. Renseignez des observations et les conditions futures, puis lancez le calcul.'));}
function probabilityInputs(){return {mode:$('probability-mode').value,clicks:numericField('observed-visits'),purchasers:numericField('observed-buyers'),provenance:$('observations-source').value.trim(),windowClosed:$('window-closed').checked,comparableTraffic:$('traffic-comparable').checked,expectedTraffic:numericField('future-visits'),variableMargin:economics?.status==='calculated'?economics.variableMargin.toFixed(6):null,fixedCosts:selectedField('future-fixed'),futureAcquisitionSpend:selectedField('future-spend'),targetProfit:selectedField('target-profit'),priorAlpha:numericField('prior-alpha'),priorBeta:numericField('prior-beta'),priorJustification:$('prior-reason').value.trim()};}
function calculateProbability(event){
  if(event)event.preventDefault();
  if(economics?.status!=='calculated'){$('probability-results').replaceChildren(notice('Le coût livré et la marge sont nécessaires.','Complétez les paramètres économiques à l’étape 2. Les inconnues ne sont pas remplacées par zéro.','warning'));return;}
  probabilityInput=probabilityInputs();probabilityResult=assessProbability(probabilityInput);
  const r=probabilityResult;
  if(!['scenario','conditional_estimate'].includes(r.status)){$('probability-results').replaceChildren(node('p',{class:'eyebrow dark'},'DONNÉES INSUFFISANTES OU INCOHÉRENTES'),empty('Probabilité non estimable',r.reason));return;}
  const scenario=r.status==='scenario';
  const outcome='Contribution ≥ '+money(Number(r.targetProfit))+' sur 30 jours';
  const rows=node('dl',{},row('Ne pas perdre d’argent (résultat ≥ 0)',probabilityText(r.breakEvenProbability)),row('Aucun acheteur futur',probabilityText(r.probabilityZeroPurchases)),row('Acheteurs futurs, espérance',decimal(r.expectedPurchases)),row('Contribution, espérance conditionnelle',money(r.expectedProfit)),row('Visiteurs futurs supposés',decimal(r.expectedTraffic)),row('Marge variable utilisée',money(Number(r.variableMargin))),row('Charges fixes sur la période',money(Number(r.fixedCosts))),row('Acquisition sur la période',money(Number(r.futureAcquisitionSpend))));
  const detail=node('details',{class:'method'},node('summary',{},'Toutes les hypothèses de ce résultat'),node('ul',{},r.assumptions.map(a=>node('li',{},a))));
  sensitivityResult=assessSensitivity(probabilityInput);
  const sensitivity=node('details',{class:'method'},node('summary',{},'Le résultat résiste-t-il à d’autres hypothèses ?'),node('p',{},sensitivityResult.disclaimer||'Variations hypothétiques indépendantes.'));
  if(sensitivityResult.status==='calculated')for(const variant of sensitivityResult.rows)sensitivity.append(node('div',{class:'offer'},node('div',{class:'offer-heading'},node('h4',{},variant.label),node('strong',{},variant.result.probability===null?'Non calculable':probabilityText(variant.result.probability))),node('p',{},variant.note),variant.result.reason?node('p',{},variant.result.reason):null));
  $('probability-results').replaceChildren(node('p',{class:'eyebrow dark'},scenario?'SCÉNARIO FICTIF / HYPOTHÉTIQUE':'ESTIMATION CONDITIONNELLE AUX DONNÉES DÉCLARÉES'),node('h3',{},outcome),node('div',{class:'probability-number'},probabilityText(r.probability)),node('p',{class:'probability-description'},'Probabilité de ce résultat dans le modèle, sous les conditions saisies.'),notice(scenario?'Ce pourcentage ne valide pas le produit.':'Les données déclarées ne sont pas authentifiées.',scenario?'Les comptes, le prior et le trafic peuvent être entièrement hypothétiques. Aucun investissement n’est justifié par cet exemple.':'Le résultat dépend du prior, de la comparabilité du trafic et de coûts supposés stables. Il ne garantit pas la réussite future.','warning'),rows,sensitivity,detail);
}

function loadTeachingExample(){
  $('probability-mode').value='scenario';$('scenario-warning').hidden=false;
  $('observed-visits').value='500';$('observed-buyers').value='20';$('observations-source').value='EXEMPLE FICTIF — aucune vente réelle';
  $('window-closed').checked=false;$('traffic-comparable').checked=false;
  $('future-visits').value='1000';$('future-spend').value='300';$('future-fixed').value='40';$('target-profit').value='300';
  $('prior-alpha').value='1';$('prior-beta').value='1';$('prior-reason').value='Prior uniforme choisi pour cet exemple pédagogique ; ce n’est pas un taux de marché.';
  invalidateProbability();setStatus('global-status','Exemple fictif chargé. Aucun budget n’est engagé et aucune campagne n’est créée.');
}

function renderImports(){
  const cards=[];
  for(const [index,record] of imports().entries()){
    const r=record.result;
    const sourceText=r.source.url||'URL non renseignée';
    const header=node('div',{class:'offer-heading'},node('h3',{},'Relevé local '+(index+1)),node('button',{class:'button small',type:'button',onclick:()=>{imports().splice(index,1);renderImports();}},'Retirer'));
    const sourceRow=node('p',{class:'help'},r.source.url?externalLink(r.source.url,sourceText):sourceText,' · vérification en direct : non');
    const time=node('p',{class:'help'},'Capture déclarée : '+(r.source.captureTime||'inconnue')+' · import : '+r.source.importTime);
    const offers=r.candidates.map(candidate=>{
      const p=candidate.product,o=candidate.offer;
      const exactPrice=o.price!==null&&o.currency?money(o.price,o.currency):o.kind==='AggregateOffer'?'Fourchette':'Prix inconnu';
      const evidence=node('details',{class:'method'},node('summary',{},'Provenance des champs'),node('ul',{},candidate.evidence.map(v=>node('li',{class:'code'},v.field+' ← '+v.path+' : '+String(v.rawValue)))));
      const variant=p.variant?Object.entries(p.variant).map(([k,v])=>k+' : '+v).join(' · '):'Variante non décrite';
      const role=node('select',{'aria-label':'Rôle de '+(p.name||'l’offre'),onchange:e=>{candidate.product.role=e.target.value;}},node('option',{value:'unclassified'},'Rôle à préciser'),node('option',{value:'supplier'},'Piste fournisseur'),node('option',{value:'competitor'},'Offre concurrente'));
      role.value=p.role;
      const content=node('article',{class:'offer'},node('div',{class:'offer-heading'},node('h4',{},p.name||'Produit sans nom'),node('span',{class:'offer-price'},exactPrice)),node('p',{},variant),node('p',{},'SKU : '+(p.sku||'inconnu')+' · GTIN : '+(p.gtin||'inconnu')),node('div',{class:'badges'},label(o.kind),label(o.currency||'Devise inconnue'),label('Port / TVA non établis','hold')),o.kind==='AggregateOffer'?node('p',{},'Minimum publié : '+(o.priceLow??'inconnu')+' · maximum : '+(o.priceHigh??'inconnu')+' '+(o.currency||'')):null,role,node('ul',{class:'warning-list'},candidate.warnings.map(w=>node('li',{},w))),evidence);
      return content;
    });
    cards.push(node('div',{class:'card'},header,sourceRow,time,...offers,node('ul',{class:'warning-list'},r.warnings.map(w=>node('li',{},w)))));
  }
  $('extracted-offers').replaceChildren(...cards);
  $('evidence-count').textContent=String((currentCase?.sources.length||0)+imports().length);
  renderSources();
}

function renderSources(){
  const cards=currentCase.sources.map(s=>node('article',{class:'card source-card'},node('div',{},node('h3',{},s.label),node('p',{},s.fact),externalLink(s.url,s.url,true)),node('span',{class:'date'},'Relevé : '+s.checkedAt)));
  for(const [i,record] of imports().entries()){
    const s=record.result.source;
    cards.push(node('article',{class:'card source-card'},node('div',{},node('h3',{},'Relevé importé '+(i+1)),node('p',{},'Données fournies localement ; source et date déclarées, sans vérification en direct.'),s.url?externalLink(s.url,s.url):node('p',{},'URL d’origine inconnue'),node('p',{},'Capture : '+(s.captureTime||'inconnue')+' · import : '+s.importTime),s.sha256?node('details',{class:'method'},node('summary',{},'Empreinte du fichier importé'),node('p',{class:'code'},s.sha256),node('p',{},'Cette empreinte identifie le fichier ; elle ne prouve pas son authenticité.')):null),label('Source importée','neutral')));
  }
  $('case-sources').replaceChildren(...(cards.length?cards:[empty('Aucune source pour ce dossier','Ajoutez une page enregistrée à l’étape 1. Son origine déclarée figurera ici et dans l’export.')]));
}

async function importSource(){
  const button=$('extract-button');button.disabled=true;
  try{
    const file=$('source-file').files[0];let content=$('source-content').value;
    if(file){if(file.size>MAX_FILE_BYTES)throw new Error('Le fichier dépasse la limite de 2 Mo.');content=await file.text();}
    if(!content.trim())throw new Error('Choisissez un fichier ou collez du HTML / JSON-LD. Une URL seule ne suffit pas.');
    if(new TextEncoder().encode(content).length>MAX_FILE_BYTES)throw new Error('Le contenu dépasse la limite de 2 Mo.');
    const source=$('source-url').value.trim();
    if(source&&!safeSourceURL(source))throw new Error('L’URL de référence doit utiliser HTTP ou HTTPS.');
    const result=await extractOffers(content,{sourceUrl:source||undefined,format:'auto'});
    if(!importsByCase.has(currentCase.id))importsByCase.set(currentCase.id,[]);
    const records=imports();if(records.length>=8)throw new Error('Ce dossier contient déjà huit relevés. Exportez-le ou retirez un relevé avant de continuer.');
    records.push({result,filename:file?.name||null});renderImports();
    setStatus('import-status',result.candidates.length+' offre(s) relevée(s). Vérifiez la variante, la devise et les conditions. Aucun prix n’a été injecté automatiquement dans les calculs.');
  }catch(error){setStatus('import-status',error.message||'Ce fichier n’a pas pu être lu.',true);}finally{button.disabled=false;}
}

function exportProject(){
  const result={schemaVersion:1,tool:'Dossier Commerce',exportedAt:new Date().toISOString(),study:currentCase,imports:imports().map(r=>r.result),economicInputs:readEconomics(),economics,probabilityInput:probabilityInputs(),probability:probabilityResult,sensitivity:sensitivityResult,limitations:['Public price sources do not measure demand or business success.','Imported capture dates and observation provenance are declared, not independently verified.','Variable margin passed to the probability model is rounded to six decimal places.','No spending, checkout, remote crawling or campaign is enabled.']};
  const json=JSON.stringify(result,null,2);
  if(new TextEncoder().encode(json).length>PROJECT_LIMITS.bytes){setStatus('global-status','Le dossier dépasse 2 Mo, la limite de reprise. Retirez un relevé volumineux avant de l’exporter. Aucun fichier incomplet n’a été créé.',true);return;}
  const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a',{href:url,download:'dossier-commerce-'+(currentCase?.id||'etude')+'.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('global-status','Dossier exporté en JSON. Les fichiers HTML d’origine et leur contenu intégral ne sont pas inclus.');
}

async function restoreProject(){
  const file=$('project-file').files[0];if(!file)return;
  try{
    if(file.size>PROJECT_LIMITS.bytes)throw new Error('Le dossier dépasse la limite de 2 Mo.');
    const restored=validateProject(await file.text());
    if(restored.status!=='ok')throw new Error(restored.reason);
    const c=restored.caseId==='custom'?customCase:cases.find(c=>c.id===restored.caseId);
    if(!c)throw new Error('Le dossier de référence n’est pas disponible.');
    currentCase=c;$('case-picker').value=c.id;
    importsByCase.set(c.id,restored.imports.map(result=>({result,filename:null})));
    renderCase();
    for(let i=0;i<economicIds.length;i++)$(economicIds[i]).value=restored.economicInputs[economicKeys[i]]??'';
    updateEconomics();
    $('cost-provenance').textContent='Paramètres restaurés · à vérifier';$('cost-provenance').className='label neutral';
    const p=restored.probabilityInput;
    if(p){
      const map={mode:'probability-mode',clicks:'observed-visits',purchasers:'observed-buyers',provenance:'observations-source',expectedTraffic:'future-visits',fixedCosts:'future-fixed',futureAcquisitionSpend:'future-spend',targetProfit:'target-profit',priorAlpha:'prior-alpha',priorBeta:'prior-beta',priorJustification:'prior-reason'};
      for(const [key,id] of Object.entries(map))$(id).value=p[key]??'';
      $('window-closed').checked=p.windowClosed===true;$('traffic-comparable').checked=p.comparableTraffic===true;
      $('scenario-warning').hidden=p.mode!=='scenario';
    }
    probabilityInput=null;invalidateProbability();
    $('case-overview').append(notice('Dossier restauré, résultats à recalculer.','Les preuves et observations du fichier sont déclaratives. Les probabilités exportées sont ignorées ; vérifiez les entrées avant de relancer le modèle.','warning'));
    setStatus('global-status',restored.warnings.join(' '));
  }catch(error){setStatus('global-status','Reprise impossible : '+(error.message||'dossier invalide'),true);}finally{$('project-file').value='';}
}

function setupCollector(){
  const value=createBookmarklet();
  const text=node('textarea',{class:'capture-textarea',readonly:'',rows:4,'aria-label':'Code du favori de collecte locale'});text.value=value;
  const button=node('button',{class:'button small',type:'button',onclick:async()=>{try{await navigator.clipboard.writeText(value);setStatus('import-status','Code copié. Créez un favori avec ce code comme adresse, puis utilisez-le uniquement sur une fiche produit publique.');}catch{text.focus();text.select();setStatus('import-status','Sélectionnez et copiez le code affiché. Le presse-papiers n’est pas disponible dans ce navigateur.');}}},'Copier le code du favori');
  $('collector-help').replaceChildren(node('p',{},'Option avancée : créez un favori nommé « Relever une offre » avec le code ci-dessous comme adresse. Sur une fiche produit publique, il téléchargera les champs Product / Offer en JSON. Il ne lit ni les formulaires ni les cookies et ne transmet rien. Certains sites ou navigateurs bloquent les favoris JavaScript ; utilisez alors l’import HTML.'),text,button);
}

async function initialize(){
  try{
    const response=await fetch(new URL('../data/cases.json',import.meta.url));if(!response.ok)throw new Error('HTTP '+response.status);
    cases=await response.json();if(!Array.isArray(cases)||!cases.length)throw new Error('Catalogue de dossiers invalide');
    $('case-count').textContent=String(cases.length);$('case-picker').replaceChildren(...cases.map(c=>node('option',{value:c.id},c.name)),node('option',{value:customCase.id},'＋ Votre propre produit'));
    currentCase=cases.find(c=>c.id==='poster-gpx')||cases[0];$('case-picker').value=currentCase.id;
    renderCase();setupCollector();
  }catch(error){$('case-overview').replaceChildren(notice('Les dossiers n’ont pas pu être chargés.','Ce site doit être servi en HTTP ou HTTPS. Réessayez depuis son adresse publiée.','error'));setStatus('global-status','Chargement incomplet : '+error.message,true);$('export-project').disabled=true;$('extract-button').disabled=true;}
}

for(const button of document.querySelectorAll('.tab'))button.addEventListener('click',()=>switchPanel(button.dataset.panel));
$('case-picker').addEventListener('change',()=>{currentCase=$('case-picker').value==='custom'?customCase:cases.find(c=>c.id===$('case-picker').value);renderCase();setStatus('global-status','Dossier changé. Les paramètres économiques de référence et le formulaire statistique ont été réinitialisés.');});
$('economics-form').addEventListener('submit',e=>e.preventDefault());$('economics-form').addEventListener('input',updateEconomics);$('economics-form').addEventListener('change',updateEconomics);
$('probability-form').addEventListener('submit',calculateProbability);$('probability-form').addEventListener('input',invalidateProbability);$('probability-form').addEventListener('change',()=>{$('scenario-warning').hidden=$('probability-mode').value!=='scenario';invalidateProbability();});
$('load-teaching-example').addEventListener('click',loadTeachingExample);$('extract-button').addEventListener('click',importSource);
$('clear-import').addEventListener('click',()=>{$('source-file').value='';$('source-content').value='';$('source-url').value='';setStatus('import-status','Champs d’import effacés. Les relevés déjà ajoutés restent dans le dossier.');});
$('export-project').addEventListener('click',exportProject);
$('restore-project').addEventListener('click',()=>$('project-file').click());$('project-file').addEventListener('change',restoreProject);
initialize();
