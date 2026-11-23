/* Écran de transition : logo au centre + anneau tricolore (bleu / jaune / rouge) qui tourne pendant le changement de page. */
(function(){
  var d=document,el=d.createElement('div');el.id='page-loader';el.setAttribute('aria-hidden','true');
  el.innerHTML='<div class="pl-wrap"><svg class="pl-ring" viewBox="0 0 120 120"><circle class="a" cx="60" cy="60" r="54"/><circle class="b" cx="60" cy="60" r="54"/><circle class="c" cx="60" cy="60" r="54"/></svg><img src="public/images/logo.jpg" alt=""></div>';
  d.body.insertBefore(el,d.body.firstChild);
  var shown=Date.now(),hide=function(){var w=Math.max(0,450-(Date.now()-shown));setTimeout(function(){el.classList.add('out')},w)};
  if(d.readyState==='complete')hide();else addEventListener('load',hide);
  addEventListener('pageshow',function(e){if(e.persisted)el.classList.add('out')});
  d.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href]');
    if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.button||a.target==='_blank'||a.hasAttribute('download'))return;
    var u=new URL(a.href,location.href);
    if(u.origin!==location.origin||(u.pathname===location.pathname&&u.search===location.search))return;
    e.preventDefault();el.classList.remove('out');
    setTimeout(function(){location.href=u.href},380);
  });
  setTimeout(function(){el.classList.add('out')},6000); // sécurité
})();
