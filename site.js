// =====================================================================
// RÉGLAGES : les 3 seules lignes à remplir / modifier (pour tout le site)
// =====================================================================
const APPLI = 'https://foodupsolution.onrender.com';   // adresse de l'application
const AIRTABLE_BASE = 'appnLn9BMS3IQsu4B';             // identifiant de la base (commence par "app")
const AIRTABLE_JETON = 'patDJb0gkiIl1SKbF.413eab40ed281e6427e807d5855c8accf05956ebf1649964b6f18766c39ae032';            // jeton en lecture seule (commence par "pat")

  // Liens vers l'appli. Les boutons d'inscription ouvrent directement
// la fenêtre de création de compte avec le bon profil.
const LIENS = {
  appli: APPLI + '/?connexion',
  client: APPLI + '/?inscription=client',
  restaurateur: APPLI + '/?inscription=restaurateur',
  livreur: APPLI + '/?inscription=livreur',
};
document.querySelectorAll('[data-lien]').forEach(a => { a.href = LIENS[a.dataset.lien]; });
document.getElementById('annee').textContent = new Date().getFullYear();

const txt = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const oui = v => v === true || v === 'Oui';
const photoValide = v => typeof v === 'string' && /^https?:\/\//.test(v.trim()) ? v.trim() : '';

// Lit toutes les lignes d'une table Airtable (envoyées par paquets de 100)
async function lireTable(table) {
  let lignes = [], suite = '';
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(table)}?pageSize=100` + (suite ? `&offset=${suite}` : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + AIRTABLE_JETON } });
    if (!r.ok) throw new Error('Airtable a répondu ' + r.status);
    const d = await r.json();
    lignes = lignes.concat(d.records || []);
    suite = d.offset || '';
  } while (suite);
  return lignes;
}

const liste = document.getElementById('restos-liste');
const fenetre = document.getElementById('menu-resto');
const euros = n => Number(n || 0).toFixed(2).replace('.', ',') + ' €';
let restos = [];
let tousLesPlats = null; // chargés une seule fois, au premier clic sur un resto

// Nombre de restos à afficher : indiqué sur la page (data-nombre="3" sur l'accueil).
// Sans indication (page « Tous les restos »), on les affiche tous.
const nombre = Number(liste?.dataset.nombre) || 0;

// Mélange une liste au hasard (pour varier les restos de l'accueil)
const melanger = l => l.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);

if (liste) lireTable('Restaurants')
  .then(lignes => {
    const tous = lignes
      .map(rec => ({
        rec: rec.id,                                  // identifiant Airtable (rec…)
        id: rec.fields.restaurant_id || rec.id,       // identifiant FoodUp (RST-…)
        nom: rec.fields.nom_restaurant || '',
        quartier: rec.fields.quartier || '',
        description: rec.fields.description || rec.fields.accroche || '',
        photo: photoValide(rec.fields.image_url),
        ouvert: oui(rec.fields.disponible_commandes),
      }))
      .filter(r => r.nom && r.ouvert)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    if (!tous.length) throw new Error('Aucun restaurant');

    // Accueil : quelques restos au hasard (en priorité ceux qui ont une photo). Page dédiée : tous.
    restos = nombre ? melanger(tous.filter(r => r.photo)).concat(tous.filter(r => !r.photo)).slice(0, nombre) : tous;

    liste.innerHTML = restos.map((r, i) => `
      <button type="button" class="resto" data-index="${i}" aria-haspopup="dialog">
        <div class="resto-photo">${r.photo ? `<img src="${txt(r.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
        <strong>${txt(r.nom)}</strong>
        ${r.quartier ? `<span>${txt(r.quartier)}</span>` : ''}
      </button>`).join('');

    // Nombre total de restos (bouton de l'accueil et titre de la page dédiée)
    document.querySelectorAll('.nombre-restos').forEach(el => { el.textContent = tous.length; });

    // Accueil : les photos des restos affichés remplissent les ronds du haut de page
    const ronds = document.querySelectorAll('.photos .rond');
    restos.filter(r => r.photo).slice(0, ronds.length).forEach((r, i) => {
      ronds[i].innerHTML = `<img src="${txt(r.photo)}" alt="" onerror="this.remove()">`;
    });
  })
  .catch(() => {
    liste.innerHTML = `<div class="etat">Les restos s'affichent dans l'application.<br><a class="btn btn-orange" href="${LIENS.appli}">Voir les restos</a></div>`;
  });

// Clic sur un resto : ouvre la fenêtre avec son menu
liste?.addEventListener('click', e => {
  const carte = e.target.closest('.resto');
  if (carte) ouvrirMenu(restos[carte.dataset.index]);
});

async function ouvrirMenu(r) {
  document.getElementById('menu-photo').querySelector('img')?.remove();
  if (r.photo) document.getElementById('menu-photo').insertAdjacentHTML('afterbegin', `<img src="${txt(r.photo)}" alt="" onerror="this.remove()">`);
  document.getElementById('menu-nom').textContent = r.nom;
  document.getElementById('menu-quartier').textContent = r.quartier;
  document.getElementById('menu-description').textContent = r.description;
  const zone = document.getElementById('menu-plats');
  zone.innerHTML = '<p class="menu-attente">Chargement du menu…</p>';
  fenetre.showModal();

  try {
    tousLesPlats ||= await lireTable('Plats');
    // Le lien plat → restaurant peut être un lien Airtable (rec…) ou un identifiant texte (RST-…)
    const plats = tousLesPlats.filter(p => {
      const lien = p.fields.restaurant_id;
      const liens = Array.isArray(lien) ? lien : [lien];
      return (liens.includes(r.rec) || liens.includes(r.id)) && oui(p.fields.disponible);
    });
    if (!plats.length) { zone.innerHTML = '<p class="menu-attente">Le menu arrive bientôt.</p>'; return; }

    const ordre = ['Entrées', 'Plats', 'Desserts', 'Boissons'];
    const rang = c => { const i = ordre.indexOf(c); return i < 0 ? 99 : i; };
    const parCategorie = {};
    plats.forEach(p => { const c = p.fields.categorie || 'Plats'; (parCategorie[c] ||= []).push(p.fields); });

    zone.innerHTML = Object.keys(parCategorie).sort((a, b) => rang(a) - rang(b)).map(c =>
      `<h4>${txt(c)}</h4>` + parCategorie[c].map(p => `
        <div class="plat">
          <div><strong>${txt(p.nom_plat)}</strong>${p.description ? `<small>${txt(p.description)}</small>` : ''}</div>
          <span class="prix">${euros(p.prix)}</span>
        </div>`).join('')
    ).join('');
  } catch {
    zone.innerHTML = '<p class="menu-attente">Le menu ne peut pas s\'afficher ici. Retrouvez-le dans l\'appli.</p>';
  }
}

// Fermeture : bouton, touche Échap (gérée par le navigateur) ou clic à côté
document.getElementById('menu-fermer').addEventListener('click', () => fenetre.close());
fenetre.addEventListener('click', e => { if (e.target === fenetre) fenetre.close(); });

// FAQ : une seule question ouverte à la fois
document.querySelectorAll('details[name="faq"]').forEach(q => {
  q.addEventListener('toggle', () => {
    if (q.open) document.querySelectorAll('details[name="faq"]').forEach(autre => { if (autre !== q) autre.open = false; });
  });
});
