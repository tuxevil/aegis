const HOURS = 3600000;
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function freshness(timestamp, now, maxHours) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || time > now.getTime() + 300000) return "unknown";
  return now.getTime() - time <= maxHours * HOURS ? "fresh" : "stale";
}

// Explainable monitoring rules, not probabilities or a substitute for CENACE.
export function assessEnergy(dams, cenace, now = new Date()) {
  const maz = dams?.mazar;
  const current = freshness(maz?.timestamp, now, 2) === "fresh";
  const reasons = [];
  const missing = [
    "Caudal y sedimentos de Coca Codo",
    "Disponibilidad adicional de térmicas",
    "Avisos vigentes de racionamiento",
  ];
  let level = "unknown",
    title = "Falta una lectura reciente",
    summary =
      "Sin una cota reciente de Mazar no podemos evaluar el deterioro de su reserva.";
  const cota = number(maz?.cotaMsnm);
  const rate = number(maz?.changeMPerDay);
  const days = number(maz?.daysToShutdown);
  const longRate = number(maz?.longTermChangeMPerDay);
  const sustainedDecline = longRate !== null && longRate <= -0.5;
  if (current && cota !== null) {
    if (cota <= 2115) {
      level = "critical";
      title = "Reserva en zona crítica";
      summary =
        "Mazar está en el umbral de seguridad por sedimentos. La presión sobre la cascada del Paute es elevada.";
      reasons.push(
        "Nivel en o por debajo de 2115 m: operación segura comprometida.",
      );
    } else if (
      cota < 2120 ||
      (rate !== null && rate <= -0.5) ||
      (sustainedDecline && rate !== null && rate <= 0.05) ||
      (days !== null && days <= 14)
    ) {
      level = "elevated";
      title = "La reserva exige atención";
      summary =
        "El nivel bajo o su ritmo de descenso acercan Mazar a la zona crítica. Conviene preparar el respaldo y seguir los avisos oficiales.";
      reasons.push(
        cota < 2120
          ? "Quedan menos de 5 m hasta el umbral de seguridad."
          : "El descenso es rápido o el escenario de continuidad cruza 2115 m en dos semanas.",
      );
    } else if (sustainedDecline && rate !== null && rate > 0.05) {
      level = "watch";
      title = "Recuperación reciente, reserva a vigilar";
      summary =
        "La última ventana mejora, pero el descenso de varios días todavía pesa. Seguimos el nivel y los aportes para confirmar la recuperación.";
      reasons.push(
        "El ascenso reciente no borra el descenso observado en la ventana más larga.",
      );
    } else if (rate !== null && rate < -0.05) {
      level = "watch";
      title = "La reserva está bajando";
      summary =
        "Mazar consume su reserva. Hay margen de nivel, pero la tendencia necesita vigilancia.";
      reasons.push("Descenso medido con lecturas históricas.");
    } else {
      level = "observed";
      title =
        rate === null
          ? "Nivel conocido, tendencia pendiente"
          : "Sin descenso apreciable reciente";
      summary =
        rate === null
          ? "Tenemos la cota de Mazar, pero aún falta una ventana suficiente para medir su evolución."
          : "La última ventana no muestra deterioro de nivel. Esto no certifica que el sistema pueda cubrir la demanda futura.";
      if (rate === null)
        missing.push("Historia suficiente para medir descenso");
    }
    if (longRate !== null && number(maz.longTermHours) !== null) {
      reasons.push(
        `En ${maz.longTermHours} h, el cambio medio de nivel fue ${longRate.toFixed(2)} m/día. La evaluación contrasta esta ventana con la más reciente.`,
      );
    }
    const inflow = number(maz.caudalEntradaM3s);
    if (inflow !== null && freshness(maz.caudalTimestamp, now, 2) === "fresh") {
      const time = Date.parse(maz.caudalTimestamp);
      const baseline = (maz.inflowHistory || [])
        .filter(
          (r) =>
            time - Date.parse(r.loctimestamp) >= 20 * HOURS &&
            time - Date.parse(r.loctimestamp) <= 28 * HOURS &&
            number(r.valueedit) !== null,
        )
        .sort(
          (a, b) =>
            Math.abs(time - Date.parse(a.loctimestamp) - 24 * HOURS) -
            Math.abs(time - Date.parse(b.loctimestamp) - 24 * HOURS),
        )[0];
      if (baseline?.valueedit > 0) {
        const change =
          ((inflow - baseline.valueedit) / baseline.valueedit) * 100;
        reasons.push(
          `El caudal de entrada ${change < 0 ? "bajó" : "subió"} ${Math.abs(change).toFixed(0)}% frente a una lectura de hace unas 24 h. No es una comparación estacional.`,
        );
        if (
          change <= -20 &&
          rate !== null &&
          rate < -0.05 &&
          level === "watch"
        ) {
          level = "elevated";
          title = "Menos entrada, reserva en descenso";
          summary =
            "Coinciden dos señales: Mazar baja y recibe menos agua que hace unas 24 horas. Seguimos la evolución antes del nivel crítico.";
        }
      }
    } else missing.push("Caudal reciente de entrada a Mazar");
  } else if (cota !== null) {
    title = "Lecturas de Mazar desactualizadas";
    summary =
      "Conservamos la última observación, pero no la presentamos como estado actual.";
    reasons.push(`Última cota conocida: ${cota.toFixed(2)} m.`);
  }
  if (freshness(cenace?.observedAt, now, 2) !== "fresh")
    missing.push("Curva reciente de CENACE");
  return {
    level,
    title,
    summary,
    reasons,
    missing,
    scope: "Evaluación parcial de señales energéticas",
    action:
      "Revisá los avisos de tu distribuidora y prepará tu respaldo si dependés de electricidad continua.",
    methodology:
      "AEGIS: 2115 m seguridad; 2120 m prealerta; vigilancia por descenso. Ritmo ≥0,5 m/día, horizonte ≤14 días y caída de caudal ≥20% son reglas preventivas experimentales, no criterios CENACE.",
  };
}

