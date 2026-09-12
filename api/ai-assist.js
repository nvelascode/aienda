// api/ai-assist.js
// Esta función corre en el servidor de Vercel, NUNCA en el navegador de quien usa la app.
// Por eso la clave de OpenAI (OPENAI_API_KEY) puede vivir aquí de forma segura, sin que
// nadie pueda verla o robársela desde las herramientas de desarrollador.

const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-PXExRRGp6CTYxgGd5ftBA_aIHY_04D';

// AJUSTA ESTA LISTA para decidir quién puede usar la IA en Aienda.
// Por ahora: solo tu cuenta. Cuando quieras vender el plan pago, aquí es donde
// agregarías a cada persona que ya pagó (o mejor, se reemplaza por una consulta
// a una tabla de Supabase — pero para una sola persona, esto es más que suficiente).
const ALLOWED_EMAILS = ['nvelascop@ismm.edu.co', 'silvitapinzon2015@gmail.com'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const { text, categorias, token } = req.body || {};

    if (!token) {
      res.status(401).json({ error: 'no_auth' });
      return;
    }

    // Verificamos con Supabase que el token de sesión es real y obtenemos el correo.
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) {
      res.status(401).json({ error: 'no_auth' });
      return;
    }
    const user = await userRes.json();
    const email = (user.email || '').toLowerCase();

    if (!ALLOWED_EMAILS.includes(email)) {
      res.status(403).json({ error: 'no_access' });
      return;
    }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'empty_text' });
      return;
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      res.status(500).json({ error: 'server_misconfigured' });
      return;
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const listaCategorias = Array.isArray(categorias) ? categorias.join(', ') : '';

    const systemPrompt =
      'Eres un asistente que convierte frases en español en un objeto JSON para una app de organización personal. ' +
      'Hoy es ' + hoy + ' (formato YYYY-MM-DD). Categorías de gasto ya existentes en la app: [' + listaCategorias + ']. ' +
      'Responde SOLO con JSON válido, sin explicación ni texto adicional, con esta forma exacta: ' +
      '{"tipo":"gasto|actividad|cumpleanos|pago|medicamento|categoria|mercado|desconocido","campos":{}}. ' +
      'Según el tipo, "campos" debe tener EXACTAMENTE estas llaves: ' +
      'gasto: nombre (string), monto (number, sin símbolos), categoria (el nombre más parecido de la lista de categorías existentes, o "" si ninguna calza), fecha (YYYY-MM-DD, hoy si no se menciona otra). ' +
      'actividad: nombre (string), fecha (YYYY-MM-DD, resolviendo días relativos como "mañana" o "el martes" respecto a hoy), hora (HH:MM en formato 24 horas, o null si no menciona hora), notas (string, puede ser ""), repite (true si describe algo que pasa todas las semanas ese día, false si es un evento puntual). ' +
      'cumpleanos: nombre (string), dia (number 1-31), mes (number 1-12). ' +
      'pago: nombre (string), dia (number 1-31), frecuencia ("mensual" o "bimestral"). ' +
      'medicamento: nombre (string), dosis (string, puede ser ""), horarios (arreglo de strings HH:MM en 24 horas). ' +
      'categoria: usa este tipo SOLO si la persona pide explícitamente crear/agregar una categoría de presupuesto (ej: "crea la categoría transporte", "agrega una categoría de mascotas con 100 mil"). campos: nombre (string), monto (number, 0 si no menciona un monto). ' +
      'mercado: usa este tipo cuando la persona pide agregar algo a la lista o al carrito de mercado/compras (ej: "agrega atún al mercado", "pon leche en el carrito", "necesito comprar papel higiénico"). campos: nombre (string, el producto). ' +
      'Si la frase no calza claramente con ninguno de estos, responde tipo "desconocido" con campos vacío {}.';

    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        response_format: { type: 'json_object' },
        temperature: 0
      })
    });

    if (!chatRes.ok) {
      res.status(502).json({ error: 'gpt_failed' });
      return;
    }

    const chatData = await chatRes.json();
    const raw = (chatData.choices && chatData.choices[0] && chatData.choices[0].message.content) || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = { tipo: 'desconocido', campos: {} }; }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
};
