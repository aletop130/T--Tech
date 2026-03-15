"""Italy Big Brother service — real-time satellite dependency mapping for Italy."""
from __future__ import annotations

import time
import math
from datetime import datetime, timezone
from typing import Optional
import httpx

from app.core.logging import get_logger
from app.schemas.italy_bigbrother import (
    ItalyServiceDependency, ServiceCategory, Criticality,
    SatelliteOverItaly, ItalyBigBrotherStats, ItalyBigBrotherResponse,
    SatelliteDependencyDetail, SatelliteTransmitter
)

logger = get_logger(__name__)

# Italy bounding box (with margin for footprint)
ITALY_BOUNDS = {
    "min_lat": 35.0, "max_lat": 48.0,
    "min_lon": 5.5, "max_lon": 19.5,
}

CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php"
SATNOGS_BASE = "https://db.satnogs.org/api"

# Cache TTL in seconds
CACHE_TTL = 7200  # 2 hours for TLE data
SATNOGS_CACHE_TTL = 86400  # 24 hours for transmitters

# ============================================================
# ITALY SERVICE DEPENDENCY DATABASE
# Maps NORAD IDs and constellation names to Italian services
# ============================================================

# Helper to build dependency
def _dep(category: ServiceCategory, icon: str, name: str, description: str,
         criticality: Criticality, users: int, provider: str,
         coverage: str = "Nazionale", note: str = None) -> ItalyServiceDependency:
    return ItalyServiceDependency(
        category=category, icon=icon, name=name, description=description,
        criticality=criticality, italian_users=users, provider=provider,
        geographic_coverage=coverage, source_note=note
    )

C = ServiceCategory
CR = Criticality

# ---- HOT BIRD TV Dependencies (shared across 13B/13E/13F/13G) ----
HOT_BIRD_SERVICES = [
    _dep(C.TV_BROADCASTING, "📺", "tivùsat (FTA)", "Piattaforma free-to-air italiana: RAI 1/2/3, Canale 5, Italia 1, Rete 4, La7, DMAX — oltre 180 canali", CR.HIGH, 2_800_000, "Eutelsat / RAI / Mediaset"),
    _dep(C.TV_BROADCASTING, "📺", "Sky Italia (Pay TV)", "Piattaforma pay-TV: sport, cinema, news, intrattenimento — 65+ canali HD", CR.HIGH, 4_760_000, "Eutelsat / Sky Italia"),
    _dep(C.TV_BROADCASTING, "📡", "RAI 4K / UHD", "Primo canale italiano Ultra HD via satellite", CR.MEDIUM, 500_000, "RAI / Eutelsat"),
    _dep(C.TV_BROADCASTING, "🏔️", "Broadcasting aree montane/isole", "Contribuzione broadcast RAI per zone non coperte da digitale terrestre", CR.MEDIUM, 1_000_000, "RAI", "Regionale"),
]

# ---- COSMO-SkyMed dependencies (CSK-1,2,3,4 and CSG-1,2) ----
COSMO_SERVICES = [
    _dep(C.EMERGENCY, "🆘", "Protezione Civile — Mappatura emergenze", "Immagini SAR radar per valutazione danni post-terremoto, alluvione, incendio. Attivato in 24h per calamità nazionali", CR.CRITICAL, 60_000_000, "Dipartimento Protezione Civile"),
    _dep(C.DEFENSE, "🛡️", "Intelligence militare ISR", "Intelligence, Sorveglianza e Ricognizione (ISR) nazionale. Missioni classificate Ministero della Difesa e NATO", CR.CRITICAL, 0, "Ministero della Difesa / NATO"),
    _dep(C.EARTH_OBSERVATION, "🌾", "AGEA — Verifica PAC", "Verifica telerilevamento parcelle agricole per Politica Agricola Comune UE. Controllo sussidi ~€4.8B/anno per agricoltura italiana", CR.HIGH, 500_000, "AGEA (Agenzia per le erogazioni in Agricoltura)"),
    _dep(C.EARTH_OBSERVATION, "🏗️", "ANAS/Autostrade — Monitoraggio infrastrutture", "Interferometria SAR (InSAR) per monitoraggio deformazioni ponti, viadotti, dighe, edifici. Post-Genova 2018", CR.HIGH, 60_000_000, "ANAS, Autostrade per l'Italia, Ministero Infrastrutture"),
    _dep(C.MARITIME, "🚢", "Guardia Costiera — Sorveglianza marittima", "Sorveglianza SAR coste italiane: traffico navale, detection olio in mare, monitoraggio immigrazione canale di Sicilia", CR.CRITICAL, 0, "Guardia Costiera / Ministero Interno / Frontex"),
    _dep(C.EARTH_OBSERVATION, "🏘️", "Comuni — Rilevamento abusivismo edilizio", "Confronto immagini multitemporali per individuare costruzioni abusive su territorio nazionale", CR.MEDIUM, 0, "Comuni / Regioni / AGEA"),
    _dep(C.EARTH_OBSERVATION, "🌊", "ISPRA — Monitoraggio frane e subsidenza", "Monitoraggio deformazioni del suolo, frane, subsidenza urbana (Roma, Venezia, Bologna)", CR.HIGH, 20_000_000, "ISPRA (Istituto Superiore Protezione Ambientale)"),
    _dep(C.MARITIME, "🐠", "Monitoraggio inquinamento marino", "Rilevamento olio e inquinanti in Mediterraneo, Mar Adriatico e canale di Sicilia", CR.HIGH, 0, "ISPRA / Guardia Costiera"),
]

