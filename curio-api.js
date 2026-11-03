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


// ===== SCOREPATCH_PROMOTER_CHECKINS_V1 =====
(function(){var SB='https://cikyevecsuamzndxfpir.supabase.co',KEY='sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH',C=null,CT=0;async function L(){if(C&&(Date.now()-CT)<3e5)return C;var o={},f=0;while(f<2e4){var r=await fetch(SB+'/rest/v1/promoter_checkins?select=promoter,date,time_str,timestamp&limit=1000&offset='+f,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});var p=await r.json();if(!Array.isArray(p)||!p.length)break;p.forEach(function(x){var k=x.promoter;if(!k)return;if(!o[k])o[k]={d:new Set(),l:null,a:0,p:0};if(x.date)o[k].d.add(x.date);if(!o[k].l||x.timestamp>o[k].l)o[k].l=x.timestamp;var h=null;if(x.time_str&&/^\d{1,2}/.test(x.time_str))h=parseInt(x.time_str.split(':')[0]);else if(x.timestamp)h=new Date(x.timestamp).getHours();if(h!=null){if(h<14)o[k].a++;else o[k].p++}});if(p.length<1000)break;f+=1000}C=o;CT=Date.now();return o}async function P(){try{var T=document.querySelectorAll('table'),t=null;for(var i=0;i<T.length;i++){var th=T[i].querySelectorAll('thead th'),n=[];for(var j=0;j<th.length;j++)n.push(th[j].textContent.trim());if(n.indexOf('Days active')>=0&&n.indexOf('AM / PM')>=0&&n.indexOf('Last active')>=0){t=T[i];break}}if(!t)return;if(t.dataset.sp=='1'&&(Date.now()-+(t.dataset.st||0))<3e4)return;var d=await L(),h=Array.from(t.querySelectorAll('thead th')).map(function(x){return x.textContent.trim()}),iN=h.indexOf('Promoter'),iD=h.indexOf('Days active'),iA=h.indexOf('AM / PM'),iL=h.indexOf('Last active');Array.from(t.querySelectorAll('tbody tr')).forEach(function(tr){var c=tr.querySelectorAll('td');if(!c.length)return;var nm=(c[iN]&&c[iN].textContent||'').replace(/^[^A-Za-z]+/,'').trim(),x=d[nm];if(!x)return;if(c[iD])c[iD].textContent=x.d.size;if(c[iA])c[iA].textContent=x.a+' / '+x.p;if(c[iL]&&x.l)c[iL].textContent=new Date(x.l).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})});t.dataset.sp='1';t.dataset.st=String(Date.now())}catch(e){console.warn(e)}}var z;var R=function(){clearTimeout(z);z=setTimeout(P,500)};if(document.body)new MutationObserver(R).observe(document.body,{childList:true,subtree:true});else document.addEventListener('DOMContentLoaded',function(){new MutationObserver(R).observe(document.body,{childList:true,subtree:true});R()});R()})();
