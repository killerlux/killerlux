/* Local, dependency-free extraction. No network request, script execution or currency conversion. */
const LIMITS = Object.freeze({bytes:5*1024*1024,depth:64,nodes:20000,products:100,offers:200,htmlAttributes:256,jsonKey:256,jsonPath:1000,outputBytes:1_000_000});
const CURRENCIES = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['EUR','USD','GBP','CAD','CHF','AUD','JPY','CNY','AED','MAD','SAR']);
const PRODUCT_TYPES = new Set(['Product','ProductGroup']);
const AVAILABILITY = new Set(['BackOrder','Discontinued','InStock','InStoreOnly','LimitedAvailability','OnlineOnly','OutOfStock','PreOrder','PreSale','Reserved','SoldOut']);
const typeNames = value => (Array.isArray(value) ? value : [value]).filter(v=>typeof v==='string').map(v=>v.split(/[\/#]/).pop());
const isType = (value,type) => value && typeof value==='object' && typeNames(value['@type']).includes(type);
const text = value => typeof value==='string' || typeof value==='number' ? String(value).trim().slice(0,2000) : null;
const escapeHTML = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const safeObject = value => value && typeof value==='object' && !Array.isArray(value);

export function safeSourceURL(value,base) {
  if (typeof value !== 'string' || value.length>8192) return null;
  try {const u=new URL(value,base||undefined);if(!['https:','http:'].includes(u.protocol))return null;u.username='';u.password='';u.search='';u.hash='';return u.href;}catch{return null;}
}

function cleanPrice(value,warnings,field) {
  if(value===null || value===undefined || value==='')return null;
  const s=String(value).trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(s) || !Number.isFinite(Number(s)) || Number(s)>1e12){warnings.push(`Prix non interprété (${field}) : format ambigu ou non valide.`);return null;}
  return s;
}
function cleanCurrency(value,warnings) {
  if(value===null || value===undefined || value==='')return null;
  const s=String(value).trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(s) || !CURRENCIES.has(s)){warnings.push('Devise non reconnue ; aucune conversion effectuée.');return null;}
  return s;
}
function cleanAvailability(value,warnings) {
  if(value===undefined||value===null)return null;
  if(typeof value==='string'&&AVAILABILITY.has(value))return value;
  try {const u=new URL(value);const state=u.pathname.split('/').pop();if(['http:','https:'].includes(u.protocol)&&['schema.org','www.schema.org'].includes(u.hostname)&&AVAILABILITY.has(state))return state;}catch{}
  warnings.push('Disponibilité non standard ignorée ; sa valeur brute a été écartée des preuves.');return null;
}
function dateOrNull(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(value))return null;
  const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():null;
}

/* Build a passive skeleton BEFORE DOMParser. No original active tag or URL-bearing
   attribute is passed to the browser parser. The tokenizer is not a renderer. */
