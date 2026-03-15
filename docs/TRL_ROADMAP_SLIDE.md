# HORUS — Technology Readiness & Roadmap

---

## Technology Readiness Level (TRL)

> Metodologia: NASA/ESA TRL Scale (ISO 16290:2013)
> Riferimento: TWI Global — Technology Readiness Levels

---

### TRL Complessivo del Sistema: **TRL 6**

**"Technology demonstrated in relevant environment"**

Prototipo di sistema verificato e dimostrato in ambiente simulato con dati reali (CelesTrak, NOAA SWPC).

---

### TRL per Sottosistema

| Sottosistema | TRL | Stato | Note |
|---|:---:|---|---|
| **Database & Multi-Tenancy** | 7–8 | Production-ready | PostgreSQL 16 + pgvector, isolamento tenant, audit trail |
| **Backend API (FastAPI)** | 7–8 | Production-ready | 32+ moduli, error handling RFC 7807, async-first |
| **Integrazione NOAA SWPC** | 7 | Operativo | Dati live space weather, scoring impatto per satellite |
| **Threat Modeling Bayesiano** | 7 | Validato | Modello a 5 dimensioni: prossimita, RF, anomalie, comportamento, meteo spaziale |
| **Tracking Orbitale + Cesium 3D** | 5–6 | Funzionale | SGP4 propagation, ground track, coverage, multi-layer |
| **Conjunction Screening (Detour)** | 5–6 | Funzionale | Screening → risk scoring → maneuver planning → approval |
| **AI Agent Orchestration** | 5–6 | Funzionale | LangGraph, Regolo.ai (qwen3.5-122b), human-in-the-loop |
| **Sandbox Multi-Dominio** | 5–6 | Funzionale | Scenari con attori (SAT, air, naval, ground), timeline playback |
| **Intelligence Workflows** | 5–6 | Funzionale | Launch correlation, reentry, manovra detection, debris genealogy |
| **Autenticazione & Secrets** | 3–4 | Da irrobustire | JWT base presente, manca OAuth/OIDC e secrets manager |
| **CI/CD & DevOps** | 3–4 | Da implementare | Docker Compose funzionante, manca pipeline automatizzata |
| **Test Coverage Frontend** | 3–4 | Parziale | Vitest + Playwright configurati, copertura da estendere |

---

### Maturita per Area Funzionale

```
TRL 9 ████████████████████████████████████████░░░░░░░░░░  Obiettivo
TRL 8 ██████████████████████████████████░░░░░░░░░░░░░░░░  DB, API Core
TRL 7 ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░  Space Weather, Threats
TRL 6 ██████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  SISTEMA COMPLESSIVO
TRL 5 ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Tracking, AI, Sandbox
TRL 4 ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Auth, CI/CD
```

---

### Cosa Significa TRL 6 per HORUS

- Il sistema funziona **end-to-end** con dati reali (CelesTrak, NOAA)
- Tutti i workflow principali sono **integrati e dimostrati**
- L'architettura e **data-agnostic**: pronta per feed premium senza redesign
- Ogni azione consequenziale ha **gate di approvazione umana**
- Infrastruttura containerizzata con **7 servizi Docker orchestrati**
- Gap rimanenti: hardening sicurezza, automazione CI/CD, copertura test

---

---

## Roadmap Progetto HORUS

---

### FASE 1 — Consolidamento (TRL 6 → 7) | Q2 2026

**Obiettivo:** Sistema verificato in ambiente operativo

| Attivita | Priorita | Impatto |
|---|:---:|---|
| Hardening autenticazione (OAuth 2.0 / OIDC) | Alta | Prerequisito deployment istituzionale |
| Secrets management (Vault / AWS Secrets Manager) | Alta | Sicurezza credenziali in produzione |
| Pipeline CI/CD (GitHub Actions / GitLab CI) | Alta | Test automatizzati, container registry |
| Estensione test suite frontend (Vitest + Playwright E2E) | Media | Affidabilita UI, regressione visiva |
| Connettore Space-Track.org SP (TLE ad alta precisione) | Media | Accuratezza orbitale significativamente superiore |
| Audit pipeline strutturata (log export, SIEM-ready) | Media | Compliance e traceability |

---

### FASE 2 — Qualificazione (TRL 7 → 8) | Q3 2026

