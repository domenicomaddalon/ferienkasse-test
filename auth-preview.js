import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase/project-config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'pkce',storageKey:'ferienkasse.v1.3.auth.test',detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let email='';
const status=message=>{$('status').textContent=message;};
function show(user){$('signed').hidden=!user;$('login').hidden=!!user;$('verify').hidden=true;$('account').textContent=user?.email||'';}
$('login').addEventListener('submit',async event=>{
 event.preventDefault();email=$('email').value.trim();$('send').disabled=true;status('Anmeldelink wird angefordert …');
 try{
  const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:new URL('./auth-preview.html',location.href).href}});
  if(error)throw error;
  $('verify').hidden=false;
  status('E-Mail versendet. Öffne den Magic Link möglichst auf demselben Gerät und im selben Browser. Falls du einen Code erhältst, kannst du ihn unten eingeben.');
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
try{
 const {data:{user},error}=await client.auth.getUser();
 if(error)throw error;
 show(user);
 status(user?'Anmeldung erfolgreich (Test).':'Nicht angemeldet. Fordere einen Magic Link an.');
}catch(error){status('Sitzungsprüfung fehlgeschlagen: '+error.message);}