# ---- SICRAL dependencies ----
SICRAL_SERVICES = [
    _dep(C.DEFENSE, "🛡️", "Comunicazioni militari strategiche e tattiche", "Backbone comunicazioni sicure Forze Armate italiane — NATO Tier-1. Banda UHF/SHF/Ka classificata", CR.CRITICAL, 0, "Ministero della Difesa / Esercito Italiano"),
    _dep(C.DEFENSE, "🎖️", "Operazioni NATO e missioni internazionali", "Supporto comunicazioni missioni ONU/NATO: Lebanon (UNIFIL), Mali, Iraq, Afghanistan. Collegamento con NATO JFC Naples", CR.CRITICAL, 0, "NATO / Ministero della Difesa"),
    _dep(C.EMERGENCY, "🚨", "Protezione Civile emergenza", "Backup comunicazioni in caso di blackout infrastrutture terrestri durante calamità", CR.HIGH, 60_000_000, "Dipartimento Protezione Civile"),
]

# ---- GALILEO dependencies ----
GALILEO_SERVICES = [
    _dep(C.NAVIGATION, "📱", "Navigazione smartphone — EU mandated", "Ogni smartphone venduto in UE dal 2018 supporta Galileo. Posizionamento cm-level con Galileo High Accuracy Service", CR.CRITICAL, 50_000_000, "Commissione Europea / produttori smartphone"),
    _dep(C.NAVIGATION, "🏛️", "Fucino Ground Control Centre — Galileo", "UNO DEI 2 CENTRI DI CONTROLLO MONDIALI GALILEO in Abruzzo! Telespazio gestisce il Galileo Control Centre", CR.CRITICAL, 0, "Telespazio / ESA / GSA (Fucino, Aq)"),
    _dep(C.EMERGENCY, "🆘", "Cospas-Sarsat SAR via Galileo", "Return Link Service: quando attivi beacon emergenza (EPIRB/PLB/ELT) Galileo invia conferma di localizzazione ricevuta", CR.CRITICAL, 0, "Guardia Costiera / SAR / Aeronautica Militare"),
    _dep(C.FINANCE, "💰", "Timing certificato transazioni finanziarie (PRS)", "Galileo Public Regulated Service per timestamping normativo MiFID II — Borsa Italiana, banche, HFT", CR.CRITICAL, 0, "Borsa Italiana / Banca d'Italia / istituti finanziari"),
    _dep(C.TRANSPORT, "✈️", "Aviazione — procedure LPV/APV EGNOS-Galileo", "Sistema di avvicinamento di precisione negli aeroporti italiani tramite EGNOS aumentato con Galileo", CR.CRITICAL, 180_000_000, "ENAV / ENAC / aeroporti italiani"),
    _dep(C.AGRICULTURE, "🚜", "Agricoltura di precisione Galileo", "Guida automatica trattori, droni agricoli, mappatura campi con Galileo accuratezza <10cm", CR.HIGH, 500_000, "Aziende agricole / AGEA"),
]

