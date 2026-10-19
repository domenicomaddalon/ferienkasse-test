import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase/project-config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'implicit',storageKey:'ferienkasse.v1.3.auth.test',detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let selected=null, people=[], editingExpenseId=null, splits=[], payments=[], categories=[], rates=[];
let realtimeChannel=null,realtimeTripId=null,realtimeTimer=null,realtimeLoading=false,realtimeQueued=false;

let activeView='expenses',reportExpenses=[];
function showView(view){
 if(!['expenses','new','balances','payments','people','categories','rates'].includes(view))return;
 activeView=view;
 for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==view;
 for(const button of document.querySelectorAll('[data-view]')){
  const active=button.dataset.view===view;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 }
}
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>showView(button.dataset.view));
showView('expenses');
$('newExpense').addEventListener('click',()=>showView('new'));
$('toggleExpenses').addEventListener('click',()=>{const list=$('expenses');list.hidden=!list.hidden;$('toggleExpenses').textContent=list.hidden?'Erfasste Ausgaben anzeigen':'Erfasste Ausgaben ausblenden';$('toggleExpenses').setAttribute('aria-expanded',String(!list.hidden));});
function printReport(){
 if(!selected)return;
 const area=$('printArea');area.replaceChildren();
 const add=(tag,value,parent=area,cls='')=>{const el=document.createElement(tag);el.textContent=String(value);if(cls)el.className=cls;parent.append(el);return el;};
 const money=c=>(c/100).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+selected.currency;
 const name=id=>people.find(p=>p.id===id)?.name||'Unbekannt';
 const table=(headers,rows)=>{
  const t=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
  for(const title of headers)add('th',title,tr);
  thead.append(tr);t.append(thead);const tbody=document.createElement('tbody');
  for(const values of rows){const row=document.createElement('tr');for(const value of values)add('td',value,row);tbody.append(row);}
  t.append(tbody);area.append(t);
 };
 const expenses=reportExpenses;
 const total=expenses.reduce((sum,e)=>sum+e.amount_cents,0);
 const byCategory=new Map(),byPayer=new Map();
 for(const e of expenses){
  const category=e.category||'Diverses';
  byCategory.set(category,(byCategory.get(category)||0)+e.amount_cents);
  const payer=name(e.person_id);byPayer.set(payer,(byPayer.get(payer)||0)+e.amount_cents);
 }
 const colors=['#176f86','#3c86b1','#e7a94b','#568b66','#9a70b3','#cc6f67','#6989a1','#b5a05a','#777d90'];
 const breakdown=(title,entries,chartType)=>{
  add('h2',title);
  if(!entries.length){add('p','Keine Ausgaben vorhanden.');return;}
  const section=document.createElement('div');section.className='report-chart';area.append(section);
  const max=Math.max(...entries.map(x=>x[1]),1);
  const totalAmount=entries.reduce((sum,x)=>sum+x[1],0);
  if(chartType==='donut'&&totalAmount>0){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 180 180');svg.setAttribute('role','img');svg.setAttribute('aria-label','Kategorienanteile als Kreisdiagramm');svg.classList.add('report-donut');
   let offset=0;
   entries.forEach(([label,value],i)=>{
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx','90');circle.setAttribute('cy','90');circle.setAttribute('r','65');
    circle.setAttribute('fill','none');circle.setAttribute('stroke',colors[i%colors.length]);
    circle.setAttribute('stroke-width','28');circle.setAttribute('pathLength','100');
    circle.setAttribute('stroke-dasharray',(value/totalAmount*100)+' '+(100-value/totalAmount*100));
    circle.setAttribute('stroke-dashoffset',String(-offset));
    circle.setAttribute('transform','rotate(-90 90 90)');
    svg.append(circle);offset+=value/totalAmount*100;
   });
   const center=document.createElementNS('http://www.w3.org/2000/svg','text');
   center.setAttribute('x','90');center.setAttribute('y','91');center.setAttribute('text-anchor','middle');
   center.setAttribute('font-size','15');center.setAttribute('font-weight','bold');center.setAttribute('fill','#17324d');
   center.textContent='100 %';svg.append(center);section.append(svg);
  }
  const rows=add('div','',section,'report-chart-rows');
  entries.forEach(([label,value],i)=>{
   const row=add('div','',rows,'report-chart-row');
   const top=add('div','',row,'report-chart-label');
   const left=add('span',label,top);
   left.style.borderLeft='9px solid '+colors[i%colors.length];left.style.paddingLeft='7px';
   add('strong',money(value)+' · '+(totalAmount? (value/totalAmount*100).toLocaleString('de-CH',{maximumFractionDigits:1}):'0')+' %',top);
   const track=add('div','',row,'report-chart-track');
   const bar=add('div','',track,'report-chart-bar');
   bar.style.width=(value/max*100)+'%';bar.style.backgroundColor=colors[i%colors.length];
  });
 };
 add('h1','Ferienkasse · '+selected.name);
 add('p','Abrechnung in '+selected.currency+' · '+new Date().toLocaleDateString('de-CH'),area,'report-meta');
 const stats=add('div','',area,'report-summary');
 const summary=(title,value)=>{const block=add('div','',stats,'report-summary-item');add('span',title,block);add('strong',value,block);};
 summary('Gesamtausgaben',money(total));summary('Ausgaben',expenses.length);summary('Teilnehmende',people.length);
 const categoryEntries=[...byCategory].sort((a,b)=>b[1]-a[1]);
 const payerEntries=[...byPayer].sort((a,b)=>b[1]-a[1]);
 breakdown('Ausgaben nach Kategorien',categoryEntries,'donut');
 breakdown('Ausgaben nach zahlender Person',payerEntries,'bar');
 add('h2','Einzelne Ausgaben');
 table(['Datum','Beschreibung','Kategorie','Bezahlt von','Betrag','Kostenaufteilung'],expenses.map(e=>{
  const portions=splits.filter(x=>x.expense_id===e.id);
  return [e.expense_date,e.description,e.category||'Diverses',name(e.person_id),money(e.amount_cents)+(e.original_currency&&e.original_currency!==selected.currency?' (Original: '+(e.original_amount_cents/100).toFixed(2)+' '+e.original_currency+', Kurs '+e.exchange_rate+')':''),portions.length?portions.map(p=>name(p.person_id)+': '+money(p.amount_cents)).join('; '):'Nicht zugeordnet'];
 }));
 const balance=new Map(people.map(p=>[p.id,{paid:0,share:0}]));
 let excluded=0;
 for(const e of expenses){
  const portions=splits.filter(x=>x.expense_id===e.id);
  if(!portions.length||portions.reduce((sum,x)=>sum+x.amount_cents,0)!==e.amount_cents||!balance.has(e.person_id)||portions.some(x=>!balance.has(x.person_id))){excluded+=e.amount_cents;continue;}
  balance.get(e.person_id).paid+=e.amount_cents;
  for(const p of portions)balance.get(p.person_id).share+=p.amount_cents;
 }
 for(const p of payments)if(balance.has(p.from_person_id)&&balance.has(p.to_person_id)){
  balance.get(p.from_person_id).paid+=p.amount_cents;balance.get(p.to_person_id).paid-=p.amount_cents;
 }
 add('h2','Salden pro Person');
 if(excluded)add('p','Hinweis: '+money(excluded)+' ohne gültige Kostenaufteilung sind in den Salden nicht berücksichtigt.');
 table(['Person','Netto bezahlt inkl. Ausgleich','Kostenanteil','Offener Saldo'],people.map(p=>{
  const b=balance.get(p.id);return[p.name,money(b.paid),money(b.share),money(b.paid-b.share)];
 }));
 add('h2','Offene Ausgleichszahlungen');
 const suggested=Array.from($('settlements').querySelectorAll('.item')).map(el=>[el.querySelector('strong')?.textContent||'',el.querySelector('.sub')?.textContent||'']);
 table(['Überweisung','Betrag'],suggested);
 add('h2','Bereits erfasste Ausgleichszahlungen');
 table(['Datum','Von','An','Betrag'],payments.map(p=>[p.paid_on,name(p.from_person_id),name(p.to_person_id),money(p.amount_cents)]));
 window.print();
}
$('pdfBtn').addEventListener('click',printReport);


