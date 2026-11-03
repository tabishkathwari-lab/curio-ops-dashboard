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
// Populates Days active / AM-PM / Last active columns on Promoters -> Performance Scorecard from Supabase promoter_checkins
(function(){
  var SB='https://cikyevecsuamzndxfpir.supabase.co';
  var KEY='sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  var CACHE=null, CACHE_T=0;
  async function loadData(){
    if (CACHE && (Date.now()-CACHE_T)<300000) return CACHE;
    var out={}, off=0;
    while(off<20000){
      var r = await fetch(SB+'/rest/v1/promoter_checkins?select=promoter,date,time_str,timestamp&limit=1000&offset='+off,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
      var page = await r.json();
      if (!Array.isArray(page)||!page.length) break;
      page.forEach(function(rec){
        var k=rec.promoter; if(!k) return;
        if (!out[k]) out[k]={days:new Set(), last:null, am:0, pm:0};
        if (rec.date) out[k].days.add(rec.date);
        if (!out[k].last || rec.timestamp>out[k].last) out[k].last=rec.timestamp;
        var h=null;
        if (rec.time_str && /^\d{1,2}/.test(rec.time_str)) h=parseInt(rec.time_str.split(':')[0]);
        else if (rec.timestamp) h=new Date(rec.timestamp).getHours();
        if (h!=null){ if (h<14) out[k].am++; else out[k].pm++; }
      });
      if (page.length<1000) break;
      off+=1000;
    }
    CACHE=out; CACHE_T=Date.now();
    return out;
  }
  async function patch(){
    try {
      var tables=document.querySelectorAll('table');
      var table=null;
      for (var i=0;i<tables.length;i++){
        var th=tables[i].querySelectorAll('thead th');
        var names=[]; for (var j=0;j<th.length;j++) names.push(th[j].textContent.trim());
        if (names.indexOf('Days active')>=0 && names.indexOf('AM / PM')>=0 && names.indexOf('Last active')>=0){ table=tables[i]; break; }
      }
      if (!table) return;
      if (table.dataset.spPatched==='1' && (Date.now()-parseInt(table.dataset.spTs||'0',10))<30000) return;
      var data=await loadData();
      var hdrs=Array.from(table.querySelectorAll('thead th')).map(function(x){return x.textContent.trim();});
      var iN=hdrs.indexOf('Promoter'), iD=hdrs.indexOf('Days active'), iA=hdrs.indexOf('AM / PM'), iL=hdrs.indexOf('Last active');
      Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
        var tds=tr.querySelectorAll('td'); if (!tds.length) return;
        var name=(tds[iN]&&tds[iN].textContent||'').replace(/^[^A-Za-z]+/,'').trim();
        var d=data[name]; if (!d) return;
        if (tds[iD]) tds[iD].textContent=d.days.size;
        if (tds[iA]) tds[iA].textContent=d.am+' / '+d.pm;
        if (tds[iL] && d.last) tds[iL].textContent=new Date(d.last).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
      });
      table.dataset.spPatched='1'; table.dataset.spTs=String(Date.now());
    } catch(e){ console.warn('[scorepatch]', e); }
  }
  var t;
  var run=function(){ clearTimeout(t); t=setTimeout(patch, 500); };
  if (document.body) new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded', function(){ new MutationObserver(run).observe(document.body,{childList:true,subtree:true}); run(); });
  run();
})();