export function assessLocal(weather, forecast, now = new Date()) {
  const current = freshness(weather?.timestamp, now, 1) === "fresh";
  const future =
    forecast?.hours?.filter(
      (r) =>
        Date.parse(r.timestamp) >= now.getTime() &&
        Date.parse(r.timestamp) < now.getTime() + 24 * HOURS,
    ) || [];
  const complete =
    future.length >= 20 &&
    future.every((r) => number(r.precipitationMm) !== null) &&
    freshness(forecast?.retrievedAt, now, 3) === "fresh";
  const rainTomorrow = complete
    ? +future.reduce((sum, r) => sum + r.precipitationMm, 0).toFixed(1)
    : null;
  const rain = current ? number(weather.rainRateMmHr) : null;
  const day = current ? number(weather.rainDailyMm) : null;
  let level = "unknown",
    title = "Estación local sin lectura reciente",
    summary = complete
      ? "Hay una previsión para la cabecera cantonal, pero falta una medición reciente de la estación. Son fuentes diferentes."
      : "Faltan datos locales recientes. Consultá los enlaces de avisos oficiales y volvé a actualizar el panorama.";
  if (rain !== null) {
    if (rain >= 8 || (day !== null && day >= 20)) {
      level = "elevated";
      title =
        rain >= 8
          ? "Lluvia intensa en la estación"
          : "Lluvia acumulada para vigilar";
      summary =
        "Prestá atención a drenajes, laderas y desplazamientos. Esta señal de lluvia no es una probabilidad de deslave.";
    } else if (rain > 0) {
      level = "watch";
      title = "Está lloviendo en Pallatanga";
      summary =
        "La estación registra lluvia. Seguí la acumulación y consultá el estado de las vías antes de viajar.";
    } else {
      level = "observed";
      title = "Sin lluvia en la última lectura";
      summary =
        "Es una observación puntual: otras zonas pueden tener lluvia y las laderas pueden conservar humedad.";
    }
  }
  if (rainTomorrow !== null && rainTomorrow >= 20 && level !== "elevated") {
    level = "watch";
    title = "El modelo anticipa lluvia";
    summary =
      "La previsión de las próximas 24 horas sugiere acumulación para vigilar. Contrastala con los avisos territoriales de INAMHI.";
  }
  return {
    level,
    title,
    summary,
    rainTomorrow,
    current,
    forecastAvailable: complete,
    action:
      "Antes de salir, verificá avisos de INAMHI y vías en ECU 911. Ante una emergencia, llamá al 911.",
    methodology:
      "Reglas experimentales de vigilancia: 8 mm/h en estación o 20 mm diarios. No miden saturación de suelo ni determinan amenaza oficial.",
  };
}

export function buildAssessment(data, now = new Date()) {
  return {
    energy: assessEnergy(data.dams, data.cenace, now),
    local: assessLocal(data.weather, data.forecast, now),
  };
}
