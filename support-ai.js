/**
 * support-ai.js
 * Modulo AI per rispondere ai clienti nei canali/ticket di supporto.
 * Usa l'API GRATUITA di Groq (Llama 3.3) per generare risposte basate sulle FAQ dello shop.
 * Se l'AI non sa rispondere con certezza, fa escalation pingando lo staff.
 *
 * INTEGRAZIONE nel bot esistente (index.js):
 *   const { setupSupportAI } = require('./support-ai');
 *   setupSupportAI(client);
 *
 * VARIABILI D'AMBIENTE richieste (Railway -> Variables):
 *   GROQ_API_KEY          -> la tua API key gratuita (console.groq.com -> API Keys)
 *   TICKET_CHANNEL_PREFIX -> prefisso dei nomi canale ticket (default: "ticket-")
 *   STAFF_ROLE_ID         -> ID del ruolo staff da pingare in escalation
 *
 * NOTA su Ticket King: se i tuoi ticket non finiscono in nessuna categoria,
 * il bot li riconosce dal NOME del canale (es. "ticket-0001"). Controlla come
 * si chiamano davvero i tuoi canali ticket e aggiorna TICKET_CHANNEL_PREFIX se serve.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile'; // gratis su Groq, ottimo per l'italiano

// ============================================================
// 1) BASE DI CONOSCENZA — modifica liberamente questa sezione
// ============================================================
const SHOP_KNOWLEDGE = `
Sei l'assistente di supporto clienti di KAIRO, uno shop Discord che vende licenze e account digitali.

PAGAMENTI:
- Accettiamo SOLO PayPal Amici e Familiari (Friends & Family).
- Il pagamento viene sempre controllato dall'owner prima. Una volta confermato, lo staff consegna la key/account.
- Non promettere consegne "istantanee": spiega che c'è un controllo prima della consegna da parte dell'owner.

GARANZIA:
- Se una licenza/account non funziona (es. Netflix "va via"), il cliente ha 10 giorni di tempo dall'acquisto per richiedere la sostituzione (replace).
- Per la sostituzione servono PROVE (screenshot/video dell'errore). Senza prove non si procede.

RIMBORSI:
- Rimborso concesso SOLO se l'errore non è del cliente, es. l'account/key era già non funzionante al momento della consegna.
- NESSUN rimborso se il problema è causato dal cliente (es. cambio password account condiviso, uso scorretto, violazione dei termini del servizio originale).

LISTINO PREZZI (tutto LIFETIME salvo dove specificato):
- Netflix (richiede VPN per collegarsi all'account proprietario): 3,99€
- Netflix (nessuna VPN richiesta): 4,99€
- YouTube Premium: 4,99€
- Canva Pro: 5,99€
- Membri Discord reali: 10€ ogni 500 membri
- DAZN: 4,99€
- Crunchyroll Mega Fan: 3,99€
- Licenze FiveM: 0,99€
- Spotify: 14,99€
- ChatGPT (Plus): 17,99€
- CapCut Pro: 4,99€
- Amazon (Prime): 5,99€
- Disney+: 4,99€
- NordVPN: 4,99€
- Steam giochi (Lifetime):
  - Wallpaper Engine: 1,99€
  - Pacchetto 4+ giochi casuali: 2,99€
  - Euro Truck Simulator: 2,99€
  - Rust: 3,99€
  - GTA V: 3,99€
  - Red Dead Redemption: 9,99€

COME ORDINARE:
- Comando /ordine-crea per aprire un ordine, oppure tramite lo staff nel canale ordini.
- Comando /recensione-dai per lasciare una recensione dopo la consegna.

STILE E ATTEGGIAMENTO:
- IMPORTANTE: rispondi SEMPRE nella stessa lingua in cui scrive il cliente (se scrive in inglese rispondi in inglese, se scrive in italiano rispondi in italiano, ecc.). Se non riesci a capire la lingua, rispondi in italiano.
- Tono SICURO di sé e persuasivo, da vero venditore.
- Promuovi attivamente KAIRO: fai notare che i prezzi sono competitivi, che il servizio è affidabile, e spingi il cliente a comprare di più (es. se chiede di un prodotto, suggerisci anche altri prodotti correlati dal listino).
- Sii convincente ma mai aggressivo o menzognero: non promettere cose che non sono nel listino o nelle policy sopra.
- NON rispondere a domande non pertinenti allo shop (es. chiacchiere generiche, argomenti a caso, richieste esterne al servizio). In quel caso rispondi brevemente che sei qui solo per supporto/acquisti KAIRO e riporta la conversazione sui prodotti, sempre nella lingua del cliente.
- Frasi brevi, dirette, senza girarci troppo intorno.
`.trim();

// ============================================================
// 2) CONFIGURAZIONE
// ============================================================
// Riconosce i ticket dal nome del canale (es. "ticket-0001")
const TICKET_CHANNEL_PREFIX = process.env.TICKET_CHANNEL_PREFIX || 'ticket-';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const ESCALATION_TAG = '[ESCALATION]';

const SYSTEM_PROMPT = `${SHOP_KNOWLEDGE}

IMPORTANTE: Se non sei sicuro della risposta, se il cliente chiede qualcosa che richiede
l'intervento di un umano (rimborso specifico, problema tecnico complesso, controversia),
oppure se il cliente chiede esplicitamente di parlare con lo staff, rispondi SOLO con:
${ESCALATION_TAG} seguito da una breve frase che spiega al cliente che lo staff verrà avvisato.
Non usare ${ESCALATION_TAG} per domande semplici a cui sai rispondere.`;

// Cronologia conversazioni in memoria, per canale (si resetta al riavvio del bot)
const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 10;

// ============================================================
// 3) CHIAMATA ALL'API GROQ (formato compatibile OpenAI)
// ============================================================
async function askAI(channelId, userMessage) {
  const history = conversationHistory.get(channelId) || [];
  history.push({ role: 'user', content: userMessage });

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;

  history.push({ role: 'assistant', content: reply });
  conversationHistory.set(channelId, history.slice(-MAX_HISTORY_MESSAGES));

  return reply;
}

// ============================================================
// 4) LISTENER DISCORD
// ============================================================
function setupSupportAI(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Risponde solo nei canali ticket, riconosciuti dal nome (es. "ticket-0001")
    if (!message.channel.name?.startsWith(TICKET_CHANNEL_PREFIX)) return;

    try {
      await message.channel.sendTyping();
      const reply = await askAI(message.channel.id, message.content);

      if (reply.startsWith(ESCALATION_TAG)) {
        const cleanReply = reply.replace(ESCALATION_TAG, '').trim();
        await message.reply(
          `${cleanReply}\n\n${STAFF_ROLE_ID ? `<@&${STAFF_ROLE_ID}>` : '@staff'} il cliente ha bisogno di supporto umano su questo ticket.`
        );
        // Da qui in poi il bot smette di auto-rispondere in questo canale finché lo staff non interviene
        conversationHistory.delete(message.channel.id);
      } else {
        await message.reply(reply);
      }
    } catch (err) {
      console.error('[support-ai] errore:', err);
      await message.reply(
        `Si è verificato un errore, ${STAFF_ROLE_ID ? `<@&${STAFF_ROLE_ID}>` : 'staff'} può darci un'occhiata?`
      );
    }
  });
}

module.exports = { setupSupportAI };
