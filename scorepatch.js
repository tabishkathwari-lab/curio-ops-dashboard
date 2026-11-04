// SCOREPATCH_PROMOTER_CHECKINS_V6
// Patches: Promoters scorecard, Promoter monthly summary, AND Attendance "today" table from Supabase
(function(){
  var SB='https://cikyevecsuamzndxfpir.supabase.co';
  var KEY='sb_publishable_GOTgzhOGd5ZEhwRFqJhDOQ_LEAmPkRH';
  var BLACKLIST={'probe':1,'AUDIT_v11':1,'TEST_DIAGNOSTIC':1,'test':1,'TEST':1};
  var CACHE_P=null, CACHE_P_T=0;
  var CACHE_A=null, CACHE_A_T=0;
  function istDateStr(d){ return new Date(d.getTime()+5.5*3600*1000).toISOString().slice(0,10); }
  function todayIST(){ return istDateStr(new Date()); }
  function hms(ts){ if (!ts) return '—'; try{ return new Date(ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}); }catch(e){ return '—'; } }
  async function loadPromoters(){
    if (CACHE_P && (Date.now()-CACHE_P_T)<300000) return CACHE_P;
    var out={}, off=0;
    while(off<20000){
      var r = await fetch(SB+'/rest/v1/promoter_checkins?select=promoter,date,time_str,timestamp&limit=1000&offset='+off,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
      var page = await r.json();
      if (!Array.isArray(page)||!page.length) break;
      page.forEach(function(rec){
        var k=rec.promoter; if(!k||BLACKLIST[k]) return;
        if (!out[k]) out[k]={allDays:new Set(), last:null, am:0, pm:0, perDay:{}, thisMonthDays:new Set()};
        if (rec.date) {
          out[k].allDays.add(rec.date);
          var ym=istDateStr(new Date()).slice(0,7);
          if (rec.date.slice(0,7)===ym) out[k].thisMonthDays.add(rec.date);
          if (!out[k].perDay[rec.date]) out[k].perDay[rec.date] = {am:0, pm:0};
        }
        if (!out[k].last || rec.timestamp>out[k].last) out[k].last=rec.timestamp;
        var h=null;
        if (rec.time_str && /^\d{1,2}/.test(rec.time_str)) h=parseInt(rec.time_str.split(':')[0]);
        else if (rec.timestamp) h=new Date(rec.timestamp).getHours();
        if (h!=null){
          if (h<14) out[k].am++; else out[k].pm++;
          if (rec.date && out[k].perDay[rec.date]){
            if (h<14) out[k].perDay[rec.date].am++; else out[k].perDay[rec.date].pm++;
          }
        }
      });
      if (page.length<1000) break;
      off+=1000;
    }
    CACHE_P=out; CACHE_P_T=Date.now();
    return out;
  }
  async function loadAttendance(){
    if (CACHE_A && (Date.now()-CACHE_A_T)<120000) return CACHE_A;
    var out={}, off=0;
    while(off<10000){
      var r = await fetch(SB+'/rest/v1/attendance_log?select=employee,date,timestamp,status,check_in_time,check_out_time,site,distance_from_site_m&order=timestamp.desc&limit=1000&offset='+off,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});
      var page = await r.json();
      if (!Array.isArray(page)||!page.length) break;
      page.forEach(function(rec){
        var emp = rec.employee; if (!emp) return;
        var date = rec.date; if (!date) return;
        if (!out[emp]) out[emp]={};
        if (!out[emp][date]) out[emp][date] = rec;
        else {
          // keep earliest check-in for that day (for IN time)
          if (rec.timestamp < out[emp][date].timestamp) {
            // preserve latest for OUT by storing both
            out[emp][date]._latest = out[emp][date].timestamp;
            out[emp][date].timestamp = rec.timestamp;
          } else if (!out[emp][date]._latest || rec.timestamp > out[emp][date]._latest) {
            out[emp][date]._latest = rec.timestamp;
          }
        }
      });
      if (page.length<1000) break;
      off+=1000;
    }
    CACHE_A=out; CACHE_A_T=Date.now();
    return out;
  }
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
  function elapsedMonthDays(){ return parseInt(todayIST().slice(8,10),10); }
  async function patchScorecard(data){
    var t = findTable(function(n){ return hasCol(n,/Days active/)>=0 && hasCol(n,/AM \/ PM/)>=0 && hasCol(n,/Last active/)>=0; });
    if (!t) return;
    var table = t.table, hdrs = t.hdrs;
    if (table.dataset.spPatched==='6' && (Date.now()-parseInt(table.dataset.spTs||'0',10))<30000) return;
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
      if (iOL>=0 && tds[iOL]) tds[iOL].textContent = Math.max(0, elapsed - d.thisMonthDays.size);
    });
    table.dataset.spPatched='6'; table.dataset.spTs=String(Date.now());
  }
  async function patchMonthlySummary(data){
    var t = findTable(function(n){ return hasCol(n,/^Promoter$/)>=0 && hasCol(n,/Attendance %/)>=0 && hasCol(n,/Full days/)>=0; });
    if (!t) return;
    var table = t.table, hdrs = t.hdrs;
    if (table.dataset.spSumPatched==='6' && (Date.now()-parseInt(table.dataset.spSumTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Promoter$/), iFull=hasCol(hdrs,/Full days/), iHalf=hasCol(hdrs,/Half days/), iLeave=hasCol(hdrs,/On leave/), iAbs=hasCol(hdrs,/Absent/), iPct=hasCol(hdrs,/Attendance %/);
    var elapsed = elapsedMonthDays();
    var ym = todayIST().slice(0,7);
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
    table.dataset.spSumPatched='6'; table.dataset.spSumTs=String(Date.now());
  }
  async function patchTodayAttendance(attData){
    var t = findTable(function(n){ return hasCol(n,/^Employee$/)>=0 && hasCol(n,/Check-IN/)>=0 && hasCol(n,/Check-OUT/)>=0; });
    if (!t) return;
    var table = t.table, hdrs = t.hdrs;
    if (table.dataset.spTodayPatched==='6' && (Date.now()-parseInt(table.dataset.spTodayTs||'0',10))<30000) return;
    var iN=hasCol(hdrs,/^Employee$/), iStat=hasCol(hdrs,/^Status$/), iIn=hasCol(hdrs,/Check-IN/), iOut=hasCol(hdrs,/Check-OUT/), iSite=hasCol(hdrs,/Site|Distance/);
    var today = todayIST();
    Array.from(table.querySelectorAll('tbody tr')).forEach(function(tr){
      var tds=tr.querySelectorAll('td'); if (!tds.length) return;
      var nameEl = tds[iN].querySelector('b');
      var name = (nameEl ? nameEl.textContent : tds[iN].textContent||'').trim();
      var rec = attData[name] && attData[name][today];
      if (!rec) return;
      if (tds[iStat]) tds[iStat].textContent = rec.status || 'PRESENT';
      if (tds[iIn]) tds[iIn].textContent = rec.check_in_time ? rec.check_in_time : hms(rec.timestamp);
      if (tds[iOut]) tds[iOut].textContent = rec.check_out_time ? rec.check_out_time : (rec._latest ? hms(rec._latest) : '—');
      if (tds[iSite] && (rec.site || rec.distance_from_site_m != null)) {
        tds[iSite].textContent = (rec.site||'') + (rec.distance_from_site_m!=null ? ' · '+Math.round(rec.distance_from_site_m)+'m' : '');
      }
    });
    table.dataset.spTodayPatched='6'; table.dataset.spTodayTs=String(Date.now());
  }
  async function patch(){
    try {
      var promData = await loadPromoters();
      await patchScorecard(promData);
      await patchMonthlySummary(promData);
      var attData = await loadAttendance();
      await patchTodayAttendance(attData);
    } catch(e){ console.warn('[scorepatch v6]', e); }
  }
  var t;
  var run=function(){ clearTimeout(t); t=setTimeout(patch, 500); };
  if (document.body) new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
  else document.addEventListener('DOMContentLoaded', function(){ new MutationObserver(run).observe(document.body,{childList:true,subtree:true}); run(); });
  run();
})();
