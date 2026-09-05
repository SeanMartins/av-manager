-- ============================================================
-- AV MANAGER — Schema Supabase
-- Incolla tutto questo nel SQL Editor di Supabase
-- e clicca "Run" (▶)
-- ============================================================

-- 1. DIPENDENTI
create table if not exists dipendenti (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cognome text not null,
  email text unique not null,
  telefono text,
  ruolo text default 'Tecnico AV',
  attivo boolean default true,
  created_at timestamptz default now()
);

-- 2. PRESENZE
create table if not exists presenze (
  id uuid default gen_random_uuid() primary key,
  dipendente_id uuid references dipendenti(id) on delete cascade,
  entrata timestamptz default now(),
  uscita timestamptz,
  tipo text default 'sede', -- 'sede' | 'smart_working'
  ore_lavorate numeric(4,2),
  note text
);

-- 3. LOCATION
create table if not exists locations (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  indirizzo text,
  tipo text,
  note text,
  tags text[] default '{}',
  foto_count int default 0,
  created_at timestamptz default now(),
  created_by uuid references dipendenti(id)
);

-- 4. LOCATION PIN (mappa interattiva)
create table if not exists location_pins (
  id uuid default gen_random_uuid() primary key,
  location_id uuid references locations(id) on delete cascade,
  tipo text, -- 'av' | 'el' | 'pr' | 'wi' | 'ge'
  x_pct int,  -- posizione % orizzontale
  y_pct int,  -- posizione % verticale
  nota text,
  created_at timestamptz default now()
);

-- 5. MAGAZZINO
create table if not exists magazzino (
  id text primary key,  -- es. TS001, LW002
  categoria text not null, -- 'traduzione' | 'ledwall'
  nome text not null,
  marca text,
  seriale text,
  quantita int default 1,
  stato text default 'ok', -- 'ok' | 'out' | 'maint'
  note text,
  created_at timestamptz default now()
);

-- 6. TICKET TROUBLESHOOTING
create table if not exists tickets (
  id serial primary key,
  titolo text not null,
  descrizione text,
  categoria text, -- 'Rete/VPN' | 'Hardware' | 'Software' | 'Account'
  priorita text default 'Media', -- 'Alta' | 'Media' | 'Bassa'
  stato text default 'aperto', -- 'aperto' | 'in_lavorazione' | 'risolto'
  segnalato_da uuid references dipendenti(id),
  assegnato_a uuid references dipendenti(id),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — tutti possono leggere,
-- solo utenti autenticati possono scrivere
-- ============================================================

alter table dipendenti enable row level security;
alter table presenze enable row level security;
alter table locations enable row level security;
alter table location_pins enable row level security;
alter table magazzino enable row level security;
alter table tickets enable row level security;

-- Lettura pubblica (necessaria per la PWA senza login obbligatorio)
create policy "Lettura pubblica dipendenti" on dipendenti for select using (true);
create policy "Lettura pubblica presenze" on presenze for select using (true);
create policy "Lettura pubblica locations" on locations for select using (true);
create policy "Lettura pubblica pins" on location_pins for select using (true);
create policy "Lettura pubblica magazzino" on magazzino for select using (true);
create policy "Lettura pubblica tickets" on tickets for select using (true);

-- Scrittura pubblica (per la PWA — in produzione limitare con auth)
create policy "Scrittura pubblica dipendenti" on dipendenti for insert with check (true);
create policy "Scrittura pubblica presenze" on presenze for insert with check (true);
create policy "Aggiornamento presenze" on presenze for update using (true);
create policy "Scrittura pubblica locations" on locations for insert with check (true);
create policy "Scrittura pubblica pins" on location_pins for insert with check (true);
create policy "Scrittura pubblica magazzino" on magazzino for all using (true);
create policy "Scrittura pubblica tickets" on tickets for all using (true);

-- ============================================================
-- DATI DEMO (opzionale — cancella se non vuoi dati di esempio)
-- ============================================================

insert into locations (nome, indirizzo, tipo, note, tags) values
('Palazzo delle Stelline', 'C.so Magenta 61, Milano', 'Hotel / Congress center', 'Soffitti bassi in sala A (3.2m). Ottima acustica in sala B.', array['WiFi','Trifase','Montacarichi']),
('Villa Borromeo d''Adda', 'Via Borromeo 1, Arcore (MB)', 'Villa / Residenza storica', 'Generatore obbligatorio per potenze >15kW. Pavimento 1700: vietato forare.', array['Buio totale','Accesso camion']),
('Superstudio Più', 'Via Tortona 27, Milano', 'Spazio industriale', 'Altezza 8m. Griglia rigging disponibile.', array['Trifase','Generatore','Accesso camion']);

insert into magazzino (id, categoria, nome, marca, seriale, quantita, stato) values
('TS001', 'traduzione', 'Bosch LBB 3422 ricevitore IR', 'Bosch', 'SN-TS001', 24, 'ok'),
('TS002', 'traduzione', 'Audipack Silent 9300 cabina regia', 'Audipack', 'SN-TS002', 2, 'ok'),
('TS003', 'traduzione', 'Bosch DCN-IDEQ centralina', 'Bosch', 'SN-TS003', 1, 'out'),
('TS004', 'traduzione', 'Sennheiser HME 26 cuffie', 'Sennheiser', 'SN-TS004', 8, 'ok'),
('LW001', 'ledwall', 'Absen Acclaim 3.9 Pro modulo LED', 'Absen', 'SN-LW001', 48, 'ok'),
('LW002', 'ledwall', 'Novastar VX6s processore video', 'Novastar', 'SN-LW002', 2, 'ok'),
('LW003', 'ledwall', 'Absen cabinet alluminio 500x500', 'Absen', 'SN-LW003', 12, 'ok'),
('LW004', 'ledwall', 'Meanwell alimentatore 5V/60A', 'Meanwell', 'SN-LW004', 12, 'ok');

-- Fine schema. Clicca RUN ▶
