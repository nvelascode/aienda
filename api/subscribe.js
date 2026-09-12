// api/subscribe.js
const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-PXExRRGp6CTYxgGd5ftBA_aIHY_04D';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const { token, subscription } = req.body || {};
    if (!token || !subscription) {
      res.status(400).json({ error: 'missing_fields' });
      return;
    }

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) { res.status(401).json({ error: 'no_auth' }); return; }
    const user = await userRes.json();

    const endpoint = subscription && subscription.endpoint;
    if (!endpoint) { res.status(400).json({ error: 'invalid_subscription' }); return; }

    // Guardamos con el propio token del usuario: las reglas de seguridad (RLS)
    // solo le dejan escribir sus propias filas, así que esto es seguro.
    // Se identifica cada fila por "endpoint" (único por dispositivo/navegador),
    // no por usuario, para que una persona pueda tener celular + computador a la vez.
    const upsertRes = await fetch(SUPABASE_URL + '/rest/v1/aienda_push?on_conflict=endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token,
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ user_id: user.id, subscription, endpoint, updated_at: new Date().toISOString() })
    });
    if (!upsertRes.ok) { res.status(502).json({ error: 'save_failed' }); return; }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
};
