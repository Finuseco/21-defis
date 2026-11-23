I18N.extend({'a.h1':'Become a member','a.lead':'Fill in the form: you immediately get your member number, then your card once validated.','a.fn':'First name','a.ln':'Last name','a.em':'E-mail','a.tel':'Phone (WhatsApp)','a.co':'Country of residence','a.ci':'City','a.pr':'Province of origin or residence','a.pr0':'— Choose —','a.type':'Membership type','a.p1':'Member','a.p1d':'Take part and vote','a.p2':'Supporter','a.p2d':'Follow our actions','a.p3':'Volunteer','a.p3d':'Give your time','a.msg':'Why are you joining? (optional)','a.ch':'I support the values and statutes of the Les 21 Défis party.','a.rg':'I agree that my data is used to manage my membership. I can ask for its deletion at any time.','a.send':'Send my request','a.ok':'Welcome to the movement!','a.okd':'Your member number:','a.okn':'Keep it with your e-mail: they let you view your card once your membership is validated.','a.card':'View my card','a.b':'Member benefits','a.bd':'Numbered member card · meetings in your province · training and workshops · vote at assemblies · possibility to run as a party MP · priority information.','a.sup':'Support the movement','a.supd':'[To complete] Ways to pay fees and donate (bank transfer, mobile money, etc.).','a.err':'Please fill in the required fields and tick both boxes.'});
const sel=document.getElementById('province');PROVINCES.forEach(p=>sel.insertAdjacentHTML('beforeend',`<option>${p}</option>`));
const form=document.getElementById('adhesion-form'),st=document.getElementById('form-status');
form.addEventListener('submit',async e=>{
  e.preventDefault();st.style.color='#b3261e';
  if(!form.checkValidity()){st.textContent=I18N.t('a.err','Merci de remplir les champs obligatoires et de cocher les deux cases.');return;}
  const d=Object.fromEntries(new FormData(form).entries());d.charte=!!d.charte;d.rgpd=!!d.rgpd;
  try{
    const r=await fetch(window.DEFIS.ADHESION_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(d)});
    const j=await r.json();if(!r.ok)throw new Error(j.error||'Erreur');
    form.style.display='none';document.getElementById('done').style.display='block';document.getElementById('done-num').textContent=j.numero;
  }catch(err){st.textContent=err.message;}
});