# ---- GPS dependencies ----
GPS_SERVICES = [
    _dep(C.NAVIGATION, "🗺️", "Navigazione veicolare — Google Maps / Waze", "35 milioni di veicoli italiani usano GPS per navigazione. Autovelox, flotte logistica, emergenze", CR.HIGH, 35_000_000, "Google / Apple / TomTom / automobilisti italiani"),
    _dep(C.ENERGY, "⚡", "Sincronizzazione rete elettrica nazionale", "Terna S.p.A. usa GPS per sincronizzare PMU (Phasor Measurement Units) della rete 380kV italiana. Blackout se GPS perso >100ms", CR.CRITICAL, 60_000_000, "Terna S.p.A."),
    _dep(C.FINANCE, "📈", "Borsa Italiana — timing e-MID/MTS", "Euronext Milan (ex Borsa Italiana) usa GPS per timestamping ordini. €700B market cap dipende dalla precisione temporale GPS", CR.CRITICAL, 0, "Euronext / Borsa Italiana"),
    _dep(C.TRANSPORT, "🚗", "eCall — chiamata emergenza automatica", "Sistema EU obbligatorio: in caso incidente, auto chiama automaticamente 112 con posizione GPS", CR.CRITICAL, 20_000_000, "Ministero Infrastrutture / case automobilistiche"),
    _dep(C.ENERGY, "📡", "Sincronizzazione reti 4G/5G", "Tutte le stazioni base 4G/5G italiane (TIM, Vodafone, WindTre) usano GPS per timing. 80M SIM interessate", CR.HIGH, 80_000_000, "TIM / Vodafone / WindTre / ILIAD"),
    _dep(C.FINANCE, "🏦", "Sincronizzazione interbancaria SEPA/TARGET2", "Sistema SEPA e TARGET2 usa GPS per timestamping transazioni. Requisito normativo BCE", CR.CRITICAL, 0, "Banca d'Italia / sistema bancario italiano"),
    _dep(C.AGRICULTURE, "🌾", "Agricoltura di precisione GPS", "500,000+ aziende agricole italiane usano GPS-guided equipment e droni per ottimizzazione colture", CR.HIGH, 500_000, "Aziende agricole / AGEA"),
    _dep(C.TRANSPORT, "🚂", "Trenitalia/RFI — gestione flotta ferroviaria", "European Train Control System (ETCS) usa GPS per posizionamento treni. 600M passeggeri/anno", CR.HIGH, 600_000_000, "Trenitalia / RFI (Rete Ferroviaria Italiana)"),
]

# ---- STARLINK dependencies ----
STARLINK_SERVICES = [
    _dep(C.TELECOM, "🌐", "Internet satellitare diretto consumer", "~100,000+ abbonati italiani. Aree rurali senza fibra/ADSL. Uso professionale in aree remote", CR.MEDIUM, 100_000, "SpaceX Starlink / Distributori italiani"),
    _dep(C.EMERGENCY, "🆘", "Backup comunicazioni emergenza", "Usato da Protezione Civile e forze dell'ordine in aree con infrastrutture terrestri danneggiate", CR.MEDIUM, 0, "Protezione Civile / Vigili del Fuoco"),
    _dep(C.TELECOM, "📡", "IoT e backhaul per aree isolate", "Connettività per stazioni meteo remote, sensori ambientali, monitoraggio vulcani (Etna, Stromboli, Vesuvio)", CR.LOW, 0, "INGV / ARPA / ricercatori"),
]

# ---- IRIDIUM NEXT dependencies ----
IRIDIUM_SERVICES = [
    _dep(C.TELECOM, "📞", "Telefonia satellitare — nautici e montagna", "Comunicazione voce/dati in aree senza copertura GSM: Alpi, Appennini, Alto Adriatico, Mediterraneo", CR.HIGH, 50_000, "Iridium / distributori italiani"),
    _dep(C.MARITIME, "⚓", "GMDSS — Global Maritime Distress Safety", "Sistema obbligatorio di sicurezza marittima internazionale. Tutte le navi >300t usano Iridium per emergenze", CR.HIGH, 0, "Guardia Costiera / capitanerie di porto"),
    _dep(C.IOT, "📡", "IoT satellitare industriale", "Tracking container, monitoraggio remoto impianti oil&gas ENI, sensori ambientali", CR.MEDIUM, 0, "ENI / industria italiana / logistica"),
]

# ---- ONEWEB dependencies ----
ONEWEB_SERVICES = [
    _dep(C.TELECOM, "🏢", "Internet B2B — aziende e PA in aree rurali", "Connettività broadband per piccole imprese, pubbliche amministrazioni in comuni senza fibra", CR.MEDIUM, 50_000, "Eutelsat OneWeb / operatori italiani"),
    _dep(C.TELECOM, "📚", "Connettività scuole remote", "Piano PNRR per connettività scuole italiane in aree disagiate tramite satellite", CR.MEDIUM, 100_000, "Ministero Istruzione / PNRR"),
]

