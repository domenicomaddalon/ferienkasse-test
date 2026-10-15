import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase/project-config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'pkce',storageKey:'ferienkasse.v1.3.auth.test'}});
const $=id=>document.getElementById(id);
let email='';
const status=msg=>{$('status').textContent=msg;};
function show(user){$('signed').hidden=!user;$('login').hidden=!!user;$('verify').hidden=true;$('account').textContent=user?.email||'';}
$('login').addEventListener('submit',async event=>{
 event.preventDefault();email=$('email').value.trim();$('send').disabled=true;status('Einmalcode wird angefordert …');
 try{const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});if(error)throw error;$('verify').hidden=false;status('Bitte E-Mail prüfen und Code eingeben.');}
 catch(error){status('Anforderung fehlgeschlagen: '+error.message);}
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
const {data:{user},error}=await client.auth.getUser();show(user);if(error)status('Sitzungsprüfung fehlgeschlagen: '+error.message);
