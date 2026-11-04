/* scorepatch V23 - preserves .ov-delta span IDs so dashboard home/shopify overview no longer throws null errors */
(function(){
  const SB_URL = 'https://cikyevecsuamzndxfpir.supabase.co/rest/v1/';
  const SB_KEY = 'sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  const BLACKLIST = ['probe','AUDIT_v11','TEST_DIAGNOSTIC'];
  const VERSION = 'V23';
  console.log('scorepatch '+VERSION+' loaded');

  function istDate(d){ d=d||new Date(); return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  function monthBounds(){
    const now = new Date();
    const ist = new Date(now.getTime()+5.5*3600*1000);
    const y = ist.getUTCFullYear(), m = ist.getUTCMonth()+1;
    const first = y+'-'+String(m).padStart(2,'0')+'-01';
    const nY = m===12?y+1:y, nM = m===12?1:m+1;
    const nextFirst = nY+'-'+String(nM).padStart(2,'0')+'-01';
    return {first, nextFirst, ym: y+'-'+String(m).padStart(2,'0'), y, m};
  }
  function fyBounds(fyLabel){
    const num = parseInt((fyLabel||'FY27').replace(/\D/g,''), 10);
    const startYear = 2000 + num - 1;
    return {first: startYear + '-04-01', nextFirst: (startYear + 1) + '-04-01', label: 'FY'+num};
  }
  function prevMonthBounds(mb){
    const pY = mb.m===1?mb.y-1:mb.y, pM = mb.m===1?12:mb.m-1;
    const first = pY+'-'+String(pM).padStart(2,'0')+'-01';
    const nextFirst = mb.first;
    return {first, nextFirst, y:pY, m:pM};
  }
  function prevYearSameMonth(mb){
    const first = (mb.y-1)+'-'+String(mb.m).padStart(2,'0')+'-01';
    const nM = mb.m===12?1:mb.m+1;
    const nY = mb.m===12?mb.y:mb.y-1;
    const nextFirst = nY+'-'+String(nM).padStart(2,'0')+'-01';
    return {first, nextFirst};
  }
  async function sbGet(path){
    const r = await fetch(SB_URL+path, {headers:{apikey:SB_KEY, Authorization:'Bearer '+SB_KEY}});
    if (!r.ok) return [];
    try { return await r.json(); } catch(e){ return []; }
  }
  async function sumPage(table, col, filter){
    let sum=0, off=0;
    while(true){
      const rows = await sbGet(table+'?select='+col+(filter||'')+'&limit=1000&offset='+off);
      if (!Array.isArray(rows) || rows.length===0) break;
      rows.forEach(r=>{ sum += parseFloat(r[col]||0); });
      if (rows.length<1000) break;
      off += 1000;
    }
    return sum;
  }
  async function pagedAll(table, selectCols, filter){
    let rows=[], off=0;
    while(true){
      const chunk = await sbGet(table+'?select='+selectCols+(filter||'')+'&limit=1000&offset='+off);
      if (!Array.isArray(chunk) || chunk.length===0) break;
      rows = rows.concat(chunk);
      if (chunk.length<1000) break;
      off += 1000;
    }
    return rows;
  }
  async function countDistinctOrders(table, col, filter){
    const set = new Set(); let off=0;
    while(true){
      const rows = await sbGet(table+'?select='+col+(filter||'')+'&limit=1000&offset='+off);
      if (!Array.isArray(rows) || rows.length===0) break;
      rows.forEach(r=> set.add(r[col]));
      if (rows.length<1000) break;
      off += 1000;
    }
    return set.size;
  }
  function inr(n){ if (n>=1e7) return 'INR '+(n/1e7).toFixed(2)+'Cr'; if (n>=1e5) return 'INR '+(n/1e5).toFixed(2)+'L'; if (n>=1000) return 'INR '+(n/1000).toFixed(1)+'K'; return 'INR '+Math.round(n); }
  function rupee(n){ return inr(n).replace('INR ', '₹'); }
  function monthNameShort(m){ return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]; }
  function pctDelta(cur, prev){
    if (!prev || prev===0) return cur>0 ? '+∞' : '—';
    const d = (cur-prev)/prev*100;
    return (d>=0?'+':'')+d.toFixed(1)+'%';
  }

  // All-channel aggregate for current month
  async function loadAllChannel(mb){
    const [shop, blink, mt, b2b, meta] = await Promise.all([
      sumPage('sales_shopify','total','&order_date=gte.'+mb.first+'&order_date=lt.'+mb.nextFirst),
      sumPage('sales_blinkit','total_sales','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('sales_mt_office','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('zoho_invoices','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('meta_ads_live','spend','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst).catch(()=>0)
    ]);
    const orders = await countDistinctOrders('sales_shopify','order_id','&order_date=gte.'+mb.first+'&order_date=lt.'+mb.nextFirst);
    return {store: shop+blink+mt+b2b, ads: meta, orders, shop, blink, mt, b2b};
  }

  // Shopify-only for a date range
  async function loadShopify(range){
    const total = await sumPage('sales_shopify','total','&order_date=gte.'+range.first+'&order_date=lt.'+range.nextFirst);
    const orders = await countDistinctOrders('sales_shopify','order_id','&order_date=gte.'+range.first+'&order_date=lt.'+range.nextFirst);
    return {store: total, orders};
  }

  function findOvRow(page, labelRe){
    const labels = Array.from(page.querySelectorAll('.ov-label'));
    for (const lab of labels) {
      if (labelRe.test((lab.textContent||'').trim())) {
        const card = lab.parentElement;
        return card;
      }
    }
    return null;
  }
  function setOvTile(card, value, delta1, delta2){
    if (!card) return;
    const v = card.querySelector('.ov-value');
    if (v && value !== undefined) v.textContent = value;
    // IMPORTANT: Do NOT setTextContent on the parent .ov-delta div because that destroys
    // the inner <span id="ovSalesPrev">...</span> element that dashboard's own code looks up by ID.
    // Instead find the inner span (e.g. ovSalesPrev) and replace only its text.
    const deltas = card.querySelectorAll('.ov-delta');
    function setDelta(deltaDiv, newText){
      if (!deltaDiv || newText === undefined) return;
      const span = deltaDiv.querySelector('span[id]');
      if (span) {
        // Replace just the span text — extract delta text (e.g. "+12.3%" after "Previous period ")
        const m = String(newText).match(/(?:previous\s+period|previous\s+year)\s+(.*)/i);
        span.textContent = m ? m[1] : String(newText);
      } else {
        // Fallback: use textContent only if no span exists
        deltaDiv.textContent = newText;
      }
    }
    setDelta(deltas[0], delta1);
    setDelta(deltas[1], delta2);
  }

  async function patchHomeOverview(){
    try {
      const page = document.getElementById('page-home');
      if (!page) return;
      const mb = monthBounds();
      const [cur, prev, prevYear] = await Promise.all([
        loadAllChannel(mb),
        loadAllChannel(prevMonthBounds(mb)),
        loadAllChannel(prevYearSameMonth(mb))
      ]);
      const roas = cur.ads>0 ? (cur.store/cur.ads) : 0;
      setOvTile(findOvRow(page, /TOTAL STORE SALES/i), rupee(cur.store),
        'Previous period '+pctDelta(cur.store, prev.store),
        'Previous year '+pctDelta(cur.store, prevYear.store));
      setOvTile(findOvRow(page, /TOTAL ADVERTISING COST/i), rupee(cur.ads),
        'Previous period '+pctDelta(cur.ads, prev.ads),
        'Previous year '+pctDelta(cur.ads, prevYear.ads));
      setOvTile(findOvRow(page, /^ORDERS$/i), String(cur.orders),
        'Previous period '+pctDelta(cur.orders, prev.orders),
        'Previous year '+pctDelta(cur.orders, prevYear.orders));
      setOvTile(findOvRow(page, /BLENDED ROAS/i), roas>0 ? roas.toFixed(2)+'x' : '-', 'Target: 3x+', '');
    } catch(e){ console.error('[sp'+VERSION+'] home overview err', e); }
  }

  async function patchShopifyOverview(){
    try {
      const page = document.getElementById('page-shopify');
      if (!page) return;
      const mb = monthBounds();
      const [cur, prev, prevYear] = await Promise.all([
        loadShopify(mb),
        loadShopify(prevMonthBounds(mb)),
        loadShopify(prevYearSameMonth(mb))
      ]);
      setOvTile(findOvRow(page, /TOTAL STORE SALES/i), rupee(cur.store),
        'Previous period '+pctDelta(cur.store, prev.store),
        'Previous year '+pctDelta(cur.store, prevYear.store));
      setOvTile(findOvRow(page, /^ORDERS$/i), String(cur.orders),
        'Previous period '+pctDelta(cur.orders, prev.orders),
        'Previous year '+pctDelta(cur.orders, prevYear.orders));
      // Ads + ROAS stay as dashboard-level since Shopify ads data isn't separated
      const adsCard = findOvRow(page, /TOTAL ADVERTISING COST/i);
      if (adsCard) {
        const v = adsCard.querySelector('.ov-value');
        if (v && !/₹/.test(v.textContent)) v.textContent = '₹0';
      }
    } catch(e){ console.error('[sp'+VERSION+'] shopify overview err', e); }
  }

  function setKPI(labelText, value, sub){
    document.querySelectorAll('.kpi .label').forEach(l => {
      if ((l.textContent||'').trim()===labelText) {
        const par = l.parentElement; if (!par) return;
        const v = par.querySelector('.value'); const s = par.querySelector('.sub');
        if (v && value!==undefined) v.textContent = value;
        if (s && sub!==undefined) s.textContent = sub;
      }
    });
  }

  async function patchToday(){
    try {
      const today = istDate();
      const [shop, blink, mt, b2b, att, chk] = await Promise.all([
        sbGet('sales_shopify?select=order_id,units,total&order_date=eq.'+today),
        sbGet('sales_blinkit?select=units,total_sales&date=eq.'+today),
        sbGet('sales_mt_office?select=units,total&date=eq.'+today),
        sbGet('zoho_invoices?select=total&date=eq.'+today),
        sbGet('attendance_log?select=employee&date=eq.'+today),
        sbGet('promoter_checkins?select=promoter&date=eq.'+today)
      ]);
      const uShop = shop.reduce((s,r)=>s+parseFloat(r.units||0),0);
      const uBlink = blink.reduce((s,r)=>s+parseFloat(r.units||0),0);
      const uMt = mt.reduce((s,r)=>s+parseFloat(r.units||0),0);
      const unitsTotal = uShop+uBlink+uMt;
      const rShop = shop.reduce((s,r)=>s+parseFloat(r.total||0),0);
      const rBlink = blink.reduce((s,r)=>s+parseFloat(r.total_sales||0),0);
      const rMt = mt.reduce((s,r)=>s+parseFloat(r.total||0),0);
      const rB2b = b2b.reduce((s,r)=>s+parseFloat(r.total||0),0);
      const revTotal = rShop+rBlink+rMt+rB2b;
      const attSet = new Set(att.filter(r=>!BLACKLIST.includes(r.employee)).map(x=>x.employee));
      const chkSet = new Set(chk.filter(r=>!BLACKLIST.includes(r.promoter)).map(x=>x.promoter));
      const unitsSub = [uShop&&(uShop+' Shopify'), uBlink&&(uBlink+' Blinkit'), uMt&&(uMt+' MT')].filter(Boolean).join(' . ') || 'No sales entered today';
      const revSub = [rShop&&(rupee(rShop)+' Shopify'), rBlink&&(rupee(rBlink)+' Blinkit'), rMt&&(rupee(rMt)+' MT'), rB2b&&(rupee(rB2b)+' B2B')].filter(Boolean).join(' . ') || 'No channel activity today';
      setKPI('Check-ins today', String(chkSet.size), chkSet.size>0 ? chkSet.size+' promoters' : '0 promoters . nobody yet');
      setKPI('Units sold today', unitsTotal>0 ? String(unitsTotal) : '0', unitsSub);
      setKPI('Revenue today', rupee(revTotal), revSub);
      setKPI('Attendance today', String(attSet.size), attSet.size>0 ? attSet.size+' checked in' : 'No one checked in yet');
    } catch(e){ console.error('[sp'+VERSION+'] today err', e); }
  }

  async function patchShopifyPanel(){
    try {
      const page = document.getElementById('page-shopify');
      if (!page || !page.classList.contains('active')) return;
      const panel = page.querySelector('.ch-ps-panel');
      if (!panel) return;
      const currentFy = panel.dataset.sp17Fy || 'FY27';
      if (panel.dataset.sp17Rendered === currentFy) return;
      const fb = fyBounds(currentFy);

      const rows = await pagedAll('sales_shopify', 'order_date,order_id,total', '&order_date=gte.'+fb.first+'&order_date=lt.'+fb.nextFirst);
      let total = 0;
      const orderSet = new Set();
      const byMonth = {};
      rows.forEach(r => {
        const t = parseFloat(r.total||0);
        total += t;
        orderSet.add(r.order_id);
        const ym = (r.order_date||'').slice(0,7);
        if (!byMonth[ym]) byMonth[ym] = {total:0, orders: new Set()};
        byMonth[ym].total += t;
        byMonth[ym].orders.add(r.order_id);
      });

      const months = Object.keys(byMonth).sort();
      const years = ['FY27','FY26','FY25'];
      let html = '';
      html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">';
      html += '<div><div style="font-size:16px;font-weight:700;color:#0f172a;">🛍️ Shopify D2C · Direct sales</div>';
      html += '<div style="font-size:11px;color:#64748b;margin-top:2px;">'+currentFy+' · '+fb.first+' → '+new Date(new Date(fb.nextFirst).getTime()-86400000).toISOString().slice(0,10)+'</div></div>';
      html += '<div class="ch-fy-toggle" style="display:flex;gap:4px;">';
      years.forEach(y => {
        const active = y===currentFy;
        html += '<button class="ch-fy-btn'+(active?' active':'')+'" data-fy="'+y+'" style="padding:4px 10px;border-radius:6px;border:1px solid '+(active?'#0f172a':'#cbd5e1')+';background:'+(active?'#0f172a':'#fff')+';color:'+(active?'#fff':'#334155')+';font-size:12px;font-weight:600;cursor:pointer;">'+y+'</button>';
      });
      html += '</div></div>';
      html += '<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:6px;margin-top:12px;">';
      html += '<div style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:#1e40af;">🟦 DIRECT SALES</div>';
      html += '<div style="font-size:28px;font-weight:700;color:#1e3a8a;margin-top:4px;">'+rupee(total)+'</div>';
      html += '<div style="font-size:12px;color:#64748b;margin-top:2px;">Curio → end consumer (website orders — invoiced and delivered directly) · '+orderSet.size+' orders</div>';
      html += '</div>';
      html += '<div style="margin-top:16px;font-weight:600;color:#1e40af;">🟦 Direct · month-wise</div>';
      if (months.length === 0) {
        html += '<div style="margin-top:6px;color:#64748b;">No data yet</div>';
      } else {
        html += '<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:13px;">';
        html += '<thead><tr><th style="text-align:left;padding:4px 6px;border-bottom:1px solid #e5e7eb;">Month</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #e5e7eb;">Orders</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #e5e7eb;">Revenue</th></tr></thead><tbody>';
        months.forEach(ym => {
          const [y,m] = ym.split('-');
          const mt = byMonth[ym];
          html += '<tr><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;">'+monthNameShort(parseInt(m,10))+' '+y.slice(2)+'</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #f1f5f9;">'+mt.orders.size+'</td><td style="text-align:right;padding:4px 6px;border-bottom:1px solid #f1f5f9;">'+rupee(mt.total)+'</td></tr>';
        });
        html += '<tr style="font-weight:700;"><td style="padding:6px;">Total</td><td style="text-align:right;padding:6px;">'+orderSet.size+'</td><td style="text-align:right;padding:6px;">'+rupee(total)+'</td></tr></tbody></table>';
      }
      panel.innerHTML = html;
      panel.dataset.sp17Fy = currentFy;
      panel.dataset.sp17Rendered = currentFy;

      panel.querySelectorAll('.ch-fy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const newFy = btn.dataset.fy;
          panel.dataset.sp17Fy = newFy;
          panel.dataset.sp17Rendered = '';
          setTimeout(()=>{ patchShopifyPanel(); }, 100);
        });
      });
    } catch(e){ console.error('[sp'+VERSION+'] shopify panel err', e); }
  }

  function hdrIdx(hdrs, re){ for (let i=0;i<hdrs.length;i++){ if (re.test(hdrs[i])) return i; } return -1; }

  async function patchScorecard(){
    try {
      const mb = monthBounds();
      const tables = document.querySelectorAll('table');
      for (const tbl of tables) {
        const hdrRow = tbl.querySelector('thead tr') || tbl.querySelector('tr');
        if (!hdrRow) continue;
        const hdrs = Array.from(hdrRow.children).map(c => (c.textContent||'').trim());
        if (!hdrs.some(h => /Promoter|Employee/i.test(h))) continue;
        const iName = hdrIdx(hdrs, /Promoter|Employee/i);
        const iDays = hdrIdx(hdrs, /Days.?Active/i);
        const iAM = hdrIdx(hdrs, /^AM$/i);
        const iPM = hdrIdx(hdrs, /^PM$/i);
        const iLast = hdrIdx(hdrs, /Last.?active/i);
        const iMiss = hdrIdx(hdrs, /Missed/i);
        if (iName<0 || (iDays<0 && iAM<0 && iLast<0)) continue;
        const rows = tbl.querySelectorAll('tbody tr, tr');
        for (const row of rows) {
          const cells = Array.from(row.children);
          if (cells.length<hdrs.length) continue;
          const name = (cells[iName]?.textContent||'').trim();
          if (!name || BLACKLIST.includes(name)) continue;
          const checks = await sbGet('promoter_checkins?select=date,shift&promoter=eq.'+encodeURIComponent(name)+'&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst+'&limit=1000');
          const amDays = new Set(), pmDays = new Set(), allDays = new Set();
          let lastDate = null;
          checks.forEach(c => {
            allDays.add(c.date);
            if (/AM/i.test(c.shift||'')) amDays.add(c.date);
            else if (/PM/i.test(c.shift||'')) pmDays.add(c.date);
            if (!lastDate || c.date>lastDate) lastDate = c.date;
          });
          if (iDays>=0) cells[iDays].textContent = allDays.size;
          if (iAM>=0) cells[iAM].textContent = amDays.size;
          if (iPM>=0) cells[iPM].textContent = pmDays.size;
          if (iLast>=0) cells[iLast].textContent = lastDate || '-';
          if (iMiss>=0) {
            const expected = Math.floor((Date.now()-new Date(mb.first).getTime())/86400000)+1;
            cells[iMiss].textContent = Math.max(0, expected-allDays.size);
          }
        }
        break;
      }
    } catch(e){ console.error('[sp'+VERSION+'] scorecard err', e); }
  }

  async function patchHomeSalesPSS(){
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let headerNode = null, n;
      while (n = walker.nextNode()) { if (n.textContent.includes('Primary + Secondary')) { headerNode = n; break; } }
      if (!headerNode) return;
      const card = headerNode.parentElement && headerNode.parentElement.closest('.card');
      if (!card) return;
      // No early-return guard — dashboard app may re-render and overwrite, so always re-check
      const fyBtn = card.querySelector('.sf-btn.active');
      const fyLabel = (fyBtn && fyBtn.textContent.trim()) || 'FY27';
      const fy = fyBounds(fyLabel);

      const zoho = await pagedAll('zoho_invoices', 'customer_name,total', '&date=gte.'+fy.first+'&date=lt.'+fy.nextFirst);
      const shop = await pagedAll('sales_shopify', 'total', '&order_date=gte.'+fy.first+'&order_date=lt.'+fy.nextFirst);
      const zohoTotal = zoho.reduce((s,r)=>s+parseFloat(r.total||0),0);
      const shopTotal = shop.reduce((s,r)=>s+parseFloat(r.total||0),0);
      const primaryTotal = zohoTotal + shopTotal;

      const divs = Array.from(card.querySelectorAll('div'));
      const pLabel = divs.find(d => /primary total/i.test(d.textContent.trim()) && d.children.length === 0);
      const wantedPrimary = rupee(primaryTotal);
      if (pLabel && pLabel.nextElementSibling && pLabel.nextElementSibling.textContent.trim() !== wantedPrimary) {
        pLabel.nextElementSibling.textContent = wantedPrimary;
      }

      const sLabel = divs.find(d => /secondary total/i.test(d.textContent.trim()) && d.children.length === 0);
      const secondaryText = (sLabel && sLabel.nextElementSibling) ? sLabel.nextElementSibling.textContent.trim() : '';
      function parseR(s){ const m = s.match(/([\d.,]+)\s*(Cr|L|K)?/); if (!m) return 0; const n = parseFloat(m[1].replace(/,/g,'')); if (m[2]==='Cr') return n*1e7; if (m[2]==='L') return n*1e5; if (m[2]==='K') return n*1000; return n; }
      const secondaryTotal = parseR(secondaryText);
      const buffer = primaryTotal - secondaryTotal;

      const bLabel = divs.find(d => /buffer/i.test(d.textContent) && d.children.length === 0);
      if (bLabel && bLabel.nextElementSibling) bLabel.nextElementSibling.textContent = (buffer >= 0 ? '+' : '-') + rupee(Math.abs(buffer)).replace(/^₹/, '₹');

      const empty = card.querySelector('.sf-empty');
      if (empty) {
        const marche = zoho.filter(r => /MARCHE/i.test(r.customer_name||'')).reduce((s,r)=>s+parseFloat(r.total||0),0);
        const blinkit = zoho.filter(r => /BLINK COMMERCE/i.test(r.customer_name||'')).reduce((s,r)=>s+parseFloat(r.total||0),0);
        const other = zohoTotal - marche - blinkit;
        const buckets = [['B2B — Blinkit', blinkit], ['B2B — Direct (Suyash, DRL, etc)', other], ['MT Chains (Marche)', marche], ['Shopify D2C', shopTotal]].filter(b => b[1] > 0).sort((a,b)=>b[1]-a[1]);
        const tot = buckets.reduce((s,b)=>s+b[1],0);
        empty.innerHTML = buckets.map(b => {
          const pct = tot > 0 ? Math.round(b[1]/tot*100) : 0;
          return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span>'+b[0]+'</span><span><strong>'+rupee(b[1])+'</strong> <small style="color:#888;margin-left:8px">'+pct+'%</small></span></div>';
        }).join('');
        empty.className = '';
      }

      // (no flag set — re-patch on every mutation is fine, data fetch is cheap)

      card.querySelectorAll('.sf-btn').forEach(btn => {
        if (btn.dataset.sp18Bound) return;
        btn.dataset.sp18Bound = '1';
        btn.addEventListener('click', () => { setTimeout(()=>{ card.dataset.sp18Rendered = ''; patchHomeSalesPSS(); }, 150); });
      });
    } catch(e){ console.error('[sp'+VERSION+'] home sales pss err', e); }
  }

  // --- V21: patch B2B top tile on home page using stable DOM IDs ---
  async function patchHomeTopTiles(){
    try {
      const b2bToday = document.getElementById('ss-b2b-today');
      const b2bMtd = document.getElementById('ss-b2b-mtd');
      const b2bYtd = document.getElementById('ss-b2b-ytd');
      if (!b2bToday) return; // page not rendered yet
      const mb = monthBounds();
      const fy = fyBounds('FY27');
      const today = istDate();
      const [bT, bM, bY] = await Promise.all([
        sumPage('sales_b2b','total','&date=eq.'+today),
        sumPage('sales_b2b','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
        sumPage('sales_b2b','total','&date=gte.'+fy.first+'&date=lt.'+fy.nextFirst)
      ]);
      b2bToday.textContent = bT>0 ? rupee(bT) : '₹0';
      if (b2bMtd) b2bMtd.textContent = rupee(bM);
      if (b2bYtd) b2bYtd.textContent = rupee(bY);
    } catch(e){ console.error('[sp'+VERSION+'] home tiles err', e); }
  }

  // --- V22: patch 'Sales by channel' table rows (MT + B2B) ---
  async function patchSalesByChannel(){
    try {
      // Find the Sales by channel table by header pattern
      const tables = Array.from(document.querySelectorAll('table'));
      let tbl = null;
      for (const t of tables) {
        const txt = (t.textContent||'');
        if (/MT/.test(txt) && /B2B/.test(txt) && /Shopify/.test(txt) && /Blinkit/.test(txt) && /This month/i.test(txt) && !/Profit/i.test(txt)) { tbl = t; break; }
      }
      if (!tbl) return;
      const rows = Array.from(tbl.querySelectorAll('tbody tr, tr'));
      const mb = monthBounds();
      const pmb = prevMonthBounds(mb);
      const today = istDate();
      const daysIn = Math.min((new Date(today).getUTCDate()), 31);

      function findRow(labelRe){
        for (const r of rows) {
          const first = (r.children[0] && r.children[0].textContent||'').trim();
          if (labelRe.test(first)) return r;
        }
        return null;
      }
      function setCell(row, colIdx, val){ if (!row || !row.children[colIdx]) return; row.children[colIdx].textContent = val; }
      function fmt(n){ return n>0 ? rupee(n) : '—'; }

      // --- MT row: sales_mt_office + zoho_invoices JOIN mt_customers ---
      async function mtRange(range){
        const [promoter, zoho, mtCust] = await Promise.all([
          sumPage('sales_mt_office','total','&date=gte.'+range.first+'&date=lt.'+range.nextFirst),
          pagedAll('zoho_invoices','customer_name,total','&date=gte.'+range.first+'&date=lt.'+range.nextFirst),
          sbGet('mt_customers?select=customer_name')
        ]);
        const names = new Set((mtCust||[]).map(x=>String(x.customer_name).toUpperCase()));
        const zMt = (zoho||[]).filter(r=>names.has(String(r.customer_name||'').toUpperCase())).reduce((s,r)=>s+parseFloat(r.total||0),0);
        return promoter + zMt;
      }
      async function mtEq(date){
        const [promoter, zoho, mtCust] = await Promise.all([
          sbGet('sales_mt_office?select=total&date=eq.'+date),
          sbGet('zoho_invoices?select=customer_name,total&date=eq.'+date),
          sbGet('mt_customers?select=customer_name')
        ]);
        const names = new Set((mtCust||[]).map(x=>String(x.customer_name).toUpperCase()));
        const pT = (promoter||[]).reduce((s,r)=>s+parseFloat(r.total||0),0);
        const zT = (zoho||[]).filter(r=>names.has(String(r.customer_name||'').toUpperCase())).reduce((s,r)=>s+parseFloat(r.total||0),0);
        return pT + zT;
      }

      // --- B2B row: sales_b2b view ---
      async function b2bRange(range){
        return await sumPage('sales_b2b','total','&date=gte.'+range.first+'&date=lt.'+range.nextFirst);
      }
      async function b2bEq(date){
        return await sumPage('sales_b2b','total','&date=eq.'+date);
      }

      const [mtToday, mtMtd, mtLast, b2bToday2, b2bMtd2, b2bLast] = await Promise.all([
        mtEq(today), mtRange(mb), mtRange(pmb),
        b2bEq(today), b2bRange(mb), b2bRange(pmb)
      ]);

      // Columns: 0=Channel, 1=Today, 2=MTD, 3=Daily avg, 4=Last month, 5=sparkline
      const mtRow = findRow(/MT$/);
      if (mtRow) {
        setCell(mtRow, 1, fmt(mtToday));
        setCell(mtRow, 2, fmt(mtMtd));
        setCell(mtRow, 3, fmt(mtMtd / daysIn));
        setCell(mtRow, 4, fmt(mtLast));
      }
      const b2bRow = findRow(/B2B$/);
      if (b2bRow) {
        setCell(b2bRow, 1, fmt(b2bToday2));
        setCell(b2bRow, 2, fmt(b2bMtd2));
        setCell(b2bRow, 3, fmt(b2bMtd2 / daysIn));
        setCell(b2bRow, 4, fmt(b2bLast));
      }

      // Update the Total row to account for our changes
      // Grab all channel MTDs by text parse
      function parseR(s){ if(!s)return 0; const m=String(s).match(/([\d.,]+)\s*(Cr|L|K)?/i); if(!m)return 0; const n=parseFloat(m[1].replace(/,/g,'')); if(/cr/i.test(m[2]||''))return n*1e7; if(/l/i.test(m[2]||''))return n*1e5; if(/k/i.test(m[2]||''))return n*1e3; return n; }
      const shopRow = findRow(/Shopify$/);
      const blnkRow = findRow(/Blinkit$/);
      const amzRow = findRow(/Amazon$/);
      function rowVal(row, idx){ return row ? parseR(row.children[idx]?.textContent) : 0; }
      const totToday = rowVal(shopRow,1)+rowVal(blnkRow,1)+rowVal(amzRow,1)+mtToday+b2bToday2;
      const totMtd = rowVal(shopRow,2)+rowVal(blnkRow,2)+rowVal(amzRow,2)+mtMtd+b2bMtd2;
      const totAvg = rowVal(shopRow,3)+rowVal(blnkRow,3)+rowVal(amzRow,3)+(mtMtd/daysIn)+(b2bMtd2/daysIn);
      const totLast = rowVal(shopRow,4)+rowVal(blnkRow,4)+rowVal(amzRow,4)+mtLast+b2bLast;
      const totToEl = document.getElementById('cbTotToday'); if (totToEl) totToEl.textContent = totToday>0 ? rupee(totToday) : '—';
      const totMtdEl = document.getElementById('cbTotMonth'); if (totMtdEl) totMtdEl.textContent = totMtd>0 ? rupee(totMtd) : '—';
      const totAvgEl = document.getElementById('cbTotAvg'); if (totAvgEl) totAvgEl.textContent = totAvg>0 ? rupee(totAvg) : '—';
      const totLastEl = document.getElementById('cbTotLast'); if (totLastEl) totLastEl.textContent = totLast>0 ? rupee(totLast) : '—';
    } catch(e){ console.error('[sp'+VERSION+'] sales by channel err', e); }
  }


  async function runAll(){
    await patchHomeTopTiles();
    await patchSalesByChannel();
    await patchHomeOverview();
    await patchHomeSalesPSS();
    await patchShopifyOverview();
    await patchToday();
    await patchShopifyPanel();
    await patchScorecard();
  }
  let pending = false;
  function schedule(){
    if (pending) return;
    pending = true;
    setTimeout(async ()=>{ pending=false; try { await runAll(); } catch(e){} }, 500);
  }
  schedule();
  new MutationObserver(() => schedule()).observe(document.body, {subtree:true, childList:true});
  setInterval(schedule, 120000);
})();
