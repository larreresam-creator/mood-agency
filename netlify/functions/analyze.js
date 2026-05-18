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
    const { profileData, mode } = JSON.parse(event.body || '{}');
    if (!profileData) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'profileData manquant' }) };
    }

    let prompt;

    if (mode === 'brands') {
      prompt = `Tu es un expert en influence marketing spécialisé dans la prospection de marques pour des créateurs de contenu.

Profil Instagram à analyser :
- Handle : ${profileData.username}
- Bio : ${profileData.bio || 'Non renseignée'}
- Abonnés : ${profileData.followers || 'Inconnu'}
- Niche : ${profileData.niche || 'Non détectée'}

Génère une liste de 10 marques PRODUITS ou SERVICES réels à prospecter pour un partenariat payé avec ce créateur.

RÈGLES ABSOLUES :
1. JAMAIS de plateformes sociales (pas de Meta, TikTok, Instagram, Snapchat, YouTube, Twitter)
2. JAMAIS de services de streaming (pas de Netflix, Disney+, Spotify, Deezer)
3. UNIQUEMENT des marques qui font des campagnes avec des influenceurs : alimentation, mode, beauté, lifestyle, tech grand public, sport, gaming, food delivery, boissons, etc.
4. Marques réelles qui existent : ex. Nike, Adidas, McDonald's, Uber Eats, L'Oréal, Red Bull, H&M, Zara, Deliveroo, Foot Locker, Decathlon, Gymshark, etc.
5. Adapte les suggestions à l'audience et au contenu de CE créateur spécifiquement
6. Mélange 5 grandes marques connues + 5 marques moyennes accessibles aux micro-influenceurs

Réponds en JSON UNIQUEMENT, sans texte avant ni après, sans bloc de code :
[{"nom": "Nike", "type": "Sport", "raison": "Audience jeune masculine très engagée sur le sport et le streetwear", "instagram": "@nike"}, ...]`;
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
        max_tokens: 1500,
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
