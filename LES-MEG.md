# Geitevakt – pushvarsler kl. 19.00

Koden er forberedt og lokalt testet. Den er ikke publisert eller satt i drift.
Den eksisterende siden og Firebase-databasen beholdes. Ingen Firebase-oppgradering kreves.
Planlagt sjekk skjer kl. 19.00 Europe/Oslo, både sommer og vinter. Varsel sendes bare når dagens logg mangler besøk. Levering helt på sekundet kan ikke garanteres.

## Dette må kobles til først

1. Logg inn eller opprett gratis konto på https://dash.cloudflare.com/ . Velg Workers Free. Du trenger ikke kjøpe domene, flytte DNS eller aktivere betalt plan.
2. Opprett en D1-database, gjerne med navnet `geitevakt-varsler`. Denne lagrer bare telefonenes push-abonnementer, nødvendige nøkler og sendestatus. Besøk ligger fortsatt i Firebase.
3. Opprett en Worker med navnet `geitevakt-varsler`. I kodeeditoren erstatter du eksempelkoden med HELE innholdet i `cloudflare/worker.js`. Filen er ferdig bygget; du trenger ikke npm eller andre utviklerverktøy.
4. Under Workerens bindings: legg til en **D1 database** med variabelnavnet **DB**, koblet til databasen fra steg 2.
5. Ingen felles kode eller Secret er nødvendig. Hver telefon aktiverer varsler med «Slå på varsler» og nettleserens tillatelse. En eventuell gammel JOIN_CODE brukes ikke av denne versjonen.
6. Publiser Worker. Under Triggers / Cron Triggers legger du til cron-uttrykket **`0 17,18 * * *`**. Cloudflare bruker UTC. Koden sjekker Europe/Oslo og kjører bare når klokken er 19. Det andre tidspunktet hoppes over. Ikke bruk bare `0 19 * * *`.
7. Kopier Workerens offentlige `https://...workers.dev`-adresse. I `nettside/push-config.js` setter du denne mellom anførselstegnene. Eksempel: `window.GEITEVAKT_PUSH_URL = 'https://geitevakt-varsler.DITT-NAVN.workers.dev';`. Dette er en offentlig adresse, ikke en hemmelig nøkkel.
8. Åpne Worker-adressen med `/config` til slutt. Når oppsettet er riktig, vises JSON med en offentlig `publicKey`, `hour: 19` og `timeZone: Europe/Oslo`. Første kall oppretter tabellene og push-nøklene automatisk. Ikke slett eller bytt database etter at telefoner er registrert.
9. Ta en kopi av dagens `index.html`. Last opp ALLE filene inni `nettside` til roten av `alkasin84/Geitevakt` på GitHub, på Pages-grenen (main). De skal ligge ved siden av `index.html`, ikke i en undermappe. Dette erstatter HTML-filen med versjonen lest 10. november 2026; flett inn eventuelle nyere endringer før opplasting.

Jeg kan gjøre kode- og oppsettstegene når nødvendig tilgang er på plass. GitHub-tilkoblingen avviste forsøk på å opprette en arbeidsgren med HTTP 403 «Resource not accessible by integration»; ingen filer i det publiserte nettstedet ble endret.

## På hver telefon, etter publisering

- iPhone/iPad: Åpne https://alkasin84.github.io/Geitevakt/ i Safari. Velg Del → Legg til på Hjem-skjerm. Åpne fra ikonet.
- Finn «Påminnelse kl. 19.00», trykk «Slå på varsler». Tillat varsler.
- Trykk «Send testvarsel til meg». Bekreft at et faktisk pushvarsel kommer. Test også når Geitevakt er i bakgrunnen.
- Gjenta på hver telefon. Å velge Kasin/Himberg Krosshus/Kivle ved besøksregistrering aktiverer ikke varsler automatisk.
- «Slå av varsler på denne telefonen» fjerner bare denne telefonen.

## Verifikasjon før dette regnes som ferdig

Lokale tester passerer: norsk tid og overgang sommer/vinter; dagens/gårsdagens/fremtidige besøk; tom og ugyldig logg; kildefeil gir ikke falsk påminnelse; samtidige sjekker gir maks ett sendeforsøk per telefon/dag; tilgangskontroll og avmelding; testvarsel med ett minutts begrensning.

Gjenstår: faktisk deploy i Cloudflare, kontroll av ressursbruk på Free-planen, publisering på GitHub Pages og reelt pushvarsel på brukerens iPhone. Sjekk deretter en planlagt kjøring i Cloudflare-loggene. Datalesingen mot eksisterende Firebase ble kontrollert uten endringer i besøksloggen. Ingen ekte testvarsler er sendt.

Tekniske grenser: maks 10 telefoner. Nettverksfeil ved sending logges, men forsøket gjentas ikke automatisk samme dag for å unngå dobbeltvarsling ved ukjent leveringsstatus. Varsler utløper etter én time. Hvis besøksloggen ikke kan leses eller har ugyldige data, stoppes sjekken med feil i Cloudflare-loggen. Sjekken leser hele loggen; dette er egnet for dagens lille datamengde, men bør avgrenses når loggen blir stor.

## Filer og videre vedlikehold

- `nettside/`: ferdige nettsidefiler. Worker-adressen er konfigurert til https://geitevakt-varsler.alexkasin84.workers.dev.
- `cloudflare/worker.js`: ferdig bygget Worker som limes inn i Cloudflare.
- `cloudflare/worker.mjs`: lesbar kildekode; `worker.test.mjs`: tester.
- For videre kodeendringer: i cloudflare-mappen, kjør `npm ci`, deretter `node --test worker.test.mjs`. Bygg med `npx esbuild worker.mjs --bundle --format=esm --platform=browser --outfile=worker.js`.
- Push bruker @block65/webcrypto-web-push 2.0.0 (MIT), med standard aes128gcm/VAPID. Lisens er vedlagt. Ingen hemmelige nøkler følger pakken; de lages i Cloudflare.

Prisgrunnlag kontrollert 10. november 2026: Cloudflare Workers Free og D1 Free. Oppsettet krever ikke betalingsplan. Ved overskredne gratiskvoter eller tjenestefeil kan varslingen stoppe; bytt ikke til betalt plan uten å avtale det.
