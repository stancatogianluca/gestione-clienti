'use strict';
const $=id=>document.getElementById(id), STORE='gestione-clienti-encrypted-v1', BACKUP_DATE='gestione-clienti-last-backup-v1';
let db={clients:[]}, key=null, salt=null, active='home', editing=null, filter='all', previous='clienti';
const THEME_KEY='gestione-clienti-theme-v1';
function applyTheme(v){const dark=v==='dark'||(v==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0d1423':'#0d63df')}
const themePreference=localStorage.getItem(THEME_KEY)||'system';applyTheme(themePreference);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((localStorage.getItem(THEME_KEY)||'system')==='system')applyTheme('system')});
$('themeSelect').value=themePreference;$('themeSelect').onchange=e=>{localStorage.setItem(THEME_KEY,e.target.value);applyTheme(e.target.value);notify('Tema aggiornato')};
let toastTimer;
function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function ask(message,title='Conferma operazione',danger=false){return new Promise(resolve=>{const wrap=$('dialogBackdrop'),yes=$('dialogConfirm'),no=$('dialogCancel');$('dialogTitle').textContent=title;$('dialogMessage').textContent=message;yes.classList.toggle('danger',danger);wrap.hidden=false;const done=value=>{wrap.hidden=true;yes.onclick=null;no.onclick=null;resolve(value)};yes.onclick=()=>done(true);no.onclick=()=>done(false)})}

