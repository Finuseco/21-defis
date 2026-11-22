/* Liste des 21 défis : remplacez les titres/descriptions par le contenu réel du mouvement. */
const DEFIS=[]; for(let i=1;i<=21;i++)DEFIS.push({t:'Défi '+i,d:'[À compléter] Description du défi '+i+'.'});
I18N.extend({'d.h1':'The 21 challenges','d.lead':'Our roadmap, challenge after challenge.'});
document.getElementById('defis-list').innerHTML=DEFIS.map((x,i)=>`<article class="card"><div class="num">${String(i+1).padStart(2,'0')} / 21</div><h3 data-i18n="d.t${i+1}">${x.t}</h3><p data-i18n="d.p${i+1}">${x.d}</p></article>`).join('');
DEFIS.forEach((x,i)=>I18N.extend({['d.t'+(i+1)]:'Challenge '+(i+1),['d.p'+(i+1)]:'[To complete] Description of challenge '+(i+1)+'.'}));