# ---- WEATHER SATELLITES (Meteosat, NOAA) dependencies ----
WEATHER_SERVICES = [
    _dep(C.METEO, "🌤️", "Previsioni meteo nazionali", "ARPAE, Aeronautica Militare, Protezione Civile usano Meteosat per modelli previsionali 0-240h", CR.CRITICAL, 60_000_000, "ARPAE / Aeronautica Militare AM / Protezione Civile"),
    _dep(C.EMERGENCY, "⛈️", "Allerte meteo Protezione Civile", "Sistema di allerta precoce per eventi estremi (alluvioni, tempeste, siccità, neve eccezionale)", CR.CRITICAL, 60_000_000, "Protezione Civile / Regioni italiane"),
    _dep(C.AGRICULTURE, "🌱", "Supporto decisionale agricoltura", "Previsioni pluviometriche per pianificazione irrigazione, raccolta, trattamenti fitosanitari", CR.MEDIUM, 1_200_000, "Aziende agricole / Consorzi di bonifica"),
    _dep(C.TRANSPORT, "✈️", "Meteorologia aeronautica (MET)", "ENAV e aeroporti italiani dipendono da dati Meteosat per previsioni rotta e condizioni aeroportuali", CR.HIGH, 180_000_000, "ENAV / ENAC"),
]

# ---- COPERNICUS/SENTINEL dependencies ----
COPERNICUS_SERVICES = [
    _dep(C.AGRICULTURE, "🌿", "NDVI — monitoraggio vegetazione PAC", "Copernicus NDVI per verifica dichiarazioni agricole e monitoraggio colture per Politica Agricola Comune", CR.HIGH, 1_200_000, "AGEA / Regioni italiane"),
    _dep(C.EARTH_OBSERVATION, "🏔️", "Monitoraggio frane e rischio idrogeologico", "Sentinel-1 InSAR per monitoraggio 620,000 frane censite in Italia. Piano IFFI (Inventario Fenomeni Franosi)", CR.HIGH, 20_000_000, "ISPRA / Regioni / Protezione Civile"),
    _dep(C.MARITIME, "🌊", "Qualità acque marino-costiere", "Sentinel-2/3 per monitoraggio acque balneari, alghe, temperatura superficiale mare Mediterraneo", CR.MEDIUM, 0, "ISPRA / ARPA regionali / Min. Ambiente"),
    _dep(C.EARTH_OBSERVATION, "🏗️", "Urban sprawl e uso del suolo", "Aggiornamento Corine Land Cover Italia, monitoraggio espansione urbana, consumo suolo", CR.MEDIUM, 0, "ISPRA / Min. Ambiente"),
    _dep(C.AGRICULTURE, "💧", "Stress idrico e gestione siccità", "Sentinel-3 LST per mappatura stress idrico colture, ottimizzazione irrigazione in periodo siccità", CR.HIGH, 1_200_000, "AGEA / Consorzi bonifica / regioni"),
    _dep(C.EMERGENCY, "🔥", "Monitoraggio incendi boschivi", "Sentinel-2/3 per rilevamento hot-spot, mappatura perimetro incendi, stima danni post-incendio", CR.HIGH, 0, "Protezione Civile / Corpo Forestale / Vigili del Fuoco"),
]

# ---- PRISMA (ASI hyperspectral) ----
PRISMA_SERVICES = [
    _dep(C.EARTH_OBSERVATION, "🔬", "Osservazione iperspettrale del territorio", "Analisi spettrale per rilevamento inquinamento acque, suoli contaminati, mappatura minerale", CR.MEDIUM, 0, "ASI / ISPRA / Università italiane"),
    _dep(C.AGRICULTURE, "🌾", "Mappatura spettrale colture e stress", "Identificazione varietà colture, rilevamento stress idrico/nutrizionale via firma spettrale", CR.MEDIUM, 500_000, "CREA / Università / AGEA"),
]

# ---- ATHENA-FIDUS ----
ATHENA_SERVICES = [
    _dep(C.DEFENSE, "🛡️", "Comunicazioni militari/civili duali Italia-Francia", "Satellte dual-use Ka/UHF per cooperazione difesa Italia-Francia. Supporto missioni NATO", CR.HIGH, 0, "ASI / Ministero Difesa / Armée de l'Air (FR)"),
    _dep(C.EMERGENCY, "🚨", "Telecomunicazioni emergenza", "Connettività banda Ka per unità di Protezione Civile e first responder in scenari di crisi", CR.HIGH, 0, "Protezione Civile / Croce Rossa"),
]

