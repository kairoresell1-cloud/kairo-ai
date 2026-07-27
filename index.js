/**
 * index.js
 * Entry point del bot. Se hai gia' un index.js per shop-manager-bot,
 * copia solo le righe segnate con "<-- AGGIUNGI QUESTO" nel tuo file esistente,
 * non serve creare un bot separato.
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { setupSupportAI } = require('./support-ai'); // <-- AGGIUNGI QUESTO

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // OBBLIGATORIO per leggere il testo dei messaggi
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Bot online come ${client.user.tag}`);
});

setupSupportAI(client); // <-- AGGIUNGI QUESTO

client.login(process.env.DISCORD_TOKEN);
