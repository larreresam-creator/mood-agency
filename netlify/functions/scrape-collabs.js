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

  const { username } = JSON.parse(event.body || '{}');
  if (!username) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'username manquant' }) };
  }

  const handle = username.replace('@', '');

  // Appel synchrone Apify — retourne directement les résultats
  const apifyRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}&timeout=20`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [handle], resultsLimit: 30 })
    }
  );

  if (!apifyRes.ok) {
    const errText = await apifyRes.text();
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Apify error: ${errText.slice(0,200)}` }) };
  }

  const items = await apifyRes.json();

  // Filtrer les posts sponsorisés — keywords français + anglais élargis
  const sponsoredKw = [
    '#ad', '#sponsored', '#partenariat', '#collab', '#partnership', '#gifted', '#pub',
    'paid partnership', 'collaboration payée', 'partenariat rémunéré',
    'en collaboration avec', 'en partenariat avec', 'merci à', 'merci @',
    'thanks to', 'avec @', 'avec la marque', 'offert par', 'offert par @',
    'code promo', 'code:', 'lien en bio', 'disponible sur', '#publicité',
    '#communication', '#brandambassador', '#ambassador', '#ambassadeur',
    'notre partenaire', 'notre partenariat', 'je travaille avec'
  ];
  const collabBrands = new Set();

  (items || []).forEach(item => {
    const posts = item.latestPosts || item.posts || [];
    posts.forEach(post => {
      const caption = (post.caption || post.text || '').toLowerCase();
      const hasSponsoredKw = sponsoredKw.some(k => caption.includes(k));
      const hasCodePromo = /code[:\s]+\w+/i.test(caption);
      if (hasSponsoredKw || hasCodePromo) {
        const mentions = caption.match(/@[\w.]+/g);
        if (mentions) mentions.forEach(m => {
          if (m.replace('@', '').toLowerCase() !== handle.toLowerCase()) collabBrands.add(m);
        });
      }
    });
  });

  const brandsArray = [...collabBrands].slice(0, 10);

  // Si aucune collab trouvée, on renvoie quand même les infos du profil
  if (brandsArray.length === 0) {
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ handle, collabBrands: [], competitors: [], profileFound: items.length > 0 })
    };
  }

  // Appeler l'IA pour générer les concurrents
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Pour chacune de ces marques Instagram qui font de l'influence marketing, donne 3 marques concurrentes directes qui pourraient aussi collaborer avec un influenceur.

Marques : ${brandsArray.join(', ')}

Réponds en JSON uniquement :
[{"brand": "@marque", "competitors": ["@concurrent1", "@concurrent2", "@concurrent3"]}]`
      }]
    })
  });

  const aiData = await aiRes.json();
  const aiText = aiData.content?.[0]?.text || '[]';
  let competitors = [];
  try {
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    competitors = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch(e) { competitors = []; }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ handle, collabBrands: brandsArray, competitors, profileFound: items.length > 0 })
  };
};
