# SATELLITE OSINT — API & DATA SOURCES

**Integration Guide per il Progetto T-TeC SDA**
Space Domain Awareness — Knowledge Layer
T-TeC 7ª Edizione — Leonardo / Telespazio | Marzo 2026

---

## Obiettivo del Documento

Questo documento cataloga tutte le API e le fonti dati OSINT pubbliche e gratuite integrabili nella piattaforma SDA del progetto T-TeC. L'obiettivo è trasformare il sistema da semplice tracker orbitale a piattaforma di intelligence spaziale completa, dove ogni oggetto in orbita è arricchito con il massimo contesto disponibile: chi lo opera, per quale scopo, quali frequenze usa, quale rischio di collisione presenta, e come l'ambiente spaziale lo influenza.

## Architettura di Integrazione

Le fonti sono organizzate in 3 tier:

- **Tier 1 — Core Orbital Intelligence:** CelesTrak + Space-Track. Dati orbitali primari, catalogo e collision warnings. Polling ogni 2–12 ore.
- **Tier 2 — Enrichment & OSINT Context:** N2YO, UCS, DISCOS, SatNOGS. Profili satellite completi, frequenze RF, pass predictions. Query on-demand o giornaliera.
- **Tier 3 — Specialized Intelligence:** SOCRATES, reentry feeds, space weather, launch data. Alert-based o polling orario.

---

## TIER 1 — Core Orbital Intelligence

### CelesTrak GP/SupGP API

| | |
|---|---|
| **Endpoint** | `celestrak.org/NORAD/elements/gp.php` |
| **Autenticazione** | Nessuna (pubblico) |
| **Rate Limit** | Ragionevole, no hard cap |
| **Formato Dati** | TLE, OMM (JSON/XML/CSV/KVN) |

**Dati e Feature Disponibili:**

- Dati GP (General Perturbations) per 68.000+ oggetti catalogati
- Query per CATNR, INTDES, GROUP, NAME — output JSON nativo
- Supplemental GP (SupGP): effemeridi ad alta precisione da operatori (SpaceX Starlink, Intelsat, AST SpaceMobile, ISS, CPF/ILRS)
- Gruppi predefiniti: STATIONS, VISUAL, STARLINK, ACTIVE, ANALYST, DEBRIS, WEATHER, GPS, GLONASS, GALILEO, ecc.
- SATCAT: catalogo completo con nome, designatore internazionale, paese, tipo oggetto, stato orbitale, data lancio/rientro
- SOCRATES (Satellite Orbital Conjunction Reports): report di avvicinamento ravvicinato aggiornati 2x/giorno

> **Valore per SDA:** Fondamento del sistema. Fornisce i dati orbitali primari per il tracking in real-time di tutti gli oggetti catalogati.

**Esempio query:**
```
https://celestrak.org/NORAD/elements/gp.php?GROUP=STATIONS&FORMAT=JSON
https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON-PRETTY
https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?SOURCE=SpaceX&FORMAT=JSON
```

---

### Space-Track.org API

| | |
|---|---|
| **Endpoint** | `space-track.org/basicspacedata/query/...` |
| **Autenticazione** | Account gratuito (registrazione obbligatoria) |
| **Rate Limit** | 30 req/min, 300 req/ora |
| **Formato Dati** | JSON (classi: gp, satcat, cdm_public, decay, launch_site, tip, boxscore) |

**Dati e Feature Disponibili:**

- GP completo con covariance e metadata estesi (RCS, OBJECT_TYPE, SITE, COUNTRY_CODE)
- Conjunction Data Messages (CDM) pubblici: probabilità di collisione, miss distance, TCA
- SATCAT esteso: tipo oggetto (PAYLOAD/ROCKET BODY/DEBRIS/UNKNOWN), paese, sito di lancio
- Decay/TIP messages: previsione di rientro atmosferico con finestra temporale
- Boxscore: statistiche aggregate per paese (oggetti in orbita, decaduti, totali)
- Launch Site: coordinate e metadata di tutti i siti di lancio
- GP History: serie storica di elementi orbitali per analisi di manovre

> **Valore per SDA:** Complemento essenziale a CelesTrak. Unica fonte pubblica per CDM (collision warnings), RCS (radar cross-section) e dati di rientro.

**Esempio query:**
```
# CDM pubblici con probabilità > 10%
/basicspacedata/query/class/cdm_public/PC/>0.1/orderby/TCA asc/

# SATCAT per tutti i payload russi
/basicspacedata/query/class/satcat/COUNTRY_CODE/CIS/OBJECT_TYPE/PAYLOAD/

# Decay predictions
/basicspacedata/query/class/decay/orderby/DECAY_EPOCH desc/limit/20/
```

