/* En-tête et pied de page partagés. Réglages à modifier : */
(function(){
  const SITE={NAME:'Les 21 Défis',EMAIL:'contact@21defis.com',ADHESION_ENDPOINT:'/api/adhesion'}; // ADHESION_ENDPOINT : URL d'un backend (POST JSON). Vide = envoi par e-mail.
  window.DEFIS=SITE;
  I18N.extend({'nav.home':'Home','nav.vision':'Vision','nav.defis':'The 21 challenges','nav.join':'Join us','nav.contact':'Contact','nav.prog':'Programme','nav.dep':'Become an MP','nav.card':'My card',
    'foot.about':'For a future and prosperous Congo. Youth first.','foot.nav':'Navigation','foot.act':'Get involved','foot.contact':'Contact',
    'foot.member':'Become a member','foot.donate':'Support the movement','foot.rights':'All rights reserved.','foot.legal':'Political party'});
  const page=document.body.dataset.page;
  const link=(h,k,fr,id)=>`<li><a href="${h}" class="${page===id?'active':''}" data-i18n="${k}">${fr}</a></li>`;
  document.getElementById('site-header').innerHTML=`<div class="container nav">
    <a class="brand" href="index.html"><img src="public/images/logo.jpg" alt="Logo 21 Défis"><span>${SITE.NAME}</span></a>
    <ul class="nav-links" id="nav-links">${link('index.html','nav.home','Accueil','home')}${link('vision.html','nav.vision','Vision','vision')}${link('defis.html','nav.defis','Les 21 défis','defis')}${link('programme.html','nav.prog','Programme','prog')}${link('deputes.html','nav.dep','Devenir député','dep')}${link('carte.html','nav.card','Ma carte','card')}${link('contact.html','nav.contact','Contact','contact')}</ul>
    <div class="nav-cta"><div class="lang" role="group" aria-label="Langue"><button type="button" data-lang="fr">FR</button><button type="button" data-lang="en">EN</button></div>
    <a class="btn btn-primary" href="adhesion.html" data-i18n="nav.join">Adhérer</a>
    <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Menu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button></div></div>`;
  document.getElementById('site-footer').innerHTML=`<div class="container"><div class="foot-grid">
    <div><a class="brand" href="index.html" style="color:#fff"><img src="public/images/logo.jpg" alt="Logo 21 Défis"><span>${SITE.NAME}</span></a><p style="margin-top:14px;font-size:14.5px" data-i18n="foot.about">Pour un Congo futur et prospère. La jeunesse avant tout.</p></div>
    <div><h4 data-i18n="foot.nav">Navigation</h4><ul><li><a href="vision.html" data-i18n="nav.vision">Vision</a></li><li><a href="defis.html" data-i18n="nav.defis">Les 21 défis</a></li><li><a href="programme.html" data-i18n="nav.prog">Programme</a></li><li><a href="deputes.html" data-i18n="nav.dep">Devenir député</a></li></ul></div>
    <div><h4 data-i18n="foot.act">S'engager</h4><ul><li><a href="adhesion.html" data-i18n="foot.member">Devenir membre</a></li><li><a href="carte.html" data-i18n="nav.card">Ma carte</a></li><li><a href="adhesion.html#soutien" data-i18n="foot.donate">Soutenir le mouvement</a></li></ul></div>
    <div><h4 data-i18n="foot.contact">Contact</h4><ul><li><a href="mailto:${SITE.EMAIL}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${SITE.EMAIL}</a></li><li><a href="contact.html">Contact</a></li></ul></div></div>
    <div class="foot-bottom"><span>© ${new Date().getFullYear()} ${SITE.NAME} — <span data-i18n="foot.rights">Tous droits réservés.</span></span><span data-i18n="foot.legal">Parti politique</span></div></div>`;
  const t=document.getElementById('menu-toggle');t.addEventListener('click',()=>document.getElementById('nav-links').classList.toggle('open'));
  document.querySelectorAll('.lang button').forEach(b=>b.addEventListener('click',()=>I18N.apply(b.dataset.lang)));
  document.addEventListener('DOMContentLoaded',()=>I18N.apply(I18N.initial()));
  if(document.readyState!=='loading')I18N.apply(I18N.initial());
})();