/* v20: sichere lokale Vorschau von 1.2.1-JSON; keine Datenbank-Schreibzugriffe */
let importBackup=null;
const importFile=$('importFile'),importTrip=$('importTrip'),importPreview=$('importPreview');
const previewMoney=(c,cur)=>(c/100).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+cur;
function renderImportPreview(){
 $('importExecute').disabled=true;$('importStatus').textContent='';
 importPreview.replaceChildren();
 const trip=importBackup?.trips?.[Number(importTrip.value)];
 if(!trip)return;
 const info=document.createElement('div');info.className='import-review';importPreview.append(info);
 const add=(label,value)=>{const p=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';p.append(b,document.createTextNode(String(value)));info.append(p);};
 const names=new Set(trip.people.map(p=>p.id));
 const invalid=trip.expenses.filter(e=>!names.has(e.payer)||!Array.isArray(e.shares)||!e.shares.length||e.shares.some(id=>!names.has(id))||new Set(e.shares).size!==e.shares.length||!Number.isSafeInteger(e.amount)||e.amount<=0||!Number.isFinite(e.rate)||e.rate<=0||!Number.isFinite(e.amount*e.rate)||!Number.isSafeInteger(Math.round(e.amount*e.rate))||e.currency===trip.currency&&e.rate!==1||e.custom&&Object.keys(e.custom).length>0);
 const converted=trip.expenses.map(e=>Math.round(e.amount*e.rate));
 const sum=converted.reduce((a,b)=>a+b,0);
 add('Reise',trip.name);
 add('Teilnehmende',trip.people.length);
 add('Ausgaben',trip.expenses.length);
 add('Kategorien',(trip.categories||[]).join(', ')||'Keine');
 add('Zielwährung',trip.currency);
 add('Gesamtbetrag (umgerechnet)',previewMoney(sum,trip.currency));
 const currencies=[...new Set(trip.expenses.map(e=>e.currency))];
 add('Erfasste Währungen',currencies.join(', ')||'Keine');
 const table=document.createElement('table'),head=document.createElement('tr');
 for(const label of ['Ausgabe','Originalbetrag','Kurs','Betrag in '+trip.currency]){const th=document.createElement('th');th.textContent=label;head.append(th);}
 table.append(head);
 for(let i=0;i<trip.expenses.length;i++){
  const e=trip.expenses[i],tr=document.createElement('tr');
  for(const value of [e.name,previewMoney(e.amount,e.currency),e.rate,previewMoney(converted[i],trip.currency)]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}
  table.append(tr);
 }
 info.append(table);
 const note=document.createElement('p');note.className=invalid.length?'negative':'muted';
 const validPeople=trip.people.length>0&&new Set(trip.people.map(p=>p.id)).size===trip.people.length&&trip.people.every(p=>typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim().length>0);
 const validPayments=(trip.payments||[]).every(p=>names.has(p.from)&&names.has(p.to)&&p.from!==p.to&&Number.isSafeInteger(p.cents)&&p.cents>0);
 const validRates=Object.entries(trip.rates||{}).every(([c,r])=>/^[A-Z]{3}$/.test(c)&&Number.isFinite(r)&&r>0);
 const canImport=!invalid.length&&validPeople&&validPayments&&validRates&&trip.expenses.length<=2000&&(trip.payments||[]).length<=2000;
 note.textContent=canImport?'Vorschau erfolgreich. Die Reise kann als separate Kopie importiert werden.':'Import gesperrt: Bitte Personen, Aufteilungen, Beträge, Kurse oder Zahlungen prüfen.';
 $('importExecute').disabled=!canImport;
 info.append(note);
}
importFile.addEventListener('change',async()=>{
 importBackup=null;importTrip.replaceChildren();importTrip.disabled=true;importPreview.replaceChildren();
 const file=importFile.files?.[0];if(!file)return;
 try{
  if(file.size>5_000_000)throw new Error('Datei ist grösser als 5 MB.');
  const data=JSON.parse(await file.text());
  if(data.version!==1||!Array.isArray(data.trips)||data.trips.length>100)throw new Error('Unbekanntes Sicherungsformat.');
  for(const t of data.trips){
   if(!t||typeof t.name!=='string'||!Array.isArray(t.people)||!Array.isArray(t.expenses)||typeof t.currency!=='string'||t.people.length>1000||t.expenses.length>10000)throw new Error('Ungültige Reisedaten.');
  }
  importBackup=data;
  data.trips.forEach((trip,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=trip.name;importTrip.append(opt);});
  importTrip.disabled=false;renderImportPreview();
 }catch(error){importPreview.textContent='Datei konnte nicht geprüft werden: '+error.message;}
});
importTrip.addEventListener('change',renderImportPreview);
$('importExecute').addEventListener('click',async()=>{
 const trip=importBackup?.trips?.[Number(importTrip.value)];if(!trip||$('importExecute').disabled)return;
 if(!confirm('Reise „'+trip.name+'“ mit '+trip.people.length+' Personen und '+trip.expenses.length+' Ausgaben als NEUE Reise in Ferienkasse 1.3 importieren? Bestehende Reisen werden nicht überschrieben.'))return;
 $('importExecute').disabled=true;$('importStatus').textContent='Import läuft …';
 try{
  const {data,error}=await client.rpc('fk_import_legacy_trip',{p_trip:trip});
  if(error)throw error;
  $('importStatus').textContent='Import erfolgreich. Neue Reise wurde erstellt.';
  await refresh();
  const {data:created,error:lookupError}=await client.from('fk_trips').select('id,name,currency,owner_id').eq('id',data).single();
  if(!lookupError&&created)await openTrip(created);
 }catch(error){$('importStatus').textContent='Import fehlgeschlagen (keine Teilübernahme): '+error.message;$('importExecute').disabled=false;}
});

const invitationToken=new URLSearchParams(location.search).get('invite');
const status=message=>{$('status').textContent=message;};
const showSignedOut=()=>{stopRealtime();$('account').textContent='Nicht angemeldet.';for(const id of ['workspace','results','detail','migration'])$(id).hidden=true;$('login').hidden=false;status('Bitte zuerst mit Magic Link anmelden.');};
$('login').addEventListener('click',()=>{location.href='./auth-preview.html';});
function line(parent,primary,secondary){const row=document.createElement('div');row.className='item';const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=primary;info.append(strong);if(secondary){const sub=document.createElement('div');sub.className='sub';sub.textContent=secondary;info.append(sub);}row.append(info);parent.append(row);return row;}

function stopRealtime(){
 if(realtimeTimer!==null){clearTimeout(realtimeTimer);realtimeTimer=null;}
 if(realtimeChannel){client.removeChannel(realtimeChannel);realtimeChannel=null;}
 realtimeTripId=null;
 if($('realtimeStatus'))$('realtimeStatus').textContent='Automatische Synchronisierung nicht verbunden.';
}
function queueRealtimeRefresh(){
 if(realtimeTimer!==null)clearTimeout(realtimeTimer);
 realtimeTimer=setTimeout(async()=>{
  realtimeTimer=null;
  if(!selected||selected.id!==realtimeTripId)return;
  if(realtimeLoading){realtimeQueued=true;return;}
  realtimeLoading=true;
  try{await loadDetail();}finally{
   realtimeLoading=false;
   if(realtimeQueued){realtimeQueued=false;queueRealtimeRefresh();}
  }
 },500);
}
function startRealtime(tripId){
 if(realtimeChannel&&realtimeTripId===tripId)return;
 stopRealtime();
 realtimeTripId=tripId;
 const channel=client.channel('ferienkasse-trip-'+tripId);
 for(const table of ['fk_people','fk_expenses','fk_settlements','fk_categories','fk_rates']){
  channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'trip_id=eq.'+tripId},queueRealtimeRefresh);
 }
 realtimeChannel=channel;
 $('realtimeStatus').textContent='Automatische Synchronisierung wird verbunden …';
 channel.subscribe((state)=>{
  if(realtimeChannel!==channel)return;
  if(state==='SUBSCRIBED'){$('realtimeStatus').textContent='Automatische Synchronisierung aktiv.';queueRealtimeRefresh();}
  else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')$('realtimeStatus').textContent='Synchronisierung unterbrochen – bitte Aktualisieren verwenden.';
  else if(state==='CLOSED')$('realtimeStatus').textContent='Synchronisierung getrennt.';
 });
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&selected)queueRealtimeRefresh();});