function passiveDocument(html,warnings) {
  if(typeof DOMParser==='undefined')throw new Error('DOMParser requis pour importer un document HTML.');
  const parser=new DOMParser();
  const decode=s=>parser.parseFromString('<textarea>'+s.replaceAll('<','&lt;')+'</textarea>','text/html').querySelector('textarea').textContent;
  const preserved=new Set(['itemprop','itemscope','itemtype','itemid','content','datetime','value','rel','href','src']);
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let position=0,count=0,output='',blocks=0;
  while(position<html.length) {
    if(++count>LIMITS.nodes){warnings.push('Limite de structure HTML atteinte ; extraction partielle.');break;}
    const open=html.indexOf('<',position);
    if(open<0){output+=html.slice(position).replaceAll('>','&gt;');break;}
    output+=html.slice(position,open).replaceAll('>','&gt;');
    if(html.startsWith('<!--',open)){const end=html.indexOf('-->',open+4);position=end<0?html.length:end+3;continue;}
    let end=open+1,quote=null;
    for(;end<html.length;end++){const c=html[end];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
    if(end>=html.length){output+='&lt;'+html.slice(open+1).replaceAll('>','&gt;');break;}
    const token=html.slice(open+1,end);position=end+1;
    const match=/^\s*(\/?)\s*([A-Za-z][A-Za-z0-9:_-]*)\b/.exec(token);
    if(!match)continue;
    const closing=!!match[1],tag=match[2].toLowerCase();
    if(closing){if(!voidTags.has(tag))output+='</div>';continue;}
    const attrs=Object.create(null);
    const attrText=token.slice(match[0].length);
    const attrPattern=/([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let a,attributeCount=0;while((a=attrPattern.exec(attrText))){
      if(++attributeCount>LIMITS.htmlAttributes){const message='Trop d’attributs HTML dans une balise ; extraction partielle.';if(!warnings.includes(message))warnings.push(message);break;}
      const key=a[1].toLowerCase();if(key!=='type'&&!preserved.has(key))continue;
      if(!(key in attrs))attrs[key]=decode(a[2]??a[3]??a[4]??'');
    }
    if(tag==='script'||tag==='style'||tag==='textarea'||tag==='title') {
      const closePattern=new RegExp('</'+tag+'\\s*>','ig');closePattern.lastIndex=position;const close=closePattern.exec(html);
      const raw=html.slice(position,close?close.index:html.length);position=close?closePattern.lastIndex:html.length;
      if(tag==='script' && (attrs.type||'').trim().toLowerCase()==='application/ld+json')output+='<pre data-jsonld="'+blocks+++'">'+escapeHTML(raw)+'</pre>';
      else if(tag==='textarea'||tag==='title')output+='<div>'+escapeHTML(decode(raw))+'</div>';
      continue;
    }
    output+='<div data-origin-tag="'+escapeHTML(tag)+'"';
    for(const [key,value] of Object.entries(attrs))if(preserved.has(key))output+=' '+(key==='href'||key==='src'?'data-source-'+key:key)+'="'+escapeHTML(value)+'"';
    output+='>';
    if(voidTags.has(tag)||/\/\s*$/.test(token))output+='</div>';
  }
  return parser.parseFromString(output,'text/html');
}

function microdata(doc,warnings) {
  const objects=[];
  const typeOf=el=>(el.getAttribute('itemtype')||'').split(/\s+/).map(v=>v.split(/[\/#]/).pop());
  const valueOf=el=>el.getAttribute('content')??el.getAttribute('data-source-href')??el.getAttribute('data-source-src')??el.getAttribute('datetime')??el.getAttribute('value')??el.textContent.trim();
  const props=(scope,name)=>Array.from(scope.querySelectorAll('[itemprop]')).filter(el=>(el.getAttribute('itemprop')||'').split(/\s+/).includes(name) && (el.parentElement?.closest('[itemscope]')===scope));
  for(const product of Array.from(doc.querySelectorAll('[itemscope]')).filter(el=>typeOf(el).some(t=>PRODUCT_TYPES.has(t)))) {
    const obj={'@type':typeOf(product).find(t=>PRODUCT_TYPES.has(t))};
    for(const field of ['name','sku','gtin','gtin8','gtin12','gtin13','gtin14','mpn','url']){const v=props(product,field)[0];if(v)obj[field]=valueOf(v);}
    const offers=props(product,'offers');
    obj.offers=offers.map(el=>{const offer={'@type':typeOf(el).includes('AggregateOffer')?'AggregateOffer':'Offer'};for(const field of ['price','lowPrice','highPrice','priceCurrency','availability','url']){const v=props(el,field)[0];if(v)offer[field]=valueOf(v);}return offer;});
    objects.push(obj);
  }
  if(objects.length)warnings.push('Microdata : extraction limitée aux propriétés explicitement rattachées au produit et à ses offres.');
  return objects;
}

function parseInputs(input,format,warnings) {
  if(typeof input!=='string')return [{value:input,path:'$',method:'json'}];
  const trimmed=input.trim();
  const useJSON=format==='json'||(format==='auto'&&/^[\[{]/.test(trimmed));
  if(useJSON){try{return [{value:JSON.parse(trimmed),path:'$',method:'json'}];}catch{warnings.push('JSON invalide ; aucun script ni expression ne sera exécuté.');return [];}}
  const doc=passiveDocument(input,warnings),records=[];
  for(const el of doc.querySelectorAll('[data-jsonld]')){try{records.push({value:JSON.parse(el.textContent),path:'script['+el.getAttribute('data-jsonld')+']',method:'jsonld'});}catch{warnings.push('Bloc JSON-LD '+el.getAttribute('data-jsonld')+' invalide et ignoré.');}}
  const canonical=Array.from(doc.querySelectorAll('[data-origin-tag="link"][rel]')).find(el=>(el.getAttribute('rel')||'').split(/\s+/).includes('canonical'))?.getAttribute('data-source-href');
  records.canonical=canonical||null;
  let inspected=0;const containsProduct=(v,d=0)=>{if(d>LIMITS.depth||++inspected>LIMITS.nodes||!v||typeof v!=='object')return false;if(typeNames(v['@type']).some(t=>PRODUCT_TYPES.has(t)))return true;return Object.values(v).some(c=>containsProduct(c,d+1));};
  if(!records.some(r=>containsProduct(r.value))){const micro=microdata(doc,warnings);micro.forEach((value,i)=>records.push({value,path:'microdata['+i+']',method:'microdata'}));}
  return records;
}

function variantSummary(product,group) {
  const v={};for(const key of ['color','size','material','pattern','productID']){const t=text(product[key]);if(t)v[key]=t;}
  if(group?.name)v.groupName=text(group.name);
  return Object.keys(v).length?v:null;
}

export async function extractOffers(input,options={}) {
  const warnings=[];
  let raw;try{raw=typeof input==='string'?input:JSON.stringify(input);}catch{throw new Error('Le document doit être du texte ou un objet JSON sérialisable.');}
  if(typeof raw!=='string')throw new Error('Document vide ou non pris en charge.');
  if(new TextEncoder().encode(raw).length>LIMITS.bytes)throw new Error('Document trop volumineux : limite de 5 Mio.');
  const importTime=dateOrNull(options.importTime)||new Date().toISOString();
  const records=parseInputs(input,options.format||'auto',warnings);
  let capture=null;
  if(records.length===1 && records[0].value?.kind==='commerce-evidence-capture'){
    capture=records[0].value;
    if(Array.isArray(capture.warnings))warnings.push(...capture.warnings.filter(v=>typeof v==='string').slice(0,20).map(v=>v.slice(0,500)));
    if(capture.version!==1){warnings.push('Version de capture non prise en charge.');records.length=0;}
    else if(!Array.isArray(capture.products)){warnings.push('Capture sans tableau de produits valide.');records.length=0;}
    else {records[0]={value:capture.products,path:'$.products',method:'captured-jsonld'};}
  }
  const rawURL=options.sourceUrl||capture?.sourceUrl||null;
  const sourceURL=safeSourceURL(rawURL);
  if(rawURL&&!sourceURL)warnings.push('URL source non valide : seuls HTTP et HTTPS sont acceptés.');
  if(sourceURL&&sourceURL!==rawURL)warnings.push('URL source normalisée : paramètres, fragment et identifiants supprimés ; vérifier les variantes liées à ces paramètres.');
  const source={url:sourceURL,canonicalUrl:safeSourceURL(records.canonical,sourceURL),captureTime:dateOrNull(options.captureTime||capture?.capturedAt),importTime,method:capture?'collector-import':typeof input==='string'&&(options.format==='html'||!/^\s*[\[{]/.test(input))?'imported-html':'imported-json',sha256:null,liveVerified:false};
  if(!source.captureTime)warnings.push('Date de capture inconnue ; la date d’import n’est pas une vérification en direct.');
  if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));source.sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
  const indexed=new Map(),nodes=[];let nodeCount=0,limitHit=false,pathLimitHit=false;
  function walk(value,path,depth,method,parentGroup=null){
    if(path.length>LIMITS.jsonPath-64){pathLimitHit=true;return;}
    if(depth>LIMITS.depth||++nodeCount>LIMITS.nodes){limitHit=true;return;}
    if(Array.isArray(value)){value.forEach((v,i)=>walk(v,path+'['+i+']',depth+1,method,parentGroup));return;}
    if(!safeObject(value))return;
    if(typeof value['@id']==='string'&&(!indexed.has(value['@id'])||Object.keys(value).length>Object.keys(indexed.get(value['@id']).value).length))indexed.set(value['@id'],{value,path,method});
    const types=typeNames(value['@type']);
    if(types.some(t=>PRODUCT_TYPES.has(t)))nodes.push({value,path,method,parentGroup});
    const group=types.includes('ProductGroup')?value:parentGroup;
    for(const [key,v] of Object.entries(value))if(key!=='@context'&&v&&typeof v==='object'){
      if(key.length>LIMITS.jsonKey||path.length+key.length+1>LIMITS.jsonPath-64){pathLimitHit=true;continue;}
      walk(v,path+'.'+key,depth+1,method,key==='hasVariant'?group:parentGroup);
    }
  }
  records.forEach(r=>walk(r.value,r.path,0,r.method));
  if(limitHit)warnings.push('Limite de profondeur ou de taille structurelle atteinte ; extraction partielle.');
  if(pathLimitHit)warnings.push('Clé ou chemin JSON trop long : branche ignorée, provenance et extraction partielles.');
  const groupsByVariantId=new Map();
  for(const node of nodes)if(isType(node.value,'ProductGroup'))for(const v of Array.isArray(node.value.hasVariant)?node.value.hasVariant:node.value.hasVariant?[node.value.hasVariant]:[])if(typeof v?.['@id']==='string')groupsByVariantId.set(v['@id'],node.value);
  const baseURL=sourceURL||source.canonicalUrl;
  const candidates=[];let productCount=0,outputBytes=0,outputLimitHit=false;
  function resolve(value,path){if(safeObject(value)&&typeof value['@id']==='string'&&Object.keys(value).length===1){const ref=indexed.get(value['@id']);if(ref)return ref;}return {value,path};}
  for(const node of nodes){
    if(outputLimitHit)break;
    if(++productCount>LIMITS.products){warnings.push('Limite de 100 produits atteinte.');break;}
    const p=node.value;
    if(isType(p,'ProductGroup') && p.hasVariant && !p.offers)continue;
    const group=node.parentGroup||groupsByVariantId.get(p['@id'])||indexed.get(p.isVariantOf?.['@id'])?.value;
    const product={name:text(p.name)||text(group?.name),brand:text(p.brand)||text(p.brand?.name)||text(group?.brand?.name)||text(group?.brand),sku:text(p.sku),gtin:text(p.gtin||p.gtin14||p.gtin13||p.gtin12||p.gtin8),mpn:text(p.mpn),variant:variantSummary(p,group),url:safeSourceURL(p.url||p['@id'],baseURL),role:'unclassified'};
    let offers=Array.isArray(p.offers)?p.offers:p.offers?[p.offers]:[null];
    for(let i=0;i<offers.length;i++){
      if(candidates.length>=LIMITS.offers){warnings.push('Limite de 200 offres atteinte.');break;}
      const declaredPath=node.path+'.offers'+(Array.isArray(p.offers)?'['+i+']':'');
      const resolved=resolve(offers[i],declaredPath),o=safeObject(resolved.value)?resolved.value:{};
      const path=resolved.path,cw=[];
      const aggregate=isType(o,'AggregateOffer');
      const price=aggregate?null:cleanPrice(o.price,cw,'price');
      const low=aggregate?cleanPrice(o.lowPrice,cw,'lowPrice'):null,high=aggregate?cleanPrice(o.highPrice,cw,'highPrice'):null;
      if(low!==null&&high!==null&&Number(low)>Number(high))cw.push('Fourchette incohérente : prix minimum supérieur au maximum.');
      if(aggregate)cw.push('Fourchette de plusieurs offres : choisir une variante avant une comparaison de prix exact.');
      if(price===null&&!aggregate)cw.push('Prix non publié ou non interprétable ; il reste inconnu.');
      const currency=cleanCurrency(o.priceCurrency,cw);
      if(!currency)cw.push('Devise inconnue ou non validée.');
      const availability=cleanAvailability(o.availability,cw);
      const offer={kind:aggregate?'AggregateOffer':'Offer',price,priceLow:low,priceHigh:high,currency,availability,url:safeSourceURL(o.url,baseURL),taxIncluded:null,shippingAmount:null,shippingDestination:null,deliveryDays:null};
      cw.push('Prix livré, taxes et livraison à destination non établis par cette extraction.');
      if(availability)cw.push('Disponibilité déclarée par la source ; pas une garantie de livraison en France.');
      if(!product.name)cw.push('Nom du produit absent.');
      const evidence=[];
      for(const [field,key] of [['price','price'],['priceLow','lowPrice'],['priceHigh','highPrice'],['currency','priceCurrency'],['availability','availability']])if(o[key]!==undefined)evidence.push({field:'offer.'+field,method:node.method,path:path+'.'+key,rawValue:key==='availability'?availability:text(o[key])});
      if(p.name!==undefined)evidence.push({field:'product.name',method:node.method,path:node.path+'.name',rawValue:text(p.name)});
      const candidate={id:'candidate-'+candidates.length,product:{...product},offer,evidence,provenance:{method:node.method,productPath:node.path,offerPath:path},warnings:cw};
      const bytes=new TextEncoder().encode(JSON.stringify(candidate)).length;
      if(outputBytes+bytes>LIMITS.outputBytes){outputLimitHit=true;warnings.push('Limite de taille des offres extraites atteinte ; des offres ont été omises.');break;}
      outputBytes+=bytes;candidates.push(candidate);
    }
  }
  if(!candidates.length)warnings.push('Aucun produit exploitable détecté ; ne pas déduire un prix à partir de la seule URL.');
  return {schemaVersion:1,source,candidates,warnings:[...new Set(warnings)]};
}

export {LIMITS};
