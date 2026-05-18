const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  try {
    const { prospect, talent } = JSON.parse(event.body || '{}');
    if (!prospect || !talent) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'prospect et talent requis' }) };
    }

    const prompt = `Tu es un expert en influence marketing. Rédige un email de prospection professionnel en français pour contacter une marque au nom d'un talent.

TALENT :
- Nom : ${talent.nom}
- Niche : ${talent.niche || 'Créateur de contenu'}
- Abonnés : ${talent.abos || 'Non précisé'}
- Plateformes : ${(talent.plats || []).join(', ') || 'Instagram'}

MARQUE À CONTACTER :
- Nom : ${prospect.nom}
- Type : ${prospect.type || 'marque'}
- Notes : ${prospect.notes || 'Aucune'}
- Action prévue : ${prospect.action || 'Contacter pour partenariat'}

RÈGLES :
- Email court, percutant, professionnel (150-200 mots max)
- Objet accrocheur et spécifique à cette marque
- Mentionne un lien concret entre le talent et la marque
- Propose une collaboration précise (pas vague)
- Ton chaleureux mais business
- Se termine avec un appel à l'action clair
- Signé au nom de l'agence Mood Agency

Réponds en JSON UNIQUEMENT :
{"objet": "Objet de l'email", "corps": "Corps de l'email complet"}`;

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

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: `API ${response.status}: ${err.slice(0,200)}` }) };
    }

    const data = await response.json();
    if (data.error) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: data.error.message }) };

    const text = data.content?.[0]?.text || '';
    let email = { objet: '', corps: '' };
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      email = jsonMatch ? JSON.parse(jsonMatch[0]) : { objet: 'Email généré', corps: text };
    } catch(e) {
      email = { objet: 'Email généré', corps: text };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ email }) };
  } catch(e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Exception: ' + e.message }) };
  }
};
