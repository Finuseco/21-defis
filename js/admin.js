const $=id=>document.getElementById(id);let rows=[],arts=[];
async function A(p,b){const r=await fetch(p,{method:b?'POST':'GET',headers:{'x-admin-token':sessionStorage.getItem('adm')||'','Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error);return j}
const gsel=m=>`<select data-g="${m.numero}">${Object.entries(GRADE).map(([k,v])=>`<option value="${k}"${m.grade===k?' selected':''}>${v}</option>`).join('')}</select>`;
async function load(){$('err').textContent='';
 try{rows=await A('/api/admin/membres');const c=await A('/api/admin/candidatures');arts=await A('/api/admin/articles');
 $('cnt').textContent='('+rows.length+')';
 $('tm').innerHTML='<tr><th>N°</th><th>Nom</th><th>Contact</th><th>Province</th><th>Grade</th><th>Statut</th><th></th></tr>'+rows.map(m=>`<tr><td><b>${m.numero}</b></td><td>${esc(m.prenom)} ${esc(m.nom)}</td><td>${esc(m.email)}<br>${esc(m.telephone)}</td><td>${esc(m.province)}<br>${esc(m.ville)}</td><td>${gsel(m)}</td><td>${esc(m.statut)}</td><td><button class="btn btn-primary sm" data-n="${m.numero}" data-s="valide">Valider</button> <button class="btn btn-outline sm" data-n="${m.numero}" data-s="refuse">Refuser</button></td></tr>`).join('');
 $('tc').innerHTML='<tr><th>Membre</th><th>Province / circ.</th><th>Profil</th><th>Motivation</th><th>Statut</th><th></th></tr>'+c.map(x=>`<tr><td>${x.numero}<br>${esc(x.prenom)} ${esc(x.nom)}<br>${esc(x.email)}</td><td>${esc(x.province)}<br>${esc(x.circonscription)}</td><td>${esc(x.profession)}</td><td>${esc(x.motivation)}</td><td>${esc(x.statut)}</td><td><button class="btn btn-primary sm" data-c="${x.id}" data-s="retenue">Retenir (devient député)</button> <button class="btn btn-outline sm" data-c="${x.id}" data-s="refusee">Refuser</button></td></tr>`).join('');
 $('ta').innerHTML='<tr><th>Titre</th><th>Catégorie</th><th>Statut</th><th></th></tr>'+arts.map(a=>`<tr><td>${esc(a.titre)}</td><td>${esc(a.categorie)}</td><td>${a.publie?'Publié':'Brouillon'}</td><td><button class="btn btn-outline sm" data-e="${a.id}">Modifier</button> <button class="btn btn-outline sm" data-x="${a.id}">Supprimer</button></td></tr>`).join('');
 }catch(e){$('err').textContent=e.message}}
document.addEventListener('click',async e=>{try{
 const b=e.target.closest('button[data-s]');if(b){await A(b.dataset.n?'/api/admin/membre':'/api/admin/candidature',b.dataset.n?{numero:+b.dataset.n,statut:b.dataset.s}:{id:+b.dataset.c,statut:b.dataset.s});load();return}
 const x=e.target.closest('button[data-x]');if(x&&confirm('Supprimer cet article ?')){await A('/api/admin/article/supprimer',{id:+x.dataset.x});load();return}
 const m=e.target.closest('button[data-e]');if(m){const a=arts.find(z=>z.id==m.dataset.e);$('aid').value=a.id;$('at').value=a.titre;$('ac').value=a.categorie;$('ai').value=a.image||'';$('ar').value=a.resume||'';$('ax').value=a.contenu;$('ap').checked=!!a.publie;scrollTo(0,$('af').offsetTop)}
}catch(x){$('err').textContent=x.message}});
document.addEventListener('change',async e=>{const s=e.target.closest('select[data-g]');if(!s)return;try{const m=rows.find(r=>r.numero==s.dataset.g);await A('/api/admin/grade',{numero:+s.dataset.g,grade:s.value,province:m.province||undefined});load()}catch(x){$('err').textContent=x.message}});
$('af').addEventListener('submit',async e=>{e.preventDefault();try{await A('/api/admin/article',{id:+$('aid').value||undefined,titre:$('at').value,categorie:$('ac').value,image:$('ai').value,resume:$('ar').value,contenu:$('ax').value,publie:$('ap').checked});$('af').reset();$('aid').value='';load()}catch(x){$('err').textContent=x.message}});
$('anew').onclick=()=>{$('af').reset();$('aid').value=''};
$('go').onclick=()=>{sessionStorage.setItem('adm',$('tok').value);load()};
$('csv').onclick=()=>{const h=['numero','prenom','nom','email','telephone','pays','ville','province','grade','statut','cree_le'];const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const t=[h.join(',')].concat(rows.map(r=>h.map(k=>q(r[k])).join(','))).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+t],{type:'text/csv'}));a.download='membres-21defis.csv';a.click()};
if(sessionStorage.getItem('adm'))load();
