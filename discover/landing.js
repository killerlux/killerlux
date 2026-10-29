import {loadCampaigns,applicationURL} from '../campaigns/shared.js';
const project=document.body.dataset.project;
const fallback=project==='trace'?'souvenir':'marge';
const angle=new URL(location.href).searchParams.get('angle')||fallback;
try{
  const records=await loadCampaigns();
  const id=(project==='trace'?'trace-':'dossier-')+angle;
  const campaign=records.find(c=>c.project===project&&c.id===id)||records.find(c=>c.project===project&&c.priority==='first');
  document.getElementById('landing-headline').textContent=campaign.headline;
  document.getElementById('landing-subheadline').textContent=campaign.subheadline;
  document.title=campaign.headline+' — '+(project==='trace'?'Trace':'Dossier Commerce');
  if(project==='trace'){
    const sample=campaign.id==='trace-local'?'trail':campaign.id==='trace-cadeau'?'ride':'run';
    document.getElementById('hero-poster').src='../campaigns/assets/poster-'+sample+'.svg';
    document.getElementById('hero-poster').alt='Aperçu d’une affiche créée à partir d’un parcours fictif de '+({run:'course',trail:'trail',ride:'vélo'}[sample])+'.';
  }else{
    const selection=campaign.id==='dossier-preuves'?'proof':campaign.id==='dossier-comparaison'?'compare':'cost';
    for(const visual of ['cost','proof','compare'])document.getElementById(visual+'-visual').hidden=visual!==selection;
    const main=document.getElementById('main-cta');
    main.dataset.anchor=selection==='proof'?'sources':selection==='compare'?'compare':'economics';
    main.textContent=selection==='proof'?'Voir les sources du dossier →':selection==='compare'?'Comparer les quatre études →':'Examiner les coûts gratuitement →';
    if(selection==='proof'){const secondary=document.getElementById('secondary-cta');secondary.dataset.anchor='try-import';secondary.textContent='Essayer un import fictif';}
  }
  for(const link of document.querySelectorAll('.app-link'))link.href=applicationURL(campaign,location.href,link.dataset.anchor);
  document.body.dataset.campaign=campaign.id;
}catch{
  // Static content and real application links remain usable if the catalogue is unavailable.
  document.body.dataset.catalog='unavailable';
}
