const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('fr-FR'),usd=n=>(+n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' $';
const DT=s=>new Date(s).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
const RS=[['facebook','Facebook'],['instagram','Instagram'],['x','X (Twitter)'],['tiktok','TikTok'],['youtube','YouTube'],['whatsapp','WhatsApp (lien wa.me/…)'],['linkedin','LinkedIn'],['telegram','Telegram'],['site','Site web']];
let T=null,Q=null;
async function load(){
 try{T=await api('/api/depute/tableau')}catch(e){if(e.status===401){location.href='connexion.html';return}$('err').innerHTML=e.status===403?'Cette page est réservée aux députés validés. <a href="espace.html" style="color:var(--blue)">Retour à mon espace</a>':esc(e.message);return}
 $('app').style.display='block';paint();
}
function paint(){
 const w=T.portefeuille;$('k-ab').textContent=fmt(T.abonnes.n);$('k-usd').textContent=usd(w.solde_usd);$('k-sms').textContent=fmt(w.credits_sms);$('k-mail').textContent=fmt(w.credits_email);
 const ev=T.evolution,mx=Math.max(1,...ev.map(x=>x.n));$('bars').innerHTML=ev.map(x=>`<i style="height:${Math.max(2,x.n/mx*100)}%" title="${x.jour} : +${x.n}"></i>`).join('');
 $('d0').textContent=ev[0].jour.split('-').reverse().slice(0,2).join('/');$('d1').textContent='aujourd’hui';
 $('r-ab').textContent=fmt(T.abonnes.n);$('r-par').textContent=fmt(T.reseau.n);
 $('l-adh').value=T.lien_adhesion;$('l-prof').value=T.lien_profil;$('vp').href=T.lien_profil;
 $('wa').href='https://wa.me/?text='+encodeURIComponent('Rejoignez le mouvement Les 21 Défis et suivez-moi : '+T.lien_adhesion);
 $('c-psms').textContent=T.prix.prix_sms_usd+' $ / SMS';$('c-pmail').textContent=T.prix.prix_email_usd+' $ / e-mail';
 $('w-tarif').textContent=`Tarifs : ${usd(T.prix.prix_sms_usd)} le SMS, ${usd(T.prix.prix_email_usd)} l’e-mail.`;$('w-amt').min=T.prix.recharge_min_usd;
 priceHint();
 $('camps').innerHTML='<tr><th>Campagne</th><th>Canal</th><th>État</th><th>Envoyés</th><th>Échecs</th><th>Date</th><th></th></tr>'+(T.campagnes.map(c=>{const p=c.total?Math.round(c.envoyes/c.total*100):0;return `<tr><td><b>${esc(c.nom)}</b></td><td>${c.canal==='sms'?'SMS':'E-mail'}</td><td>${{en_cours:'En cours',terminee:'Terminée',annulee:'Annulée',brouillon:'Brouillon'}[c.statut]}</td><td style="min-width:130px">${c.envoyes}/${c.total}<div class="prog"><i style="width:${p}%"></i></div></td><td>${c.echecs}</td><td>${DT(c.cree_le)}</td><td>${c.statut==='en_cours'?`<button class="btn btn-outline sm" data-cancel="${c.id}">Annuler</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="7">Aucune campagne.</td></tr>');
 $('mvts').innerHTML='<tr><th>Date</th><th>Opération</th><th>Montant</th><th>SMS</th><th>E-mail</th></tr>'+(T.mouvements.map(m=>`<tr><td>${DT(m.cree_le)}</td><td>${esc(m.description||m.type)}</td><td>${m.montant_usd?usd(m.montant_usd):''}</td><td>${m.credits_sms||''}</td><td>${m.credits_email||''}</td></tr>`).join('')||'<tr><td colspan="5">Aucun mouvement.</td></tr>');
 $('pays').innerHTML='<tr><th>Date</th><th>Référence</th><th>Montant</th><th>État</th></tr>'+(T.paiements.map(p=>`<tr><td>${DT(p.cree_le)}</td><td>${esc(p.reference)}</td><td>${usd(p.montant_usd)}</td><td>${{en_attente:'En attente',reussi:'Réussi',echoue:'Échoué'}[p.statut]}</td></tr>`).join('')||'<tr><td colspan="4">Aucun paiement.</td></tr>');
 const ct=T.contacts;$('n-contacts').textContent=ct.n?`${ct.n} contact(s)`:'aucun';
 const p=T.profil;$('p-slogan').value=p.slogan||'';$('p-bio').value=p.bio||'';$('p-prof').value=p.profession||'';$('p-col').value=p.couleur||'bleu';$('p-cov').value=p.couverture||'';
 $('p-soc').innerHTML=RS.map(([k,l])=>`<div class="field"><label>${l}</label><input data-r="${k}" placeholder="https://…" value="${esc((p.reseaux||{})[k]||'')}"></div>`).join('');
 $('p-ph').textContent=p.a_photo?'Photo enregistrée.':'Aucune photo.';$('p-msgs').checked=!!T.membre.accepte_messages;
 devis();
}
function priceHint(){const w=T.portefeuille;
 $('b-sms-p').textContent=`${usd((+$('b-sms').value||0)*T.prix.prix_sms_usd)} — vous avez ${fmt(w.credits_sms)} crédit(s)`;$('b-mail-p').textContent=`${usd((+$('b-mail').value||0)*T.prix.prix_email_usd)} — vous avez ${fmt(w.credits_email)} crédit(s)`}
document.addEventListener('input',e=>{if(e.target.id==='b-sms'||e.target.id==='b-mail')priceHint();if(e.target.id==='c-msg')$('c-len').textContent=e.target.value.length+' caractères'+(canal()==='sms'?' (320 max)':'');if(e.target.closest('#srcs,.plans')||e.target.id==='c-lim')devis()});
const canal=()=>document.querySelector('input[name=canal]:checked').value;
const sources=()=>[...document.querySelectorAll('#srcs input:checked')].map(i=>i.value);
let dvT=0;
function devis(){clearTimeout(dvT);dvT=setTimeout(async()=>{
 $('f-sujet').style.display=canal()==='email'?'block':'none';const box=$('devis'),s=sources(),c=canal();
 if(!s.length){box.className='quote-box';box.textContent='Choisissez au moins un groupe de destinataires.';$('manque').style.display='none';$('c-buy').style.display='none';Q=null;return}
 try{const lim=+$('c-lim').value||undefined;Q=await api('/api/depute/campagne/devis',{canal:c,sources:s,limite:lim});
  for(const k of ['abonnes','province','tous','contacts'])$('n-'+k).textContent=Q.par_source[k]!==undefined?fmt(Q.par_source[k])+' dest.':'';
  const unit=c==='sms'?'SMS':'e-mails',pr=T.prix['prix_'+c+'_usd'];
  const manque=Q.manque>0;
  box.className='quote-box '+(manque?'warn':'ok');
  box.innerHTML=`<b>${fmt(Q.disponibles)}</b> destinataire(s) distinct(s) au total · vos crédits : <b>${fmt(Q.credits)}</b> ${unit} · <b>${fmt(Q.envoyables)}</b> message(s) pourront partir.`+(manque?`<br>Il manque <b>${fmt(Q.manque)}</b> crédit(s) (≈ ${usd(Q.cout_manque_usd)}). Décochez des groupes, limitez l'envoi à ${fmt(Q.credits)} destinataire(s), ou rechargez.`:'');
  $('manque').style.display=manque?'block':'none';$('c-buy').style.display=manque?'inline-block':'none';
 }catch(e){box.className='quote-box warn';box.textContent=e.message}},250)}
$('c-go').onclick=async()=>{const st=$('c-st');st.style.color='#b3261e';
 const body={canal:canal(),sources:sources(),nom:$('c-nom').value,sujet:$('c-sujet').value,message:$('c-msg').value,signature:$('c-sig').value};
 if(Q&&Q.manque>0){const l=+$('c-lim').value;body.limite=l>0?Math.min(l,Q.credits):Q.credits;if(!Q.credits){st.textContent='Aucun crédit : rechargez d’abord.';return}}
 else if(+$('c-lim').value>0)body.limite=+$('c-lim').value;
 if(!confirm(`Lancer cette campagne ${body.canal==='sms'?'SMS':'e-mail'} ? Les crédits seront débités.`))return;
 try{const r=await api('/api/depute/campagne/lancer',body);st.style.color='#1b7a3d';st.textContent=`Campagne lancée : ${fmt(r.total)} message(s) partiront progressivement.`;$('c-msg').value='';await load()}catch(e){st.textContent=e.message}};
$('c-buy').onclick=()=>tab('wal');
$('w-pay').onclick=async()=>{const st=$('w-st');st.style.color='#b3261e';try{const r=await api('/api/portefeuille/recharger',{montant:+$('w-amt').value});st.style.color='#1b7a3d';st.textContent='Redirection vers le paiement sécurisé…';location.href=r.redirectUrl}catch(e){st.textContent=e.message}};
document.addEventListener('click',async e=>{
 const b=e.target.closest('button[data-buy]');if(b){const st=$('b-st');st.style.color='#b3261e';const c=b.dataset.buy;try{await api('/api/portefeuille/acheter',{canal:c,quantite:+$(c==='sms'?'b-sms':'b-mail').value});st.style.color='#1b7a3d';st.textContent='Crédits ajoutés.';await load();tab('wal')}catch(x){st.textContent=x.message}return}
 const cp=e.target.closest('[data-copy]');if(cp){const i=$(cp.dataset.copy);i.select();try{await navigator.clipboard.writeText(i.value);cp.textContent='Copié ✓'}catch(x){document.execCommand('copy')}setTimeout(()=>cp.textContent='Copier',1800);return}
 const ca=e.target.closest('[data-cancel]');if(ca){if(!confirm('Annuler cette campagne ? Les messages non envoyés seront remboursés en crédits.'))return;try{await api('/api/depute/campagne/annuler',{id:+ca.dataset.cancel});await load();tab('camp')}catch(x){alert(x.message)}return}
 const tb=e.target.closest('#tabs button');if(tb)tab(tb.dataset.t);
 const dl=e.target.closest('[data-delct]');if(dl){await api('/api/depute/contacts/supprimer',{id:+dl.dataset.delct});loadContacts();load().then(()=>tab('ct'))}});
function tab(t){document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));for(const k of ['res','camp','wal','ct','prof'])$('t-'+k).style.display=k===t?'block':'none';if(t==='ct')loadContacts()}
async function loadContacts(){const l=await api('/api/depute/contacts');$('ct-n').textContent='('+l.length+')';$('cts').innerHTML='<tr><th>Nom</th><th>Téléphone</th><th>E-mail</th><th></th></tr>'+(l.map(c=>`<tr><td>${esc(c.nom)}</td><td>${esc(c.telephone||'')}</td><td>${esc(c.email||'')}</td><td><button class="btn btn-outline sm" data-delct="${c.id}">Retirer</button></td></tr>`).join('')||'<tr><td colspan="4">Aucun contact.</td></tr>')}
$('i-go').onclick=async()=>{const st=$('i-st');st.style.color='#b3261e';
 const contacts=$('i-txt').value.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const p=l.split(/[,;\t]/).map(x=>x.trim());let nom='',tel='',mail='';for(const x of p){if(x.includes('@'))mail=x;else if(/^[+\d][\d\s().-]{6,}$/.test(x))tel=x;else if(!nom)nom=x}return{nom,telephone:tel,email:mail}});
 if(!contacts.length){st.textContent='Collez au moins un contact.';return}
 try{const r=await api('/api/depute/contacts/importer',{consentement:$('i-ok').checked,contacts});st.style.color='#1b7a3d';st.textContent=`${r.ajoutes} ajouté(s), ${r.doublons} doublon(s), ${r.invalides} invalide(s).`;$('i-txt').value='';await load();tab('ct')}catch(e){st.textContent=e.message}};
