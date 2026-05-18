// ── FIREBASE REST API ─────────────────────────────────
const FB_BASE = 'https://firestore.googleapis.com/v1/projects/mood-agency/databases/(default)/documents/data';
const FB_KEY = 'AIzaSyDtG-Jbr3iCCXbUaYLHD7kBh2f6jicl8GY';

function toFsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsVal(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}
function fromFsVal(fv) {
  if (!fv) return null;
  if (fv.nullValue !== undefined) return null;
  if (fv.booleanValue !== undefined) return fv.booleanValue;
  if (fv.integerValue !== undefined) return Number(fv.integerValue);
  if (fv.doubleValue !== undefined) return fv.doubleValue;
  if (fv.stringValue !== undefined) return fv.stringValue;
  if (fv.arrayValue) return (fv.arrayValue.values || []).map(fromFsVal);
  if (fv.mapValue) {
    const obj = {};
    for (const [k, v] of Object.entries(fv.mapValue.fields || {})) obj[k] = fromFsVal(v);
    return obj;
  }
  return null;
}
async function fbGet(col) {
  try {
    const r = await fetch(`${FB_BASE}/${col}?key=${FB_KEY}`);
    if (!r.ok) return null;
    const doc = await r.json();
    if (!doc.fields?.items) return null;
    return fromFsVal(doc.fields.items);
  } catch(e) { return null; }
}
async function fbSet(col, items) {
  try {
    await fetch(`${FB_BASE}/${col}?key=${FB_KEY}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { items: toFsVal(items) } })
    });
  } catch(e) { console.error('Firebase set error:', e); }
}

// ── MOOD AGENCY — Instagram Scout ────────────────────
let panelInjected = false;
let lastProfileUrl = '';

const observer = new MutationObserver(() => {
  const url = window.location.href;
  const profileUrl = getProfileUrl(url);
  if (profileUrl && profileUrl !== lastProfileUrl) {
    lastProfileUrl = profileUrl;
    panelInjected = false;
    removePanel();
    setTimeout(tryInject, 1500);
  }
  if (!profileUrl && !isSubPage(url) && panelInjected && !window._moodPinned) {
    removePanel(); panelInjected = false; lastProfileUrl = '';
  }
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(tryInject, 2000);

function getProfileUrl(url) {
  const match = url.match(/instagram\.com\/([^\/\?#]+)/);
  if (!match) return null;
  const u = match[1];
  if (['explore','direct','accounts','stories','p','reel','reels','tv'].includes(u)) return null;
  return 'https://www.instagram.com/' + u + '/';
}
function isProfileOrReelsPage() {
  const path = window.location.pathname;
  // Page principale du profil : /username/
  const isMain = /^\/[^\/]+\/?$/.test(path) &&
    !['/','/explore/','/direct/','/accounts/'].includes(path) &&
    !path.startsWith('/p/') && !path.startsWith('/reel/') &&
    !path.startsWith('/stories/') && !path.startsWith('/explore/') &&
    !path.startsWith('/accounts/');
  // Page reels du profil : /username/reels/
  const isReels = /^\/[^\/]+\/reels\/?$/.test(path);
  return isMain || isReels;
}
function isSubPage(url) {
  return lastProfileUrl && (url.includes('/p/') || url.includes('/reel/') || url.includes('/reels/') || url.includes('/stories/') || url.includes('/tv/'));
}
function isProfilePage() {
  const path = window.location.pathname;
  return /^\/[^\/]+\/?$/.test(path) &&
    !['/','/explore/','/direct/','/accounts/'].includes(path) &&
    !path.startsWith('/p/') && !path.startsWith('/reel/') &&
    !path.startsWith('/reels/') && !path.startsWith('/stories/') &&
    !path.startsWith('/explore/') && !path.startsWith('/accounts/');
}
function tryInject() {
  if (!isProfileOrReelsPage() || panelInjected) return;
  const header = document.querySelector('header') || document.querySelector('main');
  if (!header) { setTimeout(tryInject, 1000); return; }
  panelInjected = true;
  injectPanel();
}
function removePanel() {
  const old = document.getElementById('mood-panel');
  if (old) old.remove();
}

// ── SCRAPE PROFILE ────────────────────────────────────
function scrapeProfile() {
  const data = {};
  const pathParts = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
  data.handle = '@' + pathParts[0];

  // Nom
  const nameEl = document.querySelector('h2') || document.querySelector('h1');
  data.nom = nameEl ? nameEl.innerText.trim() : data.handle.replace('@','');

  // Bio complète
  const bioSelectors = ['div[data-testid="user-description"] span', 'span[class*="_aacl"]', 'div.-vDIg span'];
  let bioEl = null;
  for (const sel of bioSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.length > 5) { bioEl = el; break; }
  }
  if (!bioEl) {
    bioEl = [...document.querySelectorAll('span')].find(el =>
      el.innerText.length > 15 && el.innerText.length < 300 &&
      !el.innerText.match(/^\d/) && !el.innerText.includes('follower'));
  }
  data.bio = bioEl ? bioEl.innerText.trim() : '';

  // Abonnés
  const metaSpans = document.querySelectorAll('span');
  let followers = '—';
  metaSpans.forEach(s => {
    const txt = s.innerText.trim();
    const parent = s.closest('a, li');
    if (parent) {
      const parentTxt = (parent.innerText || '').toLowerCase();
      if ((parentTxt.includes('follower') || parentTxt.includes('abonn')) && /[\d,.]+[KkMm]?/.test(txt)) {
        followers = txt;
      }
    }
  });
  data.abos = followers;

  // Liens externes dans la bio (site web, autres comptes)
  data.links = [];
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href || '';
    const txt = a.innerText.trim();
    const blockedDomains = ['facebook.com','meta.com','about.meta.com','facebook.net','fbcdn.net','whatsapp.com','threads.net'];
    const blockedLabels = ['meta','autres applications meta','facebook','threads','whatsapp','applications meta'];
    if (href.includes('l.instagram.com') || href.includes('linktr.ee') ||
        (href.startsWith('http') && !href.includes('instagram.com') && txt.length > 3)) {
      // Filtrer les liens Meta/Facebook inutiles
      const txtLower = txt.toLowerCase();
      const isMeta = blockedDomains.some(d => href.includes(d)) || blockedLabels.some(l => txtLower.includes(l));
      if (!isMeta && !data.links.find(l => l.url === href)) {
        data.links.push({ url: href, label: txt || new URL(href).hostname });
      }
    }
  });

  // Autres comptes Instagram mentionnés dans la bio (@mentions)
  data.otherAccounts = [];
  const bioText = data.bio;
  const mentions = bioText.match(/@[\w.]+/g);
  if (mentions) {
    mentions.forEach(m => {
      if (m.toLowerCase() !== data.handle.toLowerCase()) {
        data.otherAccounts.push(m);
      }
    });
  }

  // Type
  const bioLower = (data.bio + ' ' + data.nom).toLowerCase();
  const brandKw = ['official','brand','shop','store','boutique','clothing','wear','ltd','inc','group','®','™'];
  const creatorKw = ['créateur','creator','influencer','vlog','youtube','tiktok','photographer','model','content'];
  data.type = brandKw.some(k => bioLower.includes(k)) ? 'marque' : 'createur';

  // Niches avec keywords
  const niches = [
    { kw:['moto','bike','ride','motorcycle','biker','motard','enduro'], label:'Moto', tags:['Moto','Lifestyle','Adrénaline'] },
    { kw:['food','recipe','chef','cook','cuisine','recette','gastro'], label:'Food', tags:['Food','Recettes','Gourmand'] },
    { kw:['fitness','gym','sport','workout','muscl','nutrition','coach'], label:'Fitness', tags:['Fitness','Sport','Nutrition'] },
    { kw:['fashion','mode','style','outfit','look','streetwear','ootd'], label:'Mode', tags:['Mode','Style','Streetwear'] },
    { kw:['humour','comedy','funny','sketch','lol','blague','prank'], label:'Humour', tags:['Humour','Divertissement','Viral'] },
    { kw:['travel','voyage','trip','explore','adventure','wanderlust'], label:'Voyage', tags:['Voyage','Aventure','Exploration'] },
    { kw:['tech','gaming','game','review','unboxing','setup','geek'], label:'Tech', tags:['Tech','Gaming','Reviews'] },
    { kw:['beauty','makeup','skincare','beauté','cosmetic','soin'], label:'Beauté', tags:['Beauté','Skincare','Makeup'] },
    { kw:['auto','car','voiture','supercar','automobile','detailing'], label:'Auto', tags:['Auto','Lifestyle','Performance'] },
    { kw:['music','musique','rap','beatmaker','producer','artist','dj'], label:'Musique', tags:['Musique','Artiste','Créatif'] },
    { kw:['business','entrepreneur','invest','money','crypto','finance'], label:'Business', tags:['Business','Finance','Entrepreneur'] },
    { kw:['foot','football','soccer','basketball','nba'], label:'Sport', tags:['Sport','Football','Performance'] },
  ];
  const allMatches = niches.filter(n => n.kw.some(k => bioLower.includes(k)));
  const detected = allMatches[0] || null;
  data.niche = detected ? detected.label : '—';
  data.keywords = detected ? [...new Set(allMatches.flatMap(n => n.tags))].slice(0,3) : extractBioWords(data.bio);

  // Tier / niveau
  const abosNum = parseAbos(data.abos);
  if (abosNum >= 1000000) data.tier = 'Mega (1M+)';
  else if (abosNum >= 500000) data.tier = 'Macro (500k+)';
  else if (abosNum >= 100000) data.tier = 'Mid (100k+)';
  else if (abosNum >= 10000) data.tier = 'Micro (10k+)';
  else if (abosNum > 0) data.tier = 'Nano (<10k)';
  else data.tier = '—';

  // Collabs
  data.collabs = scanCollabs(data.handle);

  // Stats 30 jours (ce qu'on peut lire)
  data.stats = scrapeStats();

  // Profils similaires
  data.similarProfiles = getSimilarProfiles(data.niche, data.handle);

  return data;
}

function parseAbos(str) {
  if (!str || str === '—') return 0;
  const s = str.replace(/\s/g,'').replace(',','.');
  if (s.includes('M') || s.includes('m')) return parseFloat(s) * 1000000;
  if (s.includes('K') || s.includes('k')) return parseFloat(s) * 1000;
  return parseInt(s) || 0;
}

function extractBioWords(bio) {
  const stop = ['le','la','les','de','du','des','un','une','et','en','je','mon','ma','mes','pour','sur','avec','par','dans','que','qui'];
  return [...new Set((bio||'').split(/[\s,.|#@\n🔥💪🎯✨]+/)
    .map(w => w.toLowerCase().replace(/[^a-záàâéèêëîïôùûü]/g,''))
    .filter(w => w.length > 3 && !stop.includes(w))
  )].slice(0,3).map(w => w.charAt(0).toUpperCase()+w.slice(1));
}

function scrapeStats() {
  // Lit ce qui est visible : nb posts, highlights, fréquence estimée
  const stats = {};
  // Nombre de posts
  const postMatch = document.body.innerText.match(/(\d[\d,. ]*)\s*(posts?|publications?)/i);
  stats.posts = postMatch ? postMatch[1].trim() : '—';
  // Highlights
  stats.highlights = document.querySelectorAll('div[class*="highlight"], li[class*="highlight"]').length || 0;
  // Fréquence estimée (nb posts / 30j - approximation)
  stats.freq = '—';
  return stats;
}

function scrapeLocations() {
  const text = document.body.innerText || '';
  const locations = new Set();
  // Villes et pays courants dans le contenu francophone/Maghreb
  const cityPatterns = [
    /\b(Paris|Lyon|Marseille|Bordeaux|Toulouse|Lille|Nice|Nantes|Strasbourg|Montpellier)\b/gi,
    /\b(Maroc|Morocco|Casablanca|Marrakech|Rabat|Fès|Agadir|Tanger|Essaouira)\b/gi,
    /\b(Algérie|Tunisie|Dubai|Londres|London|Madrid|Barcelone|Milan|New York)\b/gi,
    /\b(France|Belgique|Suisse|Canada|Québec)\b/gi,
  ];
  cityPatterns.forEach(re => {
    const m = text.match(re);
    if (m) m.forEach(loc => locations.add(loc));
  });
  return [...locations].slice(0, 8);
}

function scrapeHashtags() {
  const tags = new Set();
  const allText = document.body.innerText || '';
  const matches = allText.match(/#[\wÀ-ÿ]+/g) || [];
  const skip = ['#ad','#sponsored','#partenariat','#collab','#partnership','#gifted','#pub','#publicité','#communication'];
  matches.forEach(t => {
    const tl = t.toLowerCase();
    if (!skip.includes(tl) && t.length > 2 && t.length < 30) tags.add(t.toLowerCase());
  });
  return [...tags].slice(0, 20);
}

function scanCollabs(currentHandle) {
  const kw = ['#ad','#sponsored','#partenariat','#collab','#partnership','#gifted','#pub','paid partnership','collaboration payée','partenariat rémunéré'];
  const brands = new Set();
  const handle = (currentHandle||'').toLowerCase();
  const allText = document.body.innerText || '';
  allText.split('\n').forEach(line => {
    if (line.length < 400 && kw.some(k => line.toLowerCase().includes(k))) {
      const m = line.match(/@[\w.]+/g);
      if (m) m.forEach(x => { if (x.toLowerCase() !== handle) brands.add(x); });
    }
  });
  document.querySelectorAll('img[alt]').forEach(img => {
    const alt = img.alt || '';
    if (kw.some(k => alt.toLowerCase().includes(k))) {
      const m = alt.match(/@[\w.]+/g);
      if (m) m.forEach(x => { if (x.toLowerCase() !== handle) brands.add(x); });
    }
  });
  return [...brands].slice(0,15);
}

function getSimilarProfiles(niche, currentHandle) {
  const db = {
    'Moto':     [{h:'@motovlogger_france',n:'MotoVlogger France',a:'89k',img:'🏍'},{h:'@bikerlife_fr',n:'BikerLife FR',a:'54k',img:'🏍'},{h:'@motard_life',n:'Motard Life',a:'41k',img:'🏍'},{h:'@lebikerfr',n:'Le Biker FR',a:'33k',img:'🏍'},{h:'@moto_addict',n:'Moto Addict',a:'28k',img:'🏍'}],
    'Food':     [{h:'@foodie_paris',n:'Foodie Paris',a:'120k',img:'🍽'},{h:'@cuisine_facile_fr',n:'Cuisine Facile',a:'98k',img:'🍽'},{h:'@chef_maison_fr',n:'Chef Maison',a:'76k',img:'🍽'},{h:'@recettes_rapides',n:'Recettes Rapides',a:'61k',img:'🍽'},{h:'@le_foodista',n:'Le Foodista',a:'44k',img:'🍽'}],
    'Fitness':  [{h:'@fit_france_off',n:'Fit France',a:'145k',img:'💪'},{h:'@coach_sport_fr',n:'Coach Sport FR',a:'87k',img:'💪'},{h:'@musculation_fr',n:'Musculation FR',a:'72k',img:'💪'},{h:'@fitgirl_france',n:'FitGirl France',a:'58k',img:'💪'},{h:'@nutrition_sport_fr',n:'Nutrition Sport',a:'39k',img:'💪'}],
    'Mode':     [{h:'@streetwear_france',n:'Streetwear France',a:'203k',img:'👗'},{h:'@mode_paris_off',n:'Mode Paris',a:'134k',img:'👗'},{h:'@style_fr_off',n:'Style FR',a:'91k',img:'👗'},{h:'@outfit_daily_fr',n:'Outfit Daily',a:'67k',img:'👗'},{h:'@fashion_france',n:'Fashion France',a:'52k',img:'👗'}],
    'Humour':   [{h:'@humour_france',n:'Humour France',a:'312k',img:'😂'},{h:'@comique_fr',n:'Comique FR',a:'189k',img:'😂'},{h:'@sketch_france',n:'Sketch France',a:'143k',img:'😂'},{h:'@pranks_fr',n:'Pranks FR',a:'97k',img:'😂'},{h:'@lol_france',n:'LOL France',a:'74k',img:'😂'}],
    'Voyage':   [{h:'@voyage_france',n:'Voyage France',a:'178k',img:'✈️'},{h:'@backpacker_fr',n:'Backpacker FR',a:'112k',img:'✈️'},{h:'@adventure_france',n:'Adventure France',a:'89k',img:'✈️'},{h:'@travel_france_off',n:'Travel France',a:'67k',img:'✈️'},{h:'@explorer_france',n:'Explorer France',a:'45k',img:'✈️'}],
    'Tech':     [{h:'@tech_france_off',n:'Tech France',a:'234k',img:'💻'},{h:'@gaming_france_off',n:'Gaming France',a:'187k',img:'💻'},{h:'@setup_france',n:'Setup France',a:'98k',img:'💻'},{h:'@review_france',n:'Review France',a:'76k',img:'💻'},{h:'@geek_france',n:'Geek France',a:'54k',img:'💻'}],
    'Beauté':   [{h:'@beauty_france',n:'Beauty France',a:'267k',img:'💄'},{h:'@makeup_france_off',n:'Makeup France',a:'198k',img:'💄'},{h:'@skincare_france',n:'Skincare France',a:'134k',img:'💄'},{h:'@routine_beaute',n:'Routine Beauté',a:'89k',img:'💄'},{h:'@beaute_france',n:'Beauté France',a:'72k',img:'💄'}],
    'Auto':     [{h:'@supercar_france',n:'Supercar France',a:'156k',img:'🚗'},{h:'@auto_lifestyle_fr',n:'Auto Lifestyle',a:'98k',img:'🚗'},{h:'@detailing_france',n:'Detailing France',a:'67k',img:'🚗'},{h:'@voiture_france',n:'Voiture France',a:'54k',img:'🚗'},{h:'@car_france_off',n:'Car France',a:'43k',img:'🚗'}],
    'Musique':  [{h:'@rap_france_off',n:'Rap France',a:'289k',img:'🎵'},{h:'@beatmaker_france',n:'Beatmaker France',a:'134k',img:'🎵'},{h:'@music_france_off',n:'Music France',a:'98k',img:'🎵'},{h:'@producer_france',n:'Producer France',a:'67k',img:'🎵'},{h:'@artiste_france',n:'Artiste France',a:'45k',img:'🎵'}],
    'Business': [{h:'@entrepreneur_france',n:'Entrepreneur FR',a:'198k',img:'💼'},{h:'@invest_france',n:'Invest France',a:'145k',img:'💼'},{h:'@startup_france_off',n:'Startup France',a:'112k',img:'💼'},{h:'@business_france',n:'Business France',a:'89k',img:'💼'},{h:'@crypto_france',n:'Crypto France',a:'67k',img:'💼'}],
    'Sport':    [{h:'@football_france',n:'Football France',a:'445k',img:'⚽'},{h:'@sport_france_off',n:'Sport France',a:'234k',img:'⚽'},{h:'@basket_france',n:'Basket France',a:'178k',img:'⚽'},{h:'@athlete_france',n:'Athlete France',a:'123k',img:'⚽'},{h:'@sport_lifestyle_fr',n:'Sport Lifestyle',a:'89k',img:'⚽'}],
  };
  return (db[niche]||[]).filter(p => p.h !== currentHandle).slice(0,5);
}

// ── INJECT PANEL ──────────────────────────────────────
async function injectPanel() {
  const profile = scrapeProfile();
  const talents = await fbGet('talents') || [{nom:'Rhyno'},{nom:'Sinan le petit marocain'},{nom:'Yova1n'},{nom:'Andji Cook'}];
  const panel = document.createElement('div');
  panel.id = 'mood-panel';
  panel.innerHTML = buildPanelHTML(profile, talents);
  document.body.appendChild(panel);
  bindPanelEvents(profile, talents);
}

// ── BUILD HTML ────────────────────────────────────────
function buildPanelHTML(p, talents) {
  const talentOpts = `<option value="">— Choisir —</option>` + talents.map(t=>`<option value="${t.nom}">${t.nom}</option>`).join('');

  const collabHTML = (p.collabs||[]).length
    ? p.collabs.map(c=>`<span class="mood-tag">${c}</span>`).join('')
    : '<span class="mood-muted">Aucune détectée automatiquement</span>';

  const similarHTML = (p.similarProfiles||[]).length
    ? p.similarProfiles.map(s=>`
      <div class="mood-similar-item">
        <div class="mood-similar-emoji">${s.img}</div>
        <div class="mood-similar-info">
          <div class="mood-similar-name">${s.n}</div>
          <div class="mood-similar-handle">${s.h} · ${s.a}</div>
        </div>
        <div class="mood-similar-actions">
          <a class="mood-btn-visit" href="https://www.instagram.com/${s.h.replace('@','')}/" target="_blank">→</a>
          <button class="mood-similar-add" data-handle="${s.h}" data-nom="${s.n}" data-abos="${s.a}">+</button>
        </div>
      </div>`).join('')
    : '<div class="mood-muted">Niche non détectée</div>';

  const linksHTML = (() => {
    let html = '';
    if ((p.otherAccounts||[]).length) {
      p.otherAccounts.slice(0,3).forEach(a => {
        html += `<a class="mood-link-item" href="https://www.instagram.com/${a.replace('@','')}/" target="_blank"><span class="mood-link-icon">📸</span>${a}</a>`;
      });
    }
    if ((p.links||[]).length) {
      p.links.slice(0,3).forEach(l => {
        const label = l.label.length > 30 ? l.label.slice(0,30)+'…' : l.label;
        html += `<a class="mood-link-item" href="${l.url}" target="_blank"><span class="mood-link-icon">🔗</span>${label}</a>`;
      });
    }
    return html || '<span class="mood-muted">Aucun lien détecté</span>';
  })();

  return `
    <div class="mood-header">
      <div class="mood-logo">mood radar <span>◎</span></div>
      <div class="mood-header-right">
        <span class="mood-badge mood-badge-${p.type}">${p.type==='marque'?'Marque':'Créateur'}</span>
        <button class="mood-pin" id="mood-pin">📌</button>
        <button class="mood-close" id="mood-close">✕</button>
      </div>
    </div>

    <!-- RECAP PROFIL -->
    <div class="mood-profile">
      <div class="mood-handle">${p.handle}</div>
      <div class="mood-name">${p.nom}</div>
      <div class="mood-tier-row">
        <span class="mood-tier">${p.tier}</span>
        <span class="mood-abos-num">👥 ${p.abos}</span>
        <span class="mood-niche-pill">${p.niche}</span>
      </div>
      <div class="mood-keywords">${(p.keywords||[]).map(k=>`<span class="mood-kw">${k}</span>`).join('')}</div>
      ${p.bio?`<div class="mood-bio">${p.bio}</div>`:''}

      <!-- LIENS & AUTRES PROJETS -->
      <div class="mood-links-section">
        <div class="mood-links-title">🔗 Liens & autres projets</div>
        <div class="mood-links-list">${linksHTML}</div>
      </div>
    </div>

    <!-- ONGLETS -->
    <div class="mood-tabs">
      <button class="mood-tab active" data-tab="crm">CRM</button>
      <button class="mood-tab" data-tab="similaires">Similaires</button>
      <button class="mood-tab" data-tab="collabs">Collabs</button>
      <button class="mood-tab" data-tab="ia">✨ IA</button>
    </div>

    <!-- TAB CRM -->
    <div id="mood-tab-crm" class="mood-tab-content">
      <div class="mood-section">
        <div class="mood-section-title">➕ Ajouter au CRM</div>
        <select class="mood-select" id="mood-pq">${talentOpts}</select>
        <select class="mood-select" id="mood-statut">
          <option value="new">À contacter</option>
          <option value="contact">Contacté</option>
          <option value="rep">Réponse reçue</option>
          <option value="nego">En négociation</option>
        </select>
        <input class="mood-input" id="mood-action" placeholder="Prochaine action..."/>
        <button class="mood-btn mood-btn-pink" id="mood-add-crm">Ajouter au CRM</button>
      </div>
      <div class="mood-divider"></div>
      <div class="mood-section">
        <div class="mood-section-title">👁 Ajouter à la Veille</div>
        <select class="mood-select" id="mood-veille-pq">${talentOpts}</select>
        <input class="mood-input" id="mood-eng" placeholder="Engagement estimé % (ex: 4.5)" type="number" step="0.1"/>
        <button class="mood-btn mood-btn-violet" id="mood-add-veille">Ajouter à la Veille</button>
      </div>
    </div>

    <!-- TAB SIMILAIRES -->
    <div id="mood-tab-similaires" class="mood-tab-content" style="display:none">
      <div class="mood-section">
        <div class="mood-section-title">🎯 Profils similaires — ${p.niche}</div>
        <div class="mood-similar-sub">→ visiter · + ajouter à la veille</div>
        <div id="mood-similar-list">${similarHTML}</div>
        <div class="mood-divider" style="margin:12px 0"></div>
        <div class="mood-section-title" style="margin-bottom:8px">Ajouter manuellement</div>
        <div style="display:flex;gap:6px">
          <input class="mood-input" id="mood-similar-input" placeholder="@handle..." style="margin-bottom:0;flex:1"/>
          <button class="mood-btn-add" id="mood-similar-manual-add">+</button>
        </div>
      </div>
    </div>

    <!-- TAB COLLABS -->
    <div id="mood-tab-collabs" class="mood-tab-content" style="display:none">
      <div class="mood-section">
        <div class="mood-section-title" style="display:flex;align-items:center;justify-content:space-between">
          🔗 Collabs détectées
          <button class="mood-rescan" id="mood-rescan">↻ Rescanner</button>
        </div>
        <div class="mood-tags" id="mood-collab-list">${collabHTML}</div>
        <button class="mood-btn mood-btn-violet" id="mood-scrape-apify" style="margin-top:10px">🔍 Scraper avec Apify</button>
        <div id="mood-apify-result" style="display:none;margin-top:10px;font-size:11px"></div>
      </div>
      <div class="mood-divider"></div>
      <div class="mood-section">
        <div class="mood-section-title">✍️ Ajouter manuellement</div>
        <div id="mood-manual-list"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input class="mood-input" id="mood-manual-input" placeholder="@marque ou nom..." style="margin-bottom:0;flex:1"/>
          <button class="mood-btn-add" id="mood-manual-add">+</button>
        </div>
        <button class="mood-btn mood-btn-save" id="mood-save-collabs" style="margin-top:8px">💾 Sauvegarder</button>
      </div>
    </div>

    <!-- TAB IA -->
    <div id="mood-tab-ia" class="mood-tab-content" style="display:none">
      <div class="mood-section">
        <div class="mood-section-title">✨ Analyse IA du profil</div>
        <button class="mood-btn mood-btn-pink" id="mood-analyze-btn">Analyser avec l'IA</button>
        <div id="mood-ia-result" style="margin-top:12px;font-size:12px;line-height:1.6;color:#e0e0e0;white-space:pre-wrap;display:none"></div>
      </div>
      <div class="mood-divider"></div>
      <div class="mood-section">
        <div class="mood-section-title">🎯 Marques à prospecter</div>
        <div style="font-size:11px;color:#888;margin-bottom:10px">L'IA génère 15-20 marques selon le thème choisi</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px" id="mood-theme-btns">
          <button class="mood-theme-btn active" data-theme="all">Tout</button>
          <button class="mood-theme-btn" data-theme="big">Grandes marques</button>
          <button class="mood-theme-btn" data-theme="local">Local & Culture</button>
          <button class="mood-theme-btn" data-theme="events">Events & Tourisme</button>
        </div>
        <button class="mood-btn mood-btn-violet" id="mood-brands-btn">Générer les marques</button>
        <div id="mood-brands-result" style="margin-top:10px;display:none"></div>
      </div>
    </div>

        <div id="mood-toast" class="mood-toast" style="display:none"></div>
  `;
}

// ── TAB SWITCH ────────────────────────────────────────
function moodSwitchTab(tab, btn) {
  document.querySelectorAll('#mood-panel .mood-tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('#mood-panel .mood-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('mood-tab-' + tab);
  if (el) el.style.display = 'block';
  if (btn) btn.classList.add('active');
}

// ── BIND EVENTS ───────────────────────────────────────
function bindPanelEvents(profile, talents) {
  // Tabs
  document.querySelectorAll('#mood-panel .mood-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('#mood-panel .mood-tab-content').forEach(t => t.style.display = 'none');
      document.querySelectorAll('#mood-panel .mood-tab').forEach(b => b.classList.remove('active'));
      const el = document.getElementById('mood-tab-' + tab);
      if (el) el.style.display = 'block';
      btn.classList.add('active');
    });
  });

  // Pin
  window._moodPinned = true;
  const pinBtn = document.getElementById('mood-pin');
  if (pinBtn) {
    pinBtn.onclick = () => {
      window._moodPinned = !window._moodPinned;
      pinBtn.style.opacity = window._moodPinned ? '1' : '0.4';
    };
  }

  // Close
  document.getElementById('mood-close').onclick = () => {
    window._moodPinned = false;
    document.getElementById('mood-panel').style.transform = 'translateX(320px)';
    setTimeout(() => removePanel(), 300);
  };

  // Rescan collabs
  const rescanBtn = document.getElementById('mood-rescan');
  if (rescanBtn) {
    rescanBtn.onclick = () => {
      rescanBtn.textContent = '...';
      setTimeout(() => {
        const newCollabs = scanCollabs(profile.handle);
        profile.collabs = newCollabs;
        const list = document.getElementById('mood-collab-list');
        if (list) list.innerHTML = newCollabs.length
          ? newCollabs.map(c=>`<span class="mood-tag">${c}</span>`).join('')
          : '<span class="mood-muted">Aucune collab détectée</span>';
        rescanBtn.textContent = '↻ Rescanner';
        // Mettre à jour le tableau stats aussi
        updateCollabTable(newCollabs);
      }, 800);
    };
  }

  // Add to CRM
  document.getElementById('mood-add-crm').onclick = async () => {
    const row = {
      id: Date.now(), nom: profile.nom || profile.handle,
      type: profile.type, canal: 'Instagram DM',
      statut: document.getElementById('mood-statut').value,
      pourQui: document.getElementById('mood-pq').value,
      date: new Date().toISOString().slice(0,10),
      action: document.getElementById('mood-action').value.trim() || 'Voir le profil',
      notes: `${profile.bio||''} | Niche: ${profile.niche} | ${profile.tier}`.trim(),
    };
    const crm = await fbGet('crm') || [];
    crm.push(row);
    await fbSet('crm', crm);
    showToast('✓ Ajouté au CRM !');
  };

  // Scraping Apify
  document.getElementById('mood-scrape-apify').onclick = async () => {
    const btn = document.getElementById('mood-scrape-apify');
    const result = document.getElementById('mood-apify-result');
    btn.textContent = '⏳ Scraping en cours... (30-60s)';
    btn.disabled = true;
    result.style.display = 'none';
    try {
      const r = await fetch('https://mood-agency-crm.netlify.app/.netlify/functions/scrape-collabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: profile.handle })
      });
      const data = await r.json();
      if (data.error) {
        result.innerHTML = `<span style="color:#ff6b6b">Erreur: ${data.error}</span>`;
      } else if (data.debug_raw !== undefined) {
        result.innerHTML = `<span style="color:#aaa;font-size:10px;word-break:break-all">RAW: ${data.debug_raw}</span>`;
      } else if (data.collabBrands?.length === 0) {
        result.innerHTML = `<span style="color:#aaa">Aucune collab détectée.</span>`;
      } else {
        let html = `<div style="color:#ff3fa4;font-weight:600;margin-bottom:8px">✓ ${data.collabBrands.length} marque(s) détectée(s)</div>`;
        html += data.collabBrands.map(b => `<span class="mood-tag">${b}</span>`).join('');
        if (data.competitors?.length > 0) {
          html += `<div style="color:#9b59f5;font-weight:600;margin:10px 0 6px">🎯 Concurrents à prospecter :</div>`;
          data.competitors.forEach(c => {
            html += `<div style="margin-bottom:6px"><span style="color:#ff3fa4">${c.brand}</span> → `;
            html += (c.competitors || []).map(x => `<span class="mood-tag" style="cursor:pointer" data-prospect="${x}">${x} +</span>`).join(' ');
            html += '</div>';
          });
        }
        result.innerHTML = html;
        result.querySelectorAll('[data-prospect]').forEach(el => {
          el.addEventListener('click', async () => {
            const nom = el.getAttribute('data-prospect');
            const crm = await fbGet('crm') || [];
            crm.push({ id: Date.now(), nom, type: 'marque', canal: 'Email', statut: 'new', pourQui: '', date: new Date().toISOString().slice(0,10), action: 'Contacter pour partenariat', notes: `Concurrent détecté via Apify scraping de ${profile.handle}` });
            await fbSet('crm', crm);
            el.style.background = '#2a7a2a';
            el.textContent = el.textContent.replace(' +', ' ✓');
          });
        });
      }
      result.style.display = 'block';
    } catch(e) {
      result.innerHTML = '<span style="color:#ff6b6b">Erreur réseau. Réessaie.</span>';
      result.style.display = 'block';
    }
    btn.textContent = '🔍 Scraper avec Apify';
    btn.disabled = false;
  };

  // Analyse IA
  document.getElementById('mood-analyze-btn').onclick = async () => {
    const btn = document.getElementById('mood-analyze-btn');
    const result = document.getElementById('mood-ia-result');
    btn.textContent = '⏳ Analyse en cours...';
    btn.disabled = true;
    result.style.display = 'none';
    try {
      const r = await fetch('https://mood-agency-crm.netlify.app/.netlify/functions/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileData: {
          username: profile.handle,
          bio: profile.bio,
          followers: profile.abos,
          following: '',
          posts: profile.stats?.posts,
          links: profile.links
        }})
      });
      const data = await r.json();
      result.textContent = data.analysis || 'Analyse indisponible';
      result.style.display = 'block';
    } catch(e) {
      result.textContent = 'Erreur lors de l\'analyse. Réessaie.';
      result.style.display = 'block';
    }
    btn.textContent = 'Analyser avec l\'IA';
    btn.disabled = false;
  };

  // Sélecteur de thème
  let selectedTheme = 'all';
  document.querySelectorAll('#mood-panel .mood-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mood-panel .mood-theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTheme = btn.getAttribute('data-theme');
    });
  });

  // Générer les marques (IA)
  document.getElementById('mood-brands-btn').onclick = async () => {
    const btn = document.getElementById('mood-brands-btn');
    const result = document.getElementById('mood-brands-result');
    btn.textContent = '⏳ Génération en cours...';
    btn.disabled = true;
    result.style.display = 'none';
    try {
      const r = await fetch('https://mood-agency-crm.netlify.app/.netlify/functions/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'brands',
          theme: selectedTheme,
          profileData: {
            username: profile.handle,
            bio: profile.bio,
            followers: profile.abos,
            tier: profile.tier,
            niche: profile.niche,
            keywords: (profile.keywords || []).join(', '),
            hashtags: scrapeHashtags().join(' '),
            locations: scrapeLocations().join(', '),
            collabs: (profile.collabs || []).join(', '),
            links: (profile.links || []).map(l => l.url).join(', '),
            otherAccounts: (profile.otherAccounts || []).join(', ')
          }
        })
      });
      const data = await r.json();
      if (data.error) {
        result.innerHTML = `<span style="color:#ff6b6b">Erreur: ${data.error}</span>`;
      } else if (!data.brands || data.brands.length === 0) {
        result.innerHTML = `<span style="color:#aaa">Aucune marque générée.</span><div style="color:#888;font-size:10px;margin-top:4px;word-break:break-all">${data.debug_text || data.debug_raw || 'Pas de réponse'}</div>`;
      } else {
        // Grouper par catégorie
        const catLabels = { grande_marque: '🏢 Grandes marques', locale_culture: '🌍 Local & Culture', event_tourisme: '🎪 Events & Tourisme', autre: '📌 Autres' };
        const catColors = { grande_marque: '#ff3fa4', locale_culture: '#3cdc78', event_tourisme: '#f5a623', autre: '#9b59f5' };
        const grouped = {};
        data.brands.forEach(b => {
          const cat = b.categorie || 'autre';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(b);
        });

        let html = '';
        const catOrder = ['grande_marque', 'locale_culture', 'event_tourisme', 'autre'];
        catOrder.forEach(cat => {
          if (!grouped[cat] || grouped[cat].length === 0) return;
          html += `<div style="color:${catColors[cat]};font-size:11px;font-weight:600;margin:10px 0 6px;letter-spacing:0.5px">${catLabels[cat]}</div>`;
          grouped[cat].forEach(b => {
            html += `
              <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:9px 11px;margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                  <div style="flex:1">
                    <div style="font-weight:600;color:#fff;font-size:12px">${b.nom} <span style="color:#9b59f5;font-weight:400;font-size:11px">${b.instagram||''}</span></div>
                    <div style="color:${catColors[cat]};font-size:10px;margin:2px 0">${b.type||''}</div>
                    <div style="color:#aaa;font-size:11px;line-height:1.4">${b.raison||''}</div>
                  </div>
                  <button class="mood-btn-add mood-brand-add-crm" data-nom="${b.nom}" data-instagram="${b.instagram||''}" data-type="${b.type||''}" data-cat="${cat}" style="flex-shrink:0;margin-top:2px">+CRM</button>
                </div>
              </div>`;
          });
        });
        result.innerHTML = html;

        result.querySelectorAll('.mood-brand-add-crm').forEach(addBtn => {
          addBtn.addEventListener('click', async () => {
            const nom = addBtn.getAttribute('data-nom');
            const insta = addBtn.getAttribute('data-instagram');
            const type = addBtn.getAttribute('data-type');
            const cat = addBtn.getAttribute('data-cat');
            const crm = await fbGet('crm') || [];
            crm.push({
              id: Date.now(), nom, type: 'marque', canal: 'Email',
              statut: 'new', pourQui: '', date: new Date().toISOString().slice(0,10),
              action: 'Contacter pour partenariat',
              notes: `Suggéré par IA pour ${profile.handle} | ${catLabels[cat]||cat} | ${type} | ${insta}`
            });
            await fbSet('crm', crm);
            addBtn.textContent = '✓';
            addBtn.style.background = 'rgba(61,220,132,0.15)';
            addBtn.style.color = '#3cdc78';
            addBtn.disabled = true;
            showToast(`✓ ${nom} ajouté au CRM !`);
          });
        });
      }
      result.style.display = 'block';
    } catch(e) {
      result.innerHTML = '<span style="color:#ff6b6b">Erreur réseau. Réessaie.</span>';
      result.style.display = 'block';
    }
    btn.textContent = 'Générer les marques';
    btn.disabled = false;
  };

  // Add to Veille
  document.getElementById('mood-add-veille').onclick = async () => {
    const row = {
      id: Date.now(),
      pourQui: document.getElementById('mood-veille-pq').value,
      talent: document.getElementById('mood-veille-pq').value,
      nom: profile.nom || profile.handle,
      handle: profile.handle, niche: profile.niche,
      abos: profile.abos,
      eng: parseFloat(document.getElementById('mood-eng').value) || 0,
      collab: (profile.collabs||[]).join(', '),
      notes: profile.bio || '',
    };
    const v = await fbGet('veille') || [];
    v.push(row);
    await fbSet('veille', v);
    showToast('✓ Ajouté à la Veille !');
  };

  // Collabs manuelles
  let manualCollabs = [...(profile.collabs||[])];
  const profileKey = 'mood_collabs_' + (profile.handle||'').replace('@','');
  chrome.storage.local.get([profileKey], r => {
    if (r[profileKey]) manualCollabs = r[profileKey];
    renderManualList();
  });

  function renderManualList() {
    const list = document.getElementById('mood-manual-list');
    if (!list) return;
    list.innerHTML = manualCollabs.map((c,i) => `
      <div class="mood-collab-item">
        <span class="mood-tag">${c}</span>
        <button class="mood-collab-del" data-idx="${i}">✕</button>
      </div>`).join('') || '<div class="mood-muted" style="margin-bottom:6px">Aucune collab ajoutée</div>';
    list.querySelectorAll('.mood-collab-del').forEach(btn => {
      btn.onclick = () => { manualCollabs.splice(parseInt(btn.dataset.idx),1); renderManualList(); };
    });
  }

  const addBtn = document.getElementById('mood-manual-add');
  const addInput = document.getElementById('mood-manual-input');
  if (addBtn && addInput) {
    const doAdd = () => {
      const val = addInput.value.trim();
      if (!val) return;
      const fmt = val.startsWith('@') ? val : '@'+val;
      if (!manualCollabs.includes(fmt)) { manualCollabs.push(fmt); renderManualList(); }
      addInput.value = '';
    };
    addBtn.onclick = doAdd;
    addInput.addEventListener('keydown', e => { if(e.key==='Enter') doAdd(); });
  }

  document.getElementById('mood-save-collabs').onclick = () => {
    chrome.storage.local.set({ [profileKey]: manualCollabs }, () => {
      updateCollabTable(manualCollabs);
      showToast('💾 Collabs sauvegardées !');
    });
  };

  // Similaires — boutons + Veille
  document.querySelectorAll('.mood-similar-add').forEach(btn => {
    btn.onclick = async () => {
      const pq = document.getElementById('mood-veille-pq')?.value || '';
      const row = { id:Date.now(), pourQui:pq, talent:pq, nom:btn.dataset.nom, handle:btn.dataset.handle, niche:profile.niche, abos:btn.dataset.abos, eng:0, collab:'', notes:'Profil similaire à '+profile.handle };
      const v = await fbGet('veille') || [];
      v.push(row);
      await fbSet('veille', v);
      btn.textContent = '✓'; btn.style.background='rgba(61,220,132,0.15)'; btn.style.color='#3cdc78';
      showToast('✓ Ajouté à la Veille !');
    };
  });

  // Similaires — ajout manuel
  const simInput = document.getElementById('mood-similar-input');
  const simAdd = document.getElementById('mood-similar-manual-add');
  if (simAdd && simInput) {
    simAdd.onclick = () => {
      const val = simInput.value.trim();
      if (!val) return;
      const handle = val.startsWith('@') ? val : '@'+val;
      const list = document.getElementById('mood-similar-list');
      if (list) {
        const item = document.createElement('div');
        item.className = 'mood-similar-item';
        item.innerHTML = `<div class="mood-similar-emoji">👤</div><div class="mood-similar-info"><div class="mood-similar-name">${handle}</div><div class="mood-similar-handle">Ajouté manuellement</div></div><div class="mood-similar-actions"><a class="mood-btn-visit" href="https://www.instagram.com/${handle.replace('@','')}/" target="_blank">→</a></div>`;
        list.appendChild(item);
      }
      simInput.value = '';
      showToast('✓ Profil ajouté !');
    };
    simInput.addEventListener('keydown', e => { if(e.key==='Enter') simAdd.click(); });
  }
}

function updateCollabTable(collabs) {
  const table = document.getElementById('mood-collab-table');
  if (!table) return;
  if (!collabs.length) { table.innerHTML = '<div class="mood-muted" style="padding:12px 0">Aucune collab</div>'; return; }
  table.innerHTML = `<div class="mood-table-head"><span>Marque / Compte</span><span>Type</span></div>` +
    collabs.map(c=>`<div class="mood-table-row"><span class="mood-table-brand">${c}</span><span class="mood-table-type">#ad</span></div>`).join('');
}

function showToast(msg) {
  const t = document.getElementById('mood-toast');
  if (!t) return;
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}
