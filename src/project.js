/** Restore editable inputs only. Pure validation: no DOM, fetch, evaluation or calculation. */
const MAX_BYTES = 2_000_000;
const CASE_IDS = new Set(['crochet','poster-gpx','keytag','puzzle-gpx','custom']);
const ROLES = new Set(['unclassified','supplier','competitor']);
const METHODS = new Set(['json','jsonld','microdata','captured-jsonld','manual','project-import']);
const SOURCE_METHODS = new Set(['imported-html','imported-json','collector-import','project-import']);
const CURRENCIES = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['EUR','USD','GBP','CAD','CHF','AUD','JPY','CNY','AED','MAD','SAR']);
const FORBIDDEN_KEYS = new Set(['__proto__','prototype','constructor']);
const IMPORT_NOTE = 'Preuves restaurées depuis un fichier utilisateur ; origine, date et contenu non vérifiés indépendamment.';

class InvalidProject extends Error {}
const fail = message => {throw new InvalidProject(message);};
function record(value,label) {
  if(!value || typeof value!=='object' || Array.isArray(value))fail(`${label} doit être un objet.`);
  return value;
}
function list(value,label,max,optional=false) {
  if(optional && value===undefined)return [];
  if(!Array.isArray(value)||value.length>max)fail(`${label} doit contenir au maximum ${max} éléments.`);
  return value;
}
function string(value,label,max=500,nullable=true) {
  if(nullable && (value===undefined||value===null))return null;
  if(typeof value!=='string'||value.length>max)fail(`${label} doit être un texte de ${max} caractères maximum.`);
  return value;
}
function choice(value,allowed,label,defaultValue) {
  if(value===undefined && defaultValue!==undefined)return defaultValue;
  if(typeof value!=='string'||!allowed.has(value))fail(`${label} contient une valeur non prise en charge.`);
  return value;
}
function url(value,label,warnings) {
  if(value===undefined||value===null||value==='')return null;
  string(value,label,8192,false);
  try {
    const parsed=new URL(value);
    if(!['https:','http:'].includes(parsed.protocol))fail(`${label} doit utiliser HTTP ou HTTPS.`);
    parsed.username='';parsed.password='';parsed.search='';parsed.hash='';
    if(parsed.href!==value)warnings.add('Des paramètres, fragments ou identifiants d’URL ont été retirés ; revérifier les variantes.');
    return parsed.href;
  } catch(error) {
    if(error instanceof InvalidProject)throw error;
    fail(`${label} n’est pas une URL HTTP(S) valide.`);
  }
}
function date(value,label) {
  if(value===undefined||value===null)return null;
  string(value,label,40,false);
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match)fail(`${label} doit être une date ISO complète ou null.`);
  const [,ys,ms,ds,hs,mins,ss]=match;
  const y=Number(ys),m=Number(ms),d=Number(ds),leap=y%4===0&&(y%100!==0||y%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(m<1||m>12||d<1||d>days[m-1]||Number(hs)>23||Number(mins)>59||Number(ss)>59)fail(`${label} n’est pas une date calendaire valide.`);
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))fail(`${label} n’est pas une date ISO valide.`);
  return parsed.toISOString();
}
function number(value,label,min,max,integer=false) {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='number'&&typeof value!=='string')fail(`${label} doit être un nombre.`);
  if(typeof value==='string' && (value.length>80||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim())))fail(`${label} doit être un nombre décimal simple.`);
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n)))fail(`${label} doit être ${integer?'un entier':'un nombre fini'} entre ${min} et ${max}.`);
  return n;
}
function price(value,label,max=1e12) {
  if(value===undefined||value===null)return null;
  if(typeof value!=='string'&&typeof value!=='number')fail(`${label} doit être un montant décimal ou null.`);
  const str=String(value).trim();
  if(str.length>80||!/^(?:0|[1-9]\d*)(?:\.\d{1,24})?$/.test(str)||!Number.isFinite(Number(str))||Number(str)>max)fail(`${label} contient un montant ambigu ou hors limite.`);
  return str;
}
function currency(value,label) {
  if(value===undefined||value===null)return null;
  if(typeof value!=='string')fail(`${label} doit être une devise ISO ou null.`);
  const code=value.toUpperCase();
  if(!/^[A-Z]{3}$/.test(code)||!CURRENCIES.has(code))fail(`${label} contient une devise non reconnue.`);
  return code;
}
function warningsList(value,label) {
  return list(value,label,100,true).map((v,i)=>string(v,`${label}[${i}]`,1000,false));
}