const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const iso=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const daysUntil=s=>Math.round((new Date(s+'T12:00:00')-new Date(iso()+'T12:00:00'))/86400000);
const status=c=>{if(daysUntil(c.expiry)<0)return 'red';if(c.kind==='pagante'&&!c.paid)return 'red';if(daysUntil(c.expiry)<=7)return 'yellow';return 'green'};
const statusLabel=c=>daysUntil(c.expiry)<0?'Scaduto':c.kind==='pagante'&&!c.paid?'Pagamento sospeso':daysUntil(c.expiry)<=7?(daysUntil(c.expiry)===0?'Scade oggi':`${daysUntil(c.expiry)} giorni`):'Attivo';
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const formatDate=s=>s?new Date(s+'T12:00:00').toLocaleDateString('it-IT'):'—';
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const to64=bytes=>btoa(String.fromCharCode(...bytes)),from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(pass,s){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encrypt(){const iv=random(12),payload=new TextEncoder().encode(JSON.stringify(db)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,payload);localStorage.setItem(STORE,JSON.stringify({version:1,salt:to64(salt),iv:to64(iv),data:to64(new Uint8Array(encrypted))}))}
async function unlock(pass,create){if(create){salt=random(16);key=await derive(pass,salt);db={clients:[]};await encrypt()}else{const saved=JSON.parse(localStorage.getItem(STORE)),candidate=await derive(pass,from64(saved.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(saved.iv)},candidate,from64(saved.data));const parsed=JSON.parse(new TextDecoder().decode(plain));if(!Array.isArray(parsed.clients))throw Error('Archivio non valido');db=parsed;key=candidate;salt=from64(saved.salt)}$('lock').hidden=true;$('main').hidden=false;lastActivity=Date.now();show('home')}
function lockScreen(){key=null;db={clients:[]};editing=null;$('main').hidden=true;$('lock').hidden=false;configureLock();$('master').value='';$('confirmMaster').value=''}
function configureLock(){const create=!localStorage.getItem(STORE);$('confirmBox').hidden=!create;$('confirmMaster').required=create;$('lockText').textContent=create?'Crea una password principale (almeno 10 caratteri) per cifrare i dati sul tuo iPhone.':'Inserisci la password principale per sbloccare l’archivio.';$('unlockButton').textContent=create?'Crea archivio protetto':'Sblocca archivio'}
$('unlockForm').onsubmit=async e=>{e.preventDefault();const pass=$('master').value,create=!localStorage.getItem(STORE);if(create&&pass!==$('confirmMaster').value){alert('Le password non coincidono');return}try{await unlock(pass,create)}catch{alert('Password errata o archivio danneggiato')}};
function show(view){active=view;for(const v of ['home','clienti','scadenze','pagamenti','settings','editor'])$(v+'View').hidden=v!==view;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===view));if(view==='home')renderHome();if(view==='clienti')renderClients();if(view==='scadenze')renderExpiry();if(view==='pagamenti')renderPayments();if(view==='settings')renderBackupStatus()}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));$('lockNow').onclick=lockScreen;
function item(c,withButton=false){const el=document.createElement('div');el.className='list-item';const left=document.createElement('div');left.className='client-info flex1 break';const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=(c.name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();const info=document.createElement('div');info.className='flex1 break';info.innerHTML=`<strong>${esc(c.name)}</strong><small>${esc(c.username||'Senza username')} · ${c.kind==='free'?'Free':'Pagante'} · ${formatDate(c.expiry)}</small>`;left.append(avatar,info);const right=document.createElement('div');right.className='client-status';right.style.textAlign='right';const badge=document.createElement('span');badge.className='badge '+status(c);badge.textContent=statusLabel(c);right.append(badge);if(withButton){const b=document.createElement('button');b.className='btn small secondary';b.style.display='block';b.style.marginTop='7px';b.textContent='Apri';b.onclick=()=>openEditor(c.id);right.append(b)}else{el.style.cursor='pointer';el.onclick=()=>openEditor(c.id)}el.append(left,right);return el}
function fillList(id,arr,msg='Nessun cliente'){const el=$(id);el.replaceChildren();if(!arr.length){const p=document.createElement('div');p.className='empty';p.textContent=msg;el.append(p)}else arr.forEach(c=>el.append(item(c)))}
function renderHome(){renderReminders();const clients=db.clients,red=clients.filter(c=>status(c)==='red'),yellow=clients.filter(c=>status(c)==='yellow'),due=clients.filter(c=>c.kind==='pagante'&&!c.paid).reduce((n,c)=>n+Number(c.amount||0),0);$('metrics').innerHTML=`<div class="metric"><small>👥 Totale clienti</small><strong>${clients.length}</strong></div><div class="metric green"><small>✓ Attivi</small><strong>${clients.filter(c=>status(c)==='green').length}</strong></div><div class="metric yellow"><small>◷ In scadenza (7 gg)</small><strong>${yellow.length}</strong></div><div class="metric red"><small>! Scaduti / sospesi</small><strong>${red.length}</strong></div><div class="metric red" style="grid-column:span 2"><small>Da incassare</small><strong>${euro(due)}</strong></div>`;fillList('homeList',[...red,...yellow].slice(0,6),'Nessuna scadenza urgente')}
function renderClients(){const q=$('search').value.toLowerCase().trim();let arr=db.clients.filter(c=>(c.name+' '+c.username).toLowerCase().includes(q));if(filter==='pagante'||filter==='free')arr=arr.filter(c=>c.kind===filter);if(filter==='red')arr=arr.filter(c=>status(c)==='red');const sort=$('sortClients').value;if(sort==='expiry')arr.sort((a,b)=>a.expiry.localeCompare(b.expiry));else if(sort==='expiryDesc')arr.sort((a,b)=>b.expiry.localeCompare(a.expiry));else if(sort==='status')arr.sort((a,b)=>({red:0,yellow:1,green:2}[status(a)]-({red:0,yellow:1,green:2}[status(b)]))||a.expiry.localeCompare(b.expiry));else arr.sort((a,b)=>a.name.localeCompare(b.name,'it'));fillList('clientList',arr,'Nessun cliente trovato')}
$('search').oninput=renderClients;$('sortClients').onchange=renderClients;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderClients()});
function renderExpiry(){renderReminders();const arr=[...db.clients].sort((a,b)=>a.expiry.localeCompare(b.expiry));fillList('overdueList',arr.filter(c=>status(c)==='red'),'Nessuna utenza scaduta o sospesa');fillList('soonList',arr.filter(c=>status(c)==='yellow'),'Nessuna scadenza nei prossimi 7 giorni')}
function renderPayments(){const arr=db.clients.filter(c=>c.kind==='pagante'&&!c.paid);$('totalDue').textContent=euro(arr.reduce((n,c)=>n+Number(c.amount||0),0));fillList('paymentList',arr,'Nessun pagamento in sospeso')}
function newClient(){editing=null;previous=active;$('clientForm').reset();$('editorTitle').textContent='Nuovo cliente';$('expiry').value=iso();$('amount').value='0';$('paid').checked=false;$('editActions').hidden=true;syncKind();show('editor')}
function openEditor(id){const c=db.clients.find(x=>x.id===id);if(!c)return;editing=id;previous=active;$('editorTitle').textContent='Scheda cliente';$('name').value=c.name;$('username').value=c.username||'';$('clientPassword').value=c.password||'';$('kind').value=c.kind;$('expiry').value=c.expiry;$('amount').value=c.amount??0;$('paid').checked=!!c.paid;$('editActions').hidden=false;syncKind();renderHistory(c);$('renewMonths').value='1';$('renewBase').value='expiry';$('renewPaid').checked=false;updateRenewPreview();show('editor')}
function syncKind(){$('paymentFields').hidden=$('kind').value==='free';$('pendingNote').hidden=$('kind').value==='free'||$('paid').checked}
$('kind').onchange=syncKind;$('paid').onchange=syncKind;$('copyUsername').onclick=()=>copyCredential($('username').value,'Username');$('copyPassword').onclick=()=>copyCredential($('clientPassword').value,'Password');$('showPassword').onclick=()=>{$('clientPassword').type=$('clientPassword').type==='password'?'text':'password'};
$('addClient').onclick=newClient;$('homeAdd').onclick=newClient;$('heroAdd').onclick=newClient;$('backBtn').onclick=()=>show(previous);
function formValues(){return{name:$('name').value.trim(),username:$('username').value.trim(),password:$('clientPassword').value,kind:$('kind').value,expiry:$('expiry').value,amount:$('kind').value==='free'?0:Math.max(0,Number($('amount').value)||0),paid:$('kind').value==='free'?true:$('paid').checked}}
function validate(v){if(!v.name||!/^\d{4}-\d{2}-\d{2}$/.test(v.expiry)||!Number.isFinite(v.amount)||v.amount>1000000){alert('Controlla nome, scadenza e importo');return false}return true}
async function persist(){try{await encrypt();return true}catch{alert('Impossibile salvare i dati. Verifica lo spazio disponibile sul dispositivo.');return false}}
$('clientForm').onsubmit=async e=>{e.preventDefault();const v=formValues();if(!validate(v))return;if(editing){const c=db.clients.find(x=>x.id===editing);const before={...c};Object.assign(c,v);if(before.paid!==c.paid&&c.kind==='pagante')c.history.unshift({date:iso(),type:c.paid?'Pagamento confermato':'Pagamento sospeso',amount:c.amount,expiry:c.expiry});}else{db.clients.push({...v,id:crypto.randomUUID(),history:[],created:iso()})}if(await persist()){show('clienti');notify('Cliente salvato correttamente')}};
function renderHistory(c){$('history').replaceChildren();if(!c.history?.length){$('history').innerHTML='<p class="muted">Nessun rinnovo registrato.</p>';return}c.history.forEach(h=>{const e=document.createElement('div');e.className='history';e.innerHTML=`<strong>${esc(h.type)}</strong><small>${formatDate(h.date)} · Scadenza ${formatDate(h.expiry)} · ${euro(h.amount)}</small>`;$('history').append(e)})}
$('renewBtn').onclick=async()=>{if(!editing)return;const v=formValues();if(!validate(v))return;const c=db.clients.find(x=>x.id===editing);if(!await ask(`Rinnovare ${c.name} con scadenza ${formatDate(v.expiry)}? Il pagamento sarà segnato come sospeso.`,'Conferma rinnovo'))return;Object.assign(c,v,{paid:v.kind==='free'});c.history.unshift({date:iso(),type:'Rinnovo manuale'+(v.kind==='free'?' (Free)':' - da pagare'),amount:c.amount,expiry:c.expiry});if(await persist()){notify('Rinnovo registrato');openEditor(c.id)}};
$('markPaid').onclick=async()=>{const c=db.clients.find(x=>x.id===editing);if(!c||c.kind==='free')return;const v=formValues();if(!validate(v))return;if(!await ask(`Confermi il pagamento di ${euro(v.amount)} per ${v.name}?`,'Conferma pagamento'))return;Object.assign(c,v,{paid:true});c.history.unshift({date:iso(),type:'Pagamento ricevuto',amount:c.amount,expiry:c.expiry});if(await persist()){notify('Pagamento confermato');openEditor(c.id)}};
$('deleteClient').onclick=async()=>{const c=db.clients.find(x=>x.id===editing);if(c&&await ask(`Eliminare definitivamente ${c.name} e il suo storico?`,'Elimina cliente',true)){db.clients=db.clients.filter(x=>x.id!==editing);if(await persist()){show('clienti');notify('Cliente eliminato')}}};

