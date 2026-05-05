# HORUS Sandbox - Guida al Prompting

Guida completa per utilizzare il chatbot della Sandbox di HORUS.
Il chatbot interpreta comandi in linguaggio naturale e li traduce in azioni sulla mappa Cesium.

---

## Regole Generali

- **Un concetto per frase** funziona meglio di prompt lunghi e narrativi
- **Usa nomi specifici** per ogni unita (il sistema li usa come identificativi)
- **Specifica la fazione**: `allied`, `hostile`, `neutral` — se non la indichi, il default e `neutral`
- **Le posizioni** possono essere nomi di citta, basi, regioni o coordinate `lat, lon`
- Per creare **molte unita**, mandare in blocchi da 5-8 per messaggio (il modello ha un limite di tool calls)

---

## Tipi di Unita Disponibili

### Aeree
| Tipo | Parole chiave | Icona | Velocita default |
|------|--------------|-------|-----------------|
| `aircraft` | aircraft, jet, helicopter | Aereo generico | 250 m/s |
| Fighter | F-22, F-35, F-16, Su-35, MiG-29, Eurofighter, Rafale, fighter | Caccia F-22 | 250 m/s |
| Bomber | B-2, B-52, B-1, bomber | Bombardiere B-2 | 250 m/s |
| `drone` | drone, UAV, recon drone | Drone militare | 85 m/s |

### Navali
| Tipo | Parole chiave | Icona | Velocita default |
|------|--------------|-------|-----------------|
| `ship` | ship, vessel, destroyer, carrier, frigate | Nave | 15 m/s |
| `submarine` | submarine, sub | Sottomarino | 15 m/s |

### Terrestri
| Tipo | Parole chiave | Icona | Velocita default |
|------|--------------|-------|-----------------|
| `ground_vehicle` | convoy, vehicle, truck | Veicolo | 20 m/s |
| `base` | base, HQ | Base/pentagono | - |
| `ground_station` | tracking station, station, AWACS, tanker | Antenna parabolica | - |
| `defended_zone` | defended zone, defense zone | Zona difesa | - |

### Spaziali
| Tipo | Parole chiave | Icona | Altitudine default |
|------|--------------|-------|-------------------|
| `satellite` | satellite | Satellite con pannelli | 400 km |

### Armi
| Tipo | Parole chiave | Icona |
|------|--------------|-------|
| `missile` | missile, cruise missile | Missile |
| `interceptor` | interceptor | Missile |

---

## Creazione Unita

### Sintassi base
```
[tipo]: "[nome]" at [posizione], [fazione]
```

### Esempi

**Singola unita:**
```
aircraft: "F-22 Raptor Alpha" at Tehran, allied
```

**Con subtype specifico (per icona dedicata):**
```
aircraft: "F-22 Raptor" at 33.0, 48.0, subtype fighter, allied
aircraft: "B-2 Spirit" at 35.0, 30.0, subtype bomber, allied
submarine: "USS Virginia" at 27.5, 51.0, allied
```

**Multiple unita:**
```
3 allied ships in the Persian Gulf
```
> Il sistema le posiziona in punti diversi automaticamente per non sovrapporle.

**Con coordinate esatte:**
```
drone: "RQ-4 Global Hawk" at 31.0, 54.0, allied
```

**Con velocita e altitudine personalizzate:**
```
satellite: "COSMO-SkyMed" at Rome, altitude 620km, allied
```

**Stazioni con raggio di copertura:**
```
ground_station: "Patriot Battery Alpha" at Riyadh, allied, coverage 250km
defended_zone: "S-400 Engagement Zone" at Damascus, hostile, coverage 400km
```

---

## Movimento

### Spostamento diretto
```
move the F-22 Raptor to Baghdad
```

### Heading direzionale
```
aircraft: "Su-35 Flanker" at Moscow, hostile, heading south
```
> Crea a Mosca e imposta rotta verso sud automaticamente.

### Approccio da punto A a punto B
```
ship: "USS Destroyer" approaching from Strait of Hormuz toward Bandar Abbas
```
> Crea allo Stretto di Hormuz con destinazione Bandar Abbas.

---

## Pattugliamento

```
ship: "Patrol Vessel" at Dubrovnik, allied, patrolling between Dubrovnik and Bari
```

```
drone: "Recon UAV" at Mosul, allied, patrol from Mosul to Kirkuk to Erbil
```
> Crea un percorso ciclico tra i waypoint indicati.

---

## Distruzione

```
destroy the F-22 Raptor
```

```
the submarine USS Virginia is sunk
```

```
B-2 Spirit shot down
```

> Appare un popup rosso al centro della mappa: **DESTROYED: [nome unita]** (auto-chiusura 5s).

---

## Eliminazione (senza effetto drammatico)

```
remove the drone
delete Alpha-1
```
> Rimuove silenziosamente l'attore dalla mappa.

---

## Controllo Simulazione

### Avvio
```
start
start at 10x speed
run at 5x
```

### Pausa / Ripresa
```
pause
resume
```

### Velocita
```
set speed to 20x
set speed to 50x
```

### Durata
```
run for 10 minutes
simulate 1 hour
run for 2 hours at 10x
duration 30 minutes
```
> La simulazione si mette in pausa automaticamente al raggiungimento della durata.

### Combinazioni
```
run for 6 hours at 50x speed
```
> Esegue 3 comandi: imposta durata 21600s, velocita 50x, avvia.

---

## Rinomina Scenario

```
name this scenario Operation Midnight Hammer
describe this as a US strike operation against Iranian nuclear facilities
```

