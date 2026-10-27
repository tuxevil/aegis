// Replay determinista y SIN red: ni ingesta en vivo ni envíos a WhatsApp.
const time = (value) => {
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new TypeError("Timestamp ISO inválido: " + value);
  return n;
};
export function replayCase(caseData, asOf) {
  if (!caseData || !Array.isArray(caseData.events)) throw new TypeError("Caso inválido");
  const cutoff = time(asOf);
  const impact = time(caseData.referenceImpactAt);
  const known = caseData.events.filter((event) => time(event.publishedAt) <= cutoff)
    .sort((a, b) => time(a.publishedAt) - time(b.publishedAt));
  const drafts = known.filter((event) => event.citySlug === caseData.citySlug &&
    (event.kind === "warning" || event.kind === "impact_update") &&
    (!event.validUntil || time(event.validUntil) >= cutoff))
    .map((event) => {
      const leadMinutes = Math.floor((impact - time(event.publishedAt)) / 60000);
      const heading = event.kind === "warning" ? "PREVENCIÓN METEOROLÓGICA" : "REPORTE DE SITUACIÓN";
      return {
        eventId: event.id,
        citySlug: event.citySlug,
        kind: event.kind,
        publishedAt: event.publishedAt,
        leadMinutesToAfternoonRainWindow: leadMinutes,
        message: "[AEGIS · " + caseData.city.toUpperCase() + " | " + heading + "]\n" +
          event.message + "\n\nFuente: " + event.authority + " — " + event.carrier +
          "\nFecha de publicación: " + event.publishedAt +
          "\n" + event.sourceUrl +
          "\n\nAEGIS es un observatorio independiente. No sustituye avisos ni instrucciones oficiales."
      };
    });
  return {
    caseId: caseData.caseId, city: caseData.city, citySlug: caseData.citySlug,
    evaluatedAt: asOf, referenceImpactAt: caseData.referenceImpactAt,
    knownEvents: known.map((event) => ({id:event.id, publishedAt:event.publishedAt, sourceUrl:event.sourceUrl})),
    drafts
  };
}

// Un plan de salida, NO un transmisor. Por diseño no se conecta a WAHA.
export function planChannelOutbox(replay, channels = {}) {
  const channel = channels[replay.citySlug];
  const ready = typeof channel?.id === "string" &&
    /^[^\s@]+@newsletter$/.test(channel.id) && channel.verifiedOwner === true;
  return replay.drafts.map((draft) => ({
    idempotencyKey: replay.caseId + ":" + draft.eventId + ":whatsapp-channel",
    citySlug: draft.citySlug, dispatchMode: "DRY_RUN",
    channelReady: ready,
    reason: ready ? "Canal verificado; envío aún desactivado" : "Canal no configurado/verificado",
    channelId: ready ? channel.id : null,
    // No se devuelve ningún payload ejecutable hasta introducir aprobación explícita y garantías operativas.
    preview: draft.message
  }));
}