function renderReminders(){
 const due=db.clients.filter(c=>{const d=daysUntil(c.expiry);return d>=0&&d<=7}).sort((a,b)=>a.expiry.localeCompare(b.expiry));
 const overdue=db.clients.filter(c=>daysUntil(c.expiry)<0).length;
 const el=$('reminderSummary');if(!el)return;
 const groups=[7,3,1,0].map(n=>({n,count:due.filter(c=>daysUntil(c.expiry)===n).length})).filter(g=>g.count);
 el.textContent=groups.map(g=>g.count+' cliente/i '+(g.n===0?'in scadenza oggi':'in scadenza tra '+g.n+' giorno/i')).join(' · ') || 'Nessuna scadenza esattamente a 7, 3 o 1 giorno.';
 $('overdueCount').textContent=overdue?overdue+' clienti già scaduti':'Nessun cliente scaduto';
}
function addMonthsClamped(value,months){
 const d=new Date(value+'T12:00:00');if(Number.isNaN(d.getTime()))throw Error('Data non valida');
 const first=new Date(d.getFullYear(),d.getMonth()+months,1,12);
 const last=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
 first.setDate(Math.min(d.getDate(),last));
 return [first.getFullYear(),String(first.getMonth()+1).padStart(2,'0'),String(first.getDate()).padStart(2,'0')].join('-');
}
function renewDate(){
 const c=db.clients.find(x=>x.id===editing);
 return c?addMonthsClamped($('renewBase').value==='today'?iso():c.expiry,Number($('renewMonths').value)):null;
}
function updateRenewPreview(){
 const d=renewDate();$('renewPreview').textContent=d?'Nuova scadenza: '+formatDate(d):'';
}
$('renewMonths').onchange=updateRenewPreview;$('renewBase').onchange=updateRenewPreview;
$('quickRenewBtn').onclick=async()=>{
 const c=db.clients.find(x=>x.id===editing);if(!c)return;
 const months=Number($('renewMonths').value),newExpiry=renewDate(),paid=c.kind==='free'||$('renewPaid').checked;
 if(![1,3,6,12].includes(months))return;
 if(!await ask('Rinnovare '+c.name+' fino al '+formatDate(newExpiry)+'? '+(paid?'Pagamento confermato/Free.':'Pagamento in sospeso.'),'Rinnovo rapido'))return;
 const old=structuredClone(db);
 c.expiry=newExpiry;c.paid=paid;
 if(!Array.isArray(c.history))c.history=[];
 c.history.unshift({date:iso(),type:'Rinnovo rapido '+months+' mesi'+(paid?' - pagato/Free':' - da pagare'),amount:c.amount,expiry:newExpiry});
 if(await persist()){openEditor(c.id);notify('Rinnovo registrato')}else db=old;
};
async function copyCredential(value,label){
 if(!value){alert(label+' non disponibile');return}
 try{await navigator.clipboard.writeText(value);notify(label+' copiato negli appunti')}
 catch{alert('Copia non disponibile: controlla i permessi del browser.')}
}
function renderBackupStatus(){
 const last=localStorage.getItem(BACKUP_DATE),el=$('backupStatus');
 if(!last){el.textContent='Nessun backup registrato su questo dispositivo. Ricorda di salvare il file su iCloud Drive.';return}
 const elapsed=Math.floor((Date.now()-Date.parse(last))/86400000);
 el.textContent='Ultimo file backup preparato: '+new Date(last).toLocaleString('it-IT')+'. '+(elapsed>=7?'Sono passati almeno 7 giorni: esegui un nuovo backup.':'Prossimo promemoria tra '+(7-Math.max(0,elapsed))+' giorni.');
}
function checkIdle(){
 if(!key)return;
 if(Date.now()-lastActivity>=300000)lockScreen();
}
let lastActivity=Date.now();
['pointerdown','keydown','touchstart'].forEach(type=>document.addEventListener(type,()=>{if(key)lastActivity=Date.now()},{passive:true}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkIdle()});
window.addEventListener('focus',checkIdle);
setInterval(checkIdle,15000);

