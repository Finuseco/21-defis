/* En-tête et pied de page partagés. Réglages : */
(function(){
  const SITE={NAME:'Les 21 Défis',EMAIL:'contact@21defis.com',ADHESION_ENDPOINT:'/api/adhesion'};
  window.DEFIS=SITE;
  I18N.extend({'nav.home':'Home','nav.vision':'Vision','nav.patrick':'The candidate','nav.defis':'The 21 challenges','nav.news':'News','nav.law':'Constitution','nav.deputes':'MPs','nav.history':'History','nav.contact':'Contact','nav.join':'Join','nav.login':'Sign in','nav.space':'My space',
    'foot.about':'For a future and prosperous Congo. Youth first.','foot.nav':'Navigation','foot.act':'Get involved','foot.contact':'Contact','foot.member':'Become a member','foot.rights':'All rights reserved.','foot.legal':'Political party'});
  const page=document.body.dataset.page;
  const L=[['index.html','nav.home','Accueil','home'],['vision.html','nav.vision','Vision','vision'],['patrick.html','nav.patrick','Le candidat','patrick'],['defis.html','nav.defis','Les 21 défis','defis'],['constitution.html','nav.law','Constitution','law'],['actualites.html','nav.news','Actualités','news'],['deputes.html','nav.deputes','Députés','deputes'],['histoire.html','nav.history','Histoire','history']];
  const link=x=>`<li><a href="${x[0]}" class="${page===x[3]?'active':''}" data-i18n="${x[1]}">${x[2]}</a></li>`;
  document.getElementById('site-header').innerHTML=`<div class="container nav">
    <a class="brand" href="index.html"><img src="public/images/logo.jpg" alt="Logo 21 Défis"><span>${SITE.NAME}</span></a>
    <ul class="nav-links" id="nav-links">${L.map(link).join('')}</ul>
    <div class="nav-cta"><div class="lang" role="group" aria-label="Langue"><button type="button" data-lang="fr">FR</button><button type="button" data-lang="en">EN</button></div>
    <a class="btn btn-outline" id="nav-login" href="connexion.html" data-i18n="nav.login">Connexion</a>
    <a class="btn btn-primary" id="nav-join" href="adhesion.html" data-i18n="nav.join">Adhérer</a>
    <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Menu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button></div></div>`;
  document.getElementById('site-footer').innerHTML=`<div class="container"><div class="foot-grid">
    <div><a class="brand" href="index.html" style="color:#fff"><img src="public/images/logo.jpg" alt=""><span>${SITE.NAME}</span></a><p style="margin-top:14px;font-size:14.5px" data-i18n="foot.about">Pour un Congo futur et prospère. La jeunesse avant tout.</p></div>
    <div><h4 data-i18n="foot.nav">Navigation</h4><ul><li><a href="vision.html">Vision</a></li><li><a href="patrick.html">Biographie de Patrick</a></li><li><a href="programme.html">Le chemin du gouvernement</a></li><li><a href="constitution.html">Constitution et droits</a></li><li><a href="actualites.html">Actualités</a></li><li><a href="histoire.html">Histoire</a></li></ul></div>
    <div><h4 data-i18n="foot.act">S'engager</h4><ul><li><a href="adhesion.html" data-i18n="foot.member">Devenir membre</a></li><li><a href="connexion.html">Espace membre</a></li><li><a href="devenir-depute.html">Devenir député</a></li><li><a href="deputes.html">Nos députés</a></li></ul></div>
    <div><h4 data-i18n="foot.contact">Contact</h4><ul><li><a href="mailto:${SITE.EMAIL}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${SITE.EMAIL}</a></li><li><a href="contact.html">Contact</a></li></ul></div></div>
    <div class="foot-flag"><svg class="flag" viewBox="0 0 300 200" role="img" aria-label="Drapeau de la République démocratique du Congo"><defs><clipPath id="fc"><rect width="300" height="200" rx="10"/></clipPath></defs><g clip-path="url(#fc)"><rect width="300" height="200" fill="#00a3dd"/><line x1="-20" y1="225" x2="320" y2="-25" stroke="#f7d618" stroke-width="64"/><line x1="-20" y1="225" x2="320" y2="-25" stroke="#ce1021" stroke-width="44"/><polygon fill="#f7d618" points="50,14 59.4,41 88,41.6 65.2,58.8 73.5,86 50,70 26.5,86 34.8,58.8 12,41.6 40.6,41"/></g></svg><span>République démocratique du Congo<br><small>Justice · Paix · Travail</small></span></div>
    <div class="foot-bottom"><span>© ${new Date().getFullYear()} ${SITE.NAME} — <span data-i18n="foot.rights">Tous droits réservés.</span></span><span data-i18n="foot.legal">Parti politique</span></div></div>`;
  document.getElementById('menu-toggle').addEventListener('click',()=>document.getElementById('nav-links').classList.toggle('open'));
  document.querySelectorAll('.lang button').forEach(b=>b.addEventListener('click',()=>I18N.apply(b.dataset.lang)));
  document.addEventListener('DOMContentLoaded',()=>{I18N.apply(I18N.initial());
    fetch('/api/moi',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{ if(!d)return;
      const a=document.getElementById('nav-login');a.href='espace.html';a.setAttribute('data-i18n','nav.space');a.textContent=I18N.t('nav.space','Mon espace');document.getElementById('nav-join').style.display='none';}).catch(()=>{});});
})();