# ============================================================
# MASTER DEPENDENCY MAP
# norad_id → list of services
# constellation_key → list of services (matched by name substring)
# ============================================================

NORAD_DEPENDENCIES: dict[int, list[ItalyServiceDependency]] = {
    # Hot Bird satellites (TV)
    33459: HOT_BIRD_SERVICES,  # Hot Bird 13B
    28946: HOT_BIRD_SERVICES,  # Hot Bird 13E
    53868: HOT_BIRD_SERVICES,  # Hot Bird 13F
    54024: HOT_BIRD_SERVICES,  # Hot Bird 13G
    # COSMO-SkyMed
    31598: COSMO_SERVICES,
    32376: COSMO_SERVICES,
    33412: COSMO_SERVICES,
    36599: COSMO_SERVICES,
    44873: COSMO_SERVICES,
    51444: COSMO_SERVICES,
    # SICRAL
    26694: SICRAL_SERVICES,
    37605: SICRAL_SERVICES,
    40258: SICRAL_SERVICES,
    # ATHENA-FIDUS
    39613: ATHENA_SERVICES,
    # PRISMA
    44072: PRISMA_SERVICES,
}

# Constellation name substrings → services
CONSTELLATION_DEPENDENCIES: list[tuple[str, list[ItalyServiceDependency]]] = [
    ("GALILEO", GALILEO_SERVICES),
    ("GSAT", GALILEO_SERVICES),
    ("GPS", GPS_SERVICES),
    ("NAVSTAR", GPS_SERVICES),
    ("STARLINK", STARLINK_SERVICES),
    ("IRIDIUM", IRIDIUM_SERVICES),
    ("ONEWEB", ONEWEB_SERVICES),
    ("METEOSAT", WEATHER_SERVICES),
    ("MTG", WEATHER_SERVICES),
    ("MSG", WEATHER_SERVICES),
    ("NOAA", WEATHER_SERVICES),
    ("GOES", WEATHER_SERVICES),
    ("SENTINEL", COPERNICUS_SERVICES),
    ("COSMO", COSMO_SERVICES),
    ("CSG", COSMO_SERVICES),
    ("SICRAL", SICRAL_SERVICES),
    ("PRISMA", PRISMA_SERVICES),
    ("ATHENA", ATHENA_SERVICES),
    ("HOT BIRD", HOT_BIRD_SERVICES),
]

# Known operators enrichment
OPERATOR_MAP: dict[int, str] = {
    33459: "Eutelsat", 28946: "Eutelsat", 53868: "Eutelsat", 54024: "Eutelsat",
    31598: "ASI/Min. Difesa", 32376: "ASI/Min. Difesa", 33412: "ASI/Min. Difesa",
    36599: "ASI/Min. Difesa", 44873: "ASI/Min. Difesa", 51444: "ASI/Min. Difesa",
    26694: "Min. Difesa / Telespazio", 37605: "Min. Difesa / Telespazio",
    40258: "Min. Difesa / DGA (FR)", 39613: "ASI / CNES",
    44072: "ASI", 42900: "Min. Difesa Italiano",
}

CONSTELLATION_MAP: dict[int, str] = {
    33459: "Hot Bird", 28946: "Hot Bird", 53868: "Hot Bird", 54024: "Hot Bird",
    31598: "COSMO-SkyMed", 32376: "COSMO-SkyMed", 33412: "COSMO-SkyMed",
    36599: "COSMO-SkyMed", 44873: "COSMO-SkyMed 2nd Gen", 51444: "COSMO-SkyMed 2nd Gen",
    26694: "SICRAL", 37605: "SICRAL", 40258: "SICRAL",
}

ITALIAN_NORAD_IDS = {31598, 32376, 33412, 36599, 44873, 51444, 44072, 42900, 39613, 26694, 37605, 40258}

# ============================================================
# MAIN SERVICE CLASS
# ============================================================

