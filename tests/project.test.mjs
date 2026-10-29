import assert from 'node:assert/strict';
import test from 'node:test';
import {validateProject, PROJECT_LIMITS} from '../src/project.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const candidate={
  id:'candidate-0',product:{name:'Article <img onerror=alert(1)>',brand:'Marque',sku:'SKU-1',gtin:null,mpn:null,variant:{color:'red'},url:'https://shop.example/product',role:'competitor'},
  offer:{kind:'Offer',price:'14.99',priceLow:null,priceHigh:null,currency:'EUR',availability:'InStock',url:'https://shop.example/product',taxIncluded:null,shippingAmount:null,shippingDestination:null,deliveryDays:null},
  evidence:[{field:'offer.price',method:'jsonld',path:'script[0].@graph[2].offers.price',rawValue:'14.99'}],provenance:{method:'jsonld',productPath:'script[0].@graph[2]',offerPath:'script[0].@graph[2].offers'},warnings:['Coût livré inconnu.']
};
const imported={schemaVersion:1,source:{url:'https://shop.example/product',canonicalUrl:null,captureTime:'2026-10-29T12:00:00.000Z',importTime:'2026-10-29T12:05:00.000Z',method:'imported-html',sha256:null,liveVerified:false},candidates:[candidate],warnings:[]};
const fixture={schemaVersion:1,tool:'Dossier Commerce',study:{id:'poster-gpx',name:'Tampered name',scenario:{cost:0,costIsVerified:true},decision:'buy-now'},imports:[imported],economicInputs:{price:'39',vatMode:'collect',vatRate:'20',landedCost:null,paymentRate:'1.5',paymentFixed:'0.25',returnReserve:'2',fixedAllocation:'2',desiredProfit:'5',assumedCpc:null},economics:{status:'calculated',variableMargin:999999999},probabilityInput:{mode:'observations',clicks:500,purchasers:20,provenance:'Déclaration utilisateur, relevé du 29 octobre',windowClosed:true,comparableTraffic:true,expectedTraffic:1000,variableMargin:'9999999',fixedCosts:'40',futureAcquisitionSpend:'300',targetProfit:'300',priorAlpha:1,priorBeta:1,priorJustification:'Hypothèse préalable déclarée'},probability:{status:'conditional_estimate',probability:1}};
const validate=v=>validateProject(JSON.stringify(v));
const invalid=v=>assert.equal(validate(v).status,'invalid');

