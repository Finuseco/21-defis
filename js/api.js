/* Petit client pour l'API (cookie de session HttpOnly). */
window.api = async (path, body) => {
  const r = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(j.error || 'Erreur'); e.status = r.status; throw e; }
  return j;
};
window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.GRADE = { membre: 'Membre', depute: 'Député', coordinateur: 'Coordinateur provincial', candidat: 'Candidat à la présidentielle' };
window.CAT = { actualite: 'Actualité', politique: 'Politique', visite: 'Visite', evenement: 'Événement' };
