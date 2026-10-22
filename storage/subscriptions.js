import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  bytes,
  endpoint,
  vault,
  pushError,
  PUSH_CONSENT_VERSION,
  dueTime,
  cancellationText,
} from "../push/policy.js";
const hash = (value) => createHash("sha256").update(value).digest("hex"),
  uid = (prefix) => prefix + randomUUID().replaceAll("-", "");
const identifier = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const exact = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !Object.keys(value).some((k) => !keys.includes(k));
export function createSubscriptions(
  db,
  { synthetic, available, transaction, now, key, getSchedules },
) {
  const mode = Number(synthetic),
    stamp = () => now().toISOString();
  let box;
  function secrets(write = false) {
    available();
    box ??= vault(typeof key === "string" ? bytes(key, 32) : key);
    const stored = db
      .prepare("SELECT value FROM settings WHERE key='push-key-fingerprint'")
      .get();
    if (stored && stored.value !== box.fingerprint)
      throw new Error("Clave Push distinta; preservar base y clave original");
    if (write && !stored)
      db.prepare("INSERT INTO settings VALUES('push-key-fingerprint',?)").run(
        box.fingerprint,
      );
    return box;
  }
  const raw = (id) =>
    db
      .prepare("SELECT * FROM watch_subscriptions WHERE id=? AND synthetic=?")
      .get(id, mode);
  function auth(id, token) {
    if (!identifier(id)) throw pushError("NOT_FOUND", 404);
    bytes(token, 32);
    const row = raw(id),
      digest = hash(`manage:${token}`);
    if (
      !row ||
      !timingSafeEqual(
        Buffer.from(row.management_hash, "hex"),
        Buffer.from(digest, "hex"),
      ) ||
      row.expires_at <= stamp()
    )
      throw pushError("NOT_FOUND", 404);
    return row;
  }
  const areas = (row) =>
    db
      .prepare(
        "SELECT w.*,a.name FROM watch_areas w JOIN areas a ON a.id=w.area_id WHERE w.subscription_id=? ORDER BY w.area_id",
      )
      .all(row.id)
      .map((a) => ({
        area_id: a.area_id,
        area_name: a.name,
        alias: secrets().open(a.alias_sealed, `${row.id}:${a.area_id}`),
      }));
  const view = (row) => ({
    id: row.id,
    revision: row.revision,
    status: row.status,
    areas: row.status === "active" ? areas(row) : [],
    preferences: row.preferences ? JSON.parse(row.preferences) : null,
    push_consent: Boolean(row.push_consent),
    push_registered: row.endpoint_state === "active",
    endpoint_state: row.endpoint_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
    last_accepted_at: row.last_accepted_at,
    synthetic,
  });
  function validate(input) {
    if (
      input.consent !== true ||
      input.consent_version !== PUSH_CONSENT_VERSION ||
      typeof input.push_consent !== "boolean" ||
      !Array.isArray(input.areas) ||
      input.areas.length < 1 ||
      input.areas.length > 5
    )
      throw pushError("INVALID_REQUEST");
    const selected = input.areas
      .map((a) => {
        if (
          !exact(a, ["area_id", "alias"]) ||
          !identifier(a.area_id) ||
          typeof a.alias !== "string" ||
          a.alias.trim().length < 1 ||
          a.alias.trim().length > 30
        )
          throw pushError("INVALID_REQUEST");
        const area = db
          .prepare(
            "SELECT * FROM areas WHERE id=? AND synthetic=? AND type='sector' AND parent_id IS NOT NULL AND location_precision='generalized_sector'",
          )
          .get(a.area_id, mode);
        if (!area) throw pushError("INVALID_REQUEST");
        return { area_id: a.area_id, alias: a.alias.trim() };
      })
      .sort((a, b) => a.area_id.localeCompare(b.area_id));
    if (new Set(selected.map((a) => a.area_id)).size !== selected.length)
      throw pushError("INVALID_REQUEST");
    const p = input.preferences,
      keys = [
        "mode",
        "quiet_start",
        "quiet_end",
        "digest_hour",
        "scheduled",
        "changes",
        "cancellations",
      ];
    if (
      !exact(p, keys) ||
      keys.some((k) => !Object.hasOwn(p, k)) ||
      !["immediate", "digest"].includes(p.mode) ||
      [p.quiet_start, p.quiet_end, p.digest_hour].some(
        (h) => !Number.isInteger(h) || h < 0 || h > 23,
      ) ||
      [p.scheduled, p.changes, p.cancellations].some(
        (v) => typeof v !== "boolean",
      )
    )
      throw pushError("INVALID_REQUEST");
    const quiet = (h) =>
      p.quiet_start === p.quiet_end
        ? false
        : p.quiet_start < p.quiet_end
          ? h >= p.quiet_start && h < p.quiet_end
          : h >= p.quiet_start || h < p.quiet_end;
    if (p.mode === "digest" && quiet(p.digest_hour))
      throw pushError("INVALID_REQUEST");
    const browser = input.browser ? endpoint(input.browser) : null;
    if (
      (browser && !input.push_consent) ||
      (input.push_consent &&
        (!browser ||
          ![p.scheduled, p.changes, p.cancellations].some(Boolean))) ||
      (browser?.expirationTime && browser.expirationTime <= now().getTime())
    )
      throw pushError("INVALID_REQUEST");
    return {
      areas: selected,
      preferences: Object.fromEntries(keys.map((k) => [k, p[k]])),
      push_consent: input.push_consent,
      browser,
    };
  }
  function replace(row, value) {
    const v = secrets(true),
      endpointHash = value.browser
        ? createHmac("sha256", typeof key === "string" ? bytes(key, 32) : key)
            .update(value.browser.endpoint)
            .digest("hex")
        : null;
    if (
      endpointHash &&
      db
        .prepare(
          "SELECT 1 FROM watch_subscriptions WHERE endpoint_hash=? AND id!=?",
        )
        .get(endpointHash, row.id)
    )
      throw pushError("CONFLICT", 409);
    db.prepare(
      "UPDATE watch_subscriptions SET preferences=?,push_consent=?,endpoint_hash=?,endpoint_sealed=?,endpoint_state=?,updated_at=? WHERE id=?",
    ).run(
      JSON.stringify(value.preferences),
      Number(value.push_consent),
      endpointHash,
      value.browser ? v.seal(value.browser, row.id) : null,
      value.browser ? "active" : "none",
      stamp(),
      row.id,
    );
    db.prepare("DELETE FROM watch_areas WHERE subscription_id=?").run(row.id);
    for (const a of value.areas)
      db.prepare("INSERT INTO watch_areas VALUES(?,?,?)").run(
        row.id,
        a.area_id,
        v.seal(a.alias, `${row.id}:${a.area_id}`),
      );
  }
  function suppress(id, code) {
    db.prepare(
      "UPDATE push_outbox SET result_code=CASE WHEN state='inflight' THEN ?||'_inflight' ELSE ? END,state='suppressed',payload_sealed=NULL,updated_at=? WHERE subscription_id=? AND state IN ('pending','inflight')",
    ).run(code, code, stamp(), id);
  }
  function enqueueJob(
    row,
    {
      event_key,
      kind,
      revision_id = null,
      area_id = null,
      review_no = null,
      payload,
      expires_at,
    },
  ) {
    if (
      db
        .prepare(
          "SELECT 1 FROM push_dedup WHERE subscription_id=? AND event_key=?",
        )
        .get(row.id, event_key)
    ) {
      const previous = db
        .prepare(
          "SELECT * FROM push_outbox WHERE subscription_id=? AND event_key=?",
        )
        .get(row.id, event_key);
      const refresh =
        previous?.attempts === 0 &&
        ((previous.state === "suppressed" &&
          ["ineligible", "preferences_changed"].includes(
            previous.result_code,
          )) ||
          (previous.state === "pending" &&
            (previous.area_id !== area_id ||
              previous.review_no !== review_no ||
              previous.subscription_revision !== row.revision)));
      if (!refresh) return false;
      db.prepare(
        "UPDATE push_outbox SET area_id=?,review_no=?,subscription_revision=?,payload_sealed=?,due_at=?,expires_at=?,state='pending',result_code=NULL,updated_at=? WHERE id=?",
      ).run(
        area_id,
        review_no,
        row.revision,
        secrets(true).seal(payload, previous.id),
        dueTime(now(), JSON.parse(row.preferences)),
        expires_at,
        stamp(),
        previous.id,
      );
      return true;
    }
    if (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM push_outbox WHERE state IN ('pending','inflight')",
        )
        .get().n >= 10000
    )
      throw pushError("CAPACITY", 503);
    db.prepare("INSERT INTO push_dedup VALUES(?,?,?)").run(
      row.id,
      event_key,
      new Date(Date.parse(expires_at) + 7 * 86400000).toISOString(),
    );
    const id = uid("job_");
    db.prepare(
      `INSERT INTO push_outbox(id,subscription_id,event_key,kind,revision_id,area_id,review_no,subscription_revision,payload_sealed,due_at,expires_at,state,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
    ).run(
      id,
      row.id,
      event_key,
      kind,
      revision_id,
      area_id,
      review_no,
      row.revision,
      secrets(true).seal(payload, id),
      dueTime(now(), JSON.parse(row.preferences)),
      expires_at,
      stamp(),
      stamp(),
    );
    return true;
  }
  const current = (row, job) => {
    if (
      row?.status !== "active" ||
      !row.push_consent ||
      row.endpoint_state !== "active" ||
      row.expires_at <= stamp() ||
      row.revision !== job.subscription_revision
    )
      return false;
    if (job.kind === "test") return true;
    if (
      !db
        .prepare(
          "SELECT 1 FROM watch_areas WHERE subscription_id=? AND area_id=?",
        )
        .get(row.id, job.area_id)
    )
      return false;
    const prefs = JSON.parse(row.preferences);
    if (
      !prefs[
        {
          scheduled: "scheduled",
          change: "changes",
          cancellation: "cancellations",
        }[job.kind]
      ]
    )
      return false;
    const list = getSchedules().listPublic({
      area_id: job.area_id,
      from: stamp(),
      to: new Date(now().getTime() + 31 * 86400000).toISOString(),
      limit: 51,
      offset: 0,
      revision_id: job.revision_id,
    }).data;
    const target = list.find((s) => s.id === job.revision_id);
    const reviewed = db
      .prepare(
        "SELECT MAX(review_no) AS n FROM schedule_reviews WHERE revision_id=?",
      )
      .get(job.revision_id)?.n;
    return Boolean(
      target &&
        target.source_status === "current" &&
        ["maintenance", "residential"].includes(target.type) &&
        target.latest_revision_no === target.revision_no &&
        reviewed === job.review_no &&
        (job.kind === "cancellation"
          ? target.effective_status === "cancelled"
          : ["published", "revised"].includes(target.effective_status)),
    );
  };
  return Object.freeze({
    ready() {
      secrets();
      return true;
    },
    validate,
    replay(input, value) {
      available();
      const previous = db
        .prepare("SELECT * FROM watch_subscriptions WHERE request_hash=?")
        .get(hash(`request:${input.request_id}`));
      if (!previous) return null;
      auth(previous.id, input.management_token);
      if (previous.create_hash !== hash(JSON.stringify(value)))
        throw pushError("CONFLICT", 409);
      return view(previous);
    },
    create(input, value = validate(input)) {
      available();
      bytes(input.management_token, 32);
      if (
        typeof input.request_id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(input.request_id)
      )
        throw pushError("INVALID_REQUEST");
      return transaction(() => {
        const replay = db
          .prepare("SELECT * FROM watch_subscriptions WHERE request_hash=?")
          .get(hash(`request:${input.request_id}`));
        if (replay) return this.replay(input, value);
        if (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM watch_subscriptions WHERE status='active' AND expires_at>?",
            )
            .get(stamp()).n >= 10000
        )
          throw pushError("CAPACITY", 503);
        const row = { id: uid("watch_") };
        secrets(true);
        db.prepare(
          `INSERT INTO watch_subscriptions(id,management_hash,request_hash,create_hash,revision,status,preferences,push_consent,endpoint_state,consent_version,created_at,updated_at,expires_at,synthetic)
          VALUES(?,?,?,?,1,'active',NULL,0,'none',?,?,?,?,?)`,
        ).run(
          row.id,
          hash(`manage:${input.management_token}`),
          hash(`request:${input.request_id}`),
          hash(JSON.stringify(value)),
          PUSH_CONSENT_VERSION,
          stamp(),
          stamp(),
          new Date(now().getTime() + 180 * 86400000).toISOString(),
          mode,
        );
        replace(row, value);
        return view(raw(row.id));
      });
    },
    owner(id, token) {
      return view(auth(id, token));
    },
    update(id, token, expected, value) {
      return transaction(() => {
        const row = auth(id, token);
        if (row.status !== "active" || row.revision !== expected)
          throw pushError("CONFLICT", 409);
        replace(row, value);
        db.prepare(
          "UPDATE watch_subscriptions SET revision=revision+1 WHERE id=?",
        ).run(id);
        suppress(id, "preferences_changed");
        return view(raw(id));
      });
    },
    revoke(id, token) {
      return transaction(() => {
        const row = auth(id, token);
        if (row.status === "revoked") return view(row);
        suppress(id, "revoked");
        db.prepare("DELETE FROM watch_areas WHERE subscription_id=?").run(id);
        db.prepare("DELETE FROM push_dedup WHERE subscription_id=?").run(id);
        db.prepare(
          "UPDATE watch_subscriptions SET status='revoked',revision=revision+1,preferences=NULL,push_consent=0,endpoint_hash=NULL,endpoint_sealed=NULL,endpoint_state='none',updated_at=? WHERE id=?",
        ).run(stamp(), id);
        return view(raw(id));
      });
    },
    requestTest(id, token, requestId) {
      return transaction(() => {
        const row = auth(id, token);
        if (
          row.status !== "active" ||
          !row.push_consent ||
          row.endpoint_state !== "active"
        )
          throw pushError("CONFLICT", 409);
        if (
          typeof requestId !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(requestId)
        )
          throw pushError("INVALID_REQUEST");
        const event_key = hash(`test:${requestId}`);
        if (
          db
            .prepare(
              "SELECT 1 FROM push_dedup WHERE subscription_id=? AND event_key=?",
            )
            .get(id, event_key)
        )
          return { queued: true };
        if (
          row.last_test_at &&
          Date.parse(stamp()) - Date.parse(row.last_test_at) < 3600000
        )
          throw pushError("RATE_LIMITED", 429);
        enqueueJob(row, {
          event_key,
          kind: "test",
          payload: {
            test: true,
            title: "AEGIS · prueba solicitada",
            body: "Aviso de prueba. No informa de un corte ni confirma entrega o lectura.",
            url: "/watch/",
          },
          expires_at: new Date(now().getTime() + 86400000).toISOString(),
        });
        db.prepare(
          "UPDATE watch_subscriptions SET last_test_at=? WHERE id=?",
        ).run(stamp(), id);
        return { queued: true };
      });
    },
    confirmCancellation({ revision_id, quote, review_reason }) {
      return transaction(() => {
        if (
          !identifier(revision_id) ||
          typeof quote !== "string" ||
          quote.length > 2000 ||
          typeof review_reason !== "string" ||
          !review_reason.trim() ||
          review_reason.length > 300
        )
          throw pushError("INVALID_REQUEST");
        const row = db
          .prepare(
            "SELECT * FROM schedule_revisions WHERE id=? AND synthetic=?",
          )
          .get(revision_id, mode);
        if (!row || quote !== row.motive || !cancellationText(quote))
          throw pushError("INVALID_REQUEST");
        const review = db
          .prepare(
            "SELECT * FROM schedule_reviews WHERE revision_id=? ORDER BY review_no DESC LIMIT 1",
          )
          .get(row.id);
        if (
          !review ||
          review.decision !== "reviewed" ||
          !review.rights_reviewed
        )
          throw pushError("CONFLICT", 409);
        const visible = getSchedules()
          .listPublic({
            area_id: review.area_id,
            from: row.start_at,
            to: row.end_at,
            limit: 51,
            revision_id: row.id,
          })
          .data.find(
            (s) =>
              s.id === row.id &&
              s.source_status === "current" &&
              s.latest_revision_no === s.revision_no,
          );
        if (!visible || !["maintenance", "residential"].includes(visible.type))
          throw pushError("CONFLICT", 409);
        const old = db
          .prepare("SELECT * FROM schedule_cancellations WHERE revision_id=?")
          .get(row.id);
        if (old) return { revision_id: row.id, confirmed: true };
        db.prepare("INSERT INTO schedule_cancellations VALUES(?,?,?,?)").run(
          row.id,
          quote,
          review_reason,
          stamp(),
        );
        return { revision_id: row.id, confirmed: true };
      });
    },
    enqueue({ limit = 100, offset = 0 } = {}) {
      available();
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 100000
      )
        throw pushError("INVALID_REQUEST");
      return transaction(() => {
        db.prepare(
          "UPDATE push_outbox SET state='suppressed',payload_sealed=NULL,result_code='expired',updated_at=? WHERE state IN ('pending','inflight') AND expires_at<=?",
        ).run(stamp(), stamp());
        const subscribers = db
          .prepare(
            "SELECT * FROM watch_subscriptions WHERE status='active' AND push_consent=1 AND endpoint_state='active' AND expires_at>? AND synthetic=? ORDER BY id LIMIT ? OFFSET ?",
          )
          .all(stamp(), mode, limit, offset);
        let queued = 0;
        for (const sub of subscribers) {
          const prefs = JSON.parse(sub.preferences);
          for (const area of db
            .prepare("SELECT area_id FROM watch_areas WHERE subscription_id=?")
            .all(sub.id))
            for (let page = 0; page <= 10000; page += 50) {
              const result = getSchedules().listPublic({
                area_id: area.area_id,
                from: stamp(),
                to: new Date(now().getTime() + 31 * 86400000).toISOString(),
                limit: 51,
                offset: page,
              }).data;
              for (const row of result.slice(0, 50)) {
                if (
                  row.source_status !== "current" ||
                  row.latest_revision_no !== row.revision_no ||
                  !["maintenance", "residential"].includes(row.type) ||
                  !["published", "revised", "cancelled"].includes(
                    row.effective_status,
                  )
                )
                  continue;
                const previous = db
                  .prepare(
                    `SELECT r.* FROM schedule_revisions r JOIN schedule_reviews v ON v.revision_id=r.id WHERE r.entry_id=? AND r.revision_no<? AND v.area_id=? AND r.row_present=1 AND r.type IN ('maintenance','residential') AND v.decision='reviewed' AND v.rights_reviewed=1 AND v.review_no=(SELECT MAX(w.review_no) FROM schedule_reviews w WHERE w.revision_id=r.id) ORDER BY r.revision_no DESC LIMIT 1`,
                  )
                  .get(row.entry_id, row.revision_no, row.area_id);
                const kind =
                  row.effective_status === "cancelled"
                    ? "cancellation"
                    : previous
                      ? "change"
                      : "scheduled";
                if (
                  !prefs[
                    {
                      scheduled: "scheduled",
                      change: "changes",
                      cancellation: "cancellations",
                    }[kind]
                  ]
                )
                  continue;
                const reviewed = db
                  .prepare(
                    "SELECT MAX(review_no) AS n FROM schedule_reviews WHERE revision_id=?",
                  )
                  .get(row.id).n;
                const format = (t) =>
                  new Intl.DateTimeFormat("es-EC", {
                    timeZone: "America/Guayaquil",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(t));
                const before = previous
                  ? `Antes: ${format(previous.start_at)}–${format(previous.end_at)}. `
                  : "";
                const after =
                  kind === "cancellation"
                    ? "Cancelación documentada del trabajo programado."
                    : `Ahora: ${format(row.start_at)}–${format(row.end_at)}. `;
                const payload = {
                  tag: hash(`schedule:${row.entry_id}`).slice(0, 32),
                  title:
                    kind === "cancellation"
                      ? "AEGIS · cancelación oficial"
                      : kind === "change"
                        ? "AEGIS · horario revisado"
                        : "AEGIS · programación oficial",
                  body: `${row.issuer.slice(0, 80)}: ${row.area_name.slice(0, 120)}. ${before}${after}No confirma interrupción ni reposición efectiva.`,
                  url: `/watch/?area_id=${row.area_id}`,
                  evidence_url: row.source_url,
                };
                if (
                  enqueueJob(sub, {
                    event_key: hash(
                      `${row.entry_id}:${row.revision_no}:${kind}`,
                    ),
                    kind,
                    revision_id: row.id,
                    area_id: row.area_id,
                    review_no: reviewed,
                    payload,
                    expires_at: row.end_at,
                  })
                )
                  queued++;
              }
              if (result.length <= 50) break;
            }
        }
        return {
          scanned: subscribers.length,
          queued,
          next_offset: subscribers.length === limit ? offset + limit : null,
        };
      });
    },
    claim() {
      return transaction(() => {
        secrets();
        db.prepare(
          "UPDATE push_outbox SET state='pending',lease_id=NULL,lease_until=NULL WHERE state='inflight' AND lease_until<=?",
        ).run(stamp());
        const candidates = db
          .prepare(
            "SELECT * FROM push_outbox WHERE state='pending' AND due_at<=? ORDER BY due_at,id LIMIT 100",
          )
          .all(stamp());
        let selected = null,
          sub = null;
        for (const job of candidates) {
          const owner = raw(job.subscription_id);
          if (
            job.expires_at <= stamp() ||
            job.attempts >= 3 ||
            !current(owner, job)
          ) {
            db.prepare(
              "UPDATE push_outbox SET state='suppressed',payload_sealed=NULL,result_code='ineligible',updated_at=? WHERE id=?",
            ).run(stamp(), job.id);
            continue;
          }
          const quietDue = dueTime(now(), {
            ...JSON.parse(owner.preferences),
            mode: "immediate",
          });
          if (quietDue > stamp()) {
            db.prepare("UPDATE push_outbox SET due_at=? WHERE id=?").run(
              quietDue,
              job.id,
            );
            continue;
          }
          selected = job;
          sub = owner;
          break;
        }
        if (!selected) return null;
        const prefs = JSON.parse(sub.preferences);
        const jobs = [selected];
        if (prefs.mode === "digest")
          for (const candidate of candidates) {
            if (
              candidate.id !== selected.id &&
              candidate.subscription_id === sub.id &&
              jobs.length < 3 &&
              candidate.expires_at > stamp() &&
              candidate.attempts < 3 &&
              current(sub, candidate)
            )
              jobs.push(candidate);
          }
        const lease = uid("lease_");
        for (const j of jobs)
          db.prepare(
            "UPDATE push_outbox SET state='inflight',attempts=attempts+1,lease_id=?,lease_until=?,updated_at=? WHERE id=?",
          ).run(
            lease,
            new Date(now().getTime() + 30000).toISOString(),
            stamp(),
            j.id,
          );
        const messages = jobs.map((j) =>
          secrets().open(j.payload_sealed, j.id),
        );
        const payload =
          messages.length === 1
            ? messages[0]
            : {
                title: `AEGIS · resumen de ${messages.length} avisos`,
                body: Buffer.from(messages.map((m) => m.body).join("\n"))
                  .subarray(0, 1200)
                  .toString("utf8"),
                url: "/watch/",
              };
        payload.job_ids = jobs.map((j) => j.id);
        payload.tag =
          messages.length === 1 && payload.tag
            ? payload.tag
            : hash(
                jobs
                  .map((j) => j.event_key)
                  .sort()
                  .join(":"),
              ).slice(0, 32);
        return {
          lease_id: lease,
          browser: endpoint(secrets().open(sub.endpoint_sealed, sub.id)),
          payload,
          ttl: Math.max(
            1,
            Math.min(
              300,
              ...jobs.map((j) =>
                Math.floor((Date.parse(j.expires_at) - now().getTime()) / 1000),
              ),
            ),
          ),
        };
      });
    },
    finish(lease, status, retrySeconds = 0) {
      return transaction(() => {
        const jobs = db
          .prepare(
            "SELECT * FROM push_outbox WHERE lease_id=? AND state='inflight'",
          )
          .all(lease);
        if (!jobs.length) return { completed: 0 };
        const sub = raw(jobs[0].subscription_id);
        if ([404, 410].includes(status)) {
          suppress(sub.id, "endpoint_invalid");
          db.prepare(
            "UPDATE watch_subscriptions SET endpoint_hash=NULL,endpoint_sealed=NULL,endpoint_state='invalid',push_consent=0,revision=revision+1,updated_at=? WHERE id=?",
          ).run(stamp(), sub.id);
          return { completed: jobs.length, result: "endpoint_invalid" };
        }
        for (const job of jobs) {
          const accepted = status >= 200 && status < 300,
            retry =
              !accepted &&
              (status === 0 || status === 429 || status >= 500) &&
              job.attempts < 3;
          db.prepare(
            "UPDATE push_outbox SET state=?,due_at=?,payload_sealed=CASE WHEN ? THEN payload_sealed ELSE NULL END,lease_id=NULL,lease_until=NULL,result_code=?,updated_at=? WHERE id=?",
          ).run(
            accepted ? "accepted" : retry ? "pending" : "failed",
            new Date(
              now().getTime() +
                Math.max(
                  [0, 60, 300][job.attempts] || 1800,
                  Math.min(3600, Math.max(0, Number(retrySeconds) || 0)),
                ) *
                  1000,
            ).toISOString(),
            Number(retry),
            accepted
              ? "provider_accepted"
              : retry
                ? "retry"
                : "delivery_failed",
            stamp(),
            job.id,
          );
          if (accepted)
            db.prepare(
              "UPDATE watch_subscriptions SET last_accepted_at=? WHERE id=?",
            ).run(stamp(), sub.id);
        }
        return {
          completed: jobs.length,
          result:
            status >= 200 && status < 300
              ? "provider_accepted"
              : "not_accepted",
        };
      });
    },
    validateDelivery({ browser, job_ids }) {
      available();
      if (
        !Array.isArray(job_ids) ||
        job_ids.length < 1 ||
        job_ids.length > 3 ||
        job_ids.some((id) => !identifier(id))
      )
        throw pushError("INVALID_REQUEST");
      const proof = endpoint(browser),
        endpointHash = createHmac(
          "sha256",
          typeof key === "string" ? bytes(key, 32) : key,
        )
          .update(proof.endpoint)
          .digest("hex");
      const sub = db
        .prepare(
          "SELECT * FROM watch_subscriptions WHERE endpoint_hash=? AND synthetic=?",
        )
        .get(endpointHash, mode);
      if (!sub || !sub.endpoint_sealed) return { current: false };
      const stored = secrets().open(sub.endpoint_sealed, sub.id);
      const digest = (v) =>
        Buffer.from(
          hash(JSON.stringify({ endpoint: v.endpoint, keys: v.keys })),
          "hex",
        );
      if (!timingSafeEqual(digest(proof), digest(stored)))
        return { current: false };
      return {
        current: job_ids.every((id) => {
          const job = db
            .prepare(
              "SELECT * FROM push_outbox WHERE id=? AND subscription_id=?",
            )
            .get(id, sub.id);
          return (
            job &&
            job.attempts > 0 &&
            ["pending", "inflight", "accepted"].includes(job.state) &&
            job.expires_at > stamp() &&
            current(sub, job)
          );
        }),
      };
    },
    diagnostics() {
      available();
      return db
        .prepare(
          "SELECT state,COUNT(*) AS count FROM push_outbox GROUP BY state ORDER BY state",
        )
        .all();
    },
    prune() {
      return transaction(() => {
        const expired = db
          .prepare(
            "SELECT id FROM watch_subscriptions WHERE expires_at<=? OR (status='revoked' AND updated_at<?)",
          )
          .all(stamp(), new Date(now().getTime() - 7 * 86400000).toISOString());
        for (const row of expired)
          db.prepare("DELETE FROM watch_subscriptions WHERE id=?").run(row.id);
        db.prepare("DELETE FROM push_dedup WHERE expires_at<=?").run(stamp());
        db.prepare(
          "DELETE FROM push_outbox WHERE state IN ('accepted','failed','suppressed') AND updated_at<?",
        ).run(new Date(now().getTime() - 7 * 86400000).toISOString());
        return { expired: expired.length };
      });
    },
  });
}
