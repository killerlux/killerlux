export function el(tag,attrs={},...children){const n=document.createElement(tag);for(const [k,v]of Object.entries(attrs)){if(v==null)continue;if(k==='class')n.className=v;else if(k.startsWith('on')&&typeof v==='function')n.addEventListener(k.slice(2),v);else n.setAttribute(k,String(v));}for(const c of children.flat(Infinity)){if(c==null)continue;n.append(c instanceof Node?c:document.createTextNode(String(c)));}return n;}
export const campaignIds=['trace-souvenir','trace-cadeau','trace-local','dossier-marge','dossier-preuves','dossier-comparaison'];
export async function loadCampaigns(){const r=await fetch(new URL('./campaigns.json',import.meta.url));if(!r.ok)throw new Error('Les créations ne sont pas disponibles. Rechargez la page.');const rows=await r.json();if(!Array.isArray(rows)||rows.length!==6||new Set(rows.map(c=>c.id)).size!==6||rows.some(c=>!campaignIds.includes(c.id)||c.status!=='draft'||c.project!==(c.id.startsWith('trace-')?'trace':'commerce')))throw new Error('Catalogue non reconnu.');return rows;}
export function campaignURL(c,base=window.location.href){const path=c.project==='trace'?'../discover/trace.html':'../discover/commerce.html';const u=new URL(path,base);u.searchParams.set('angle',c.id.split('-').slice(1).join('-'));u.searchParams.set('utm_source','studio');u.searchParams.set('utm_medium','preview');u.searchParams.set('utm_campaign',c.project==='trace'?'trace_free_fr':'commerce_free_fr');u.searchParams.set('utm_content',c.id);return u.href;}
export function applicationURL(c,base=window.location.href,fragment){const path=c.project==='trace'?'../route-poster/index.html':'../index.html';const u=new URL(path,base);const input=new URL(base);const allowed={utm_source:['studio','meta','google','organic'],utm_medium:['preview','paid_social','cpc','organic'],utm_campaign:[c.project==='trace'?'trace_free_fr':'commerce_free_fr'],utm_content:[c.id]};for(const [key,values] of Object.entries(allowed)){const value=input.searchParams.get(key);if(values.includes(value))u.searchParams.set(key,value);}u.hash=fragment||(c.project==='trace'?'editor':'workspace');return u.href;}
export async function copyText(text,status){try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(text);status.textContent='Copié dans le presse-papiers.';}catch{status.textContent='La copie automatique est indisponible. Le texte reste sélectionnable dans cette page.';}}
export async function downloadAsset(path,filename,status){
  const url=new URL(path,location.href);
  status.textContent='Préparation du fichier…';
  try{
    if(url.origin!==location.origin||!url.pathname.includes('/campaigns/assets/')||!/^[a-z-]+\.(png|svg|mp4)$/.test(filename))throw new Error('Fichier non reconnu');
    const response=await fetch(url,{credentials:'omit'});
    if(!response.ok)throw new Error('Fichier indisponible');
    const blob=await response.blob();
    if(!blob.size||blob.size>20_000_000)throw new Error('Taille inattendue');
    const bytes=new Uint8Array(await blob.slice(0,128).arrayBuffer());
    const prefix=new TextDecoder().decode(bytes);
    const valid=filename.endsWith('.png')?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):filename.endsWith('.mp4')?prefix.slice(4,8)==='ftyp':prefix.trimStart().startsWith('<svg');
    if(!valid)throw new Error('Le serveur n’a pas renvoyé le média attendu');
    const objectURL=URL.createObjectURL(blob),link=el('a',{href:objectURL,download:filename});
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),10000);
    status.textContent='Fichier préparé : '+filename;
  }catch{
    status.replaceChildren(document.createTextNode('Téléchargement automatique indisponible. '),el('a',{href:url.href,target:'_blank',rel:'noopener noreferrer'},'Ouvrir le fichier'));
  }
}
