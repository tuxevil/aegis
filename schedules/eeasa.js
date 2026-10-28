import { JSDOM } from "jsdom";
import { utcDate } from "../storage/repositories.js";
import { EEASA } from "./providers.js";
export const labelKey = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
const plain = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
function localTime(date, time) {
  if (
    !/^\d{2}:\d{2}$/.test(time) ||
    Number(time.slice(0, 2)) > 23 ||
    Number(time.slice(3)) > 59
  )
    throw new Error("TIME_REVIEW");
  const result = utcDate(`${date}T${time}:00-05:00`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: EEASA.zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(result))
      .map((p) => [p.type, p.value]),
  );
  if (
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !==
    `${date}T${time}`
  )
    throw new Error("TIMEZONE_REVIEW");
  return result;
}
export function parseEeasa(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > EEASA.max_bytes
  )
    throw new Error("BODY_LIMIT");
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const dom = new JSDOM(html); // Default: no scripts, subresources, cookies or remote execution.
  try {
    const doc = dom.window.document;
    for (const node of doc.querySelectorAll("script,style,iframe,object,embed"))
      node.remove();
    const root = doc.querySelector("main#main section.eeasa-container");
    if (
      !root ||
      !/trabajos programados/i.test(
        doc.querySelector("main#main h1")?.textContent || "",
      )
    )
      throw new Error("FORMAT_REVIEW");
    const cards = [...root.querySelectorAll(".card .card-body")];
    if (!cards.length || cards.length > 100) throw new Error("ROWS_REVIEW");
    const seen = new Set();
    const entries = cards.map((card) => {
      const values = {};
      for (const node of card.querySelectorAll("h5.card-title,p.card-text")) {
        const strong = node.querySelector("strong");
        const key = strong?.textContent.trim().replace(/:$/, "").toLowerCase();
        if (
          !["fecha", "horario", "sector", "motivo"].includes(key) ||
          Object.hasOwn(values, key)
        )
          throw new Error("LABEL_REVIEW");
        strong.remove();
        values[key] = node.textContent.trim().replace(/\s+/g, " ");
        if (!values[key] || values[key].length > 2000)
          throw new Error("FIELD_REVIEW");
      }
      if (!["fecha", "horario", "sector", "motivo"].every((k) => values[k]))
        throw new Error("FIELD_REVIEW");
      const dateMatch = plain(values.fecha).match(
        /^(?:(lunes|martes|miercoles|jueves|viernes|sabado|domingo),\s*)?(\d{1,2})\s*-\s*([a-z]+)\s*-\s*(20\d{2})$/,
      );
      if (!dateMatch || !months.includes(dateMatch[3]))
        throw new Error("DATE_REVIEW");
      const date = `${dateMatch[4]}-${String(months.indexOf(dateMatch[3]) + 1).padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`;
      const interval = values.horario.match(
        /^(\d{2}:\d{2})\s+a\s+(\d{2}:\d{2})$/,
      );
      if (!interval) throw new Error("TIME_REVIEW");
      const start_at = localTime(date, interval[1]),
        end_at = localTime(date, interval[2]);
      if (start_at >= end_at) throw new Error("OVERNIGHT_REVIEW");
      if (
        dateMatch[1] &&
        [
          "domingo",
          "lunes",
          "martes",
          "miercoles",
          "jueves",
          "viernes",
          "sabado",
        ][new Date(`${date}T12:00:00Z`).getUTCDay()] !== dateMatch[1]
      )
        throw new Error("WEEKDAY_REVIEW");
      const natural_key = JSON.stringify([labelKey(values.sector), date]);
      if (seen.has(natural_key)) throw new Error("AMBIGUOUS_WINDOWS_REVIEW");
      seen.add(natural_key);
      const motive = plain(values.motivo);
      const industrial =
        /industr|grandes usuarios|alto voltaje|alta tension|transmision|\b(?:69|138|230)\s*kv\b/.test(
          motive,
        );
      const maintenance =
        /mantenim|distribucion|bajo voltaje|poste|seccionamiento/.test(motive);
      return {
        natural_key,
        sector_label: values.sector,
        local_date: date,
        start_at,
        end_at,
        original_time_string: `${values.fecha} | ${values.horario}`,
        type: industrial
          ? "industrial"
          : maintenance
            ? "maintenance"
            : "unknown",
        motive: values.motivo,
        parser_confidence: industrial || maintenance ? 1 : 0.5,
      };
    });
    const published = doc
      .querySelector('meta[property="article:published_time"]')
      ?.getAttribute("content");
    let source_published_at = null;
    if (published) {
      try {
        source_published_at = utcDate(published);
      } catch {
        /* Unknown publication timestamp, never substitute fetch time. */
      }
    }
    return { entries, source_published_at };
  } finally {
    dom.window.close();
  }
}
