const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  try {
    const { profileData, mode, theme } = JSON.parse(event.body || '{}');
    if (!profileData) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'profileData manquant' }) };
    }

    let prompt;

    if (mode === 'brands') {
      const themeInstructions = {
        all: `Génère 18 marques réparties en 3 catégories équilibrées : 6 grandes marques connues, 6 marques locales/culturelles, 6 événements/tourisme/restaurants.`,
        big: `Génère 15 grandes marques connues internationalement qui font régulièrement des campagnes d'influence.`,
        local: `Génère 15 marques locales, culturelles, restaurants, médias locaux, associations, marques artisanales qui correspondent à la culture et à l'origine du créateur.`,
        events: `Génère 15 partenaires events & tourisme : offices du tourisme, festivals, événements culturels, hôtels, compagnies aériennes, musées, agences de voyage, destinations.`
      };
      const themeRule = themeInstructions[theme] || themeInstructions.all;

      const catRule = theme === 'big'
        ? `Toutes les marques ont "categorie": "grande_marque"`
        : theme === 'local'
        ? `Toutes les marques ont "categorie": "locale_culture"`
        : theme === 'events'
        ? `Toutes les marques ont "categorie": "event_tourisme"`
        : `Répartis les marques avec le champ "categorie" : "grande_marque", "locale_culture", ou "event_tourisme"`;

      prompt = `Tu es un expert en influence marketing. Analyse ce profil Instagram et génère des marques à prospecter pour un partenariat payé.

DONNÉES DU PROFIL :
- Handle : ${profileData.username}
- Bio : ${profileData.bio || 'Non renseignée'}
- Abonnés : ${profileData.followers || 'Inconnu'} (${profileData.tier || 'tier inconnu'})
- Niche : ${profileData.niche || 'Non détectée'}
- Mots-clés : ${profileData.keywords || 'Aucun'}
- Hashtags : ${profileData.hashtags || 'Aucun'}
- Villes/pays détectés : ${profileData.locations || 'Aucun'}
- Collabs passées : ${profileData.collabs || 'Aucune'}
- Liens bio : ${profileData.links || 'Aucun'}
- Autres comptes mentionnés : ${profileData.otherAccounts || 'Aucun'}

MISSION : ${themeRule}

RÈGLES ABSOLUES :
1. JAMAIS de plateformes sociales (Meta, TikTok, Instagram, Snapchat, YouTube, Twitter, LinkedIn)
2. JAMAIS de streaming (Netflix, Disney+, Spotify, Deezer, Prime Video)
3. Marques RÉELLES qui existent vraiment
4. Pour "locale_culture" et "event_tourisme" : sois très précis — cite des vrais offices du tourisme (ex: "Office du Tourisme de Marrakech"), des vrais festivals (ex: "Mawazine Festival"), de vrais restaurants ou chaînes, de vrais médias culturels
5. La raison doit être spécifique à CE créateur (mentionne ses hashtags, sa culture, ses villes)
6. ${catRule}

Réponds en JSON UNIQUEMENT, sans texte avant ni après, sans bloc de code :
[{"nom": "Nike", "type": "Sport", "raison": "Raison précise liée au profil", "instagram": "@nike", "categorie": "grande_marque"}, ...]`;
    } else {
      prompt = `Tu es un expert en influence marketing. Analyse ce profil Instagram et donne une évaluation concise en français.

Profil : ${profileData.username}
Bio : ${profileData.bio || 'Non renseignée'}
Abonnés : ${profileData.followers || 'Inconnu'}
Posts : ${profileData.posts || 'Inconnu'}
Liens : ${(profileData.links || []).map(l => l.url).join(', ') || 'Aucun'}

Donne :
1. **Niche** : la catégorie principale du créateur (2-3 mots)
2. **Tier** : Nano / Micro / Mid / Macro / Mega
3. **Score de collaboration** : /10 (potentiel pour des partenariats marques)
4. **Analyse** : 2-3 phrases sur le profil, son audience et son potentiel commercial
5. **Marques idéales** : 3 types de marques qui correspondraient bien`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ brands: [], error: `API ${response.status}: ${errText.slice(0,200)}` }) };
    }

    const data = await response.json();
    const debugRaw = JSON.stringify(data).slice(0, 600);

    if (data.error) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ brands: [], error: data.error.message || JSON.stringify(data.error), debug_raw: debugRaw }) };
    }

    const text = data.content?.[0]?.text || '';

    if (mode === 'brands') {
      let brands = [];
      let parseError = null;
      try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        brands = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch(e) {
        parseError = e.message;
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ brands, debug_text: text ? text.slice(0, 400) : null, debug_raw: debugRaw, parse_error: parseError }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ analysis: text || 'Analyse indisponible', v: 2, mode_received: mode }) };

  } catch(e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ brands: [], error: 'Exception: ' + e.message }) };
  }
};