**Obiettivo:** Sistema completo e qualificato per deployment operativo

| Attivita | Priorita | Impatto |
|---|:---:|---|
| Integrazione feed premium (LeoLabs, COMSPOC) | Alta | Dati ottici + conjunction data di livello istituzionale |
| Adversary Satellite Tracking (catalogo + profiling comportamentale) | Alta | Capacita intelligence avanzata |
| Migration Docker Compose → Kubernetes | Alta | Scalabilita orizzontale, alta disponibilita |
| Database read replicas + Redis cluster | Media | Performance sotto carico operativo |
| Multi-Factor Authentication (MFA) | Media | Standard sicurezza istituzionale |
| Copernicus Earth Observation integration | Media | Imagery per correlazione eventi |
| ESA DISCOS debris database connector | Media | Arricchimento dati debris |
| Stress testing & performance benchmarking | Media | Validazione sotto carico reale |

---

### FASE 3 — Operativo (TRL 8 → 9) | Q4 2026 – Q1 2027

**Obiettivo:** Sistema provato e pronto per deployment commerciale/istituzionale

| Attivita | Priorita | Impatto |
|---|:---:|---|
| Pilot operativo con ente istituzionale | Critica | Validazione in ambiente reale |
| Integrazione effemeridi istituzionali proprietarie | Alta | Massima accuratezza possibile |
| Role-Based Access Control (RBAC) completo | Alta | Multi-utente, multi-ruolo, multi-tenant |
| SLA monitoring & alerting (Grafana, PagerDuty) | Alta | Operabilita 24/7 |
| Documentazione operatore & training | Media | Onboarding utenti finali |
| Mobile-responsive dashboard | Media | Accesso da dispositivi field |
| API pubblica per integrazioni terze parti | Media | Ecosistema e interoperabilita |
| Certificazione sicurezza (ISO 27001 readiness) | Media | Requisito per contratti difesa |

---

### Timeline Visuale

```
2026                                                    2027
Q2              Q3              Q4              Q1
|───────────────|───────────────|───────────────|──────────|
│  FASE 1       │  FASE 2       │  FASE 3                  │
│  TRL 6→7      │  TRL 7→8      │  TRL 8→9                 │
│               │               │                          │
│ ● Auth/OIDC   │ ● Feed premium│ ● Pilot istituzionale    │
│ ● CI/CD       │ ● Adversary   │ ● Effemeridi proprietarie│
│ ● Secrets mgmt│   Tracking    │ ● RBAC completo          │
│ ● Space-Track │ ● Kubernetes  │ ● SLA monitoring         │
│ ● Test suite  │ ● MFA         │ ● Certificazione         │
│ ● Audit logs  │ ● Copernicus  │ ● API pubblica           │
│               │ ● Stress test │ ● Mobile dashboard       │
|───────────────|───────────────|───────────────|──────────|
   CONSOLIDAMENTO  QUALIFICAZIONE     OPERATIVO
```

---

### Stima Costi Infrastruttura

| Fase | Costo Mensile Stimato | Note |
|---|---|---|
| Fase 1 (Dev/Staging) | EUR 800 – 1.500 | Cloud VM + managed PostgreSQL + Redis |
| Fase 2 (Pre-Prod) | EUR 1.500 – 3.000 | Kubernetes cluster + feed premium |
| Fase 3 (Produzione) | EUR 3.000 – 6.000 | HA, monitoring, SLA, backup |

*Nessun requisito hardware esotico. Nessuna GPU locale necessaria (inferenza AI via API).*

---

### Vantaggi Competitivi

1. **Data-Agnostic by Design** — Funziona oggi con dati pubblici, domani con feed premium. Stesso codice.
2. **Human-in-the-Loop** — Nessuna azione consequenziale senza approvazione operatore.
3. **Full-Stack Integrato** — Tracking → Intelligence → Planning → AI → Approvazione in un'unica piattaforma.
4. **Costo Accessibile** — Alternativa concreta a suite SDA enterprise da milioni di EUR.
5. **Architettura Moderna** — Async-first, containerizzato, cloud-native ready.
6. **Multi-Tenant Ready** — Isolamento dati per organizzazione gia integrato nel layer database.

---

*HORUS Space Domain Awareness Platform — TRL Assessment & Roadmap v1.0*
*Ultimo aggiornamento: 15 Marzo 2026*