async function refresh(){
 status('Reisen werden geladen …');
 const {data,error}=await client.from('fk_trips').select('id,name,currency,created_at,owner_id').order('created_at',{ascending:false});
 if(error){status('Laden fehlgeschlagen: '+error.message);return;}
 $('trips').replaceChildren();
 if(!data.length){const p=document.createElement('p');p.className='muted';p.textContent='Noch keine Reisen vorhanden.';$('trips').append(p);}
 for(const trip of data){const row=line($('trips'),trip.name,trip.currency+' · '+new Date(trip.created_at).toLocaleDateString('de-CH'));const btn=document.createElement('button');btn.textContent='Öffnen';btn.className='secondary';btn.addEventListener('click',()=>openTrip(trip));row.append(btn);}
 status(data.length+' Reise(n) aus Supabase geladen.');
 if(selected){const match=data.find(t=>t.id===selected.id);if(match)await openTrip(match);else{stopRealtime();$('detail').hidden=true;selected=null;}}
}
async function openTrip(trip){
 if(selected?.id!==trip.id){stopRealtime();resetExpenseEdit();}selected=trip;$('detail').hidden=false;$('triptitle').textContent=trip.name+' ('+trip.currency+')';
 await loadDetail();
 startRealtime(trip.id);
 const {data:{user}}=await client.auth.getUser();$('createInvite').hidden=user?.id!==trip.owner_id;
 $('inviteLink').value='';$('copyInvite').hidden=true;$('inviteStatus').textContent='';
 $('detail').scrollIntoView({behavior:'smooth',block:'start'});
}
async function loadDetail(){
 if(!selected)return;
 const tripId=selected.id;
 const [pr,er,cr,rr]=await Promise.all([client.from('fk_people').select('id,name').eq('trip_id',tripId).order('name'),client.from('fk_expenses').select('id,description,amount_cents,expense_date,person_id,currency,category,original_amount_cents,original_currency,exchange_rate').eq('trip_id',tripId).order('expense_date',{ascending:false}),client.from('fk_categories').select('id,name').eq('trip_id',tripId).order('name'),client.from('fk_rates').select('currency,rate,rate_date').eq('trip_id',tripId).order('currency')]);
 if(selected?.id!==tripId)return;
 if(pr.error||er.error||cr.error||rr.error){status('Reisedaten konnten nicht geladen werden: '+(pr.error||er.error||cr.error||rr.error).message+'. Bitte supabase/currencies.sql prüfen.');return;}
 const sr=await client.from('fk_expense_splits').select('expense_id,person_id,amount_cents').in('expense_id',er.data.length?er.data.map(e=>e.id):['00000000-0000-0000-0000-000000000000']);
 if(sr.error){status('Aufteilungen konnten nicht geladen werden: '+sr.error.message);return;}
 const payResult=await client.from('fk_settlements').select('id,from_person_id,to_person_id,amount_cents,paid_on').eq('trip_id',tripId).order('paid_on',{ascending:false});
 if(payResult.error){status('Zahlungen konnten nicht geladen werden: '+payResult.error.message);return;}
 payments=payResult.data;splits=sr.data;people=pr.data;reportExpenses=er.data;categories=cr.data;rates=rr.data;renderCategories();renderRates();$('people').replaceChildren();$('payer').replaceChildren();$('splitPeople').replaceChildren();
 for(const p of people){line($('people'),p.name);const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('payer').append(option);}
 if(!people.length)line($('people'),'Noch keine Personen erfasst.');
 for(const p of people){const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=p.id;checkbox.checked=true;label.append(checkbox,document.createTextNode(' '+p.name));$('splitPeople').append(label);}
 $('paymentFrom').replaceChildren();$('paymentTo').replaceChildren();$('paymentHistory').replaceChildren();
 for(const p of people)for(const id of ['paymentFrom','paymentTo']){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$(id).append(o);}
 $('paymentSave').disabled=people.length<2;
 for(const p of payments){
  const from=people.find(x=>x.id===p.from_person_id)?.name||'Unbekannt',to=people.find(x=>x.id===p.to_person_id)?.name||'Unbekannt';
  const row=line($('paymentHistory'),from+' → '+to,(p.amount_cents/100).toFixed(2)+' '+selected.currency+' · '+p.paid_on);
  const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='Rückgängig';
  btn.addEventListener('click',async()=>{
   if(!confirm('Erfasste Zahlung wirklich entfernen?'))return;
   btn.disabled=true;const {data,error}=await client.from('fk_settlements').delete().eq('id',p.id).eq('trip_id',tripId).select('id');
   if(error||!data?.length){$('paymentStatus').textContent='Entfernen fehlgeschlagen: '+(error?.message||'Keine Zahlung entfernt');btn.disabled=false;return;}
   await loadDetail();$('paymentStatus').textContent='Zahlung entfernt.';
  });row.append(btn);
 }
 if(!payments.length)line($('paymentHistory'),'Noch keine Zahlungen erfasst.');
 $('expenses').replaceChildren();
 for(const e of er.data){
 const payer=people.find(p=>p.id===e.person_id)?.name||'Unbekannt';
 const portions=splits.filter(s=>s.expense_id===e.id);
 const portionText=portions.length?' · Aufgeteilt auf '+portions.map(s=>people.find(p=>p.id===s.person_id)?.name+' '+(s.amount_cents/100).toFixed(2)).join(', '):' · Noch nicht aufgeteilt';
 const originalText=(e.original_currency&&e.original_currency!==selected.currency)?' · Original '+(e.original_amount_cents/100).toFixed(2)+' '+e.original_currency+' (Kurs '+e.exchange_rate+')':'';
 const row=line($('expenses'),e.description,(e.amount_cents/100).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+e.currency+originalText+' · '+(e.category||'Diverses')+' · '+payer+' · '+e.expense_date+portionText);
 const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Bearbeiten';
 edit.addEventListener('click',()=>{
  showView('new');editingExpenseId=e.id;const ids=splits.filter(s=>s.expense_id===e.id).map(s=>s.person_id);for(const box of $('splitPeople').querySelectorAll('input'))box.checked=ids.length?ids.includes(box.value):true;$('description').value=e.description;$('amount').value=((e.original_amount_cents??e.amount_cents)/100).toFixed(2);$('expenseCurrency').value=e.original_currency||selected.currency;updateExchangePreview();$('payer').value=e.person_id;$('date').value=e.expense_date;$('expenseCategory').value=e.category||'Diverses';
  $('expensesave').textContent='Änderungen speichern';$('cancelEdit').hidden=false;$('expenseStatus').textContent='Ausgabe bearbeiten: '+e.description;
  $('expenseform').scrollIntoView({behavior:'smooth',block:'center'});
 });
 const del=document.createElement('button');del.type='button';del.className='secondary';del.textContent='Löschen';
 del.addEventListener('click',async()=>{
  if(!confirm('Ausgabe „'+e.description+'“ wirklich endgültig löschen?'))return;
  del.disabled=true;$('expenseStatus').textContent='Ausgabe wird gelöscht …';
  try{
   const {data,error}=await client.from('fk_expenses').delete().eq('id',e.id).eq('trip_id',tripId).select('id');
   if(error)throw error;if(!data?.length)throw new Error('Keine Ausgabe gelöscht. Bitte Berechtigungen prüfen.');
   if(editingExpenseId===e.id)resetExpenseEdit();await loadDetail();$('expenseStatus').textContent='Ausgabe gelöscht.';
  }catch(error){$('expenseStatus').textContent='Löschen fehlgeschlagen: '+error.message;del.disabled=false;}
 });
 row.append(edit,del);
}
 if(!er.data.length)line($('expenses'),'Noch keine Ausgaben erfasst.');
 renderBalances(er.data);
 $('expensesave').disabled=!people.length;
 status('Reisedaten aus Supabase geladen.');
}