function sanitizeSource(input,label,warnings) {
  const source=record(input,label);
  const sha=string(source.sha256,label+'.sha256',64);
  if(sha!==null&&!/^[a-fA-F0-9]{64}$/.test(sha))fail(`${label}.sha256 doit être un hash hexadécimal ou null.`);
  if(source.liveVerified===true)warnings.add('Le statut « vérifié en direct » du fichier a été supprimé.');
  return {
    url:url(source.url,label+'.url',warnings),
    canonicalUrl:url(source.canonicalUrl,label+'.canonicalUrl',warnings),
    captureTime:date(source.captureTime,label+'.captureTime'),
    importTime:date(source.importTime,label+'.importTime'),
    method:choice(source.method,SOURCE_METHODS,label+'.method','project-import'),
    sha256:sha?.toLowerCase()??null,
    liveVerified:false
  };
}
function sanitizeCandidate(input,label,warnings,index) {
  const candidate=record(input,label),p=record(candidate.product,label+'.product'),o=record(candidate.offer,label+'.offer');
  const kind=choice(o.kind,new Set(['Offer','AggregateOffer']),label+'.offer.kind');
  const exact=price(o.price,label+'.offer.price'),low=price(o.priceLow,label+'.offer.priceLow'),high=price(o.priceHigh,label+'.offer.priceHigh');
  if(kind==='AggregateOffer'&&exact!==null)fail(`${label} : une fourchette ne doit pas être un prix exact.`);
  if(kind==='Offer'&&(low!==null||high!==null))fail(`${label} : une offre exacte ne doit pas contenir de fourchette.`);
  if(low!==null&&high!==null&&Number(low)>Number(high))fail(`${label} : fourchette de prix inversée.`);
  let variant=null;
  if(p.variant!==undefined&&p.variant!==null){
    const original=record(p.variant,label+'.product.variant');variant={};
    for(const key of ['color','size','material','pattern','productID','groupName'])if(original[key]!==undefined)variant[key]=string(original[key],label+'.product.variant.'+key,2000,false);
    if(!Object.keys(variant).length)variant=null;
  }
  const evidence=list(candidate.evidence,label+'.evidence',64,true).map((item,i)=>{
    const e=record(item,`${label}.evidence[${i}]`);
    const raw=e.rawValue===null||e.rawValue===undefined?null:typeof e.rawValue==='number'&&Number.isFinite(e.rawValue)?String(e.rawValue):string(e.rawValue,label+'.evidence.rawValue',2000,false);
    return {field:string(e.field,label+'.evidence.field',200,false),method:choice(e.method,METHODS,label+'.evidence.method'),path:string(e.path,label+'.evidence.path',1000,false),rawValue:raw};
  });
  const pr=candidate.provenance===undefined?{}:record(candidate.provenance,label+'.provenance');
  if(['taxIncluded','shippingAmount','shippingDestination','deliveryDays'].some(k=>o[k]!==undefined&&o[k]!==null))warnings.add('Des conclusions de TVA/livraison du relevé ont été écartées : elles restent à vérifier.');
  return {
    id:'restored-'+index,
    product:{
      name:string(p.name,label+'.product.name',2000),brand:string(p.brand,label+'.product.brand',2000),sku:string(p.sku,label+'.product.sku',2000),gtin:string(p.gtin,label+'.product.gtin',2000),mpn:string(p.mpn,label+'.product.mpn',2000),variant,
      url:url(p.url,label+'.product.url',warnings),role:choice(p.role,ROLES,label+'.product.role','unclassified')
    },
    offer:{kind,price:exact,priceLow:low,priceHigh:high,currency:currency(o.currency,label+'.offer.currency'),availability:string(o.availability,label+'.offer.availability',2000),url:url(o.url,label+'.offer.url',warnings),taxIncluded:null,shippingAmount:null,shippingDestination:null,deliveryDays:null},
    evidence,
    provenance:{method:choice(pr.method,METHODS,label+'.provenance.method','project-import'),productPath:string(pr.productPath,label+'.provenance.productPath',1000),offerPath:string(pr.offerPath,label+'.provenance.offerPath',1000)},
    warnings:[...new Set(warningsList(candidate.warnings,label+'.warnings'))]
  };
}
function sanitizeImport(input,index,warnings) {
  const label=`imports[${index}]`,r=record(input,label);
  if(r.schemaVersion!==1)fail(`${label} : version de relevé non prise en charge.`);
  return {schemaVersion:1,source:sanitizeSource(r.source,label+'.source',warnings),candidates:list(r.candidates,label+'.candidates',200).map((c,i)=>sanitizeCandidate(c,`${label}.candidates[${i}]`,warnings,i)),warnings:[...new Set([...warningsList(r.warnings,label+'.warnings'),IMPORT_NOTE])]};
}
function sanitizeEconomics(input) {
  const e=record(input,'economicInputs');
  const out={vatMode:choice(e.vatMode,new Set(['collect','exempt']),'economicInputs.vatMode')};
  const ranges={price:[.01,1e6],vatRate:[0,100],landedCost:[0,1e6],paymentRate:[0,100],paymentFixed:[0,1e6],returnReserve:[0,1e6],fixedAllocation:[0,1e6],desiredProfit:[0,1e6],assumedCpc:[0,1e6]};
  for(const [key,[min,max]] of Object.entries(ranges))out[key]=number(e[key],'economicInputs.'+key,min,max);
  return out;
}
function sanitizeProbability(input,warnings) {
  if(input===undefined||input===null)return null;
  const p=record(input,'probabilityInput');
  const mode=choice(p.mode,new Set(['observations','scenario']),'probabilityInput.mode');
  const clicks=number(p.clicks,'probabilityInput.clicks',0,10_000_000,true),purchasers=number(p.purchasers,'probabilityInput.purchasers',0,10_000_000,true);
  if(clicks!==null&&purchasers!==null&&purchasers>clicks)fail('Le nombre d’acheteurs ne peut pas dépasser le nombre de visiteurs.');
  for(const key of ['windowClosed','comparableTraffic'])if(p[key]!==undefined&&typeof p[key]!=='boolean')fail(`probabilityInput.${key} doit être un booléen.`);
  warnings.add('Les observations, leur provenance et les confirmations restaurées sont déclaratives ; elles ne sont pas authentifiées.');
  if(p.variableMargin!==undefined&&p.variableMargin!==null)warnings.add('La marge variable exportée a été ignorée ; elle doit être recalculée à partir des paramètres économiques.');
  return {
    mode,clicks,purchasers,provenance:string(p.provenance,'probabilityInput.provenance',400)??'',windowClosed:p.windowClosed===true,comparableTraffic:p.comparableTraffic===true,
    expectedTraffic:number(p.expectedTraffic,'probabilityInput.expectedTraffic',0,10000,true),variableMargin:null,
    fixedCosts:price(p.fixedCosts,'probabilityInput.fixedCosts',1e6),futureAcquisitionSpend:price(p.futureAcquisitionSpend,'probabilityInput.futureAcquisitionSpend',1e6),targetProfit:price(p.targetProfit,'probabilityInput.targetProfit',1e6),
    priorAlpha:number(p.priorAlpha,'probabilityInput.priorAlpha',.000001,1e6),priorBeta:number(p.priorBeta,'probabilityInput.priorBeta',.000001,1e6),priorJustification:string(p.priorJustification,'probabilityInput.priorJustification',400)??''
  };
}

