const sel=document.getElementById('province');PROVINCES.forEach(p=>sel.insertAdjacentHTML('beforeend',`<option>${p}</option>`));
const form=document.getElementById('adhesion-form'),st=document.getElementById('form-status'),fi=document.getElementById('pf'),prev=document.getElementById('pprev');
const ref=new URLSearchParams(location.search).get('d')||'';
if(ref)api('/api/depute?c='+encodeURIComponent(ref)).then(p=>{const b=document.getElementById('parrain');b.style.display='block';b.innerHTML='<i class="fa-solid fa-user-check"></i> Vous rejoignez le mouvement sur l’invitation de <b>'+esc(p.prenom+' '+p.nom)+'</b>, député. Vous le suivrez automatiquement.';}).catch(()=>{});
const toDataUrl=f=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=ko;r.readAsDataURL(f)});
fi.addEventListener('change',()=>{const f=fi.files[0];prev.style.display='none';if(f&&f.type.startsWith('image/')){prev.src=URL.createObjectURL(f);prev.style.display='block';}});
form.addEventListener('submit',async e=>{
  e.preventDefault();st.style.color='#b3261e';
  if(!form.checkValidity()){st.textContent='Merci de remplir tous les champs obligatoires et de cocher les cases requises.';return;}
  const f=fi.files[0];if(!f){st.textContent='Ajoutez la photo ou le scan de votre pièce d’identité.';return;}
  if(f.size>5*1048576){st.textContent='La pièce dépasse 5 Mo.';return;}
  const d=Object.fromEntries(new FormData(form).entries());delete d.undefined;d.charte=!!d.charte;d.rgpd=!!d.rgpd;d.accepte_messages=!!d.accepte_messages;if(ref)d.d=ref;
  const btn=form.querySelector('button[type=submit]');btn.disabled=true;st.style.color='#1f3a9c';st.textContent='Envoi en cours…';
  try{
    d.piece_image=await toDataUrl(f);
    const j=await api('/api/adhesion',d);
    form.style.display='none';document.getElementById('done').style.display='block';document.getElementById('done-num').textContent=j.numero;
  }catch(err){st.style.color='#b3261e';st.textContent=err.message;btn.disabled=false;}
});
