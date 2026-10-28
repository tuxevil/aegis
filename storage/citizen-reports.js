import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { CONSENT_VERSION, reportError } from "../reports/policy.js";
import { utcDate } from "./repositories.js";
const digest = value => createHash("sha256").update(value).digest("hex");
const tokenHash = token => digest(`receipt:${token}`);
const equalHash = (a, b) => typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ownerColumns = `r.id AS report_id,r.current_revision AS revision,r.status,r.created_at,r.updated_at,
  v.area_id,(SELECT name FROM areas WHERE id=v.area_id) AS area_name,v.declaration,v.reported_start_at,v.received_at,r.synthetic`;

export function createCitizenReports(db, { synthetic, available, transaction, now }) {
  const mode = Number(synthetic);
  function current(id) {
    return db.prepare(`SELECT r.*,v.area_id,v.declaration,v.reported_start_at,v.action,v.content_hash,v.reason
      FROM citizen_reports r JOIN citizen_report_revisions v ON v.report_id=r.id AND v.revision=r.current_revision
      WHERE r.id=? AND r.synthetic=? AND r.created_at>=?
      AND (r.status NOT IN ('withdrawn','rejected') OR r.updated_at>=?)`).get(id, mode,
      new Date(now().getTime() - 30 * 86400000).toISOString(), new Date(now().getTime() - 7 * 86400000).toISOString());
  }
  function authorized(id, token) {
    const row = current(id), hash = tokenHash(token);
    if (!row || !equalHash(row.receipt_hash, hash)) throw reportError("NOT_FOUND", 404);
    if (Date.parse(row.created_at) < now().getTime() - 30 * 86400000
      || ["withdrawn", "rejected"].includes(row.status) && Date.parse(row.updated_at) < now().getTime() - 7 * 86400000) throw reportError("NOT_FOUND", 404);
    return row;
  }
  function view(id) {
    const row = db.prepare(`SELECT ${ownerColumns} FROM citizen_reports r JOIN citizen_report_revisions v
      ON v.report_id=r.id AND v.revision=r.current_revision WHERE r.id=? AND r.synthetic=?`).get(id, mode);
    return row ? { ...row, synthetic: Boolean(row.synthetic) } : null;
  }
  function normalize(body) {
    if (body.consent !== true || body.area_confirmed !== true || body.consent_version !== CONSENT_VERSION) throw reportError("INVALID_REQUEST");
    const area = db.prepare("SELECT * FROM areas WHERE id=? AND synthetic=?").get(body.area_id, mode);
    if (!area || area.type !== "sector" || area.location_precision !== "generalized_sector" || !area.parent_id) throw reportError("INVALID_REQUEST");
    if (!["outage", "restored"].includes(body.declaration)) throw reportError("INVALID_REQUEST");
    let reported = null;
    try { if (body.reported_start_at !== null) reported = utcDate(body.reported_start_at); } catch { throw reportError("INVALID_REQUEST"); }
    if (reported && (Date.parse(reported) > now().getTime() + 300000 || Date.parse(reported) < now().getTime() - 7 * 86400000)) throw reportError("INVALID_REQUEST");
    const payload = { area_id: body.area_id, declaration: body.declaration, reported_start_at: reported,
      consent_version: CONSENT_VERSION, reason: body.reason || "initial" };
    return { ...payload, hash: digest(JSON.stringify(payload)) };
  }
  function revision(id, number, value, action) {
    db.prepare(`INSERT INTO citizen_report_revisions
      (report_id,revision,area_id,declaration,reported_start_at,received_at,action,reason,consent_version,content_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, number, value.area_id, value.declaration, value.reported_start_at,
      now().toISOString(), action, value.reason, CONSENT_VERSION, value.hash);
  }
  return Object.freeze({
    synthetic,
    validate(body) { available(); return normalize(body); },
    replay(body, value) {
      available();
      const row = db.prepare("SELECT * FROM citizen_reports WHERE request_hash=? AND synthetic=?").get(digest(body.request_id), mode);
      if (!row) return null;
      if (!equalHash(row.receipt_hash, tokenHash(body.receipt_token)) || row.create_hash !== value.hash) throw reportError("CONFLICT", 409);
      authorized(row.id, body.receipt_token);
      return view(row.id);
    },
    create(body, value) {
      available();
      return transaction(() => {
        const existing = db.prepare("SELECT id FROM citizen_reports WHERE request_hash=?").get(digest(body.request_id));
        if (existing) return this.replay(body, value);
        const id = `r_${randomUUID()}`, at = now().toISOString();
        if (db.prepare("SELECT 1 FROM citizen_reports WHERE receipt_hash=?").get(tokenHash(body.receipt_token))) throw reportError("CONFLICT", 409);
        db.prepare(`INSERT INTO citizen_reports(id,receipt_hash,request_hash,create_hash,observation_id,current_revision,status,created_at,updated_at,synthetic)
          VALUES(?,?,?,?,NULL,1,'pending',?,?,?)`).run(id, tokenHash(body.receipt_token), digest(body.request_id), value.hash, at, at, mode);
        revision(id, 1, value, "create"); return view(id);
      });
    },
    owner(id, token) { available(); authorized(id, token); return view(id); },
    correct(id, token, expected, value) {
      available();
      return transaction(() => {
        const row = authorized(id, token);
        if (row.status === "withdrawn") throw reportError("CONFLICT", 409);
        if (row.current_revision !== expected) {
          if (row.current_revision === expected + 1 && row.action === "correct" && row.content_hash === value.hash) return view(id);
          throw reportError("CONFLICT", 409);
        }
        if (row.current_revision >= 100) throw reportError("RATE_LIMITED", 429);
        revision(id, expected + 1, value, "correct");
        db.prepare("UPDATE citizen_reports SET current_revision=?,status='pending',updated_at=? WHERE id=?").run(expected + 1, now().toISOString(), id);
        return view(id);
      });
    },
    withdraw(id, token, expected) {
      available();
      return transaction(() => {
        const row = authorized(id, token);
        if (row.status === "withdrawn") return view(id);
        if (row.current_revision !== expected) throw reportError("CONFLICT", 409);
        revision(id, expected + 1, { ...row, reason: "withdrawal", hash: digest(`withdraw:${id}:${expected}`) }, "withdraw");
        db.prepare("UPDATE citizen_reports SET current_revision=?,status='withdrawn',updated_at=? WHERE id=?").run(expected + 1, now().toISOString(), id);
        return view(id);
      });
    },
    queue({ limit = 50, offset = 0 } = {}) {
      available();
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw reportError("INVALID_REQUEST");
      return db.prepare(`SELECT ${ownerColumns} FROM citizen_reports r JOIN citizen_report_revisions v
        ON v.report_id=r.id AND v.revision=r.current_revision WHERE r.status='pending' AND r.synthetic=? AND r.created_at>=?
        ORDER BY r.updated_at,r.id LIMIT ? OFFSET ?`).all(mode, new Date(now().getTime() - 30 * 86400000).toISOString(), limit, offset).map(row => ({ ...row, synthetic: Boolean(row.synthetic) }));
    },
    moderate(id, expected, decision) {
      available();
      if (!["approved", "rejected"].includes(decision)) throw reportError("INVALID_REQUEST");
      return transaction(() => {
        const row = current(id);
        if (!row) throw reportError("NOT_FOUND", 404);
        if (row.status === decision && row.current_revision === expected) return view(id);
        if (row.status !== "pending" || row.current_revision !== expected) throw reportError("CONFLICT", 409);
        const at = now().toISOString();
        db.prepare("INSERT INTO citizen_report_reviews VALUES(?,?,?,?)").run(id, expected, decision, at);
        db.prepare("UPDATE citizen_reports SET status=?,updated_at=? WHERE id=?").run(decision, at, id);
        return view(id);
      });
    },
    summary(areaId) {
      available();
      const area = db.prepare("SELECT type FROM areas WHERE id=? AND synthetic=?").get(areaId, mode);
      if (!area || area.type !== "sector") throw reportError("INVALID_REQUEST");
      const counts = db.prepare(`SELECT count(*) AS total,sum(v.declaration='outage') AS outage,sum(v.declaration='restored') AS restored
        FROM citizen_reports r JOIN citizen_report_revisions v ON v.report_id=r.id AND v.revision=r.current_revision
        WHERE r.status='approved' AND r.synthetic=? AND v.area_id=? AND v.received_at>=? AND v.received_at<=?
        AND r.created_at>=?`).get(mode, areaId, new Date(now().getTime() - 86400000).toISOString(), now().toISOString(), new Date(now().getTime() - 30 * 86400000).toISOString());
      const suppressed = counts.total < 3;
      return { area_id: areaId, suppressed, approved_reports: suppressed ? null : counts.total,
        outage_reports: suppressed ? null : counts.outage, restoration_reports: suppressed ? null : counts.restored,
        coverage: "unknown", synthetic, generated_at: now().toISOString() };
    },
    prune() {
      available();
      return transaction(() => db.prepare(`DELETE FROM citizen_reports WHERE synthetic=? AND
        (created_at<? OR (status IN ('withdrawn','rejected') AND updated_at<?))`).run(mode,
      new Date(now().getTime() - 30 * 86400000).toISOString(), new Date(now().getTime() - 7 * 86400000).toISOString()).changes);
    },
  });
}
