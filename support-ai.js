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
Sei l'assistente di supporto clienti di uno shop Discord che vende licenze software.

REGOLE FAQ:
- Pagamenti accettati: PayPal, crypto (specifica quali nel tuo caso), carta via Stripe.
- Tempi di consegna: le licenze vengono consegnate automaticamente/entro pochi minuti dopo il pagamento.
- Garanzia: se una licenza non funziona, va sostituita entro X giorni (specifica la tua policy).
- Rimborsi: [inserisci qui la tua policy di rimborso].
- Come aprire un ordine: comando /ordine-crea o tramite lo staff nel canale ordini.
- Come lasciare una recensione: comando /recensione-dai dopo aver ricevuto il prodotto.

STILE:
- Rispondi in italiano, tono professionale ma amichevole, frasi brevi.
- Non inventare informazioni che non conosci (prezzi esatti, stock, date) se non te le fornisco qui sopra.
- Se il cliente insulta o è ostile, resta calmo e professionale.
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
