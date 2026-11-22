/* FR par défaut (dans le HTML) ; EN via data-i18n="clé" / data-i18n-ph="clé". */
(function(){
  const EN={};const state={lang:'fr',en:EN};
  function apply(lang){
    state.lang=lang==='en'?'en':'fr';
    try{localStorage.setItem('defis-lang',state.lang)}catch(e){}
    document.documentElement.lang=state.lang;
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      if(!el.hasAttribute('data-fr'))el.setAttribute('data-fr',el.innerHTML);
      const k=el.getAttribute('data-i18n');
      el.innerHTML=(state.lang==='en'&&state.en[k]!==undefined)?state.en[k]:el.getAttribute('data-fr');
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
      if(!el.hasAttribute('data-fr-ph'))el.setAttribute('data-fr-ph',el.getAttribute('placeholder')||'');
      const k=el.getAttribute('data-i18n-ph');
      el.setAttribute('placeholder',(state.lang==='en'&&state.en[k]!==undefined)?state.en[k]:el.getAttribute('data-fr-ph'));
    });
    document.querySelectorAll('.lang button').forEach(b=>b.classList.toggle('active',b.dataset.lang===state.lang));
  }
  window.I18N={apply,extend(o){Object.assign(state.en,o)},t(k,fr){return state.lang==='en'&&state.en[k]!==undefined?state.en[k]:fr},get lang(){return state.lang},
    initial(){let l='fr';try{l=localStorage.getItem('defis-lang')||'fr'}catch(e){}return l}};
})();