// Backup: share sheet on iOS when supported; otherwise download via Files/Safari.
$('exportBtn').onclick=async()=>{
  const raw=localStorage.getItem(STORE);
  if(!raw){alert('Nessun archivio da esportare');return}
  const filename=`gestione-clienti-backup-${iso()}.json`;
  const file=new File([raw],filename,{type:'application/json'});
  try{
    if(navigator.canShare?.({files:[file]})&&navigator.share){
      await navigator.share({files:[file],title:'Backup cifrato Gestione Clienti'});
      localStorage.setItem(BACKUP_DATE,new Date().toISOString());renderBackupStatus();
      return;
    }
    const url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    localStorage.setItem(BACKUP_DATE,new Date().toISOString());renderBackupStatus();
    alert('Backup creato. Apri Download in Safari o File e spostalo su iCloud Drive.');
  }catch(err){if(err?.name!=='AbortError')alert('Impossibile esportare il backup: '+err.message)}
};
$('importFile').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    if(f.size>10000000)throw Error('File troppo grande');
    const raw=await f.text(),v=JSON.parse(raw);
    if(v.version!==1||![v.salt,v.iv,v.data].every(x=>typeof x==='string'))throw Error('Formato backup non valido');
    const backupSalt=from64(v.salt),backupIv=from64(v.iv),backupData=from64(v.data);
    if(backupSalt.length!==16||backupIv.length!==12||backupData.length<16)throw Error('Formato backup non valido');
    const pass=prompt('Inserisci la password principale usata per creare questo backup');
    if(pass===null)return;
    const candidate=await derive(pass,backupSalt);
    const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:backupIv},candidate,backupData);
    const parsed=JSON.parse(new TextDecoder().decode(decrypted));
    if(!parsed||!Array.isArray(parsed.clients)||parsed.clients.some(c=>!c||typeof c.name!=='string'||typeof c.expiry!=='string'||typeof c.id!=='string'))throw Error('Dati clienti non validi');
    if(!await ask(`Backup verificato: ${parsed.clients.length} clienti. Vuoi sostituire TUTTI i dati presenti sull'iPhone? L'operazione non si può annullare.`,'Ripristina backup',true))return;
    // Commit the archive only after successful authentication and validation.
    localStorage.setItem(STORE,raw);
    db=parsed;key=candidate;salt=backupSalt;editing=null;lastActivity=Date.now();
    show('home');
    alert(`Ripristino completato: ${parsed.clients.length} clienti caricati.`);
  }catch(err){
    alert('Ripristino non riuscito. I dati attuali non sono stati modificati. Controlla il file e la password. '+(err?.name==='QuotaExceededError'?'Spazio insufficiente.':''));
  }finally{e.target.value=''}
};
$('eraseBtn').onclick=()=>{(async()=>{if(await ask('Eliminare DEFINITIVAMENTE tutti i dati locali? Assicurati di avere un backup.','Elimina archivio',true)&&await ask('Seconda conferma: tutti i dati locali saranno cancellati.','Conferma definitiva',true)){localStorage.removeItem(STORE);lockScreen()}})()};
configureLock();if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));


