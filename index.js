/**
 * index.js
 * Entry point del bot. Se hai gia' un index.js per shop-manager-bot,
 * copia solo le righe segnate con "<-- AGGIUNGI QUESTO" nel tuo file esistente,
 * non serve creare un bot separato.
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { setupSupportAI, commandsData } = require('./support-ai'); // <-- AGGIUNGI QUESTO

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // OBBLIGATORIO per leggere il testo dei messaggi
  ],
  partials: [Partials.Channel],
});

client.once('clientReady', async () => {
  console.log(`Bot online come ${client.user.tag}`);

  // Registra /stop e /start su ogni server in cui è presente il bot
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.commands.set(commandsData);
      console.log(`Comandi slash registrati su: ${guild.name}`);
    } catch (err) {
      console.error(`Errore registrando comandi su ${guild.name}:`, err);
    }
  }
});

setupSupportAI(client); // <-- AGGIUNGI QUESTO

client.login(process.env.DISCORD_TOKEN);
