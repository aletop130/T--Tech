# CelesTrak Attribution for HORUS

HORUS uses public orbital and catalog data from **CelesTrak**: <https://celestrak.org>.

CelesTrak is created and maintained by **Dr. T.S. Kelso** and is an external public data provider. HORUS is not affiliated with CelesTrak. Whenever HORUS screenshots, demos, analytics, or exports rely on these public orbital feeds, attribution to CelesTrak should be preserved.

This document records the current CelesTrak usage in the repository as inspected on **March 15, 2026**.

## Attribution Statement

Suggested short-form credit:

> Orbital data and catalog products provided by CelesTrak (<https://celestrak.org>).

Suggested long-form credit:

> HORUS uses public orbital element sets, catalog products, and collision-risk source data from CelesTrak (<https://celestrak.org>), created and maintained by Dr. T.S. Kelso.

## What HORUS Uses from CelesTrak

| Endpoint / Product | Use in HORUS |
| --- | --- |
| `https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=TLE` | Group-based TLE import, group browser, debris import |
| `https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=JSON` | Italy monitor, reentry feed, group-based JSON workflows |
| `https://celestrak.org/NORAD/elements/gp.php?CATNR=<norad>&FORMAT=TLE` | Direct NORAD lookup for curated tracked objects |
| `https://celestrak.org/NORAD/elements/gp.php?CATNR=<norad>&FORMAT=JSON` | Maneuver detection and GP history/current record retrieval |
| `https://celestrak.org/NORAD/elements/gp.php?NAME=<name>&FORMAT=TLE` | Name-based search and preview workflows |
| `https://celestrak.org/NORAD/elements/gp.php?NAME=<name>&FORMAT=JSON` | Italy monitor name-based JSON lookup support |
| `https://celestrak.org/pub/satcat.csv` | Country dashboard enrichment |
| `https://celestrak.org/satcat/records.php` | Debris genealogy and SATCAT fragment tracing |
| `https://celestrak.org/SOCRATES/sort-minRange.csv` | Collision heatmap and conjunction aggregation |

## CelesTrak Group Feeds Exposed or Consumed by HORUS

The repository currently supports **all 36 group slugs** listed below through the CelesTrak browser and/or automated workflows.

| Group Slug | Category | How HORUS Uses It |
| --- | --- | --- |
| `last-30-days` | Special Interest | Reentry feed, browser preview |
| `stations` | Special Interest | Browser preview/import |
| `visual` | Special Interest | Browser preview/import |
| `active` | Special Interest | Browser preview/import, country dashboard basis, Italy monitor |
| `analyst` | Special Interest | Browser preview/import |
| `cosmos-1408-debris` | Debris | Scheduled/on-demand debris ingestion |
| `fengyun-1c-debris` | Debris | Scheduled/on-demand debris ingestion |
| `iridium-33-debris` | Debris | Scheduled/on-demand debris ingestion |
| `cosmos-2251-debris` | Debris | Scheduled/on-demand debris ingestion |
| `weather` | Weather | Italy monitor, browser preview/import |
| `noaa` | Weather | Browser preview/import |
| `goes` | Weather | Browser preview/import |
| `resource` | Weather | Browser preview/import |
| `sarsat` | Weather | Browser preview/import |
| `geo` | Communications | Italy monitor, browser preview/import |
| `intelsat` | Communications | Browser preview/import |
| `ses` | Communications | Browser preview/import |
| `starlink` | Communications | Italy monitor, browser preview/import |
| `oneweb` | Communications | Italy monitor, browser preview/import |
| `iridium-NEXT` | Communications | Italy monitor, browser preview/import |
| `orbcomm` | Communications | Browser preview/import |
| `globalstar` | Communications | Browser preview/import |
| `amateur` | Communications | Browser preview/import |
| `gnss` | Navigation | Browser preview/import |
| `gps-ops` | Navigation | Italy monitor, browser preview/import |
| `glo-ops` | Navigation | Browser preview/import |
| `galileo` | Navigation | Italy monitor, browser preview/import |
| `beidou` | Navigation | Browser preview/import |
| `science` | Science | Browser preview/import |
| `geodetic` | Science | Browser preview/import |
| `engineering` | Science | Browser preview/import |
| `education` | Science | Browser preview/import |
| `military` | Military | Browser preview/import |
| `cubesat` | Other | Browser preview/import |
| `radar` | Other | Browser preview/import |
| `other` | Other | Browser preview/import |

## Direct NORAD Catalog References in HORUS Code

The list below covers every explicit real **NORAD Catalog ID** currently hardcoded in the repository for seeded catalogs, scenario labeling, dependency maps, special handling, or historical examples.

Important note:

- HORUS sometimes presents scenario-oriented labels instead of official object names.
- The authoritative orbital record still comes from CelesTrak and is keyed by the NORAD ID shown below.
- This list does **not** enumerate the thousands of dynamic objects fetched at runtime from CelesTrak groups; it enumerates the explicit static references in code.

### Curated operational seed set and tracked object catalog

| NORAD ID | HORUS Label / Mapping | Primary Use in HORUS |
| --- | --- | --- |
| `20580` | `TerraScan-1` | Curated allied seed via direct CelesTrak NORAD lookup |
| `24876` | `HOSTILE-NAV-1` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `25530` | `WeatherEye-1` | Curated allied seed via direct CelesTrak NORAD lookup |
| `25544` | `Guardian Station Alpha` | Curated allied seed; also special handling in reentry logic |
| `25994` | `NavBeacon-1` | Curated allied seed via direct CelesTrak NORAD lookup |
| `26407` | `HOSTILE-NAV-2` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `26690` | `HOSTILE-NAV-3` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `26694` | `SICRAL-1` | Curated Italian seed and Italy dependency map |
| `27424` | `TRACKED-OBJ-1` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `27663` | `HOSTILE-NAV-4` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `27704` | `HOSTILE-NAV-5` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `31598` | `COSMO-SkyMed 1` | Curated Italian seed and Italy dependency map |
| `32376` | `COSMO-SkyMed 2` | Curated Italian seed and Italy dependency map |
| `33412` | `COSMO-SkyMed 3` | Curated Italian seed and Italy dependency map |
| `33591` | `TRACKED-OBJ-2` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `36516` | `DeepWatch One` | Curated allied seed via direct CelesTrak NORAD lookup |
| `36599` | `COSMO-SkyMed 4` | Curated Italian seed and Italy dependency map |
| `36793` | `Pleiades-1A` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `37214` | `TRACKED-OBJ-3` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `37605` | `SICRAL-1B` | Curated Italian seed and Italy dependency map |
| `37846` | `Galileo FOC-1` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `38012` | `Pleiades-1B` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `38857` | `Galileo FOC-2` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `39444` | `UNIDENTIFIED-1` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `39613` | `ATHENA-FIDUS` | Curated Italian seed and Italy dependency map |
| `39634` | `Sentinel-1A` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `40115` | `SUSPECT-COM-1` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `40116` | `SUSPECT-COM-2` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `40258` | `SICRAL-2` | Curated Italian seed and Italy dependency map |
| `41456` | `Sentinel-1B` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `41465` | `UNIDENTIFIED-2` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `41771` | `SUSPECT-COM-3` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `42900` | `OPTSAT-3000` | Curated Italian seed and Italy monitor operator mapping |
| `43013` | `StarFinder-A` | Curated allied seed via direct CelesTrak NORAD lookup |
| `43205` | `Celestial Station` | Curated allied seed via direct CelesTrak NORAD lookup |
| `43234` | `Carbonite-2` | Curated NATO/allied seed via direct CelesTrak NORAD lookup |
| `43286` | `EyeInSky-1` | Curated allied seed via direct CelesTrak NORAD lookup |
| `43689` | `WindWatcher` | Curated allied seed via direct CelesTrak NORAD lookup |
| `44072` | `PRISMA` | Curated Italian seed and Italy dependency map |
| `44484` | `UNIDENTIFIED-3` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `44713` | `CommLink-1` | Curated allied seed via direct CelesTrak NORAD lookup |
| `44873` | `CSG-1` | Curated Italian seed and Italy dependency map |
| `48274` | `UNKNOWN-ALPHA` | Curated adversary seed; also special handling in reentry logic |
| `49044` | `UNKNOWN-BETA` | Curated adversary seed; also reused in reentry examples |
| `49271` | `CONTACT-X1` | Curated adversary seed via direct CelesTrak NORAD lookup |
| `51444` | `CSG-2` | Curated Italian seed and Italy dependency map |
| `53239` | `UNKNOWN-GAMMA` | Curated adversary seed; also special handling in reentry logic |
| `54216` | `CONTACT-X2` | Curated adversary seed; also special handling in reentry logic |

### Italy dependency map additions

| NORAD ID | HORUS Label / Mapping | Primary Use in HORUS |
| --- | --- | --- |
| `28946` | `Hot Bird 13E` | Italy dependency map |
| `33459` | `Hot Bird 13B` | Italy dependency map |
| `53868` | `Hot Bird 13F` | Italy dependency map |
| `54024` | `Hot Bird 13G` | Italy dependency map |

### Additional reentry and historical-example references

| NORAD ID | HORUS Label / Mapping | Primary Use in HORUS |
| --- | --- | --- |
| `39765` | `COSMOS 2499 DEB` | Historical/example reentry data |
| `43762` | `FALCON 9 DEB` | Historical/example reentry data |
| `45891` | `STARLINK-1745` | Historical/example reentry data |
| `47201` | `VEGA R/B` | Historical/example reentry data |
| `48912` | `SL-4 R/B` | Historical/example reentry data |
| `51003` | `CZ-2C R/B` | Historical/example reentry data |
| `52891` | `ELECTRON R/B` | Historical/example reentry data |
| `53240` | `COSMOS 2551 DEB` | Historical/example reentry data |
| `57320` | `STARLINK-5241` | Historical/example reentry data |

## Practical Credit Guidance

If you are presenting HORUS publicly, the safest wording is:

- credit CelesTrak in the main README or deck
- keep this attribution file in the repository
- mention that public orbital records come from CelesTrak when showing live tracking, catalog analytics, collision heatmaps, debris genealogy, or reentry views

## Related HORUS Files

- `README.md`
- `backend/app/services/celestrack.py`
- `backend/app/services/debris_import.py`
- `backend/app/services/italy_bigbrother.py`
- `backend/app/services/country_dashboard.py`
- `backend/app/services/reentry_tracker.py`
- `backend/app/services/maneuver_detection.py`
- `backend/app/services/debris_genealogy.py`
- `backend/app/services/collision_heatmap.py`
