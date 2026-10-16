import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase/project-config.js';
// Test preview: implicit flow allows an email link to open in a different browser context.
// For production, review PKCE and native deep-link handling before rollout.
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'implicit',storageKey:'ferienkasse.v1.3.auth.test',detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let email='';
const status=message=>{$('status').textContent=message;};
function show(user){$('signed').hidden=!user;$('login').hidden=!!user;$('verify').hidden=true;$('account').textContent=user?.email||'';}
client.auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_IN'){show(session?.user);status('Anmeldung erfolgreich (Test).');}
 if(event==='SIGNED_OUT'){show(null);status('Abgemeldet.');}
});
$('login').addEventListener('submit',async event=>{
 event.preventDefault();email=$('email').value.trim();$('send').disabled=true;status('Anmeldelink wird angefordert …');
 try{
  const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:new URL('./auth-preview.html',location.href).href}});
  if(error)throw error;
  $('verify').hidden=false;
  status('E-Mail angefordert. Öffne den Magic Link. Falls du einen Code erhältst, kannst du ihn unten eingeben.');
 }catch(error){status('Anforderung fehlgeschlagen: '+error.message);}
 finally{$('send').disabled=false;}
});
$('verify').addEventListener('submit',async event=>{
 event.preventDefault();status('Code wird geprüft …');
 try{const {data,error}=await client.auth.verifyOtp({email,token:$('token').value.trim(),type:'email'});if(error)throw error;show(data.user);status('Anmeldung erfolgreich (Test).');}
 catch(error){status('Codeprüfung fehlgeschlagen: '+error.message);}
});
$('logout').addEventListener('click',async()=>{
 const {error}=await client.auth.signOut();if(error){status(error.message);return;}show(null);status('Abgemeldet.');
});
status('Sitzung wird geprüft …');
const callbackError=new URLSearchParams(location.hash.replace(/^#/,'' )).get('error_description')||new URLSearchParams(location.search).get('error_description');
try{
 const {data:{session},error}=await client.auth.getSession();
 if(error)throw error;
 show(session?.user||null);
 if(callbackError)status('Anmeldelink konnte nicht verarbeitet werden: '+callbackError);
 else status(session?.user?'Anmeldung erfolgreich (Test).':'Noch nicht angemeldet. Fordere einen Anmeldelink an.');
}catch(error){show(null);status('Anmeldung konnte nicht abgeschlossen werden: '+error.message);}