---

## TIER 2 — Enrichment & OSINT Context

### N2YO REST API

| | |
|---|---|
| **Endpoint** | `n2yo.com/api/` |
| **Autenticazione** | API key gratuita (registrazione) |
| **Rate Limit** | 1000 transazioni/ora (free tier) |
| **Formato Dati** | JSON |

**Dati e Feature Disponibili:**

- `get_tle`: TLE per NORAD ID
- `get_positions`: posizioni future come footprint (lat/lon) + azimuth/elevation da osservatore
- `get_visualpasses`: passaggi visibili da una località (satellite illuminato + cielo scuro)
- `get_radiopasses`: finestre di comunicazione radio per HAM/SATCOM
- `get_above`: tutti i satelliti sopra una località entro raggio di ricerca (filtrabile per categoria: military, weather, ISS, ecc.)

> **Valore per SDA:** Aggiunge pass prediction e footprint mapping in tempo reale. Ideale per l'overlay su mappa e per alert di visibilità.

**Esempio query:**
```
# Posizione ISS da Roma per i prossimi 300 secondi
https://api.n2yo.com/rest/v1/satellite/positions/25544/41.9/12.5/0/300/&apiKey=KEY

# Satelliti militari sopra Roma (raggio 70°)
https://api.n2yo.com/rest/v1/satellite/above/41.9/12.5/0/70/30/&apiKey=KEY
```

---

### UCS Satellite Database

| | |
|---|---|
| **Endpoint** | `ucsusa.org/resources/satellite-database` |
| **Autenticazione** | Download diretto (Excel/TSV) |
| **Rate Limit** | Aggiornato trimestralmente |
| **Formato Dati** | Excel / TSV (7.560+ satelliti operativi) |

**Dati e Feature Disponibili:**

- 28 campi per satellite: nome, paese operatore, proprietario, utente (civile/commerciale/gov/militare), scopo
- Dettagli missione: scopo dettagliato (Earth Observation, Communications, Navigation, SIGINT, ELINT, ecc.)
- Dati fisici: massa al lancio, massa a secco, potenza (watt), vita operativa prevista
- Dati orbitali: classe orbita, tipo, perigeo, apogeo, eccentricità, inclinazione, periodo
- Provenance: costruttore, paese costruttore, sito di lancio, vettore, COSPAR, NORAD number
- Cross-reference: collega NORAD ID alla missione e all'operatore reale

> **Valore per SDA:** Intelligence layer fondamentale: trasforma un NORAD ID numerico in un profilo completo (chi opera, per cosa, da quando, con che capacità).

---

### ESA DISCOS / DISCOSweb API

| | |
|---|---|
| **Endpoint** | `discosweb.esoc.esa.int` |
| **Autenticazione** | Account ESA (enti di stati membri ESA) |
| **Rate Limit** | Quota per utente |
| **Formato Dati** | JSON REST API |

**Dati e Feature Disponibili:**

- 38.700+ oggetti tracciati dal 1957 (Sputnik-1) con 10M+ record orbitali
- Storico orbite completo per ogni oggetto
- Proprietà fisiche: dimensione, massa, forma, sezione efficace
- Dettagli lancio: veicolo, sito, data, orbita iniziale
- Descrizione missione e obiettivi
- Database rientri: previsioni e storico di rientri atmosferici
- Fragmentation events: log di tutti gli eventi di frammentazione in orbita (290+)

> **Valore per SDA:** Fonte europea di riferimento. Storico orbitale profondo e proprietà fisiche dettagliate non disponibili altrove.

---

### SatNOGS DB API

| | |
|---|---|
| **Endpoint** | `db.satnogs.org/api/` |
| **Autenticazione** | Pubblica (nessuna chiave) |
| **Rate Limit** | Ragionevole |
| **Formato Dati** | JSON REST |

**Dati e Feature Disponibili:**

- Endpoint: `/satellites`, `/transmitters`, `/telemetry`, `/tle`, `/modes`, `/optical-observations`
- Database trasmettitori: frequenze uplink/downlink, modo, baud rate, stato per ogni satellite
- Telemetria decodificata: dati di housekeeping ricevuti dalla rete globale di ground station
- Osservazioni ottiche della community
- Collegamento diretto a TLE aggiornati

> **Valore per SDA:** Unica fonte open per profili RF dei satelliti: frequenze, modi, potenza. Fondamentale per SIGINT/ELINT awareness e per identificare emissioni.

**Esempio query:**
```
https://db.satnogs.org/api/satellites/
https://db.satnogs.org/api/transmitters/?satellite__norad_cat_id=25544
```

