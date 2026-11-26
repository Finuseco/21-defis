const $=id=>document.getElementById(id);
const dep=(d,suivi)=>`<div class="dep"><div class="av" style="${d.photo?`background-image:url('${esc(d.photo)}')`:''}">${d.photo?'':esc((d.prenom[0]||'')+(d.nom[0]||''))}</div><div class="grow"><h3>${esc(d.prenom)} ${esc(d.nom)}</h3><small>${GRADE[d.grade]||''} · ${esc(d.province||'')} · <span data-ab="${d.numero}">${d.abonnes}</span> abonné(s)</small></div><button class="btn ${suivi?'btn-outline':'btn-red'} sm" data-s="${d.numero}" data-on="${suivi?1:0}">${suivi?'Abonné':'Suivre'}</button></div>`;
async function init(){
 let d;try{d=await api('/api/moi')}catch(e){if(e.status===401){location.href='connexion.html';return}$('err').textContent=e.message;return}
 const m=d.membre;$('app').style.display='block';$('consent').checked=!!m.accepte_messages;
 $('c-num').textContent=m.numero;$('c-name').textContent=m.prenom+' '+m.nom;
 $('c-meta').textContent=GRADE[m.grade]+(m.province?' · '+m.province:'');
 const st=$('c-st');st.textContent=m.statut==='valide'?'Membre validé':m.statut==='refuse'?'Adhésion refusée':'En attente de validation';st.className='mc-status'+(m.statut==='valide'?' ok':'');
 $('s-m').textContent=d.stats.membres.toLocaleString('fr-FR');$('s-d').textContent=d.stats.deputes.toLocaleString('fr-FR');
 if(d.ma_province)$('s-prov').innerHTML=`<b>${esc(m.province)}</b> : ${d.ma_province.membres} membre(s), ${d.ma_province.deputes} député(s).`;
 const c=d.candidature;$('cand-t').innerHTML=m.grade!=='membre'?`Vous êtes <b>${GRADE[m.grade]}</b>.`:c?`Candidature (${esc(c.province)}) : <b>${{en_attente:'en cours d’examen',retenue:'retenue',refusee:'non retenue'}[c.statut]}</b>.`:`<a href="devenir-depute.html" style="color:var(--blue);font-weight:700">Déposer ma candidature</a> pour représenter le parti.`;
 if(m.grade!=='membre'){$('prof').style.display='block';$('nb-abo').textContent=d.abonnes;}
 const suivis=new Set(d.suivis.map(x=>x.numero));
 $('t-prov').innerHTML=m.province?(d.deputes_province.length?`<div class="grid">${d.deputes_province.map(x=>dep(x,suivis.has(x.numero))).join('')}</div>`:'<p>Aucun député dans votre province pour le moment.</p>'):'<p>Aucune province renseignée sur votre profil.</p>';
 $('t-suivis').innerHTML=d.suivis.length?`<div class="grid">${d.suivis.map(x=>dep(x,true)).join('')}</div>`:'<p>Vous ne suivez encore aucun député. Découvrez-les dans <a href="deputes.html" style="color:var(--blue);font-weight:700">la liste des députés</a>.</p>';
 try{const f=await api('/api/defis');$('t-defis').innerHTML=f.defis.map(x=>`<div class="defi-item"><b>${String(x.n).padStart(2,'0')}</b><div><h3>${esc(x.titre)}</h3><p>${esc(x.texte)}</p></div></div>`).join('');
  $('t-chemin').innerHTML=f.chemin.map(p=>`<p style="margin-bottom:14px">${esc(p)}</p>`).join('')}
 catch(e){$('t-defis').innerHTML=`<div class="card lock"><div class="ico"><i class="fa-solid fa-lock"></i></div><h3>Défis réservés aux membres validés</h3><p>${esc(e.message)}</p></div>`}
}
document.addEventListener('click',async e=>{
 const t=e.target.closest('.tabs button');if(t){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b===t));['defis','chemin','prov','suivis'].forEach(k=>$('t-'+k).style.display=k===t.dataset.t?'block':'none');return}
 const s=e.target.closest('button[data-s]');if(s){try{const r=await api('/api/suivre',{numero:+s.dataset.s,suivre:s.dataset.on!=='1'});const on=s.dataset.on!=='1';s.dataset.on=on?1:0;s.textContent=on?'Abonné':'Suivre';s.className='btn '+(on?'btn-outline':'btn-red')+' sm';document.querySelectorAll(`[data-ab="${s.dataset.s}"]`).forEach(x=>x.textContent=r.abonnes)}catch(x){alert(x.message)}}});
$('out').onclick=async()=>{await api('/api/logout',{});location.href='index.html'};
$('consent').onchange=async()=>{try{await api('/api/moi/consentement',{accepte_messages:$('consent').checked})}catch(e){alert(e.message)}};
init();