class ItalyBigBrotherService:
    """Service for Italy satellite dependency mapping."""

    def __init__(self):
        self._tle_cache: dict[str, tuple[float, list]] = {}  # group → (timestamp, data)
        self._satnogs_cache: dict[int, tuple[float, list]] = {}  # norad_id → (timestamp, transmitters)

    # ------ TLE FETCHING ------

    async def _fetch_tle_group(self, group: str) -> list[dict]:
        """Fetch TLE GP data from CelesTrak for a group, with caching."""
        now = time.time()
        if group in self._tle_cache:
            ts, data = self._tle_cache[group]
            if now - ts < CACHE_TTL:
                return data

        url = f"{CELESTRAK_BASE}?GROUP={group}&FORMAT=json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200 and resp.text.strip() not in ("No GP data found", ""):
                    data = resp.json()
                    self._tle_cache[group] = (now, data)
                    return data
        except Exception as e:
            logger.warning(f"Failed to fetch CelesTrak group {group}: {e}")

        # Return cached data even if expired, better than nothing
        if group in self._tle_cache:
            return self._tle_cache[group][1]
        return []

    async def _fetch_tle_by_name(self, name: str) -> list[dict]:
        """Fetch TLE by satellite name."""
        cache_key = f"name:{name}"
        now = time.time()
        if cache_key in self._tle_cache:
            ts, data = self._tle_cache[cache_key]
            if now - ts < CACHE_TTL:
                return data

        url = f"{CELESTRAK_BASE}?NAME={name}&FORMAT=json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200 and resp.text.strip() not in ("No GP data found", ""):
                    data = resp.json()
                    self._tle_cache[cache_key] = (now, data)
                    return data
        except Exception as e:
            logger.warning(f"Failed to fetch CelesTrak name {name}: {e}")
        return []

    # ------ SGP4 PROPAGATION ------

    def _propagate_satellite(self, sat_data: dict) -> Optional[dict]:
        """Propagate satellite position using sgp4 library (OMM format from CelesTrak JSON)."""
        import math
        try:
            from sgp4.api import Satrec, jday
            from sgp4 import omm

            # CelesTrak JSON returns OMM format — no TLE lines, use omm.initialize()
            sat = Satrec()
            omm.initialize(sat, sat_data)

            now = datetime.now(timezone.utc)
            jd, fr = jday(
                now.year, now.month, now.day,
                now.hour, now.minute, now.second + now.microsecond / 1e6
            )
            e, r, v = sat.sgp4(jd, fr)

            if e != 0:
                return None

            # ECI → geodetic (WGS84)
            x, y, z = r  # km
            gmst = self._gmst(now)
            lon_rad = math.atan2(y, x) - gmst
            r_eq = math.sqrt(x * x + y * y)

            # Iterative geodetic latitude (Bowring)
            a = 6378.137
            f = 1.0 / 298.257223563
            e2 = 2 * f - f * f
            lat_rad = math.atan2(z, r_eq)
            for _ in range(10):
                N = a / math.sqrt(1 - e2 * math.sin(lat_rad) ** 2)
                lat_rad = math.atan2(z + e2 * N * math.sin(lat_rad), r_eq)

            lat_deg = math.degrees(lat_rad)
            lon_deg = math.degrees(lon_rad) % 360
            if lon_deg > 180:
                lon_deg -= 360

            cos_lat = math.cos(lat_rad)
            N = a / math.sqrt(1 - e2 * math.sin(lat_rad) ** 2)
            if abs(cos_lat) > 1e-10:
                alt_km = r_eq / cos_lat - N
            else:
                alt_km = abs(z) / abs(math.sin(lat_rad)) - N * (1 - e2)

            R_earth = 6371.0
            footprint_km = math.sqrt(max(0.0, 2 * R_earth * alt_km + alt_km * alt_km))

            return {
                "lat": lat_deg,
                "lon": lon_deg,
                "alt": alt_km,
                "footprint_km": footprint_km,
            }
        except Exception as exc:
            logger.debug(f"SGP4 propagation failed: {exc}")
            return None

    def _gmst(self, dt: datetime) -> float:
        """Calculate Greenwich Mean Sidereal Time in radians."""
        import math
        J2000 = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        d = (dt - J2000).total_seconds() / 86400.0
        gmst_deg = 280.46061837 + 360.98564736629 * d
        return math.radians(gmst_deg % 360)

    def _is_over_italy(self, lat: float, lon: float) -> bool:
        """Check if position is within Italy bounding box."""
        return (ITALY_BOUNDS["min_lat"] <= lat <= ITALY_BOUNDS["max_lat"] and
                ITALY_BOUNDS["min_lon"] <= lon <= ITALY_BOUNDS["max_lon"])

    # ------ DEPENDENCY LOOKUP ------

    def _get_dependencies(self, norad_id: int, name: str) -> list[ItalyServiceDependency]:
        """Get Italian service dependencies for a satellite."""
        # First check NORAD ID map
        if norad_id in NORAD_DEPENDENCIES:
            return NORAD_DEPENDENCIES[norad_id]

        # Then check constellation name substrings
        name_upper = name.upper()
        for substr, services in CONSTELLATION_DEPENDENCIES:
            if substr in name_upper:
                return services

        return []

    # ------ SATNOGS ENRICHMENT ------

    async def _get_transmitters(self, norad_id: int) -> list[SatelliteTransmitter]:
        """Fetch transmitter data from SatNOGS with caching."""
        now = time.time()
        if norad_id in self._satnogs_cache:
            ts, data = self._satnogs_cache[norad_id]
            if now - ts < SATNOGS_CACHE_TTL:
                return data

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = f"{SATNOGS_BASE}/transmitters/?satellite__norad_cat_id={norad_id}&format=json"
                resp = await client.get(url)
                if resp.status_code == 200:
                    raw = resp.json()
                    transmitters = []
                    for t in raw[:10]:  # max 10
                        freq_hz = t.get("downlink_low") or t.get("downlink_high")
                        band = self._classify_band(freq_hz) if freq_hz else None
                        transmitters.append(SatelliteTransmitter(
                            description=t.get("description"),
                            alive=t.get("alive", False),
                            type=t.get("type"),
                            downlink_low=t.get("downlink_low"),
                            downlink_high=t.get("downlink_high"),
                            uplink_low=t.get("uplink_low"),
                            uplink_high=t.get("uplink_high"),
                            mode=t.get("mode"),
                            baud=t.get("baud"),
                            service=t.get("service"),
                            band=band,
                        ))
                    self._satnogs_cache[norad_id] = (now, transmitters)
                    return transmitters
        except Exception as e:
            logger.debug(f"SatNOGS fetch failed for {norad_id}: {e}")
        return []

    def _classify_band(self, freq_hz: float) -> str:
        """Classify frequency into band name."""
        if freq_hz < 30e6: return "HF"
        if freq_hz < 300e6: return "VHF"
        if freq_hz < 3e9: return "UHF/L/S"
        if freq_hz < 8e9: return "C/X"
        if freq_hz < 18e9: return "Ku"
        return "Ka"

    # ------ MAIN PUBLIC METHODS ------

    async def get_satellites_over_italy(self, include_transmitters: bool = False) -> ItalyBigBrotherResponse:
        """Main method: get all satellites currently over Italy with Italian service dependencies."""
        logger.info("Fetching satellites over Italy...")

        # Fetch TLE data from multiple groups
        groups = ["active", "geo", "galileo", "gps-ops", "starlink", "oneweb", "iridium-NEXT", "weather"]
        import asyncio
        tle_results = await asyncio.gather(
            *[self._fetch_tle_group(g) for g in groups],
            return_exceptions=True
        )

        # Merge and deduplicate by NORAD ID
        all_sats: dict[int, dict] = {}
        for result in tle_results:
            if isinstance(result, list):
                for sat in result:
                    norad_id = sat.get("NORAD_CAT_ID")
                    if norad_id and norad_id not in all_sats:
                        all_sats[norad_id] = sat

        logger.info(f"Loaded {len(all_sats)} unique satellites from CelesTrak")

        # Find satellites over Italy
        over_italy = []
        for norad_id, sat_data in all_sats.items():
            pos = self._propagate_satellite(sat_data)
            if pos is None:
                continue

            if not self._is_over_italy(pos["lat"], pos["lon"]):
                continue

            # Get dependencies
            name = sat_data.get("OBJECT_NAME", f"NORAD-{norad_id}")
            deps = self._get_dependencies(norad_id, name)
            operator = OPERATOR_MAP.get(norad_id, sat_data.get("COUNTRY_CODE"))
            constellation = CONSTELLATION_MAP.get(norad_id)

            total_users = sum(d.italian_users for d in deps)
            critical_count = sum(1 for d in deps if d.criticality == Criticality.CRITICAL)
            is_italian = norad_id in ITALIAN_NORAD_IDS
            is_critical = critical_count > 0 or is_italian

            transmitters = []
            if include_transmitters and deps:
                transmitters = await self._get_transmitters(norad_id)

            # Detect orbit type
            period = sat_data.get("PERIOD")
            if period:
                if period > 1400: orbit_type = "GEO"
                elif period > 600: orbit_type = "MEO"
                else: orbit_type = "LEO"
            else:
                orbit_type = "GEO" if pos["alt"] > 35000 else ("MEO" if pos["alt"] > 2000 else "LEO")

            over_italy.append(SatelliteOverItaly(
                norad_id=norad_id,
                name=name,
                operator=operator,
                country_code=sat_data.get("COUNTRY_CODE"),
                constellation=constellation,
                orbit_type=orbit_type,
                latitude=round(pos["lat"], 4),
                longitude=round(pos["lon"], 4),
                altitude=round(pos["alt"], 1),
                inclination=sat_data.get("INCLINATION"),
                period=period,
                footprint_radius_km=round(pos["footprint_km"], 1),
                over_italy=True,
                is_italian=is_italian,
                is_critical=is_critical,
                italian_services=deps,
                total_italian_beneficiaries=total_users,
                critical_services_count=critical_count,
                transmitters=transmitters,
            ))

        logger.info(f"Found {len(over_italy)} satellites over Italy")

        # Build stats
        category_counts: dict[str, int] = {}
        for sat in over_italy:
            for svc in sat.italian_services:
                cat = svc.category.value
                category_counts[cat] = category_counts.get(cat, 0) + 1

        stats = ItalyBigBrotherStats(
            total_satellites_over_italy=len(over_italy),
            italian_satellites=sum(1 for s in over_italy if s.is_italian),
            by_category=category_counts,
            total_beneficiaries=sum(s.total_italian_beneficiaries for s in over_italy),
            critical_satellites=sum(1 for s in over_italy if s.is_critical),
            timestamp=datetime.now(timezone.utc),
        )

        return ItalyBigBrotherResponse(
            satellites=sorted(over_italy, key=lambda s: (-s.is_italian, -s.critical_services_count)),
            stats=stats,
            timestamp=datetime.now(timezone.utc),
        )

    async def get_satellite_dependency_detail(self, norad_id: int) -> Optional[SatelliteDependencyDetail]:
        """Get detailed dependency info for a specific satellite."""
        # Try to find in TLE data
        all_groups = ["active", "geo", "galileo", "gps-ops", "starlink", "oneweb", "iridium-NEXT", "weather"]
        sat_data = None

        # Check cached data first
        for group in all_groups:
            cache_entry = self._tle_cache.get(group)
            if cache_entry:
                _, data = cache_entry
                for sat in data:
                    if sat.get("NORAD_CAT_ID") == norad_id:
                        sat_data = sat
                        break
            if sat_data:
                break

        name = sat_data.get("OBJECT_NAME", f"NORAD-{norad_id}") if sat_data else f"NORAD-{norad_id}"
        deps = self._get_dependencies(norad_id, name)
        transmitters = await self._get_transmitters(norad_id)

        period = sat_data.get("PERIOD") if sat_data else None
        pos = self._propagate_satellite(sat_data) if sat_data else None
        alt = pos["alt"] if pos else None

        if period:
            if period > 1400: orbit_type = "GEO"
            elif period > 600: orbit_type = "MEO"
            else: orbit_type = "LEO"
        elif alt:
            orbit_type = "GEO" if alt > 35000 else ("MEO" if alt > 2000 else "LEO")
        else:
            orbit_type = "UNKNOWN"

        return SatelliteDependencyDetail(
            norad_id=norad_id,
            name=name,
            operator=OPERATOR_MAP.get(norad_id),
            constellation=CONSTELLATION_MAP.get(norad_id),
            orbit_type=orbit_type,
            altitude=alt,
            inclination=sat_data.get("INCLINATION") if sat_data else None,
            italian_services=deps,
            total_italian_beneficiaries=sum(d.italian_users for d in deps),
            critical_services_count=sum(1 for d in deps if d.criticality == Criticality.CRITICAL),
            transmitters=transmitters,
        )

    async def get_dependency_database(self) -> dict:
        """Return the full Italy dependency database categorized."""
        return {
            "categories": {cat.value: cat.name for cat in ServiceCategory},
            "satellites": [
                {
                    "norad_id": nid,
                    "name": OPERATOR_MAP.get(nid, "Unknown"),
                    "constellation": CONSTELLATION_MAP.get(nid),
                    "services_count": len(deps),
                    "total_users": sum(d.italian_users for d in deps),
                    "criticality": max((d.criticality.value for d in deps), default="LOW"),
                }
                for nid, deps in NORAD_DEPENDENCIES.items()
            ],
            "constellations": [
                {
                    "key": key,
                    "services_count": len(services),
                    "total_users": sum(s.italian_users for s in services),
                }
                for key, services in CONSTELLATION_DEPENDENCIES
            ]
        }


# Singleton service instance
_italy_service: Optional[ItalyBigBrotherService] = None

def get_italy_bigbrother_service() -> ItalyBigBrotherService:
    global _italy_service
    if _italy_service is None:
        _italy_service = ItalyBigBrotherService()
    return _italy_service