---

## Overlay Tattici (Ground Planning)

### Markers
```
place objective at Isfahan Nuclear Facility
rally point at Camp Arifjan
HQ at Al Udeid Air Base
checkpoint at Strait of Hormuz
```

**Tipi marker:** `objective`, `rally_point`, `op`, `hq`, `checkpoint`

### Route
```
attack axis from Kuwait City to Basra to Baghdad
supply route from Jeddah to Riyadh
patrol route from Dubrovnik to Split to Zadar
```

**Tipi route:** `attack_axis`, `retreat_route`, `patrol_route`, `supply_route`, `phase_line`

### Aree
```
kill zone at Isfahan, Natanz, Fordow
area of operations covering Baghdad, Tikrit, Mosul
restricted area at Tehran, Qom, Esfahan
```

**Tipi area:** `ao` (area of operations), `kill_zone`, `safe_zone`, `restricted`, `objective_area`

---

## Esempio Completo: Operazione

Invia i comandi in 3-4 messaggi separati per non sovraccaricare il modello.

**Messaggio 1 — Basi e supporto:**
```
Create allied forces:
base: "Al Udeid Air Base" at 25.117, 51.315, allied
base: "Camp Arifjan" at 28.95, 48.1, allied
ground_station: "KC-135 Tanker Alpha" at 36.0, 38.0, allied
ground_station: "KC-135 Tanker Bravo" at 33.0, 42.0, allied
ground_station: "E-3 AWACS" at 32.0, 44.0, allied
```

**Messaggio 2 — Forze d'attacco:**
```
Create allied strike forces:
aircraft: "B-2 Spirit #1" at 35.0, 29.5, subtype bomber, allied
aircraft: "B-2 Spirit #2" at 35.2, 30.0, subtype bomber, allied
aircraft: "B-2 Spirit #3" at 34.8, 30.5, subtype bomber, allied
aircraft: "F-22 Raptor SEAD" at 33.0, 48.0, subtype fighter, allied
aircraft: "F-35A Lightning" at 34.0, 47.0, subtype fighter, allied
```

**Messaggio 3 — Forze navali e ISR:**
```
Create allied naval and ISR:
submarine: "USS Virginia" at 27.5, 51.0, allied
ship: "USS Destroyer" at 26.5, 56.5, allied
drone: "RQ-4 Global Hawk" at 31.0, 54.0, allied
satellite: "COSMO-SkyMed" at 35.0, 35.0, allied
```

**Messaggio 4 — Forze ostili:**
```
Create hostile forces:
defended_zone: "S-300 Battery Tehran" at Tehran, hostile, coverage 200km
defended_zone: "S-400 Isfahan" at Isfahan, hostile, coverage 400km
aircraft: "Su-35 Flanker" at Tehran, subtype fighter, hostile
aircraft: "MiG-29 Fulcrum" at Esfahan, subtype fighter, hostile
base: "Natanz Nuclear Facility" at 33.72, 51.73, hostile
```

**Messaggio 5 — Avvio simulazione:**
```
name this scenario Operation Midnight Hammer
attack axis from Al Udeid Air Base to Isfahan to Natanz
run for 2 hours at 20x speed
```

**Messaggio 6 — Durante la simulazione:**
```
move the B-2 Spirit #1 to Isfahan
move the F-22 Raptor SEAD to Tehran
```

**Messaggio 7 — Evento:**
```
the MiG-29 Fulcrum is shot down
destroy the S-300 Battery Tehran
```

---

## Intel Overlay — Dati in Tempo Reale

Nella sidebar destra, tab **INTEL**, ci sono 3 sotto-pannelli:

### SAT (Satelliti)
- Seleziona un'area geografica (Italia, Mediterraneo, Medio Oriente, Hormuz...)
- Mostra solo i satelliti che **in quel momento** sorvolano l'area selezionata
- Toggle **MAP** per mostrarli/nasconderli sulla mappa
- Limite visualizzazione: 50 / 100 / 500 / 1000

### PLANE (Aerei ADS-B)
- Dati in tempo reale da OpenSky Network
- Seleziona area → vedi tutti gli aerei civili/militari in volo
- Auto-refresh ogni 60s
- Toggle **MAP** + limite

### SHIP (Navi AIS)
- Dati in tempo reale da MyShipTracking
- Seleziona area → vedi le navi nella zona
- Cache 1 ora per risparmiare crediti API
- Toggle **MAP** + limite

### Controllo Layers
Nel tab **LAYERS** puoi attivare/disattivare:
- **SCENARIO ACTORS** → Allied / Hostile / Neutral (singolarmente)
- **INTEL OVERLAY** → Satellites / Ground Stations / Vehicles / Aircraft / Vessels
- **TACTICAL PLANNING** → Markers / Routes / Areas / Zones

---

## Tips & Tricks

1. **Prompt brevi e strutturati** > prompt narrativi lunghi
2. **Max 5-8 unita per messaggio** — il modello ha un limite di token
3. **Usa coordinate quando possibile** — il geocoding a volte e impreciso per luoghi generici
4. **Specifica `subtype fighter` o `subtype bomber`** per ottenere l'icona militare dedicata
5. **Per i sottomarini** usa esplicitamente `submarine:` come tipo
6. **Le fazioni** determinano il colore: cyan (allied), rosso (hostile), giallo (neutral)
7. **La distruzione** (`destroy`) mostra un popup — la rimozione (`remove`/`delete`) e silenziosa
8. **Per scenari complessi**, usa 4-5 messaggi sequenziali piuttosto che un unico mega-prompt