---

## TIER 3 — Specialized Intelligence Feeds

### CelesTrak SOCRATES

| | |
|---|---|
| **Endpoint** | `celestrak.org/SOCRATES/` |
| **Autenticazione** | Pubblica |
| **Rate Limit** | Aggiornato 2x/giorno |
| **Formato Dati** | HTML/CSV |

**Dati e Feature Disponibili:**

- Top conjunction events: le coppie di oggetti con la minima distanza prevista
- Filtro per altitudine, tipo oggetto, distanza minima
- Probabilità di collisione stimata
- Storico eventi di avvicinamento

> **Valore per SDA:** Alert system per collision risk. Può alimentare un widget di early warning sulla piattaforma.

---

### ESA Reentry Predictions

| | |
|---|---|
| **Endpoint** | `reentry.esoc.esa.int` |
| **Autenticazione** | Pubblica |
| **Rate Limit** | Aggiornato più volte/giorno |
| **Formato Dati** | Web/JSON |

**Dati e Feature Disponibili:**

- Lista oggetti in fase di rientro imminente
- Finestre di rientro previste con incertezza
- Ground track del potenziale corridoio di rientro
- Analisi di rischio per oggetti ad alto interesse

> **Valore per SDA:** Feed critico per awareness su rientri incontrollati. Visualizzabile come overlay dinamico.

---

### Aerospace Corp CORDS Reentry DB

| | |
|---|---|
| **Endpoint** | `aerospace.org/reentries` |
| **Autenticazione** | Pubblica |
| **Rate Limit** | Database storico |
| **Formato Dati** | Web / Structured |

**Dati e Feature Disponibili:**

- Storico completo rientri dal 2000
- Tipo di rientro (controllato/incontrollato)
- Date di lancio e rientro
- Nome oggetto e missione

> **Valore per SDA:** Complemento storico per analisi pattern di rientro e lifecycle degli oggetti.

---

### Jonathan McDowell's GCAT

| | |
|---|---|
| **Endpoint** | `planet4589.org/space/gcat/` |
| **Autenticazione** | Pubblica |
| **Rate Limit** | Periodico |
| **Formato Dati** | TSV (multipli cataloghi) |

**Dati e Feature Disponibili:**

- General Catalog of Artificial Space Objects: il più completo catalogo indipendente
- Satcat: satelliti con designatore, proprietario, stato, orbita
- Launch Log: ogni lancio orbitale dal 1957 con esito
- Auxcat: catalogo oggetti ausiliari (adattatori, shroud, debris intenzionale)
- Master list: cross-reference con ID USSPACECOM, COSPAR, nomi alternativi

> **Valore per SDA:** Gold standard per cross-reference e verifica. Include oggetti e lanci non presenti in altri database.

---

### Space Weather — NOAA SWPC API

| | |
|---|---|
| **Endpoint** | `services.swpc.noaa.gov/json/` |
| **Autenticazione** | Pubblica |
| **Rate Limit** | Nessun limite pratico |
| **Formato Dati** | JSON |

**Dati e Feature Disponibili:**

- Indice Kp (attività geomagnetica) in tempo reale e previsione
- Flusso solare F10.7 (drag atmosferico → degrado orbitale)
- Alert tempeste solari, CME, radiazione
- Solar wind: velocità, densità, campo magnetico interplanetario

> **Valore per SDA:** Correlazione diretta con drag satellitare e degradazione orbite LEO. Essenziale per previsione accurata di rientri e manovre.

**Esempio query:**
```
https://services.swpc.noaa.gov/json/planetary_k_index_1m.json
https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json
```

---

### LaunchLibrary2 / The Space Devs API

| | |
|---|---|
| **Endpoint** | `thespacedevs.com/llapi` |
| **Autenticazione** | Pubblica (free tier) / API key |
| **Rate Limit** | 15 req/ora (free) |
| **Formato Dati** | JSON REST |

**Dati e Feature Disponibili:**

- Database lanci: prossimi e passati, con countdown, vettore, pad, payload
- Dettagli missione: orbita target, payload, operatore, descrizione
- Agenzie spaziali: profilo completo
- Astronauti e veicoli con equipaggio
- Immagini e link a webcast live

> **Valore per SDA:** Collega nuovi oggetti in orbita al lancio di origine. Arricchisce il contesto prevenendo l'arrivo di "unknown objects" nel catalogo.

---

## Tabella Riassuntiva API

