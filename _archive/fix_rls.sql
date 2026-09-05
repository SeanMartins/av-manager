-- ============================================================
-- AV MANAGER — FIX RLS (Row Level Security)
-- Incolla questo nel SQL Editor di Supabase e clicca RUN ▶
-- Risolve il problema: i nuovi dati non vengono salvati
-- ============================================================

-- 1. Rimuovi le policy esistenti (ignora errori "does not exist")
drop policy if exists "Lettura pubblica dipendenti" on dipendenti;
drop policy if exists "Lettura pubblica presenze" on presenze;
drop policy if exists "Lettura pubblica locations" on locations;
drop policy if exists "Lettura pubblica pins" on location_pins;
drop policy if exists "Lettura pubblica magazzino" on magazzino;
drop policy if exists "Lettura pubblica tickets" on tickets;
drop policy if exists "Scrittura pubblica dipendenti" on dipendenti;
drop policy if exists "Scrittura pubblica presenze" on presenze;
drop policy if exists "Aggiornamento presenze" on presenze;
drop policy if exists "Scrittura pubblica locations" on locations;
drop policy if exists "Scrittura pubblica pins" on location_pins;
drop policy if exists "Scrittura pubblica magazzino" on magazzino;
drop policy if exists "Scrittura pubblica tickets" on tickets;

-- 2. Disabilita RLS su tutte le tabelle (approccio più semplice per PWA senza auth)
alter table dipendenti disable row level security;
alter table presenze disable row level security;
alter table locations disable row level security;
alter table location_pins disable row level security;
alter table magazzino disable row level security;
alter table tickets disable row level security;

-- 3. Riabilita RLS con policy permissive complete (SELECT + INSERT + UPDATE + DELETE)
alter table dipendenti enable row level security;
alter table presenze enable row level security;
alter table locations enable row level security;
alter table location_pins enable row level security;
alter table magazzino enable row level security;
alter table tickets enable row level security;

-- DIPENDENTI: accesso completo pubblico
create policy "dipendenti_all" on dipendenti
  for all using (true) with check (true);

-- PRESENZE: accesso completo pubblico
create policy "presenze_all" on presenze
  for all using (true) with check (true);

-- LOCATIONS: accesso completo pubblico
create policy "locations_all" on locations
  for all using (true) with check (true);

-- LOCATION_PINS: accesso completo pubblico
create policy "location_pins_all" on location_pins
  for all using (true) with check (true);

-- MAGAZZINO: accesso completo pubblico
create policy "magazzino_all" on magazzino
  for all using (true) with check (true);

-- TICKETS: accesso completo pubblico
create policy "tickets_all" on tickets
  for all using (true) with check (true);

-- 4. Verifica che tutto funzioni — dovresti vedere le tabelle
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
