/**
 * Client API MessagingMe pour recuperer les custom events Auxerre.
 * Port simplifie de EDH/src/lib/messagingme/client.ts (vanilla JS, sans types).
 *
 * Usage :
 *   const c = new MessagingMeClient(token, base);
 *   const events = await c.listEvents();
 *   for await (const batch of c.iterOccurrences(eventNs)) { ... }
 */
class MessagingMeClient {
  constructor(token, base) {
    if (!token) throw new Error('MessagingMeClient: token manquant');
    if (!base) throw new Error('MessagingMeClient: base URL manquante');
    this.token = token;
    this.base = base.replace(/\/+$/, '');
  }

  async _fetch(url, attempt = 1) {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });
    if (r.ok) return r;
    // Retry 5xx + 429 jusqu'a 3 fois avec backoff exponentiel
    if ((r.status >= 500 || r.status === 429) && attempt < 3) {
      const wait = 500 * Math.pow(2, attempt - 1);
      await new Promise((res) => setTimeout(res, wait));
      return this._fetch(url, attempt + 1);
    }
    throw new Error(`MessagingMe HTTP ${r.status} on ${url}`);
  }

  async listEvents() {
    const all = [];
    let page = 1;
    while (true) {
      const r = await this._fetch(`${this.base}/flow/custom-events?page=${page}`);
      const j = await r.json();
      all.push(...(j.data || []));
      if (!j.meta || j.meta.current_page >= j.meta.last_page) break;
      page++;
      if (page > 200) throw new Error('listEvents: pagination > 200, abort');
    }
    return all;
  }

  /**
   * Itere les occurrences d'un event, page par page (most-recent-first).
   * yield un array d'occurrences par page.
   */
  async *iterOccurrences(eventNs) {
    let page = 1;
    while (true) {
      const url = `${this.base}/flow/custom-events/data?event_ns=${encodeURIComponent(eventNs)}&page=${page}`;
      const r = await this._fetch(url);
      const j = await r.json();
      const data = j.data || [];
      if (data.length === 0) break;
      yield data;
      if (!j.meta || j.meta.current_page >= j.meta.last_page) break;
      page++;
      if (page > 1000) throw new Error('iterOccurrences: pagination > 1000, abort');
    }
  }
}

module.exports = { MessagingMeClient };
