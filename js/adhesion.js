I18N.extend({'a.h1':'Become a member','a.lead':'Fill in the form: we will confirm your membership shortly.','a.fn':'First name','a.ln':'Last name','a.em':'E-mail','a.tel':'Phone','a.co':'Country','a.ci':'City','a.type':'Membership type','a.p1':'Member','a.p1d':'Take part and vote','a.p2':'Supporter','a.p2d':'Follow our actions','a.p3':'Volunteer','a.p3d':'Give your time','a.msg':'Why are you joining? (optional)','a.ch':'I support the values and statutes of the movement.','a.rg':'I agree that my data is used to manage my membership. I can ask for its deletion at any time.','a.send':'Send my request','a.sup':'Support the movement','a.supd':'[To complete] Ways to pay fees and donate (bank transfer, mobile money, etc.).','a.ok':'Thank you! Your request was sent.','a.err':'Please fill in the required fields.','a.fail':'Sending failed, please try again.'});
const form=document.getElementById('adhesion-form'),status=document.getElementById('form-status');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.checkValidity()){status.style.color='#b3261e';status.textContent=I18N.t('a.err','Merci de remplir les champs obligatoires.');return;}
  const data=Object.fromEntries(new FormData(form).entries());
  const url=window.DEFIS.ADHESION_ENDPOINT;
  if(!url){ // Sans backend : ouvre le courriel pré-rempli
    const body=Object.entries(data).map(([k,v])=>k+' : '+v).join('\n');
    location.href='mailto:'+window.DEFIS.EMAIL+'?subject='+encodeURIComponent('Adhésion 21 Défis')+'&body='+encodeURIComponent(body);
    return;
  }
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!r.ok)throw 0;form.reset();status.style.color='#1b7a3d';status.textContent=I18N.t('a.ok','Merci ! Votre demande a bien été envoyée.');
  }catch(_){status.style.color='#b3261e';status.textContent=I18N.t('a.fail','Échec de l’envoi, réessayez.');}
});
