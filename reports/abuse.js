import { randomBytes, createHmac, createHash } from "node:crypto";
import { reportError } from "./policy.js";
const hash = value => createHash("sha256").update(value).digest("hex");

// Single-process, bounded, ephemeral abuse controls: no raw IP or fingerprint on disk.
export function createReportGuard({ now = () => new Date(), capacity = 10000, maxAttempts = 30 } = {}) {
  const secret = randomBytes(32), subjects = new Map(), challenges = new Map();
  let nextSweep = -Infinity;
  const keyFor = ip => createHmac("sha256", secret).update(ip).digest("hex");
  const time = () => now().getTime();
  function prune() {
    const at = time();
    for (const [key, value] of subjects) if (value.expires <= at) subjects.delete(key);
    for (const [key, value] of challenges) if (value.expires <= at) challenges.delete(key);
    nextSweep = at + 60000;
  }
  function subject(ip) {
    if (time() >= nextSweep) prune();
    const key = keyFor(ip), at = time();
    if (subjects.get(key)?.expires <= at) subjects.delete(key);
    if (!subjects.has(key)) {
      if (subjects.size >= capacity) throw reportError("RATE_LIMITED", 429);
      subjects.set(key, { expires: at + 3600000, attempts: 0, issued: 0, successes: 0, lastIssue: -Infinity, seen: new Map() });
    }
    return { key, state: subjects.get(key) };
  }
  return Object.freeze({
    issue(ip) {
      const { key, state } = subject(ip), at = time();
      if (++state.issued > 20 || at - state.lastIssue < 1000 || challenges.size >= capacity * 2) throw reportError("RATE_LIMITED", 429);
      state.lastIssue = at;
      const nonce = randomBytes(24).toString("base64url");
      const a = 1 + randomBytes(1)[0] % 9, b = 1 + randomBytes(1)[0] % 9;
      const question = state.successes >= 2 ? `Comprobación adicional: ¿cuánto es ${a} + ${b}?` : null;
      const expires = Math.min(at + 600000, state.expires);
      challenges.set(hash(nonce), { key, issued: at, expires, answer: question ? String(a + b) : null });
      return { challenge_id: nonce, question, expires_at: new Date(expires).toISOString(), min_wait_seconds: 1 };
    },
    attempt(ip) {
      const { state } = subject(ip);
      if (++state.attempts > maxAttempts) throw reportError("RATE_LIMITED", 429);
    },
    check(ip, { challenge_id, answer, website }, fingerprint) {
      const { key, state } = subject(ip), challenge = challenges.get(hash(challenge_id));
      if (website || !challenge || challenge.key !== key || challenge.expires <= time()
        || time() - challenge.issued < 1000) throw reportError("VERIFICATION_REQUIRED", 403);
      if (state.successes >= 2 && !challenge.answer || challenge.answer && answer !== challenge.answer) throw reportError("VERIFICATION_REQUIRED", 403);
      if (state.successes >= 5) throw reportError("RATE_LIMITED", 429);
      const previous = state.seen.get(fingerprint);
      if (previous && previous > time()) throw reportError("CONFLICT", 409);
    },
    consume(ip, challengeId, fingerprint) {
      const { state } = subject(ip);
      challenges.delete(hash(challengeId)); state.successes++;
      state.seen.set(fingerprint, time() + 1800000);
    },
    prune,
    counts: () => ({ subjects: subjects.size, challenges: challenges.size }),
    close() { subjects.clear(); challenges.clear(); secret.fill(0); },
  });
}
