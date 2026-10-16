import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase/project-config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'implicit',storageKey:'ferienkasse.v1.3.auth.test',detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const status=message=>{$('status').textContent=message;};
const showSignedOut=()=>{$('account').textContent='Nicht angemeldet.';$('workspace').hidden=true;$('results').hidden=true;$('login').hidden=false;status('Bitte zuerst mit Magic Link anmelden.');};
$('login').addEventListener('click',()=>{location.href='./auth-preview.html';});
async function refresh(){
 status('Reisen werden geladen …');
 const {data,error}=await client.from('fk_trips').select('id,name,currency,created_at').order('created_at',{ascending:false});
 if(error){status('Laden fehlgeschlagen: '+error.message);return;}
 $('trips').replaceChildren();
 if(!data.length){const p=document.createElement('p');p.className='muted';p.textContent='Noch keine Reisen vorhanden.';$('trips').append(p);}
 for(const trip of data){const row=document.createElement('div');row.className='item';const details=document.createElement('div');const title=document.createElement('strong');title.textContent=trip.name;const meta=document.createElement('div');meta.className='sub';meta.textContent=trip.currency+' · '+new Date(trip.created_at).toLocaleDateString('de-CH');details.append(title,meta);row.append(details);$('trips').append(row);}
 status(data.length+' Reise(n) aus Supabase geladen.');
}
$('refresh').addEventListener('click',refresh);
$('create').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('save');button.disabled=true;status('Reise wird gespeichert …');
 try{
  const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)throw authError||new Error('Nicht angemeldet');
  const {error}=await client.from('fk_trips').insert({name:$('name').value.trim(),currency:$('currency').value,owner_id:user.id});
  if(error)throw error;$('name').value='';await refresh();
 }catch(error){status('Speichern fehlgeschlagen: '+error.message);}
 finally{button.disabled=false;}
});
async function init(){
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session){showSignedOut();return;}
 $('account').textContent='Angemeldet als '+(session.user.email||'Benutzer');$('workspace').hidden=false;$('results').hidden=false;$('login').hidden=true;await refresh();
}
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showSignedOut();});
init().catch(error=>status('Initialisierung fehlgeschlagen: '+error.message));
