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

  const { profileData, mode } = JSON.parse(event.body || '{}');
  if (!profileData) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'profileData manquant' }) };
  }

  let prompt;

  if (mode === 'brands') {
    prompt = `Tu es un expert en influence marketing. En te basant sur ce profil Instagram, génère une liste de 10 marques concrètes à prospecter pour un partenariat.

Profil : ${profileData.username}
Bio : ${profileData.bio || 'Non renseignée'}
Abonnés : ${profileData.followers || 'Inconnu'}
Niche : ${profileData.niche || 'Non détectée'}

Règles :
- Propose des vraies marques qui font de l'influence marketing
- Mélange grandes marques et marques moyennes accessibles
- Adapte au profil et à son audience
- Pour chaque marque, indique pourquoi elle correspond

Réponds en JSON uniquement, format :
[{"nom": "Nike", "type": "Sport", "raison": "Correspond au lifestyle sportif du créateur", "instagram": "@nike"}, ...]`;
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
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || 'Analyse indisponible';

  if (mode === 'brands') {
    let brands = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      brands = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch(e) { brands = []; }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ brands }) };
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ analysis: text }) };
};