function renderBalances(expenses){
 const money=cents=>(cents/100).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+selected.currency;
 const balance=new Map(people.map(p=>[p.id,{name:p.name,paid:0,share:0}]));
 let total=0,unallocated=0,unallocatedCount=0;
 for(const e of expenses){
  const portions=splits.filter(s=>s.expense_id===e.id);
  const sum=portions.reduce((n,s)=>n+s.amount_cents,0);
  if(!portions.length||sum!==e.amount_cents||!balance.has(e.person_id)||portions.some(s=>!balance.has(s.person_id))){
   unallocated+=e.amount_cents;unallocatedCount++;continue;
  }
  total+=e.amount_cents;
  balance.get(e.person_id).paid+=e.amount_cents;
  for(const s of portions)balance.get(s.person_id).share+=s.amount_cents;
 }
 $('totalExpenses').textContent=money(total);
 $('unallocatedExpenses').textContent=unallocatedCount?unallocatedCount+' Ausgabe(n) ohne gültige Aufteilung: '+money(unallocated)+' (nicht eingerechnet)':'Alle Ausgaben sind zugeordnet.';
 $('balances').replaceChildren();$('settlements').replaceChildren();
 for(const p of payments){if(balance.has(p.from_person_id)&&balance.has(p.to_person_id)){balance.get(p.from_person_id).paid+=p.amount_cents;balance.get(p.to_person_id).paid-=p.amount_cents;}}
 const creditors=[],debtors=[];
 for(const p of people){
  const b=balance.get(p.id),net=b.paid-b.share;
  line($('balances'),p.name,'Netto bezahlt (inkl. Ausgleich) '+money(b.paid)+' · Anteil '+money(b.share)+' · Offener Saldo '+(net>0?'+':'')+money(net));
  if(net>0)creditors.push({name:p.name,amount:net});
  if(net<0)debtors.push({name:p.name,amount:-net});
 }
 creditors.sort((a,b)=>b.amount-a.amount);debtors.sort((a,b)=>b.amount-a.amount);
 let i=0,k=0;
 while(i<debtors.length&&k<creditors.length){
  const value=Math.min(debtors[i].amount,creditors[k].amount);
  line($('settlements'),debtors[i].name+' → '+creditors[k].name,money(value));
  debtors[i].amount-=value;creditors[k].amount-=value;
  if(!debtors[i].amount)i++;
  if(!creditors[k].amount)k++;
 }
 if(!people.length)line($('balances'),'Noch keine Personen vorhanden.');
 if(!$('settlements').children.length)line($('settlements'),'Keine Ausgleichszahlungen nötig.');
}

