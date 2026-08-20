/**
 * curio-api.js — Client-side helper for talking to the Curio backend.
 *
 * Include this file in every entry app AND the admin dashboard, right before
 * the closing </body> tag:
 *     <script src="curio-api.js"></script>
 *
 * SETUP:
 *   1. Deploy Curio_Backend.gs as a Web App (see instructions in that file)
 *   2. Paste the /exec URL you get from Google as WEBHOOK_URL below
 *   3. Paste the same SECRET string you set in the .gs file as API_SECRET below
 *
 * USAGE (in your HTML app):
 *
 *   // Submit data
 *   CurioAPI.submit('promoter_checkin', 'Laxmi Sharma', {
 *     store_code: 'MB001', store_name: 'MB Saket',
 *     gps_lat: 28.522, gps_lng: 77.219,
 *     store_gps_lat: 28.522, store_gps_lng: 77.219,
 *     photo_url: '...', notes: ''
 *   })
 *   .then(res => {
 *      if (res.ok) alert('Saved: ' + res.message);
 *      else alert('Error: ' + res.error);
 *   });
 *
 *   // Read data (admin dashboard)
 *   CurioAPI.get('todays_checkins').then(res => {
 *     if (res.ok) console.log(res.data);
 *   });
 *
 * OFFLINE MODE:
 *   If the network is down (e.g. promoter in a basement), CurioAPI queues the
 *   submission in localStorage and flushes when connectivity returns.
 * ------------------------------------------------------------------
 */

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwCqZtIIM7ZKVf9b-3Fwa_4K9tgrkr6MRG34hw4IXcuicPYpJ48zbfm5pSUImnIzXCo/exec';
const API_SECRET  = 'curio2026';
const CurioAPI = {

  // POST — submit any action
  async submit(action, user, payload) {
    const body = { secret: API_SECRET, action, user, app: window.location.pathname.split('/').pop(), payload };

    if (!navigator.onLine) {
      this._queue(body);
      return { ok: true, offline: true, message: 'Saved offline — will sync when you\'re back online' };
    }

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        // Apps Script requires text/plain to avoid CORS preflight; the .gs file parses JSON from the raw body
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
      const json = await res.json();
      // Attempt to flush any queued submissions
      this._flushQueue();
      return json;
    } catch (err) {
      this._queue(body);
      return { ok: false, offline: true, error: err.toString(), message: 'Network error — saved offline' };
    }
  },

  // GET — read data (admin dashboard use)
  async get(query, extraParams = {}) {
    const params = new URLSearchParams({ secret: API_SECRET, q: query, ...extraParams });
    try {
      const res = await fetch(WEBHOOK_URL + '?' + params.toString());
      return await res.json();
    } catch (err) {
      return { ok: false, error: err.toString() };
    }
  },

  // -------------------- OFFLINE QUEUE --------------------
  _queue(body) {
    const q = JSON.parse(localStorage.getItem('curio_offline_queue') || '[]');
    q.push({ ...body, queued_at: new Date().toISOString() });
    localStorage.setItem('curio_offline_queue', JSON.stringify(q));
  },
  async _flushQueue() {
    const q = JSON.parse(localStorage.getItem('curio_offline_queue') || '[]');
    if (q.length === 0) return;
    const remaining = [];
    for (const body of q) {
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.ok) remaining.push(body);
      } catch (err) {
        remaining.push(body);
      }
    }
    localStorage.setItem('curio_offline_queue', JSON.stringify(remaining));
    console.log('Flushed offline queue:', q.length - remaining.length, 'sent,', remaining.length, 'still queued');
  },
  offlineQueueLength() {
    return JSON.parse(localStorage.getItem('curio_offline_queue') || '[]').length;
  }
};

// Auto-flush when connection returns
window.addEventListener('online', () => CurioAPI._flushQueue());

// Expose for console debugging
window.CurioAPI = CurioAPI;