| Fonte | Auth | Formato | Polling | Dato Chiave |
|---|---|---|---|---|
| CelesTrak GP | Nessuna | JSON/TLE | 2–12h | Orbite primarie |
| CelesTrak SupGP | Nessuna | JSON/TLE | 6h | Effemeridi precise |
| CelesTrak SOCRATES | Nessuna | CSV | 12h | Conjunctions |
| Space-Track | Account | JSON | 8h | CDM, RCS, Decay |
| N2YO | API Key | JSON | On-demand | Pass, Positions |
| UCS Database | Download | Excel/TSV | Trimestrale | Profili missione |
| DISCOS (ESA) | Account ESA | JSON API | Giornaliero | Storico, fisico |
| SatNOGS DB | Nessuna | JSON API | On-demand | Frequenze RF |
| ESA Reentry | Nessuna | Web | Multi/giorno | Rientri |
| NOAA SWPC | Nessuna | JSON | 5 min | Space weather |
| LaunchLibrary2 | Free/Key | JSON | Orario | Lanci |
| GCAT (McDowell) | Download | TSV | Periodico | Cross-reference |
| Aerospace CORDS | Nessuna | Web | Storico | Rientri storici |

---

## Feature Avanzate Suggerite

### Satellite Profile Card

Selezionando un oggetto sulla mappa 3D, si apre una scheda che fonde automaticamente: dati orbitali (CelesTrak), profilo missione (UCS), frequenze RF (SatNOGS), proprietario/paese, RCS (Space-Track), rischio collisione attivo (CDM), status operativo. Un'unica vista su tutto ciò che si sa di quell'oggetto.

### Collision Risk Heatmap

Overlay sulla visualizzazione 3D che colora le regioni orbitali per densità di conjunction events (SOCRATES + CDM). Zone rosse = alta probabilità di avvicinamento. Drill-down sulla singola coppia di oggetti.

### Space Weather Impact Layer

Feed NOAA SWPC che mostra in tempo reale l'indice Kp e il flusso solare. Quando il drag atmosferico aumenta per tempesta solare, il sistema evidenzia automaticamente i satelliti LEO a rischio di degrado orbitale accelerato.

### Reentry Tracker & Alert

Dashboard dedicata che fonde ESA Reentry Predictions, Aerospace Corp CORDS e Space-Track Decay/TIP. Mostra il corridoio di rientro previsto su mappa, con countdown e incertezza. Push notification per eventi ad alto interesse.

### RF Spectrum Awareness Panel

Da SatNOGS: per ogni satellite selezionato, mostra le frequenze downlink/uplink, il modo di trasmissione, il baud rate. Filtra satelliti per banda (UHF, VHF, S-band, X-band) o per modo (FM, BPSK, LORA). Utile per SIGINT awareness.

### Launch Correlation Engine

Quando un nuovo NORAD ID appare nel catalogo, il sistema incrocia automaticamente con LaunchLibrary2 per associarlo al lancio di origine, al payload dichiarato, al vettore usato. Elimina gli "unknown objects" dalla vista.

### Maneuver Detection

Confrontando la serie storica GP di Space-Track, il sistema rileva variazioni anomale di semi-asse maggiore, inclinazione o eccentricità che indicano una manovra orbitale. Alert automatico: "Satellite X ha cambiato orbita di Δv stimato Y".

### Country / Operator Dashboard

Vista aggregata da UCS + SATCAT: quanti satelliti per paese, per tipo (civile/militare/commerciale), per scopo. Grafici temporali di crescita delle costellazioni. Drill-down per operatore.

### Debris Genealogy

Da DISCOS fragmentation events + SATCAT: per ogni frammento di debris, risali all'evento che l'ha generato (esplosione, collisione, ASAT test). Visualizza l'albero genealogico dei frammenti sulla mappa 3D.

### Ground Track & Footprint Overlay

Da N2YO `get_positions`: proietta la traccia a terra del satellite selezionato sulle Google 3D Tiles. Mostra il cono di visibilità (footprint) per sensori ottici/radar, calcolato dall'altitudine e dal campo di vista dichiarato.

---

## Prossimi Passi

1. **Accesso al codebase:** rendere il repo GitHub accessibile o condividere i file principali, così da mappare ogni API al modulo corretto del sistema esistente.
2. **Registrazione account:** creare account su Space-Track.org e N2YO.com per ottenere le credenziali necessarie.
3. **Implementazione Tier 1:** iniziare con CelesTrak GP JSON e Space-Track SATCAT/CDM come backbone dati.
4. **Enrichment pipeline:** costruire un servizio di arricchimento che, dato un NORAD ID, fonde automaticamente i dati da tutte le fonti disponibili.
5. **Feature prioritization:** scegliere 3–4 feature avanzate dalla lista sopra e implementarle iterativamente.