$('paymentForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('paymentSave');button.disabled=true;
 try{
  if(!selected)throw new Error('Bitte Reise öffnen.');
  const from=$('paymentFrom').value,to=$('paymentTo').value;
  if(!from||!to||from===to)throw new Error('Zwei unterschiedliche Personen auswählen.');
  const raw=$('paymentAmount').value.trim().replace(',','.');
  if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(raw))throw new Error('Ungültiger Betrag.');
  const cents=Math.round(Number(raw)*100);
  if(!Number.isSafeInteger(cents)||cents<=0)throw new Error('Ungültiger Betrag.');
  if(!$('paymentDate').value)throw new Error('Bitte Zahlungsdatum wählen.');
  const {error}=await client.from('fk_settlements').insert({trip_id:selected.id,from_person_id:from,to_person_id:to,amount_cents:cents,paid_on:$('paymentDate').value});
  if(error)throw error;
  $('paymentAmount').value='';await loadDetail();$('paymentStatus').textContent='Ausgleichszahlung gespeichert.';
 }catch(error){$('paymentStatus').textContent='Zahlung konnte nicht gespeichert werden: '+error.message;}
 finally{button.disabled=false;}
});
$('paymentDate').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);

function renderCategories(){
 const select=$('expenseCategory'),old=select.value;select.replaceChildren();$('categoryList').replaceChildren();
 for(const cat of categories){
  const opt=document.createElement('option');opt.value=cat.name;opt.textContent=cat.name;select.append(opt);
  const used=reportExpenses.some(e=>(e.category||'Diverses')===cat.name);
  const row=line($('categoryList'),cat.name,used?'In Ausgaben verwendet':'Noch nicht verwendet');
  const rename=document.createElement('button');rename.type='button';rename.className='secondary';rename.textContent='Umbenennen';
  rename.addEventListener('click',async()=>{
   const value=prompt('Neuer Kategoriename',cat.name)?.trim();
   if(!value||value===cat.name)return;
   if(value.length>60){$('categoryStatus').textContent='Maximal 60 Zeichen.';return;}
   const {error}=await client.from('fk_categories').update({name:value}).eq('id',cat.id).eq('trip_id',selected.id);
   if(error){$('categoryStatus').textContent='Umbenennen fehlgeschlagen: '+error.message;return;}
   await loadDetail();$('categoryStatus').textContent='Kategorie umbenannt.';
  });row.append(rename);
  const del=document.createElement('button');del.type='button';del.className='secondary';del.textContent='Löschen';del.disabled=used;
  del.addEventListener('click',async()=>{
   if(!confirm('Kategorie „'+cat.name+'“ löschen?'))return;
   const {error}=await client.from('fk_categories').delete().eq('id',cat.id).eq('trip_id',selected.id);
   if(error){$('categoryStatus').textContent='Löschen fehlgeschlagen: '+error.message;return;}
   await loadDetail();$('categoryStatus').textContent='Kategorie gelöscht.';
  });row.append(del);
 }
 select.value=categories.some(c=>c.name===old)?old:(categories.some(c=>c.name==='Diverses')?'Diverses':categories[0]?.name||'');
}
$('categoryForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!selected)return;
 const name=$('categoryName').value.trim();
 if(!name||name.length>60)return;
 const {error}=await client.from('fk_categories').insert({trip_id:selected.id,name});
 if(error){$('categoryStatus').textContent='Hinzufügen fehlgeschlagen: '+error.message;return;}
 $('categoryName').value='';await loadDetail();$('categoryStatus').textContent='Kategorie hinzugefügt.';
});


