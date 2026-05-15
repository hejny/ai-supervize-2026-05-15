[x] ~$0.00 11 minutes by GitHub Copilot `gpt-5.4`

[✨🎐] Vyrob appku na daňové přiznání, která bude mít tyto funkce:


- Řešime DPH a daněové přiznání pro s.r.o. v ČR
- Uživatel zadá své vydané a přijaté doklady, a appka mu spočítá DPH a připraví daňové přiznání.
- Uživatel bude mít možnost uložit své doklady a přiznání pro pozdější použití.
- Ukádání funguje lokálně v prohlížeči (localStorage nebo IndexedDB)
- Appka bude mít jednoduché a přehledné uživatelské rozhraní
- Aplikace má spravovat jednu firmu, není potřeba řešit více firem nebo uživatelů
- Pro teď nemusíš řešit žádné složité účetní případy, stačí základní výpočet DPH a daňového přiznání pro běžné případy
- Pro teď neemusíš řešit žádné složité případy, jako jsou například ztráty, odpočty, apod. Stačí základní výpočet DPH a daňového přiznání pro běžné případy.


**Tohle jsou věci, které není potřeba řešit pro MVP, ale je potřeba na ně myslet pro budoucí vývoj a rozšíření appky:**


- Skenování dokladů bude fungovat přes mobilní telefon a jeho kameru
- Do budoucna je potřeba vytěžit data z dokladů (najdi nějakou knihovnu pro OCR, která umí vytěžit data z faktur a implementuj to do appky)
    - Nepoužívej generické OCR, ale rovnou použij Agents SDK od OpenAI, který umí využít modely pro vytěžování dat z faktur a dokladů.
- Bude potřeba export do xml (najdi dokumentaci pro elektronické podání daňového přiznání v ČR a implementuj export do xml podle této dokumentace)