/**
 * @returns {{status:'ok', caseId:string, imports:Array, economicInputs:Object,
 * probabilityInput:Object|null, requiresUserCalculation:true, warnings:Array}
 * | {status:'invalid', reason:string}}
 * Consumers must bind caseId to their own bundled cases. Never restore exported
 * study/economics/probability as authoritative data or calculate automatically.
 * Restored sources, dates, observations, provenance and confirmation flags are
 * user declarations, not independently authenticated evidence. UI must display
 * warnings, invalidate the previous probability, and wait for an explicit user
 * calculation. variableMargin is intentionally null and must come from a fresh
 * economic calculation. Evidence paths are inert labels, never instructions.
 */
export function validateProject(text) {
  try {
    if(typeof text!=='string')fail('Le dossier doit être fourni sous forme de texte JSON.');
    if(text.length>MAX_BYTES||new TextEncoder().encode(text).length>MAX_BYTES)fail('Le dossier dépasse la limite de 2 Mo.');
    let parsed;
    try {parsed=JSON.parse(text,(key,value)=>{if(FORBIDDEN_KEYS.has(key))fail('Le dossier contient une clé structurelle interdite.');return value;});}
    catch(error){if(error instanceof InvalidProject)throw error;fail('Le dossier JSON est invalide ou trop profondément imbriqué.');}
    const root=record(parsed,'Le dossier');
    if(root.schemaVersion!==1||root.tool!=='Dossier Commerce')fail('Ce fichier n’est pas un export Dossier Commerce version 1.');
    const study=record(root.study,'study');
    const caseId=choice(study.id,CASE_IDS,'study.id');
    const warnings=new Set([IMPORT_NOTE,'Les faits du dossier, les résultats économiques et les probabilités exportés ne sont pas restaurés comme preuves. Relancer explicitement le calcul après vérification.']);
    const imports=list(root.imports,'imports',8).map((r,i)=>sanitizeImport(r,i,warnings));
    const economicInputs=sanitizeEconomics(root.economicInputs),probabilityInput=sanitizeProbability(root.probabilityInput,warnings);
    return {status:'ok',caseId,imports,economicInputs,probabilityInput,requiresUserCalculation:true,warnings:[...warnings]};
  } catch(error) {
    return {status:'invalid',reason:error instanceof InvalidProject?error.message:'Le dossier ne peut pas être interprété en sécurité.'};
  }
}

export const PROJECT_LIMITS = Object.freeze({bytes:MAX_BYTES,imports:8,candidatesPerImport:200});
