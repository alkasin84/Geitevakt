(async function () {
  const base=(window.GEITEVAKT_PUSH_URL||'').replace(/\/$/,'');
  if (!base) return; // Vis ingen aktiveringsknapp før tjenesten er konfigurert.
  const card=document.createElement('div');
  card.className='card';
  card.innerHTML='<h2>Påminnelse kl. 19.00</h2><p style="font-size:14px;line-height:1.5">Få varsel på denne telefonen hvis ingen har registrert besøk i dag.</p><p id="pushStatus" role="status" style="font-size:14px;line-height:1.5">Sjekker varsling …</p><div id="pushSetup" hidden><button id="pushEnable" class="register-btn" disabled>Slå på varsler</button></div><div id="pushActive" hidden><button id="pushTest" class="register-btn">Send testvarsel til meg</button><button id="pushDisable" class="history-toggle" style="margin-top:16px">Slå av varsler på denne telefonen</button></div>';
  document.querySelector('.footer-note').before(card);
  const status=card.querySelector('#pushStatus');
  const enable=card.querySelector('#pushEnable');
  const setup=card.querySelector('#pushSetup');
  const active=card.querySelector('#pushActive');
  const test=card.querySelector('#pushTest');
  const disable=card.querySelector('#pushDisable');
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if (ios&&!standalone) {status.textContent='På iPhone: Trykk Del → Legg til på Hjem-skjerm. Åpne Geitevakt fra det nye ikonet for å aktivere varsler.';return;}
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {status.textContent='Denne nettleseren støtter ikke pushvarsler. Bruk en oppdatert nettleser.';return;}
  let registration,config;
  let saved;
  try {saved=JSON.parse(localStorage.getItem('geitevakt-push')||'null');} catch {saved=null;}
  const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const token=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  async function api(path,data) {
    const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+saved.token},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
    const body=await res.json();
    if(!res.ok) throw new Error(body.error||'Kunne ikke kontakte varslingstjenesten.');
    return body;
  }
  function show(on) {
    setup.hidden=on;active.hidden=!on;
    status.textContent=on?'Varsler er aktivert på denne telefonen. Vi sjekker kl. 19.00 norsk tid hver dag.':'Aktiver én gang på hver telefon som skal få varsler.';
  }
  try {
    const response=await fetch(base+'/config',{signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Varslingstjenesten er ikke klar ennå. Prøv igjen senere.');
    config=await response.json();
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    const current=await registration.pushManager.getSubscription();
    show(Boolean(current&&saved?.id&&saved.base===base&&Notification.permission==='granted'));
    enable.disabled=false;
    if(Notification.permission==='denied') status.textContent='Varsler er blokkert. Tillat varsler for Geitevakt i telefonens/nettleserens innstillinger og åpne siden igjen.';
  } catch(e) {status.textContent=e.message;return;}
  enable.onclick=async()=>{
    enable.disabled=true;
    try {
      const permission=await Notification.requestPermission();
      if(permission!=='granted') throw new Error('Varsler ble ikke tillatt. Du kan prøve igjen etter å ha tillatt varsler i innstillingene.');
      if(!saved||saved.base!==base) {
        const old=await registration.pushManager.getSubscription();
        if(old) await old.unsubscribe();
        saved={token:token(),base};
        localStorage.setItem('geitevakt-push',JSON.stringify(saved));
      }
      const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(config.publicKey)});
      const response=await api('/subscribe',{subscription:sub.toJSON()});
      saved.id=response.id;
      localStorage.setItem('geitevakt-push',JSON.stringify(saved));
      show(true);
    } catch(e){status.textContent=e.message;} finally{enable.disabled=false;}
  };
  test.onclick=async()=>{
    test.disabled=true;
    try{await api('/test',{id:saved.id});status.textContent='Testvarselet er sendt til denne telefonen. Sjekk at det dukker opp.';}
    catch(e){status.textContent=e.message;}
    finally{test.disabled=false;}
  };
  disable.onclick=async()=>{
    disable.disabled=true;
    try {
      await api('/unsubscribe',{id:saved.id});
      const sub=await registration.pushManager.getSubscription();
      if(sub) await sub.unsubscribe();
      localStorage.removeItem('geitevakt-push');saved=null;show(false);
      status.textContent='Varsler er slått av på denne telefonen.';
    }catch(e){status.textContent=e.message;}finally{disable.disabled=false;}
  };
})();
