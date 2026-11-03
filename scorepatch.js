// SCOREPATCH_PROMOTER_CHECKINS_V5
(function(){
  var SB='https://cikyevecsuamzndxfpir.supabase.co';
  var KEY='sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  var BLACKLIST={'probe':1,'AUDIT_v11':1,'TEST_DIAGNOSTIC':1,'test':1,'TEST':1};
  var CACHE=null, CACHE_T=0;
  function istDateStr(d){ return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  async function loadData(){
    if (CACHE && (Date.now()-CACHE_T)<300000) return CACHE;
    var out={}, off=0;
    while(off<20000){
      var r = await fetch(SB+'/rest/v1/promoter_checkins?select=promoter,date,time_str,timestamp&limit=1000&offset='+off,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
      var page = await r.json();
      if (!Array.isArray(page)||!page.length) break;
      page.forEach(function(rec){
        var k=rec.promoter; if(!k) return;
        if (BLACKLIST[k]) return;
        if (!out[k]) out[k]={allDays:new Set(), last:null, am:0, pm:0, perDay:{}, thisMonthDays:new Set()};
        if (rec.date) {
          out[k].allDays.add(rec.date);
          var now=new Date(), ym=istDateStr(now).slice(0,7);
          if (rec.date.slice(0,7)===ym) out[k].thisMonthDays.add(rec.date);
          if (!out[k].perDay[rec.date]) out[k].perDay[rec.date] = {am:0, pm:0};
        }
        if (!out[k].last || rec.timestamp>out[k].last) out[k].last=rec.timestamp;
        var h=null;
        if (rec.time_str && /^\d{1,2}/.test(rec.time_str)) h=parseInt(rec.time_str.split(':')[0]);
        else if (rec.timestamp) h=new Date(rec.timestamp).getHours();
        if (h!=null){
          if (h<14) out[k].am++;
          else out[k].pm++;
          if (rec.date && out[k].perDay[rec.date]){
            if (h<14) out[k].perDay[rec.date].am++;
            else out[k].perDay[rec.date].pm++;
          }
        }
      });
      if (page.length<1000) break;
      off+=1000;
    }
    CACHE=out; CACHE_T=Date.now();
    return out;
  }
  function elapsedMonthDays(){ var now=new Date(); return parseInt(istDateStr(now).slice(8,10),10); }
  function hasCol(hdrs, re){ for (var i=0;i<hdrs.length;i++) if (re.test(hdrs[i])) return i; return -1; }
  function findTable(filter){
    var tables=document.querySelectorAll('table');
    for (var i=0;i<tables.length;i++){
      var th=tables[i].querySelectorAll('thead th');
      var names=[]; for (var j=0;j<th.length;j++) names.push(th[j].textContent.trim());
      if (filter(names)) return {table: tables[i], hdrs: names};
    }
    return null;
  }
  async function patchScorecard(data){
    var t = findTable(function(n){ return hasCol(n,/Days active/)>=0 && hasCol(n,/AM \/ PM/)>=0 && hasCol(n,/Last active/)>=0; });
    if (!t) return;
    var table = t.table, hdrs = t.hdrs;
    if (table.dataset.spPatched==='5' && (Date.now()-parseInt(table.dataset.spTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Promoter$/), iD=hasCol(hdrs,/Days active/), iA=hasCol(hdrs,/AM \/ PM/), iL=hasCol(hdrs,/Last active/);
    var iOL=hasCol(hdrs,/On leave|Missed/);
    if (iOL>=0 && /On leave/.test(hdrs[iOL]) && table.querySelectorAll('thead th')[iOL].dataset.renamed!=='1'){
      var th=table.querySelectorAll('thead th')[iOL]; th.textContent='Missed (mo)'; th.title='Working days this month without a check-in'; th.dataset.renamed='1';
    }
    var elapsed = elapsedMonthDays();
    Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
      var tds=tr.querySelectorAll('td'); if (!tds.length) return;
      var name=(tds[iN]&&tds[iN].textContent||'').replace(/^[^A-Za-z]+/,'').trim();
      var d=data[name]; if (!d) return;
      if (tds[iD]) tds[iD].textContent=d.allDays.size;
      if (tds[iA]) tds[iA].textContent=d.am+' / '+d.pm;
      if (tds[iL] && d.last) tds[iL].textContent=new Date(d.last).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
      if (iOL>=0 && tds[iOL]) {
        var missed = Math.max(0, elapsed - d.thisMonthDays.size);
        tds[iOL].textContent = missed;
      }
    });
    table.dataset.spPatched='5'; table.dataset.spTs=String(Date.now());
  }
  async function patchMonthlySummary(data){
    var t = findTable(function(n){ return hasCol(n,/^Promoter$/)>=0 && hasCol(n,/Attendance %/)>=0 && hasCol(n,/Full days/)>=0; });
    if (!t) return;
    var table = t.table, hdrs = t.hdrs;
    if (table.dataset.spSumPatched==='5' && (Date.now()-parseInt(table.dataset.spSumTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Promoter$/), iFull=hasCol(hdrs,/Full days/), iHalf=hasCol(hdrs,/Half days/), iLeave=hasCol(hdrs,/On leave/), iAbs=hasCol(hdrs,/Absent/), iPct=hasCol(hdrs,/Attendance %/);
    var elapsed = elapsedMonthDays();
    var now = new Date(); var ym = istDateStr(now).slice(0,7);
    var tbody = table.querySelector('tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    Object.keys(data).forEach(function(name){
      var d = data[name];
      var full=0, half=0;
      Object.keys(d.perDay).forEach(function(date){
        if (date.slice(0,7) !== ym) return;
        var day = d.perDay[date];
        if (day.am>0 && day.pm>0) full++;
        else if (day.am>0 || day.pm>0) half++;
      });
      var leave = 0;
      var absent = Math.max(0, elapsed - full - half - leave);
      var pct = elapsed>0 ? Math.round((full + 0.5*half) / elapsed * 100) : 0;
      var tr = document.createElement('tr');
      var cells = [];
      for (var i=0;i<hdrs.length;i++) cells.push('<td>-</td>');
      if (iN>=0) cells[iN] = '<td><strong>'+name+'</strong></td>';
      if (iFull>=0) cells[iFull] = '<td>'+full+'</td>';
      if (iHalf>=0) cells[iHalf] = '<td>'+half+'</td>';
      if (iLeave>=0) cells[iLeave] = '<td>'+leave+'</td>';
      if (iAbs>=0) cells[iAbs] = '<td>'+absent+'</td>';
      if (iPct>=0) cells[iPct] = '<td>'+pct+'%</td>';
      tr.innerHTML = cells.join('');
      tbody.appendChild(tr);
    });
    table.dataset.spSumPatched='5'; table.dataset.spSumTs=String(Date.now());
  }
  async function patch(){
    try {
      var data = await loadData();
      await patchScorecard(data);
      await patchMonthlySummary(data);
    } catch(e){ console.warn('[scorepatch v5]', e); }
  }
  var t;
  var run=function(){ clearTimeout(t); t=setTimeout(patch, 500); };
  if (document.body) new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded', function(){ new MutationObserver(run).observe(document.body,{childList:true,subtree:true}); run(); });
  run();
})();
