/* This function is self-contained so its bookmarklet contains no remote code. */
export function collectProductSnapshot() {
  'use strict';
  const publicLocation=new URL(location.href);
  if(!['https:','http:'].includes(publicLocation.protocol)){alert('Ouvrez une page produit publique HTTP ou HTTPS.');return;}
  if(/^(localhost|127\.|0\.|\[?::1\]?)/i.test(publicLocation.hostname)||/(^|\/)(account|checkout|admin|login|orders)(\/|$)/i.test(publicLocation.pathname)){alert('Ce collecteur est réservé aux pages produit publiques, hors compte et paiement.');return;}
  const url=value=>{try{const u=new URL(value,location.href);if(!['http:','https:'].includes(u.protocol))return undefined;u.username='';u.password='';u.search='';u.hash='';return u.href;}catch{return undefined;}};
  const scalar=value=>typeof value==='string'||typeof value==='number'?String(value).slice(0,2000):undefined;
  const types=v=>(Array.isArray(v)?v:[v]).filter(x=>typeof x==='string').map(x=>x.split(/[\/#]/).pop());
  const seen=new WeakSet(),captured=new WeakSet(),refs=new Map(),visitingProducts=new WeakSet(),visitingOffers=new WeakSet();
  const found=[],errors=[];
  const warn=message=>{if(!errors.includes(message))errors.push(message);};
  const availabilityStates=new Set(['BackOrder','Discontinued','InStock','InStoreOnly','LimitedAvailability','OnlineOnly','OutOfStock','PreOrder','PreSale','Reserved','SoldOut']);
  const availability=value=>{if(availabilityStates.has(value))return value;try{const u=new URL(value),state=u.pathname.split('/').pop();if(['http:','https:'].includes(u.protocol)&&['schema.org','www.schema.org'].includes(u.hostname)&&availabilityStates.has(state))return state;}catch{}if(value!==undefined)warn('Disponibilité non standard ignorée.');return undefined;};
  let visited=0,indexed=0,clonedProducts=0,clonedOffers=0,clonedNodes=0;
  const items=value=>{const list=Array.isArray(value)?value:[value];if(list.length>100)warn('Liste de variantes ou offres limitée à 100 éléments.');return list.slice(0,100);};
  const resolve=v=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v['@id']==='string'?(refs.get(v['@id'])||v):v;
  function index(v,depth=0){if(!v||typeof v!=='object')return;if(depth>64||++indexed>20000){warn('Limite de structure JSON atteinte ; relevé partiel.');return;}if(typeof v['@id']==='string'&&(!refs.has(v['@id'])||Object.keys(v).length>Object.keys(refs.get(v['@id'])).length))refs.set(v['@id'],v);for(const child of Object.values(v))index(child,depth+1);}
  function offer(o,depth=0){
    o=resolve(o);
    if(!o||typeof o!=='object')return undefined;
    if(visitingOffers.has(o)){warn('Référence cyclique d’offre ignorée.');return undefined;}
    if(depth>8||clonedOffers>=200||clonedNodes>=20000){warn('Limite de copie des offres atteinte ; relevé partiel.');return undefined;}
    clonedOffers++;clonedNodes++;visitingOffers.add(o);
    try {
      const r={};for(const k of ['@type','price','lowPrice','highPrice','priceCurrency','sku']){const v=scalar(o[k]);if(v!==undefined)r[k]=v;}
      const state=availability(o.availability);if(state!==undefined)r.availability=state;
      if(o.url)r.url=url(o.url);
      if(o.offers)r.offers=items(o.offers).map(v=>offer(v,depth+1)).filter(Boolean);
      return r;
    } finally {visitingOffers.delete(o);}
  }
  function product(p,depth=0){
    p=resolve(p);
    if(!p||typeof p!=='object')return undefined;
    if(visitingProducts.has(p)){warn('Référence cyclique de produit ignorée.');return undefined;}
    if(depth>12||clonedProducts>=100||clonedNodes>=20000){warn('Limite de copie des produits atteinte ; relevé partiel.');return undefined;}
    clonedProducts++;clonedNodes++;captured.add(p);visitingProducts.add(p);
    try {
      const r={};for(const k of ['name','sku','gtin','gtin8','gtin12','gtin13','gtin14','mpn','color','size','material','pattern','productID']){const v=scalar(p[k]);if(v!==undefined)r[k]=v;}
      r['@type']=types(p['@type']).includes('ProductGroup')?'ProductGroup':'Product';
      if(p.url)r.url=url(p.url);
      const brand=scalar(p.brand)||scalar(p.brand?.name);if(brand)r.brand={name:brand};
      if(p.offers)r.offers=items(p.offers).map(v=>offer(v)).filter(Boolean);
      if(p.hasVariant)r.hasVariant=items(p.hasVariant).map(v=>product(v,depth+1)).filter(Boolean);
      return r;
    } finally {visitingProducts.delete(p);}
  }
  function walk(v,depth=0){
    if(!v||typeof v!=='object'||seen.has(v)||captured.has(v))return;
    if(depth>64||++visited>20000){warn('Limite de parcours atteinte ; relevé partiel.');return;}seen.add(v);
    if(types(v['@type']).some(t=>t==='Product'||t==='ProductGroup')){const copy=product(v);if(copy)found.push(copy);return;}
    for(const value of Object.values(v))walk(value,depth+1);
  }
  const scripts=Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,100);
  let size=0;const parsed=[];
  for(const [i,s] of scripts.entries()){size+=s.textContent.length;if(size>5*1024*1024){errors.push('Limite de taille atteinte.');break;}try{parsed.push(JSON.parse(s.textContent));}catch{errors.push('Bloc JSON-LD '+i+' non interprétable.');}}
  parsed.forEach(v=>index(v));parsed.forEach(v=>walk(v));
  if(!found.length){alert('Aucun Product ou ProductGroup JSON-LD détecté. Rien téléchargé. Le collecteur ne lit pas les formulaires, comptes ou API privées.');return;}
  const snapshot={kind:'commerce-evidence-capture',version:1,sourceUrl:url(location.href),capturedAt:new Date().toISOString(),products:found.slice(0,100),warnings:[...errors,'Paramètres et fragment des URL retirés : vérifier les variantes.','Données déclarées par cette page ; aucun prix livré ou volume de ventes vérifié.']};
  const data=JSON.stringify(snapshot,null,2);
  if(new TextEncoder().encode(data).length>2_000_000){alert('Le relevé dépasse 2 Mo après extraction. Aucun fichier créé ; utilisez une fiche produit plus précise.');return;}
  const blob=new Blob([data],{type:'application/json'}),downloadURL=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=downloadURL;a.download='offres-publiques-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(downloadURL),1000);
}

export function createBookmarklet() {return 'javascript:'+encodeURIComponent('('+collectProductSnapshot.toString()+')();');}