function renderRates(){
 const base=selected?.currency;if(!base)return;
 const currencies=new Set([base,...rates.map(r=>r.currency)]);
 const previous=$('expenseCurrency').value;
 $('expenseCurrency').replaceChildren();
 for(const c of [...currencies].sort()){
  const option=document.createElement('option');option.value=c;option.textContent=c;$('expenseCurrency').append(option);
 }
 $('expenseCurrency').value=currencies.has(previous)?previous:base;
 $('rateList').replaceChildren();
 for(const rate of rates){
  const row=line($('rateList'),rate.currency+' · 1 '+rate.currency+' = '+Number(rate.rate).toLocaleString('de-CH',{maximumFractionDigits:12})+' '+base,rate.currency===base?'Basiswährung':rate.rate_date?'Referenzkurs vom '+rate.rate_date:'Manuell festgelegt');
  if(rate.currency!==base){
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Kurs ändern';
   button.addEventListener('click',()=>{$('rateCurrency').value=rate.currency;$('rateValue').value=rate.rate;$('rateValue').focus();});
   row.append(button);
  }
 }
 updateExchangePreview();
}
function updateExchangePreview(){
 if(!selected)return;
 const currency=$('expenseCurrency').value||selected.currency;
 const raw=$('amount').value.trim();
 const amount=Number(raw);
 const historical=editingExpenseId?reportExpenses.find(e=>e.id===editingExpenseId):null;
 const rate=historical?.original_currency===currency?Number(historical.exchange_rate):(currency===selected.currency?1:Number(rates.find(r=>r.currency===currency)?.rate));
 $('exchangePreview').textContent=Number.isFinite(rate)&&rate>0
  ?'1 '+currency+' = '+rate.toLocaleString('de-CH',{maximumFractionDigits:12})+' '+selected.currency+(Number.isFinite(amount)&&amount>0?' · ≈ '+(Math.round(amount*100*rate)/100).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+selected.currency:'')+(historical?.original_currency===currency?' · gespeicherter Buchungskurs':'')
  :'Kein gültiger Wechselkurs vorhanden.';
}
$('expenseCurrency').addEventListener('change',updateExchangePreview);
$('amount').addEventListener('input',updateExchangePreview);
$('rateForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!selected)return;
 const currency=$('rateCurrency').value.trim().toUpperCase(),rate=Number($('rateValue').value);
 if(!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(rate)||rate<=0){$('rateStatus').textContent='Bitte gültigen Währungscode und positiven Kurs eingeben.';return;}
 if(currency===selected.currency&&rate!==1){$('rateStatus').textContent='Der Kurs der Basiswährung muss 1 sein.';return;}
 const btn=$('rateForm').querySelector('button');btn.disabled=true;
 try{
  const {error}=await client.from('fk_rates').upsert({trip_id:selected.id,currency,rate,rate_date:null},{onConflict:'trip_id,currency'});
  if(error)throw error;
  await loadDetail();$('rateStatus').textContent='Kurs für '+currency+' gespeichert. Bestehende Ausgaben bleiben unverändert.';$('rateCurrency').value='';$('rateValue').value='';
 }catch(error){$('rateStatus').textContent='Speichern fehlgeschlagen: '+error.message;}finally{btn.disabled=false;}
});
$('fetchRates').addEventListener('click',async()=>{
 if(!selected)return;
 const btn=$('fetchRates'),base=selected.currency;btn.disabled=true;$('rateStatus').textContent='Referenzkurse werden geladen …';
 try{
  let data=null,source='',errors=[];
  for(const provider of [{name:'Frankfurter',url:'https://api.frankfurter.dev/v1/latest?base='+encodeURIComponent(base)},{name:'Frankfurter (Alternative)',url:'https://api.frankfurter.app/latest?from='+encodeURIComponent(base)}]){
   try{const response=await fetch(provider.url,{cache:'no-store',mode:'cors'});if(!response.ok)throw Error('HTTP '+response.status);const candidate=await response.json();if(!candidate?.rates||!candidate?.date)throw Error('Ungültige Antwort');data=candidate;source=provider.name;break;}catch(error){errors.push(provider.name+': '+error.message);}
  }
  if(!data)throw Error(errors.join(' / '));
  const changes=rates.filter(r=>r.currency!==base).map(r=>({currency:r.currency,perBase:Number(data.rates[r.currency])})).filter(x=>Number.isFinite(x.perBase)&&x.perBase>0);
  if(!changes.length){$('rateStatus').textContent='Keine passenden Referenzkurse gefunden. Bitte zuerst Fremdwährungen hinzufügen.';return;}
  if(!confirm('Referenzkurse vom '+data.date+' für '+changes.length+' Währung(en) übernehmen? Bestehende Ausgaben bleiben unverändert.')){$('rateStatus').textContent='Aktualisierung abgebrochen.';return;}
  const updates=changes.map(x=>({trip_id:selected.id,currency:x.currency,rate:1/x.perBase,rate_date:data.date}));
  const {error}=await client.from('fk_rates').upsert(updates,{onConflict:'trip_id,currency'});if(error)throw error;
  await loadDetail();$('rateStatus').textContent='Referenzkurse aktualisiert: '+data.date+' · '+source;
 }catch(error){$('rateStatus').textContent='Abruf fehlgeschlagen: '+error.message;}finally{btn.disabled=false;}
});

