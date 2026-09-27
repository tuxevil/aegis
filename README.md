# 🐧🤖 A.E.G.I.S. - GRID SENTINEL
**Advanced Ecological & Grid Intelligence System**

![AEGIS-GRID Status](https://img.shields.io/badge/Status-OPERATIVE-00ff00?style=for-the-badge)
![Target](https://img.shields.io/badge/Target-PALLATANGA_EC-blue?style=for-the-badge)
![Nixpacks](https://img.shields.io/badge/Coolify-Ready-blueviolet?style=for-the-badge)

A.E.G.I.S.-GRID es un sistema autónomo de alerta temprana, monitoreo hidrológico y análisis de la matriz energética ecuatoriana, diseñado para mitigar los impactos del **Súper El Niño 2026**. Se encarga de cruzar la climatología local en la cordillera andina (Pallatanga) con los datos del Sistema Nacional Interconectado (SNI) de Ecuador.

## ⚡ Capacidades Core

1. **Defensa Geológica (SSLI):**
   - Consume en tiempo real los datos de la Estación Meteorológica de Pallatanga (vía *Ambient Weather*).
   - Utiliza un **Índice de Saturación de Suelo** (Antecedent Precipitation Index) para disparar alertas críticas de deslaves y bloqueos de la vía E487.

2. **Defensa Energética (DDPM - Dams Depletion Prediction Model):**
   - Monitoreo directo sin latencia a la base de datos Oracle REST (ORDS) de CELEC SUR.
   - Extrae Cota, Caudales y Turbinas en línea de los embalses **Mazar**, **Paute-Molino**, **Sopladora** y **Minas San Francisco**.
   - Calcula el tiempo restante de turbinación antes del colapso del sistema y envía pre-alertas de apagón para activar bancos de baterías (UPS).

3. **Demanda Nacional en Tiempo Real (CENACE):**
   - Scraper dinámico que decodifica tensores base64 crudos inyectados en la plataforma operativa de CENACE.
   - Muestra la curva horaria real, demanda eléctrica (MW) y composición del mix hidro/térmico/importado.

4. **Predicción Súper El Niño (NOAA):**
   - Lee anomalías SST (Temperatura Superficial del Mar) semanales de la NOAA.
   - Correlaciona Niño 1+2 (lluvias destructivas en los Andes occidentales) vs. Niño 3.4 (sequías en la cuenca oriental).

## 🚀 Despliegue en Producción (Coolify)

Este repositorio es 100% *Cloud-Native* y está optimizado para despliegues *Zero-Config* usando **Coolify v4** en clusters Proxmox.

### Opción A: Nixpacks (Recomendado)
Coolify detectará el `package.json`, instalará las dependencias y ejecutará automáticamente el script `"start": "node backend.js"`. 

### Opción B: Dockerfile
El repositorio incluye un `Dockerfile` hiper-ligero (Node 22 Alpine).
- **Build Pack:** `Dockerfile`
- **Port:** `3010`

### Configuración requerida

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de escucha (default `3010`) |
| `AMBIENT_MAC` | MAC de la estación Ambient Weather para `/api/weather` |

```bash
cp .env.example .env
# editar .env con tu MAC real
```

En Coolify, define `AMBIENT_MAC` en Environment Variables. Sin ella, `/api/weather` responde `500`.

---

## 📡 Arquitectura de la API Local

El orquestador levanta un API robusta con múltiples capas de caché en memoria para proteger los endpoints públicos:

* `GET /api/status` - Aggregator táctico (Todo en uno).
* `GET /api/weather` - Microclima y modelo de deslaves (5 min TTL).
* `GET /api/dams` - Hidrometría de CELEC (10 min TTL).
* `GET /api/cenace` - Red Eléctrica Nacional (30 min TTL).
* `GET /api/enso` - Estado ENSO NOAA (60 min TTL).
* `GET /ui` - Interfaz Táctica de Control (Cyberpunk Dashboard).

*Ghost in the shell. pi.dev network operative.*