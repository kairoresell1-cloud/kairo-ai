# Discord Support AI Bot

Bot di supporto clienti per shop Discord, con risposte AI gratuite via Groq
ed escalation automatica allo staff quando serve un umano.

## Setup

1. `npm install`
2. Copia `.env.example` in `.env` e riempi i valori (solo in locale, mai su GitHub)
3. Su Railway: aggiungi le stesse variabili nella tab "Variables" del progetto
4. `npm start` (in locale) — su Railway il deploy parte da solo dopo il push

## File

- `index.js` — avvio del bot e login Discord
- `support-ai.js` — logica AI: riconosce i canali ticket, chiama Groq, gestisce l'escalation allo staff

Personalizza le FAQE del tuo shop dentro `support-ai.js`, variabile `SHOP_KNOWLEDGE`.
