# Dokumentace

## Přehled

Tato aplikace je MVP pro jednu českou s.r.o. Uživatel zadává vydané a přijaté doklady a aplikace z nich počítá:

- základní přiznání k DPH,
- zjednodušený náhled daňového přiznání k dani z příjmů právnických osob,
- lokálně uložený pracovní stav v prohlížeči.

## Co MVP umí

- správa jedné firmy,
- zadání vydaných a přijatých dokladů,
- okamžitá validační zpětná vazba u nevyplněných nebo neplatných polí dokladů,
- výpočet základu daně, DPH a celkové částky na dokladech,
- výpočet DPH na výstupu, DPH na vstupu a výsledné bilance,
- výpočet výnosů, nákladů, daňového základu a daně z příjmů právnických osob,
- plovoucí AI asistent pro dotazy nad profilem firmy, doklady a souhrny,
- přidávání, úpravy a mazání daňových dokladů přes chat s AI asistentem,
- automatické lokální ukládání přes `localStorage`.

## Co MVP záměrně neřeší

- složité účetní a daňové případy,
- daňové ztráty, speciální odpočty a další úpravy základu daně,
- oficiální elektronické podání,
- OCR z dokladů a skenování mobilem.

## Výpočty

### DPH

- podporované sazby: `21 %`, `12 %`, `0 %`,
- DPH na výstupu = součet DPH z vydaných dokladů,
- DPH na vstupu = součet DPH z přijatých dokladů,
- bilance DPH = DPH na výstupu - DPH na vstupu.

### Daň z příjmů právnických osob

- výnosy = základy daně z vydaných dokladů,
- náklady = základy daně z přijatých dokladů,
- hospodářský výsledek = výnosy - náklady,
- daňový základ = `max(hospodářský výsledek, 0)`,
- sazba daně = `21 %`.

## Ukládání dat

- data se ukládají pouze lokálně v prohlížeči,
- používá se klíč `tax-return-mvp-state-v1`,
- ukládá se profil firmy i zadané doklady,
- po znovuotevření aplikace se pracovní stav obnoví.

## AI asistent

- AI asistent je dostupný jako plovoucí bublina vpravo dole na každé stránce aplikace.
- Frontend posílá serverové route `/api/tax-agent` aktuální lokální stav aplikace a poslední zprávy chatu.
- Server používá OpenAI Agents SDK a nástroje:
  - `get_tax_workspace_data` pro načtení profilu firmy, dokladů a vypočtených souhrnů,
  - `add_tax_document` pro přidání vydaného nebo přijatého dokladu,
  - `edit_tax_document` pro úpravu jednoho existujícího dokladu,
  - `delete_tax_document` pro smazání jednoho existujícího dokladu.
- Systémové instrukce a prompt pro běh agenta používají `prompt` notaci z `@promptbook/utils`.
- Agent má komunikovat pouze česky a s diakritikou.
- Pro volání OpenAI je potřeba serverová proměnná `OPENAI_API_KEY`.
- Pokud agent změní doklady, vrácený normalizovaný stav se uloží zpět do `localStorage` a hlavní přehled se okamžitě přepočítá.

## Budoucí rozšíření

Architektura MVP odděluje:

1. vstup dat,
2. výpočet souhrnů,
3. prezentaci přiznání.

Díky tomu lze později doplnit:

- import a vytěžení dokladů přes mobilní kameru,
- automatické doplnění formulářů z OCR,
- XML export pro elektronické podání.

## Doporučené oficiální zdroje pro další fázi

### OpenAI Agents SDK pro vytěžení dat z dokladů

- OpenAI Agents SDK (JS/TS): `https://openai.github.io/openai-agents-js/guides/agents`
- Spouštění agentů a orchestrace workflow: `https://openai.github.io/openai-agents-js/guides/running-agents`
- Oficiální práce s obrázky ve OpenAI API: `https://developers.openai.com/api/docs/guides/images`

Doporučení pro další implementaci:

- udržovat interní datový model dokladu odděleně od OCR vrstvy,
- ukládat zvlášť originální soubor, vytěžený JSON a validační chyby,
- napojit budoucí OCR jako samostatnou službu nad stávajícím formulářovým modelem.

### XML export pro elektronické podání v ČR

- Portál MOJE daně / ADIS: `https://adisspr.mfcr.cz/`
- Veřejná struktura obsahu Finanční správy: `https://www.financnisprava.gov.cz/sitemap.xml`

Poznámka k implementaci:

- veřejně dostupné informace působí jako formulářově a verzově členěné,
- je vhodné počítat s tím, že XML export nebude mít jedno univerzální schéma,
- exportní vrstvu je proto potřeba navrhnout po jednotlivých formulářích a verzích schémat.
