// SCOREPATCH_PROMOTER_CHECKINS_V7
(function(){
  var SB='https://cikyevecsuamzndxfpir.supabase.co';
  var KEY='sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  var BL={'probe':1,'AUDIT_v11':1,'TEST_DIAGNOSTIC':1,'test':1,'TEST':1};
  var H = {apikey:KEY, Authorization:'Bearer '+KEY};
  var C_P=null,C_P_T=0,C_A=null,C_A_T=0,C_O=null,C_O_T=0;
  function istDateStr(d){ return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  function todayIST(){ return istDateStr(new Date()); }
  function monthBounds(){ var t=todayIST(), ym=t.slice(0,7); return {first:ym+'-01',last:ym+'-31',ym:ym}; }
  function fmtINR(n){
    if (n==null||isNaN(n)) return '₹0';
    if (n>=10000000) return '₹'+(n/10000000).toFixed(2)+'Cr';
    if (n>=100000) return '₹'+(n/100000).toFixed(2)+'L';
    if (n>=1000) return '₹'+Math.round(n/1000)+'K';
    return '₹'+Math.round(n);
  }
  async function sbq(path){ return (await fetch(SB+'/rest/v1/'+path,{headers:H})).json(); }
  async function sumPage(table, col, filter){
    var out=0, off=0;
    while(off<20000){
      var p=await sbq(table+'?select='+col+'&'+filter+'&limit=1000&offset='+off);
      if (!Array.isArray(p)||!p.length) break;
      out += p.reduce(function(s,r){return s+(Number(r[col])||0);},0);
      if (p.length<1000) break; off+=1000;
    }
    return out;
  }
  async function countOrders(filter){
    var seen=new Set(), off=0;
    while(off<20000){
      var p=await sbq('sales_shopify?select=order_id&'+filter+'&limit=1000&offset='+off);
      if (!Array.isArray(p)||!p.length) break;
      p.forEach(function(r){ seen.add(r.order_id); });
      if (p.length<1000) break; off+=1000;
    }
    return seen.size;
  }
  async function loadOverview(){
    if (C_O && (Date.now()-C_O_T)<120000) return C_O;
    var mb=monthBounds(), t=todayIST();
    var monthF='date=gte.'+mb.first+'&date=lte.'+mb.last;
    var shopMo='order_date=gte.'+mb.first+'&order_date=lte.'+mb.last;
    var shopMtd=await sumPage('sales_shopify','total',shopMo);
    var shopOrdersMtd=await countOrders(shopMo);
    var blMtd=await sumPage('sales_blinkit','net_sales',monthF);
    var blAds=await sumPage('sales_blinkit','ad_spend',monthF);
    var mtMtd=await sumPage('sales_mt_office','revenue',monthF);
    var b2bMtd=await sumPage('zoho_invoices','total',monthF);
    C_O = {
      storeSales: shopMtd+blMtd+mtMtd+b2bMtd,
      ads: blAds,
      orders: shopOrdersMtd,
      bk: {shop:shopMtd, bl:blMtd, mt:mtMtd, b2b:b2bMtd}
    };
    C_O_T=Date.now();
    return C_O;
  }
  function setSibling(labelRe, text, title){
    Array.from(document.querySelectorAll('*')).filter(function(e){
      return e.offsetParent && e.childElementCount===0 && labelRe.test(e.textContent.trim());
    }).forEach(function(h){
      var sib=h.nextElementSibling; if(!sib) return;
      if (sib.dataset.spOv==='1' && sib.textContent.trim()===text) return;
      sib.textContent=text; sib.dataset.spOv='1'; if (title) sib.title=title;
    });
  }
  async function patchOverview(){
    try {
      var o=await loadOverview();
      var roas = o.ads>0 ? (o.storeSales/o.ads).toFixed(2)+'x' : '—';
      setSibling(/^TOTAL STORE SALES( ·|$)/, fmtINR(o.storeSales), 'Shopify '+fmtINR(o.bk.shop)+' + Blinkit '+fmtINR(o.bk.bl)+' + MT '+fmtINR(o.bk.mt)+' + B2B '+fmtINR(o.bk.b2b));
      setSibling(/^TOTAL ADVERTISING COST( ·|$)/, fmtINR(o.ads), 'Blinkit ads only; Meta/Amazon not aggregated yet');
      setSibling(/^ORDERS$/, String(o.orders), 'Shopify orders this month');
      setSibling(/^BLENDED ROAS$/, roas);
      setSibling(/^ROAS$/, roas);
    } catch(e){ console.warn('[overview]',e); }
  }
  // Promoter + attendance patches from v6
  async function loadPromoters(){
    if (C_P && (Date.now()-C_P_T)<300000) return C_P;
    var out={},off=0;
    while(off<20000){
      var p=await sbq('promoter_checkins?select=promoter,date,time_str,timestamp&limit=1000&offset='+off);
      if (!Array.isArray(p)||!p.length) break;
      p.forEach(function(rec){
        var k=rec.promoter; if(!k||BL[k]) return;
        if (!out[k]) out[k]={allDays:new Set(),last:null,am:0,pm:0,perDay:{},thisMonthDays:new Set()};
        if (rec.date){
          out[k].allDays.add(rec.date);
          if (rec.date.slice(0,7)===todayIST().slice(0,7)) out[k].thisMonthDays.add(rec.date);
          if (!out[k].perDay[rec.date]) out[k].perDay[rec.date]={am:0,pm:0};
        }
        if (!out[k].last||rec.timestamp>out[k].last) out[k].last=rec.timestamp;
        var h=null;
        if (rec.time_str && /^\d{1,2}/.test(rec.time_str)) h=parseInt(rec.time_str.split(':')[0]);
        else if (rec.timestamp) h=new Date(rec.timestamp).getHours();
        if (h!=null){ if (h<14) out[k].am++; else out[k].pm++; if (rec.date && out[k].perDay[rec.date]){ if (h<14) out[k].perDay[rec.date].am++; else out[k].perDay[rec.date].pm++; } }
      });
      if (p.length<1000) break; off+=1000;
    }
    C_P=out; C_P_T=Date.now(); return out;
  }
  async function loadAttendance(){
    if (C_A && (Date.now()-C_A_T)<120000) return C_A;
    var out={},off=0;
    while(off<10000){
      var p=await sbq('attendance_log?select=employee,date,timestamp,status,check_in_time,check_out_time,site,distance_from_site_m&order=timestamp.desc&limit=1000&offset='+off);
      if (!Array.isArray(p)||!p.length) break;
      p.forEach(function(rec){
        var emp=rec.employee; if (!emp||!rec.date) return;
        if (!out[emp]) out[emp]={};
        if (!out[emp][rec.date]) out[emp][rec.date]=rec;
        else if (rec.timestamp<out[emp][rec.date].timestamp){ out[emp][rec.date]._latest=out[emp][rec.date].timestamp; out[emp][rec.date].timestamp=rec.timestamp; }
        else if (!out[emp][rec.date]._latest||rec.timestamp>out[emp][rec.date]._latest){ out[emp][rec.date]._latest=rec.timestamp; }
      });
      if (p.length<1000) break; off+=1000;
    }
    C_A=out; C_A_T=Date.now(); return out;
  }
  function hasCol(h,re){ for (var i=0;i<h.length;i++) if (re.test(h[i])) return i; return -1; }
  function findTable(fn){
    var tt=document.querySelectorAll('table');
    for (var i=0;i<tt.length;i++){
      var th=tt[i].querySelectorAll('thead th'), names=[];
      for (var j=0;j<th.length;j++) names.push(th[j].textContent.trim());
      if (fn(names)) return {table:tt[i],hdrs:names};
    }
    return null;
  }
  function elapsedMonthDays(){ return parseInt(todayIST().slice(8,10),10); }
  function hms(ts){ if(!ts) return '—'; try{return new Date(ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'});}catch(e){return '—';} }
  async function patchScorecard(d){
    var t=findTable(function(n){return hasCol(n,/Days active/)>=0&&hasCol(n,/AM \/ PM/)>=0&&hasCol(n,/Last active/)>=0;});
    if(!t) return;
    var table=t.table,hdrs=t.hdrs;
    if(table.dataset.spPatched==='7'&&(Date.now()-parseInt(table.dataset.spTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Promoter$/),iD=hasCol(hdrs,/Days active/),iA=hasCol(hdrs,/AM \/ PM/),iL=hasCol(hdrs,/Last active/),iOL=hasCol(hdrs,/On leave|Missed/);
    if (iOL>=0&&/On leave/.test(hdrs[iOL])&&table.querySelectorAll('thead th')[iOL].dataset.renamed!=='1'){
      var th=table.querySelectorAll('thead th')[iOL]; th.textContent='Missed (mo)'; th.title='Working days this month without a check-in'; th.dataset.renamed='1';
    }
    var elapsed=elapsedMonthDays();
    Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
      var tds=tr.querySelectorAll('td'); if(!tds.length) return;
      var name=(tds[iN]&&tds[iN].textContent||'').replace(/^[^A-Za-z]+/,'').trim();
      var dd=d[name]; if(!dd) return;
      if (tds[iD]) tds[iD].textContent=dd.allDays.size;
      if (tds[iA]) tds[iA].textContent=dd.am+' / '+dd.pm;
      if (tds[iL]&&dd.last) tds[iL].textContent=new Date(dd.last).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
      if (iOL>=0&&tds[iOL]) tds[iOL].textContent=Math.max(0,elapsed-dd.thisMonthDays.size);
    });
    table.dataset.spPatched='7'; table.dataset.spTs=String(Date.now());
  }
  async function patchMonthlySummary(d){
    var t=findTable(function(n){return hasCol(n,/^Promoter$/)>=0&&hasCol(n,/Attendance %/)>=0&&hasCol(n,/Full days/)>=0;});
    if(!t) return;
    var table=t.table,hdrs=t.hdrs;
    if(table.dataset.spSumPatched==='7'&&(Date.now()-parseInt(table.dataset.spSumTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Promoter$/),iFull=hasCol(hdrs,/Full days/),iHalf=hasCol(hdrs,/Half days/),iLeave=hasCol(hdrs,/On leave/),iAbs=hasCol(hdrs,/Absent/),iPct=hasCol(hdrs,/Attendance %/);
    var elapsed=elapsedMonthDays(), ym=todayIST().slice(0,7);
    var tbody=table.querySelector('tbody'); if(!tbody) return;
    tbody.innerHTML='';
    Object.keys(d).forEach(function(name){
      var dd=d[name], full=0, half=0;
      Object.keys(dd.perDay).forEach(function(date){ if (date.slice(0,7)!==ym) return; var day=dd.perDay[date]; if (day.am>0&&day.pm>0) full++; else if (day.am>0||day.pm>0) half++; });
      var leave=0, absent=Math.max(0,elapsed-full-half-leave);
      var pct=elapsed>0?Math.round((full+0.5*half)/elapsed*100):0;
      var tr=document.createElement('tr'), cells=[];
      for (var i=0;i<hdrs.length;i++) cells.push('<td>-</td>');
      if (iN>=0) cells[iN]='<td><strong>'+name+'</strong></td>';
      if (iFull>=0) cells[iFull]='<td>'+full+'</td>';
      if (iHalf>=0) cells[iHalf]='<td>'+half+'</td>';
      if (iLeave>=0) cells[iLeave]='<td>'+leave+'</td>';
      if (iAbs>=0) cells[iAbs]='<td>'+absent+'</td>';
      if (iPct>=0) cells[iPct]='<td>'+pct+'%</td>';
      tr.innerHTML=cells.join(''); tbody.appendChild(tr);
    });
    table.dataset.spSumPatched='7'; table.dataset.spSumTs=String(Date.now());
  }
  async function patchTodayAttendance(att){
    var t=findTable(function(n){return hasCol(n,/^Employee$/)>=0&&hasCol(n,/Check-IN/)>=0&&hasCol(n,/Check-OUT/)>=0;});
    if(!t) return;
    var table=t.table,hdrs=t.hdrs;
    if(table.dataset.spTodayPatched==='7'&&(Date.now()-parseInt(table.dataset.spTodayTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Employee$/),iStat=hasCol(hdrs,/^Status$/),iIn=hasCol(hdrs,/Check-IN/),iOut=hasCol(hdrs,/Check-OUT/),iSite=hasCol(hdrs,/Site|Distance/);
    var today=todayIST();
    Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
      var tds=tr.querySelectorAll('td'); if(!tds.length) return;
      var nameEl=tds[iN].querySelector('b');
      var name=(nameEl?nameEl.textContent:tds[iN].textContent||'').trim();
      var rec=att[name]&&att[name][today]; if(!rec) return;
      if (tds[iStat]) tds[iStat].textContent=rec.status||'PRESENT';
      if (tds[iIn]) tds[iIn].textContent=rec.check_in_time||hms(rec.timestamp);
      if (tds[iOut]) tds[iOut].textContent=rec.check_out_time||(rec._latest?hms(rec._latest):'—');
      if (tds[iSite]&&(rec.site||rec.distance_from_site_m!=null)) tds[iSite].textContent=(rec.site||'')+(rec.distance_from_site_m!=null?' · '+Math.round(rec.distance_from_site_m)+'m':'');
    });
    table.dataset.spTodayPatched='7'; table.dataset.spTodayTs=String(Date.now());
  }
  async function patch(){
    try {
      var p=await loadPromoters();
      await patchScorecard(p);
      await patchMonthlySummary(p);
      var a=await loadAttendance();
      await patchTodayAttendance(a);
      await patchOverview();
    } catch(e){ console.warn('[scorepatch v7]',e); }
  }
  var t;
  var run=function(){ clearTimeout(t); t=setTimeout(patch,600); };
  if (document.body) new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded',function(){new MutationObserver(run).observe(document.body,{childList:true,subtree:true});run();});
  run();
})();
