const $=id=>document.getElementById(id);let rows=[];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(p,body){const r=await fetch(p,{method:body?'POST':'GET',headers:{'x-admin-token':sessionStorage.getItem('adm')||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error);return j}
async function load(){$('err').textContent='';
 try{rows=await api('/api/admin/membres');const c=await api('/api/admin/candidatures');
 $('cnt').textContent='('+rows.length+')';
 $('tm').innerHTML='<tr><th>N°</th><th>Nom</th><th>Contact</th><th>Province</th><th>Type</th><th>Statut</th><th></th></tr>'+rows.map(m=>`<tr><td><b>${m.numero}</b></td><td>${esc(m.prenom)} ${esc(m.nom)}</td><td>${esc(m.email)}<br>${esc(m.telephone)}</td><td>${esc(m.province)}<br>${esc(m.ville)}</td><td>${esc(m.type)}</td><td>${esc(m.statut)}</td><td><button class="btn btn-primary sm" data-n="${m.numero}" data-s="valide">Valider</button> <button class="btn btn-outline sm" data-n="${m.numero}" data-s="refuse">Refuser</button></td></tr>`).join('');
 $('tc').innerHTML='<tr><th>Membre</th><th>Province / circ.</th><th>Profil</th><th>Motivation</th><th>Statut</th><th></th></tr>'+c.map(x=>`<tr><td>${x.numero}<br>${esc(x.prenom)} ${esc(x.nom)}<br>${esc(x.email)}</td><td>${esc(x.province)}<br>${esc(x.circonscription)}</td><td>${esc(x.profession)}</td><td>${esc(x.motivation)}</td><td>${esc(x.statut)}</td><td><button class="btn btn-primary sm" data-c="${x.id}" data-s="retenue">Retenir</button> <button class="btn btn-outline sm" data-c="${x.id}" data-s="refusee">Refuser</button></td></tr>`).join('');
 }catch(e){$('err').textContent=e.message}}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-s]');if(!b)return;
 try{await api(b.dataset.n?'/api/admin/membre':'/api/admin/candidature',b.dataset.n?{numero:+b.dataset.n,statut:b.dataset.s}:{id:+b.dataset.c,statut:b.dataset.s});load()}catch(x){$('err').textContent=x.message}});
$('go').onclick=()=>{sessionStorage.setItem('adm',$('tok').value);load()};
$('csv').onclick=()=>{const h=['numero','prenom','nom','email','telephone','pays','ville','province','type','statut','cree_le'];
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const t=[h.join(',')].concat(rows.map(r=>h.map(k=>q(r[k])).join(','))).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+t],{type:'text/csv'}));a.download='membres-21defis.csv';a.click()};
if(sessionStorage.getItem('adm'))load();