/* CSV import v1.3.2 — file parsed locally, never uploaded */
function parseCsv(text){
 text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/,1)[0]||'';
 const delim=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
  else if(c===delim&&!quoted){row.push(field);field=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}
  else field+=c;
 }
 if(quoted)throw Error('Virgolette CSV non chiuse');
 row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 if(!rows.length)throw Error('File vuoto');
 const columns=rows.shift().map(x=>x.trim().toLowerCase().replace(/\s+/g,' '));
 const required=['nome','username','password','tipo','scadenza','importo','pagato'];
 if(required.some(c=>!columns.includes(c))||new Set(columns).size!==columns.length)throw Error('Intestazioni mancanti o duplicate: '+required.join(', '));
 return rows.map((values,i)=>({line:i+2,data:Object.fromEntries(columns.map((k,j)=>[k,(values[j]||'').trim()]))}));
}
function csvDate(value){let m=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m){const x=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(x)m=[null,x[3],x[2].padStart(2,'0'),x[1].padStart(2,'0')]}if(!m)return null;const out=m[1]+'-'+m[2]+'-'+m[3],d=new Date(out+'T12:00:00');return !Number.isNaN(d.getTime())&&isoDateParts(d)===out?out:null}
function isoDateParts(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function normalizeCsvRow(x){const a=x.data,expiry=csvDate(a.scadenza),kind=/^(pagante|paid)$/i.test(a.tipo)?'pagante':/^(free|gratuito)$/i.test(a.tipo)?'free':null;
 const amount=a.importo===''?0:Number(a.importo.replace(/\s/g,'').replace(',','.'));
 const paid=a.pagato===''?false:/^(s[iì]|si|yes|true|1)$/i.test(a.pagato)?true:/^(no|false|0)$/i.test(a.pagato)?false:null;
 if(!a.nome||!expiry||!kind||!Number.isFinite(amount)||amount<0||amount>1000000||paid===null)throw Error('Riga '+x.line+': controlla Nome, Tipo, Scadenza, Importo o Pagato');
 return {name:a.nome.slice(0,120),username:a.username.slice(0,150),password:a.password.slice(0,300),kind,expiry,amount:kind==='free'?0:amount,paid:kind==='free'?true:paid};
}
function csvDuplicateKey(c){return (c.name||'').trim().toLocaleLowerCase('it')+'|'+(c.username||'').trim().toLocaleLowerCase('it')}
let csvPending=null;
$('csvImportFile').onchange=async e=>{
 csvPending=null;const host=$('csvPreview');host.replaceChildren();const f=e.target.files?.[0];if(!f)return;
 try{if(f.size>3e6)throw Error('File troppo grande (massimo 3 MB)');
 const raw=await f.text(),rows=parseCsv(raw);if(rows.length>5000)throw Error('Troppi clienti (massimo 5000)');
 const parsed=rows.map(normalizeCsvRow),existing=new Set(db.clients.map(csvDuplicateKey)),seen=new Set(),fresh=[],duplicates=[];
 for(const c of parsed){const k=csvDuplicateKey(c);if(existing.has(k)||seen.has(k))duplicates.push(c);else{fresh.push(c);seen.add(k)}}
 csvPending=fresh;
 const p=document.createElement('p');p.className='notice';p.textContent='Righe valide: '+parsed.length+' · Nuovi: '+fresh.length+' · Duplicati saltati: '+duplicates.length+'. Importi vuoti = €0; Pagato vuoto = No. I clienti Free sono considerati pagati.';host.append(p);
 const preview=document.createElement('div');preview.className='help';preview.textContent='Anteprima: '+fresh.slice(0,5).map(c=>c.name+' ('+c.kind+', '+c.expiry+')').join(' · ')+(fresh.length>5?' …':'');host.append(preview);
 if(!fresh.length)return;
 const btn=document.createElement('button');btn.type='button';btn.className='btn wide';btn.textContent='Conferma importazione di '+fresh.length+' clienti';host.append(btn);
 btn.onclick=async()=>{if(!csvPending||!key)return;if(!await ask('Aggiungere '+csvPending.length+' nuovi clienti all’archivio cifrato? '+duplicates.length+' duplicati verranno saltati. I dati esistenti resteranno invariati.','Conferma importazione CSV'))return;
 const before=db.clients.slice(),now=iso();db.clients.push(...csvPending.map(c=>({...c,id:crypto.randomUUID(),history:[],created:now})));
 if(await persist()){notify('Importati '+csvPending.length+' clienti');csvPending=null;host.replaceChildren();$('csvImportFile').value='';show('clienti')}else db.clients=before;
 };
 }catch(err){const p=document.createElement('p');p.className='notice red';p.textContent='CSV non importato: '+err.message;host.append(p)}
};
