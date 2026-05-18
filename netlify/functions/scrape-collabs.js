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

  // Lancer le scraping Apify
  const runRes = await fetch(`https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?token=${process.env.APIFY_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernames: [handle],
      resultsLimit: 50
    })
  });

  if (!runRes.ok) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Erreur Apify run' }) };
  }

  const run = await runRes.json();
  const runId = run.data?.id;
  if (!runId) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Pas de runId' }) };
  }

  // Attendre que le run soit terminé (max 60s)
  let status = 'RUNNING';
  let attempts = 0;
  while (status === 'RUNNING' && attempts < 12) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${process.env.APIFY_API_KEY}`);
    const statusData = await statusRes.json();
    status = statusData.data?.status;
    attempts++;
  }

  if (status !== 'SUCCEEDED') {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Run terminé avec statut: ${status}` }) };
  }

  // Récupérer les résultats
  const dataRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${process.env.APIFY_API_KEY}`);
  const items = await dataRes.json();

  // Filtrer les posts sponsorisés
  const sponsoredKw = ['#ad', '#sponsored', '#partenariat', '#collab', '#partnership', '#gifted', '#pub', 'paid partnership', 'collaboration payée', 'partenariat rémunéré'];
  const collabBrands = new Set();

  (items || []).forEach(item => {
    const posts = item.latestPosts || [];
    posts.forEach(post => {
      const caption = (post.caption || '').toLowerCase();
      if (sponsoredKw.some(k => caption.includes(k))) {
        const mentions = caption.match(/@[\w.]+/g);
        if (mentions) mentions.forEach(m => {
          if (m.replace('@', '') !== handle.toLowerCase()) collabBrands.add(m);
        });
      }
    });
  });

  // Appeler l'IA pour générer les concurrents
  const brandsArray = [...collabBrands].slice(0, 10);

  let competitors = [];
  if (brandsArray.length > 0) {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Pour chacune de ces marques Instagram qui font de l'influence marketing, donne 3 marques concurrentes directes qui font aussi de l'influence marketing et qui pourraient collaborer avec un influenceur similaire.

Marques détectées : ${brandsArray.join(', ')}

Réponds en JSON uniquement, format :
[{"brand": "@marque_originale", "competitors": ["@concurrent1", "@concurrent2", "@concurrent3"]}]`
        }]
      })
    });
    const aiData = await aiRes.json();
    const aiText = aiData.content?.[0]?.text || '[]';
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      competitors = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch(e) { competitors = []; }
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      handle,
      collabBrands: brandsArray,
      competitors
    })
  };
};
