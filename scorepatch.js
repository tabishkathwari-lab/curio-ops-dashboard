/* scorepatch V11 - Curio Admin Dashboard live patches */
(function(){
  const SB_URL = 'https://cikyevecsuamzndxfpir.supabase.co/rest/v1/';
  const SB_KEY = 'sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  const BLACKLIST = ['probe','AUDIT_v11','TEST_DIAGNOSTIC'];
  const VERSION = 'V11';
  console.log('scorepatch '+VERSION+' loaded');

  function istDate(d){ d=d||new Date(); return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  function monthBounds(){
    const now = new Date();
    const ist = new Date(now.getTime()+5.5*3600*1000);
    const y = ist.getUTCFullYear(), m = ist.getUTCMonth()+1;
    const first = y+'-'+String(m).padStart(2,'0')+'-01';
    const nY = m===12?y+1:y, nM = m===12?1:m+1;
    const nextFirst = nY+'-'+String(nM).padStart(2,'0')+'-01';
    return {first, nextFirst, ym: y+'-'+String(m).padStart(2,'0')};
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
  async function countOrders(filter){
    const set = new Set();
    let off=0;
    while(true){
      const rows = await sbGet('sales_shopify?select=order_id'+(filter||'')+'&limit=1000&offset='+off);
      if (!Array.isArray(rows) || rows.length===0) break;
      rows.forEach(r=> set.add(r.order_id));
      if (rows.length<1000) break;
      off += 1000;
    }
    return set.size;
  }
  function inr(n){ if (n>=1e7) return 'INR '+(n/1e7).toFixed(2)+'Cr'; if (n>=1e5) return 'INR '+(n/1e5).toFixed(2)+'L'; if (n>=1000) return 'INR '+(n/1000).toFixed(1)+'K'; return 'INR '+Math.round(n); }
  function rupee(n){ return inr(n).replace('INR ', '₹'); }

  async function loadOverview(){
    const mb = monthBounds();
    const [shop, blink, mt, b2b] = await Promise.all([
      sumPage('sales_shopify','total','&order_date=gte.'+mb.first+'&order_date=lt.'+mb.nextFirst),
      sumPage('sales_blinkit','total_sales','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('sales_mt_office','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('zoho_invoices','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst)
    ]);
    const orders = await countOrders('&order_date=gte.'+mb.first+'&order_date=lt.'+mb.nextFirst);
    const storeTotal = shop+blink+mt+b2b;
    const adsTotal = 0;
    const roas = 0;
    return {mb, storeTotal, adsTotal, orders, roas, shop, blink, mt, b2b};
  }

  function setValue(selParent, labelRe, selLabel, selValue, value){
    document.querySelectorAll(selParent).forEach(card => {
      const lab = card.querySelector(selLabel);
      const val = card.querySelector(selValue);
      if (lab && val && labelRe.test((lab.textContent||'').trim())) val.textContent = value;
    });
  }
  function setKPI(labelText, value, sub){
    document.querySelectorAll('.kpi .label').forEach(l => {
      if ((l.textContent||'').trim()===labelText) {
        const par = l.parentElement;
        if (!par) return;
        const v = par.querySelector('.value');
        const s = par.querySelector('.sub');
        if (v && value!==undefined) v.textContent = value;
        if (s && sub!==undefined) s.textContent = sub;
      }
    });
  }

  async function patchOverview(){
    try {
      const o = await loadOverview();
      setValue('.ov-card', /TOTAL STORE SALES/i, '.ov-label', '.ov-value', rupee(o.storeTotal));
      setValue('.ov-card', /^ORDERS$/i,           '.ov-label', '.ov-value', String(o.orders));
      document.querySelectorAll('.kpi .label').forEach(l => {
        const t = (l.textContent||'').trim();
        const v = l.parentElement && l.parentElement.querySelector('.value');
        if (!v) return;
        if (/TOTAL STORE SALES/i.test(t)) v.textContent = rupee(o.storeTotal);
        else if (/^ORDERS$/i.test(t))      v.textContent = String(o.orders);
      });
      console.log('[sp'+VERSION+'] overview', o);
    } catch(e){ console.error('[sp'+VERSION+'] overview err', e); }
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
      const revSub   = [rShop&&(rupee(rShop)+' Shopify'), rBlink&&(rupee(rBlink)+' Blinkit'), rMt&&(rupee(rMt)+' MT'), rB2b&&(rupee(rB2b)+' B2B')].filter(Boolean).join(' . ') || 'No channel activity today';
      setKPI('Check-ins today', String(chkSet.size), chkSet.size>0 ? chkSet.size+' promoters' : '0 promoters . nobody yet');
      setKPI('Units sold today', unitsTotal>0 ? String(unitsTotal) : '0', unitsSub);
      setKPI('Revenue today', rupee(revTotal), revSub);
      setKPI('Attendance today', String(attSet.size), attSet.size>0 ? attSet.size+' checked in' : 'No one checked in yet');
      console.log('[sp'+VERSION+'] today', {unitsTotal, revTotal, att: attSet.size, chk: chkSet.size});
    } catch(e){ console.error('[sp'+VERSION+'] today err', e); }
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
          if (iAM>=0)   cells[iAM].textContent   = amDays.size;
          if (iPM>=0)   cells[iPM].textContent   = pmDays.size;
          if (iLast>=0) cells[iLast].textContent = lastDate || '-';
          if (iMiss>=0) {
            const expected = Math.floor((Date.now()-new Date(mb.first).getTime())/86400000)+1;
            cells[iMiss].textContent = Math.max(0, expected-allDays.size);
          }
        }
        console.log('[sp'+VERSION+'] scorecard patched');
        break;
      }
    } catch(e){ console.error('[sp'+VERSION+'] scorecard err', e); }
  }

  async function runAll(){
    await patchOverview();
    await patchToday();
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
/* scorepatch V10 - Curio Admin Dashboard live patches */
(function(){
  const SB_URL = 'https://cikyevecsuamzndxfpir.supabase.co/rest/v1/';
  const SB_KEY = 'sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  const BLACKLIST = ['probe','AUDIT_v11','TEST_DIAGNOSTIC'];
  const VERSION = 'V10';
  console.log('scorepatch '+VERSION+' loaded');

  function istDate(d){ d=d||new Date(); return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  function monthBounds(){
    const now = new Date();
    const ist = new Date(now.getTime()+5.5*3600*1000);
    const y = ist.getUTCFullYear(), m = ist.getUTCMonth()+1;
    const first = y+'-'+String(m).padStart(2,'0')+'-01';
    const nY = m===12?y+1:y, nM = m===12?1:m+1;
    const nextFirst = nY+'-'+String(nM).padStart(2,'0')+'-01';
    return {first, nextFirst, ym: y+'-'+String(m).padStart(2,'0')};
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
  async function countOrders(filter){
    const set = new Set();
    let off=0;
    while(true){
      const rows = await sbGet('sales_shopify?select=order_id'+(filter||'')+'&limit=1000&offset='+off);
      if (!Array.isArray(rows) || rows.length===0) break;
      rows.forEach(r=> set.add(r.order_id));
      if (rows.length<1000) break;
      off += 1000;
    }
    return set.size;
  }
  function inr(n){ if (n>=1e7) return 'INR '+(n/1e7).toFixed(2)+'Cr'; if (n>=1e5) return 'INR '+(n/1e5).toFixed(2)+'L'; if (n>=1000) return 'INR '+(n/1000).toFixed(1)+'K'; return 'INR '+Math.round(n); }
  function rupee(n){ return inr(n).replace('INR ', '₹'); }

  async function loadOverview(){
    const mb = monthBounds();
    const [shop, blink, mt, b2b, amz, meta] = await Promise.all([
      sumPage('sales_shopify','total','&order_date=gte.'+mb.first+'&order_date=lt.'+mb.nextFirst),
      sumPage('sales_blinkit','total_sales','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('sales_mt_office','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('zoho_invoices','total','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst),
      sumPage('amazon_ads_live','cost','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst).catch(()=>0),
      sumPage('meta_ads_live','spend','&date=gte.'+mb.first+'&date=lt.'+mb.nextFirst).catch(()=>0)
    ]);
    const orders = await countOrders('&order_date=gte.'+mb.first+'&order_date=lt.'+mb.nextFirst);
    const storeTotal = shop+blink+mt+b2b;
    const adsTotal = amz+meta;
    const roas = adsTotal>0 ? (storeTotal/adsTotal) : 0;
    return {mb, storeTotal, adsTotal, orders, roas, shop, blink, mt, b2b};
  }

  function setKPI(labelText, value, sub){
    document.querySelectorAll('.kpi .label').forEach(l => {
      if ((l.textContent||'').trim()===labelText) {
        const par = l.parentElement;
        if (!par) return;
        const v = par.querySelector('.value');
        const s = par.querySelector('.sub');
        if (v && value!==undefined) v.textContent = value;
        if (s && sub!==undefined) s.textContent = sub;
      }
    });
  }

  async function patchOverview(){
    try {
      const o = await loadOverview();
      document.querySelectorAll('.kpi .label').forEach(l => {
        const t = (l.textContent||'').trim();
        const par = l.parentElement;
        const v = par && par.querySelector('.value');
        if (!v) return;
        if (/TOTAL STORE SALES/i.test(t))           v.textContent = rupee(o.storeTotal);
        else if (/TOTAL ADVERTISING COST/i.test(t)) v.textContent = rupee(o.adsTotal);
        else if (/^ORDERS$/i.test(t))               v.textContent = String(o.orders);
        else if (/BLENDED ROAS/i.test(t))           v.textContent = o.roas>0 ? o.roas.toFixed(2)+'x' : '-';
      });
      console.log('[sp'+VERSION+'] overview', o);
    } catch(e){ console.error('[sp'+VERSION+'] overview err', e); }
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
      const revSub   = [rShop&&(rupee(rShop)+' Shopify'), rBlink&&(rupee(rBlink)+' Blinkit'), rMt&&(rupee(rMt)+' MT'), rB2b&&(rupee(rB2b)+' B2B')].filter(Boolean).join(' . ') || 'No channel activity today';
      setKPI('Check-ins today', String(chkSet.size), chkSet.size>0 ? chkSet.size+' promoters' : '0 promoters . nobody yet');
      setKPI('Units sold today', unitsTotal>0 ? String(unitsTotal) : '0', unitsSub);
      setKPI('Revenue today', rupee(revTotal), revSub);
      setKPI('Attendance today', String(attSet.size), attSet.size>0 ? attSet.size+' checked in' : 'No one checked in yet');
      console.log('[sp'+VERSION+'] today', {unitsTotal, revTotal, att: attSet.size, chk: chkSet.size});
    } catch(e){ console.error('[sp'+VERSION+'] today err', e); }
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
          if (iAM>=0)   cells[iAM].textContent   = amDays.size;
          if (iPM>=0)   cells[iPM].textContent   = pmDays.size;
          if (iLast>=0) cells[iLast].textContent = lastDate || '-';
          if (iMiss>=0) {
            const expected = Math.floor((Date.now()-new Date(mb.first).getTime())/86400000)+1;
            cells[iMiss].textContent = Math.max(0, expected-allDays.size);
          }
        }
        console.log('[sp'+VERSION+'] scorecard patched');
        break;
      }
    } catch(e){ console.error('[sp'+VERSION+'] scorecard err', e); }
  }

  async function runAll(){
    await patchOverview();
    await patchToday();
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
