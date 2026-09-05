# AV Manager — Guida al deploy

## Struttura file
```
av-pwa/
├── index.html      ← App completa (unico file)
├── manifest.json   ← Configurazione PWA
├── sw.js           ← Service Worker (offline)
├── icon-192.png    ← Icona app 192×192
├── icon-512.png    ← Icona app 512×512
├── vercel.json     ← Config Vercel (headers, routing)
└── DEPLOY.md       ← Questa guida
```

---

## 🚀 Deploy su Vercel (gratuito, 5 minuti)

### Passo 1 — Crea un account GitHub
Se non ce l'hai: https://github.com/signup

### Passo 2 — Crea un repository
1. Vai su https://github.com/new
2. Nome: `av-manager`
3. Visibilità: **Private**
4. Clicca "Create repository"

### Passo 3 — Carica i file
Nella pagina del repository, clicca "uploading an existing file" e trascina:
- `index.html`
- `manifest.json`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `vercel.json`

Clicca "Commit changes".

### Passo 4 — Deploy su Vercel
1. Vai su https://vercel.com e accedi con GitHub
2. Clicca "Add New Project"
3. Seleziona il repo `av-manager`
4. Clicca "Deploy" (nessuna configurazione necessaria)
5. Dopo ~30 secondi l'app è live su `av-manager.vercel.app`

---

## 📲 Installare l'app su iPhone

1. Apri Safari e vai su `av-manager.vercel.app`
2. Tocca il tasto **Condividi** (quadrato con freccia su)
3. Scorri e tocca **"Aggiungi a schermata Home"**
4. Conferma con **"Aggiungi"**

L'icona AV Manager apparirà sulla home come un'app vera.

---

## 📲 Installare l'app su Android

1. Apri Chrome e vai su `av-manager.vercel.app`
2. Apparirà un banner in basso: **"Installa AV Manager"**
3. Tocca **"Installa"**

In alternativa: menu (⋮) → "Aggiungi a schermata Home"

---

## 🔧 Personalizzazione

### Cambiare nome azienda
Nel file `index.html`, cerca e sostituisci:
- `"AV Manager"` → il nome della tua azienda
- `"Gestione eventi audio-video"` → il tuo sottotitolo

### Aggiungere il tuo dominio
Su Vercel → Settings → Domains → aggiungi es. `app.tuaazienda.it`
(richiede di aggiungere un record DNS presso il tuo provider)

### Colori brand
Nel file `index.html`, nella sezione `:root { }`, cambia:
- `--accent: #6c63ff` → il colore principale del tuo brand (es. `#e63946`)
- `--accent2: #8b84ff` → versione più chiara dello stesso colore

---

## 🗄️ Aggiungere database reale (Supabase)

Per salvare i dati su un database vero invece che in memoria:

1. Crea account su https://supabase.com (gratuito)
2. Crea un nuovo progetto
3. Vai su "SQL Editor" ed esegui:

```sql
-- Tabella dipendenti
create table dipendenti (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cognome text not null,
  email text unique not null,
  telefono text,
  ruolo text,
  created_at timestamptz default now()
);

-- Tabella presenze
create table presenze (
  id uuid default gen_random_uuid() primary key,
  dipendente_id uuid references dipendenti(id),
  entrata timestamptz,
  uscita timestamptz,
  tipo text default 'sede'
);

-- Tabella location
create table locations (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  indirizzo text,
  tipo text,
  note text,
  tags text[],
  created_at timestamptz default now()
);

-- Tabella magazzino
create table magazzino (
  id text primary key,
  categoria text,
  nome text not null,
  marca text,
  seriale text,
  quantita int default 1,
  stato text default 'ok',
  note text
);
```

4. Copia la "Project URL" e la "anon key" da Settings → API
5. Nel file `index.html`, aggiungi in cima allo `<script>`:

```js
const SUPABASE_URL = 'https://xxx.supabase.co';
const SUPABASE_KEY = 'eyJ...';
```

6. Sostituisci le funzioni `salvaLocation()`, `salvaArticolo()` etc. con chiamate fetch a Supabase.

---

## 📋 Funzionalità incluse nell'app

✅ Timbratura presenze con orologio live
✅ Registro team con stati (in sede / smart working / pausa)
✅ Ticket troubleshooting con priorità
✅ Database location con mappa pin interattiva
✅ Upload foto e planimetrie per ogni location
✅ Inventario magazzino (traduzione simultanea + LED wall)
✅ Generazione QR code per ogni articolo
✅ Kit evento automatico (calcola materiali per n. lingue + LED wall)
✅ Registrazione dipendenti via QR code
✅ QR di registrazione con ruolo preassegnato e scadenza
✅ Checklist sopralluogo AV con progress bar
✅ Funziona offline (Service Worker)
✅ Installabile su iPhone e Android dalla schermata Home
✅ Privacy GDPR inclusa nel form di registrazione

---

## 💰 Costi

| Servizio | Piano gratuito | Limite |
|----------|---------------|--------|
| Vercel   | Gratuito      | Illimitato per uso personale/team piccolo |
| Supabase | Gratuito      | 500MB database, 1GB storage |
| Dominio  | ~10€/anno     | Opzionale |

**Totale per iniziare: 0€**
