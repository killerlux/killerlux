import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEconomics } from '../src/economics.js';
const base={price:39,landedCost:16,vatMode:'collect',vatRate:20,paymentRate:1.5,paymentFixed:.25,returnReserve:2,fixedAllocation:2,desiredProfit:5,assumedCpc:.5};
test('known scenario reconciles with independent arithmetic and excludes fixed allocation from variable margin',()=>{
  const r=computeEconomics(base);assert.equal(r.status,'calculated');assert.ok(Math.abs(r.margin-11.665)<1e-10);assert.ok(Math.abs(r.variableMargin-13.665)<1e-10);assert.ok(Math.abs(r.targetCAC-6.665)<1e-10);assert.ok(Math.abs(r.conversionAtBreakEven-.04286326618088298)<1e-12);
});
test('missing cost is never treated as free',()=>{for(const landedCost of ['',null,undefined])assert.equal(computeEconomics({...base,landedCost}).status,'incomplete');});
test('zero cost is allowed as an explicit scenario',()=>assert.equal(computeEconomics({...base,landedCost:0}).status,'calculated'));
test('VAT exemption uses full revenue and the entered nonrecoverable cost',()=>{const r=computeEconomics({...base,vatMode:'exempt',landedCost:19.2});assert.equal(r.revenue,39);assert.ok(Math.abs(r.margin-14.965)<1e-10);});
test('unprofitable scenario does not produce a spurious conversion threshold',()=>{const r=computeEconomics({...base,landedCost:100});assert.ok(r.margin<0);assert.equal(r.conversionAtBreakEven,null);});
test('CPC is optional; zero is not confused with unknown',()=>{assert.equal(computeEconomics({...base,assumedCpc:''}).conversionAtBreakEven,null);assert.equal(computeEconomics({...base,assumedCpc:0}).conversionAtBreakEven,0);});
test('invalid values are rejected',()=>{for(const bad of [Infinity,NaN,-1,'bad'])assert.equal(computeEconomics({...base,price:bad}).status,'incomplete');assert.equal(computeEconomics({...base,vatMode:'guess'}).status,'incomplete');});
