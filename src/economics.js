export function computeEconomics(input) {
  const errors=[];
  const numeric=(key,min=0,max=1e6)=>{
    const raw=input[key];
    if(raw===null||raw===undefined||String(raw).trim()===''){errors.push(key);return null;}
    const n=Number(raw);
    if(!Number.isFinite(n)||n<min||n>max){errors.push(key);return null;}
    return n;
  };
  const price=numeric('price',0.01), cost=numeric('landedCost');
  const exempt=input.vatMode==='exempt';
  if(!['collect','exempt'].includes(input.vatMode))errors.push('vatMode');
  const vat=exempt?0:numeric('vatRate',0,100);
  const feeRate=numeric('paymentRate',0,100),feeFixed=numeric('paymentFixed');
  const reserve=numeric('returnReserve'),allocation=numeric('fixedAllocation'),desired=numeric('desiredProfit');
  const cpc=input.assumedCpc===null||input.assumedCpc===undefined||String(input.assumedCpc).trim()===''?null:numeric('assumedCpc');
  if(errors.length)return {status:'incomplete',missingOrInvalid:[...new Set(errors)]};
  const revenue=price/(1+vat/100),fees=price*feeRate/100+feeFixed;
  const variableMargin=revenue-cost-fees-reserve,margin=variableMargin-allocation,targetCAC=margin-desired;
  return {status:'calculated',currency:'EUR',revenue,fees,variableMargin,margin,targetCAC,
    conversionAtBreakEven:cpc!==null&&margin>0?cpc/margin:null,
    conversionAtTarget:cpc!==null&&targetCAC>0?cpc/targetCAC:null,
    implicitCpc:cpc,vatMode:input.vatMode,
    limitations:['Amounts are scenarios, not evidence of demand.','Income taxes, social contributions and time are excluded.','Fixed allocation depends on volume.']};
}