test('editable inputs restored; authoritative study and derived results ignored',()=>{
  const r=validate(fixture);
  assert.equal(r.status,'ok');assert.equal(r.caseId,'poster-gpx');assert.equal(r.economicInputs.price,39);assert.equal(r.economicInputs.landedCost,null);
  assert.equal(r.probabilityInput.clicks,500);assert.equal(r.probabilityInput.variableMargin,null);assert.equal(r.requiresUserCalculation,true);
  assert.equal(r.study,undefined);assert.equal(r.probability,undefined);assert.equal(r.economics,undefined);
  assert.ok(r.warnings.some(w=>w.includes('non vérifiés indépendamment')));
  assert.equal(r.imports[0].candidates[0].product.name,candidate.product.name); // text, never markup execution
});
test('no DOM, network or probability evaluation is invoked',()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('Network is forbidden');};
  const oldDoc=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,get(){throw new Error('DOM is forbidden');}});
  try{assert.equal(validate(fixture).status,'ok');}finally{globalThis.fetch=originalFetch;delete globalThis.document;if(oldDoc)Object.defineProperty(globalThis,'document',oldDoc);}
});
test('case allowlist and custom case; unsupported versions rejected',()=>{
  for(const id of ['crochet','poster-gpx','keytag','puzzle-gpx','custom']){const p=copy(fixture);p.study.id=id;assert.equal(validate(p).caseId,id);}
  for(const id of ['other','__proto__','javascript:alert(1)']){const p=copy(fixture);p.study.id=id;invalid(p);}
  const p=copy(fixture);p.schemaVersion=2;invalid(p);p.schemaVersion=1;p.tool='Other tool';invalid(p);
});
test('prototype pollution keys rejected at any depth',()=>{
  const original=JSON.stringify(fixture);
  for(const key of ['__proto__','constructor','prototype']){
    const poisoned=original.replace('"name":"Tampered name"',`"name":"Tampered name","${key}":{"polluted":true}`);
    const r=validateProject(poisoned);assert.equal(r.status,'invalid');
  }
  assert.equal({}.polluted,undefined);
});
test('URLs stripped and live status revoked; dangerous schemes rejected',()=>{
  const p=copy(fixture);p.imports[0].source.url='https://user:pass@shop.example/product?token=SECRET#variant';p.imports[0].source.liveVerified=true;p.imports[0].candidates[0].offer.shippingAmount='0';
  const r=validate(p);assert.equal(r.status,'ok');assert.equal(r.imports[0].source.url,'https://shop.example/product');assert.equal(r.imports[0].source.liveVerified,false);assert.equal(r.imports[0].candidates[0].offer.shippingAmount,null);assert.ok(!JSON.stringify(r).includes('SECRET'));
  for(const unsafe of ['javascript:alert(1)','file:///etc/passwd','data:text/html,hello']){p.imports[0].source.url=unsafe;invalid(p);}
});
test('strict prices, currencies, roles and ranges',()=>{
  for(const bad of ['1,234','Infinity','-1','1e100',{},'1000000000001']){const p=copy(fixture);p.imports[0].candidates[0].offer.price=bad;invalid(p);}
  for(const bad of ['BTC','INVALID','<svg>',4]){const p=copy(fixture);p.imports[0].candidates[0].offer.currency=bad;invalid(p);}
  const p=copy(fixture);p.imports[0].candidates[0].offer.price='0';p.imports[0].candidates[0].offer.currency=null;assert.equal(validate(p).status,'ok');
  p.imports[0].candidates[0].product.role='admin';invalid(p);
  const q=copy(fixture),o=q.imports[0].candidates[0].offer;o.kind='AggregateOffer';o.price=null;o.priceLow='5';o.priceHigh='20';assert.equal(validate(q).status,'ok');o.price='5';invalid(q);o.price=null;o.priceLow='30';invalid(q);
});
test('source dates validated, missing dates remain unknown',()=>{
  for(const d of ['2026-02-30T12:00:00Z','2026-13-01T12:00:00Z','yesterday','2026-10-29']){const p=copy(fixture);p.imports[0].source.captureTime=d;invalid(p);}
  const p=copy(fixture);p.imports[0].source.captureTime=null;p.imports[0].source.importTime=undefined;const r=validate(p);assert.equal(r.status,'ok');assert.equal(r.imports[0].source.importTime,null);
});
test('bounded numeric economics and unknowns; booleans and Infinity rejected',()=>{
  for(const bad of [true,{},'0x10','Infinity','1e309',-1,1000001]){const p=copy(fixture);p.economicInputs.price=bad;invalid(p);}
  const p=copy(fixture);p.economicInputs.price='1e2';p.economicInputs.extra='ignored';let r=validate(p);assert.equal(r.economicInputs.price,100);assert.equal(r.economicInputs.extra,undefined);
  p.economicInputs.paymentRate=101;invalid(p);p.economicInputs.paymentRate=1.5;p.economicInputs.price=null;assert.equal(validate(p).status,'ok');
  const overflow=JSON.stringify(fixture).replace('"price":"39"','"price":1e309');assert.equal(validateProject(overflow).status,'invalid');
});
test('observation bounds and explicit provenance; calculated margin never accepted',()=>{
  for(const bad of [-1,1.2,10000001]){const p=copy(fixture);p.probabilityInput.clicks=bad;invalid(p);}
  const p=copy(fixture);p.probabilityInput.purchasers=501;invalid(p);p.probabilityInput.purchasers=20;p.probabilityInput.expectedTraffic=10001;invalid(p);
  p.probabilityInput.expectedTraffic=1000;p.probabilityInput.windowClosed='true';invalid(p);
  p.probabilityInput.windowClosed=true;p.probabilityInput.priorAlpha=0;invalid(p);
  p.probabilityInput.priorAlpha=1;p.probabilityInput.fixedCosts='0.123456789012345678901234';assert.equal(validate(p).probabilityInput.fixedCosts,p.probabilityInput.fixedCosts);
  p.probabilityInput=null;assert.equal(validate(p).probabilityInput,null);
});
test('document, record, candidate and text limits',()=>{
  assert.equal(validateProject('x'.repeat(PROJECT_LIMITS.bytes+1)).status,'invalid');
  assert.equal(validateProject('{broken}').status,'invalid');assert.equal(validateProject(fixture).status,'invalid');
  const p=copy(fixture);p.imports=Array(9).fill(imported);invalid(p);p.imports=[copy(imported)];p.imports[0].candidates=Array(201).fill(candidate);invalid(p);
  p.imports[0].candidates=[copy(candidate)];p.imports[0].candidates[0].product.name='x'.repeat(2001);invalid(p);
});
test('extractor maximum variant text is restorable',()=>{
  const p=copy(fixture);p.imports[0].candidates[0].product.variant.color='x'.repeat(2000);
  const r=validate(p);assert.equal(r.status,'ok');assert.equal(r.imports[0].candidates[0].product.variant.color.length,2000);
  p.imports[0].candidates[0].product.variant.color+='x';invalid(p);
});