$('pf-form').addEventListener('submit',async e=>{e.preventDefault();const st=$('p-st');st.style.color='#b3261e';
 const reseaux={};document.querySelectorAll('[data-r]').forEach(i=>{if(i.value.trim())reseaux[i.dataset.r]=i.value.trim()});
 try{const f=$('p-photo').files[0];
  if(f){if(f.size>2*1048576)throw new Error('Photo : 2 Mo maximum.');const img=await new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=ko;r.readAsDataURL(f)});await api('/api/depute/photo',{image:img})}
  await api('/api/depute/profil',{slogan:$('p-slogan').value,bio:$('p-bio').value,profession:$('p-prof').value,couleur:$('p-col').value,couverture:$('p-cov').value,reseaux});
  st.style.color='#1b7a3d';st.textContent='Profil enregistré.';$('p-photo').value='';await load();tab('prof')}catch(x){st.textContent=x.message}});
$('p-msgs').onchange=async()=>{try{await api('/api/moi/consentement',{accepte_messages:$('p-msgs').checked})}catch(e){alert(e.message)}};
$('out').onclick=async()=>{await api('/api/logout',{});location.href='index.html'};
const pr=new URLSearchParams(location.search).get('paiement');
load().then(()=>{if(pr){tab('wal');$('w-st').style.color='#1b7a3d';$('w-st').textContent='Paiement en cours de confirmation : votre solde sera mis à jour dans un instant.';setTimeout(load,6000)}});