function resetExpenseEdit(){
 editingExpenseId=null;$('expenseform').reset();$('expenseCurrency').value=selected?.currency||'CHF';updateExchangePreview();for(const box of $('splitPeople').querySelectorAll('input'))box.checked=true;$('expensesave').textContent='Ausgabe speichern';$('cancelEdit').hidden=true;
 $('date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
}
$('cancelEdit').addEventListener('click',()=>{resetExpenseEdit();$('expenseStatus').textContent='Bearbeitung abgebrochen.';});
$('refresh').addEventListener('click',refresh);
$('createInvite').addEventListener('click',async()=>{
 if(!selected)return;const button=$('createInvite');button.disabled=true;$('inviteStatus').textContent='Einladungslink wird erstellt …';
 try{
  const {data,error}=await client.rpc('fk_create_invitation',{p_trip:selected.id});if(error)throw error;
  const url=new URL('./trips-preview.html',location.href);url.searchParams.set('invite',data);
  $('inviteLink').value=url.href;$('copyInvite').hidden=false;
  $('inviteStatus').textContent='Link erstellt. Einmalig nutzbar, 7 Tage gültig. Nur an die gewünschte Person senden.';
 }catch(error){$('inviteStatus').textContent='Einladung fehlgeschlagen: '+error.message;}
 finally{button.disabled=false;}
});
$('copyInvite').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('inviteLink').value);$('inviteStatus').textContent='Link kopiert.';}
 catch(error){$('inviteLink').select();$('inviteStatus').textContent='Bitte markierten Link manuell kopieren.';}
});
$('acceptInvite').addEventListener('click',async()=>{
 if(!invitationToken)return;const button=$('acceptInvite');button.disabled=true;$('inviteMessage').textContent='Einladung wird angenommen …';
 try{
  const {data,error}=await client.rpc('fk_accept_invitation',{p_token:invitationToken});if(error)throw error;
  history.replaceState(null,'',location.pathname);
  $('invitation').hidden=true;await refresh();
  $('inviteMessage').textContent='Einladung angenommen.';status('Einladung angenommen. Die gemeinsame Reise erscheint unter Meine Reisen.');
 }catch(error){$('inviteMessage').textContent='Einladung konnte nicht angenommen werden: '+error.message;button.disabled=false;}
});
$('create').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('save');button.disabled=true;status('Reise wird gespeichert …');
 try{const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)throw authError||new Error('Nicht angemeldet');
 const {error}=await client.from('fk_trips').insert({name:$('name').value.trim(),currency:$('currency').value,owner_id:user.id});
 if(error)throw error;$('name').value='';await refresh();
 }catch(error){status('Speichern fehlgeschlagen: '+error.message);}finally{button.disabled=false;}
});
$('personform').addEventListener('submit',async event=>{
 event.preventDefault();if(!selected)return;const button=$('personsave');button.disabled=true;
 try{const {error}=await client.from('fk_people').insert({trip_id:selected.id,name:$('personname').value.trim()});if(error)throw error;$('personname').value='';await loadDetail();}
 catch(error){status('Person konnte nicht gespeichert werden: '+error.message);}finally{button.disabled=false;}
});
$('expenseform').addEventListener('submit',async event=>{
 event.preventDefault();const report=message=>{$('expenseStatus').textContent=message;status(message);};if(!selected){report('Bitte zuerst eine Reise öffnen.');return;}if(!people.some(p=>p.id===$('payer').value)){report('Bitte eine zahlende Person auswählen.');return;}if(!$('description').value.trim()){report('Bitte eine Beschreibung eingeben.');return;}if(!$('date').value){report('Bitte ein Datum auswählen.');return;}const button=$('expensesave');button.disabled=true;report('Ausgabe wird gespeichert …');
 try{const amount=$('amount').value.trim().replace(',','.');if(!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(amount))throw new Error('Bitte Betrag mit maximal zwei Dezimalstellen eingeben.');const cents=Math.round(Number(amount)*100);if(!Number.isSafeInteger(cents)||cents<=0)throw new Error('Ungültiger Betrag.');
 const participants=Array.from($('splitPeople').querySelectorAll('input:checked')).map(box=>box.value);
 if(!participants.length)throw new Error('Bitte mindestens eine Person für die Aufteilung auswählen.');
 const wasEditing=!!editingExpenseId;
 const response=await client.rpc('fk_save_currency_expense',{
  p_trip:selected.id,p_expense:editingExpenseId,p_payer:$('payer').value,
  p_description:$('description').value.trim(),p_original_amount_cents:cents,p_original_currency:$('expenseCurrency').value,p_date:$('date').value,p_people:participants,p_category:$('expenseCategory').value
 });
 if(response.error)throw response.error;
 resetExpenseEdit();await loadDetail();showView('expenses');report(wasEditing?'Ausgabe erfolgreich geändert.':'Ausgabe erfolgreich in Supabase gespeichert.');
 }catch(error){report('Ausgabe konnte nicht gespeichert werden: '+error.message);}finally{button.disabled=false;}
});
$('date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
async function init(){
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session){showSignedOut();if(invitationToken){$('invitation').hidden=false;$('inviteMessage').textContent='Bitte zuerst anmelden. Danach diesen Einladungslink erneut öffnen.';}return;}
 $('account').textContent='Angemeldet als '+(session.user.email||'Benutzer');
 $('workspace').hidden=false;$('migration').hidden=false;$('results').hidden=false;$('login').hidden=true;
 if(invitationToken){$('invitation').hidden=false;$('inviteMessage').textContent='Du wurdest zu einer Reise eingeladen. Mit „Einladung annehmen“ trittst du bei.';}
 await refresh();
}
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showSignedOut();});
init().catch(error=>status('Initialisierung fehlgeschlagen: '+error.message));
