// api/ai-assist.js
const SUPABASE_URL = 'https://hymclqcdpplamdinfrhb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-PXExRRGp6CTYxgGd5ftBA_aIHY_04D';

const ALLOWED_EMAILS = ['nvelascop@ismm.edu.co', 'silvitapinzon2015@gmail.com', 'judys_90@hotmail.com'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const { text, contexto, token } = req.body || {};

    if (!token) {
      res.status(401).json({ error: 'no_auth' });
      return;
    }

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

    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const contextoJson = contexto ? JSON.stringify(contexto) : '{}';

    const systemPrompt =
      'Eres un asistente que convierte frases en español en un objeto JSON para una app de organización personal. ' +
      'Hoy es ' + hoy + ' (formato YYYY-MM-DD). ' +
      'Estos son los datos actuales guardados por esta persona (úsalos SOLO para responder preguntas, tipo "consulta"): ' + contextoJson + '. ' +
      'El contexto trae estas secciones: "actividadesProximosDias" (arreglo de los próximos 7 días, el que tiene esHoy:true es hoy, cada uno con su lista "actividades"), "proximosCompromisosPuntuales" (TODAS las citas o eventos de un solo día que la persona tiene agendados a futuro, sin importar qué tan lejos estén — úsala para preguntas sobre una cita específica que puede caer más allá de los próximos 7 días, ej. "¿cuándo es mi cita de audiología?"), "cumpleanos", "pagos", "presupuesto" (puede venir null si la persona no ha configurado su ingreso mensual; si no es null trae "ingresoMensual", "gastadoEnNecesidades", "gastadoEnDeseos", "ahorradoOInvertido" y "sinRegistrar" — este último es lo que del ingreso aún no se ha registrado como gastado ni ahorrado, NO es un elogio ni un defecto, es solo dinero sin clasificar todavía), "medicamentos", "mercado" (con "enCarritoPendiente": lo que falta comprar, "enCarritoYaComprado": lo ya marcado como comprado, y "listaPredeterminadaCompleta": todos los productos que existen en la lista aunque no estén en el carrito), y "signosVitalesRecientes" (los últimos registros de presión, frecuencia cardíaca, glicemia, peso y otras métricas personalizadas, más reciente primero). ' +
      'Responde SOLO con JSON válido, sin explicación ni texto adicional, con esta forma exacta: ' +
      '{"tipo":"gasto|actividad|cumpleanos|pago|medicamento|mercado|consulta|signos|desconocido","campos":{}}. ' +
      'Según el tipo, "campos" debe tener EXACTAMENTE estas llaves: ' +
      'gasto: nombre (string), monto (number, sin símbolos), tipo ("necesidad" si es un gasto obligatorio como arriendo/servicios/mercado/transporte/salud/deudas; "deseo" si es estilo de vida como restaurantes/entretenimiento/compras/viajes; "ahorro" si la persona está apartando o invirtiendo dinero, ej. un CDT, una transferencia a ahorros, una inversión — infiere el que mejor calce según el nombre del gasto), fecha (YYYY-MM-DD, hoy si no se menciona otra). ' +
      'actividad: nombre (string), fecha (YYYY-MM-DD, resolviendo días relativos como "mañana" o "el martes" respecto a hoy), hora (HH:MM en formato 24 horas, o null si no menciona hora), notas (string, puede ser ""), repite (true si describe algo que pasa todas las semanas ese día, false si es un evento puntual). ' +
      'cumpleanos: nombre (string), dia (number 1-31), mes (number 1-12). ' +
      'pago: nombre (string), dia (number 1-31), frecuencia ("mensual" o "bimestral"). ' +
      'medicamento: nombre (string), dosis (string, puede ser ""), horarios (arreglo de strings HH:MM en 24 horas). ' +
      'mercado: usa este tipo cuando la persona pide agregar uno o varios productos a la lista o al carrito de mercado/compras (ej: "agrega atún al mercado", "pon leche en el carrito", "agrégame pan, huevos, leche y pollo"). campos: {"productos": arreglo de strings, UNO por cada producto mencionado en la frase — si menciona varios, inclúyelos TODOS, nunca solo el último}. ' +
      'consulta: usa este tipo cuando la persona hace una PREGUNTA sobre algo que ya tiene guardado en cualquiera de las secciones del contexto (actividades, citas puntuales, cumpleaños, pagos, presupuesto/gastos, medicamentos, mercado, o signos vitales) — por ejemplo "¿qué tengo que comprar?", "¿cuándo es mi cita de audiología?", "¿cuánto llevo gastado en necesidades?", "¿cuánto he ahorrado este mes?", "¿qué pagos me faltan?", "¿a qué hora me toca el losartán?", "¿tengo actividades hoy?", "¿cuál fue mi última presión arterial?". Revisa TANTO "actividadesProximosDias" COMO "proximosCompromisosPuntuales" antes de decir que no tienes la información — una cita puede estar guardada más allá de los próximos 7 días. Si "presupuesto" es null y preguntan por plata, dile que aún no ha configurado su ingreso mensual en el Plan financiero. Para preguntas de mercado usa "enCarritoPendiente" (lo que falta comprar) salvo que la persona pregunte específicamente por lo ya comprado o por toda la lista. Responde usando ÚNICAMENTE los datos del contexto de arriba — si de verdad no encuentras esa información en ninguna sección, dilo claramente en vez de inventar. campos: {"respuesta": string} — una respuesta corta, hablada, en español natural, como si se la dijeras en voz alta a la persona (máximo 2-3 frases). ' +
      'signos: usa este tipo cuando la persona quiera registrar un signo vital (presión arterial, frecuencia cardíaca, glicemia o peso) (ej: "mi presión hoy fue 120 sobre 80", "registra mi glicemia en 95", "mi peso es 68 kilos"). campos: sistolica (number o null), diastolica (number o null), fc (number o null, frecuencia cardíaca), glicemia (number o null), peso (number o null), fecha (YYYY-MM-DD, hoy si no se menciona otra). Deja en null cualquier valor que no se haya mencionado en la frase. ' +
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
