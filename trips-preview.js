import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase/project-config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'implicit',storageKey:'ferienkasse.v1.3.auth.test',detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let selected=null, people=[], editingExpenseId=null, splits=[];
const invitationToken=new URLSearchParams(location.search).get('invite');
const status=message=>{$('status').textContent=message;};
const showSignedOut=()=>{$('account').textContent='Nicht angemeldet.';for(const id of ['workspace','results','detail'])$(id).hidden=true;$('login').hidden=false;status('Bitte zuerst mit Magic Link anmelden.');};
$('login').addEventListener('click',()=>{location.href='./auth-preview.html';});
function line(parent,primary,secondary){const row=document.createElement('div');row.className='item';const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=primary;info.append(strong);if(secondary){const sub=document.createElement('div');sub.className='sub';sub.textContent=secondary;info.append(sub);}row.append(info);parent.append(row);return row;}
async function refresh(){
 status('Reisen werden geladen …');
 const {data,error}=await client.from('fk_trips').select('id,name,currency,created_at,owner_id').order('created_at',{ascending:false});
 if(error){status('Laden fehlgeschlagen: '+error.message);return;}
 $('trips').replaceChildren();
 if(!data.length){const p=document.createElement('p');p.className='muted';p.textContent='Noch keine Reisen vorhanden.';$('trips').append(p);}
 for(const trip of data){const row=line($('trips'),trip.name,trip.currency+' · '+new Date(trip.created_at).toLocaleDateString('de-CH'));const btn=document.createElement('button');btn.textContent='Öffnen';btn.className='secondary';btn.addEventListener('click',()=>openTrip(trip));row.append(btn);}
 status(data.length+' Reise(n) aus Supabase geladen.');
 if(selected){const match=data.find(t=>t.id===selected.id);if(match)await openTrip(match);else{$('detail').hidden=true;selected=null;}}
}
async function openTrip(trip){
 if(selected?.id!==trip.id)resetExpenseEdit();selected=trip;$('detail').hidden=false;$('triptitle').textContent=trip.name+' ('+trip.currency+')';
 await loadDetail();
 const {data:{user}}=await client.auth.getUser();$('createInvite').hidden=user?.id!==trip.owner_id;
 $('inviteLink').value='';$('copyInvite').hidden=true;$('inviteStatus').textContent='';
 $('detail').scrollIntoView({behavior:'smooth',block:'start'});
}
async function loadDetail(){
 if(!selected)return;
 const tripId=selected.id;
 const [pr,er]=await Promise.all([client.from('fk_people').select('id,name').eq('trip_id',tripId).order('name'),client.from('fk_expenses').select('id,description,amount_cents,expense_date,person_id,currency').eq('trip_id',tripId).order('expense_date',{ascending:false})]);
 if(selected?.id!==tripId)return;
 if(pr.error||er.error){status('Reisedaten konnten nicht geladen werden: '+(pr.error||er.error).message);return;}
 const sr=await client.from('fk_expense_splits').select('expense_id,person_id,amount_cents').in('expense_id',er.data.length?er.data.map(e=>e.id):['00000000-0000-0000-0000-000000000000']);
 if(sr.error){status('Aufteilungen konnten nicht geladen werden: '+sr.error.message);return;}
 splits=sr.data;people=pr.data;$('people').replaceChildren();$('payer').replaceChildren();$('splitPeople').replaceChildren();
 for(const p of people){line($('people'),p.name);const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('payer').append(option);}
 if(!people.length)line($('people'),'Noch keine Personen erfasst.');
 for(const p of people){const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=p.id;checkbox.checked=true;label.append(checkbox,document.createTextNode(' '+p.name));$('splitPeople').append(label);}
 $('expenses').replaceChildren();
 for(const e of er.data){
 const payer=people.find(p=>p.id===e.person_id)?.name||'Unbekannt';
 const portions=splits.filter(s=>s.expense_id===e.id);
 const portionText=portions.length?' · Aufgeteilt auf '+portions.map(s=>people.find(p=>p.id===s.person_id)?.name+' '+(s.amount_cents/100).toFixed(2)).join(', '):' · Noch nicht aufgeteilt';
 const row=line($('expenses'),e.description,(e.amount_cents/100).toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+e.currency+' · '+payer+' · '+e.expense_date+portionText);
 const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Bearbeiten';
 edit.addEventListener('click',()=>{
  editingExpenseId=e.id;const ids=splits.filter(s=>s.expense_id===e.id).map(s=>s.person_id);for(const box of $('splitPeople').querySelectorAll('input'))box.checked=ids.length?ids.includes(box.value):true;$('description').value=e.description;$('amount').value=(e.amount_cents/100).toFixed(2);$('payer').value=e.person_id;$('date').value=e.expense_date;
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
 $('expensesave').disabled=!people.length;
 status('Reisedaten aus Supabase geladen.');
}
function resetExpenseEdit(){
 editingExpenseId=null;$('expenseform').reset();for(const box of $('splitPeople').querySelectorAll('input'))box.checked=true;$('expensesave').textContent='Ausgabe speichern';$('cancelEdit').hidden=true;
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
 const response=await client.rpc('fk_save_split_expense',{
  p_trip:selected.id,p_expense:editingExpenseId,p_payer:$('payer').value,
  p_description:$('description').value.trim(),p_amount_cents:cents,p_date:$('date').value,p_people:participants
 });
 if(response.error)throw response.error;
 resetExpenseEdit();await loadDetail();report(wasEditing?'Ausgabe erfolgreich geändert.':'Ausgabe erfolgreich in Supabase gespeichert.');
 }catch(error){report('Ausgabe konnte nicht gespeichert werden: '+error.message);}finally{button.disabled=false;}
});
$('date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
async function init(){
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session){showSignedOut();if(invitationToken){$('invitation').hidden=false;$('inviteMessage').textContent='Bitte zuerst anmelden. Danach diesen Einladungslink erneut öffnen.';}return;}
 $('account').textContent='Angemeldet als '+(session.user.email||'Benutzer');
 $('workspace').hidden=false;$('results').hidden=false;$('login').hidden=true;
 if(invitationToken){$('invitation').hidden=false;$('inviteMessage').textContent='Du wurdest zu einer Reise eingeladen. Mit „Einladung annehmen“ trittst du bei.';}
 await refresh();
}
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showSignedOut();});
init().catch(error=>status('Initialisierung fehlgeschlagen: '+error.message));
