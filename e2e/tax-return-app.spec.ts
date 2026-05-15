import { expect, test, type Locator, type Page } from "@playwright/test";

/** Currency formatter aligned with the application UI. */
const CURRENCY_FORMATTER = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Supported document panel headings used in the MVP. */
type TaxDocumentSectionHeading = "Vydané doklady" | "Přijaté doklady";

/** Form data used to create one tax document in the UI. */
interface TaxDocumentInput {
  documentNumber: string;
  partnerName: string;
  taxableDate: string;
  baseAmount: string;
  description: string;
  vatRateLabel: string;
}

/**
 * Formats a CZK amount exactly the way the UI renders it.
 *
 * @param amount Monetary amount in CZK.
 * @returns Localized currency string.
 */
function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(amount);
}

/**
 * Returns the closest article or section wrapper for a heading.
 *
 * @param page Browser page used by the test.
 * @param headingName Visible heading text.
 * @returns Locator for the surrounding content block.
 */
function getSectionByHeading(page: Page, headingName: string): Locator {
  return page
    .getByRole("heading", { exact: true, name: headingName })
    .locator("xpath=ancestor::*[self::article or self::section][1]");
}

/**
 * Returns one top-level summary card identified by its label.
 *
 * @param page Browser page used by the test.
 * @param label Summary label shown in the card.
 * @returns Locator for the summary card.
 */
function getSummaryCard(page: Page, label: string): Locator {
  return page
    .locator("main > section")
    .nth(1)
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::article[1]");
}

/**
 * Fills and submits one issued or received document form.
 *
 * @param page Browser page used by the test.
 * @param sectionHeading UI heading for the target form.
 * @param taxDocumentInput Values entered into the form.
 * @returns Promise resolved after the document is submitted.
 */
async function addTaxDocument(
  page: Page,
  sectionHeading: TaxDocumentSectionHeading,
  taxDocumentInput: TaxDocumentInput,
): Promise<void> {
  const section = getSectionByHeading(page, sectionHeading);

  await section.getByLabel("Číslo dokladu").fill(taxDocumentInput.documentNumber);
  await section.getByLabel("Partner").fill(taxDocumentInput.partnerName);
  await section.getByLabel("DUZP").fill(taxDocumentInput.taxableDate);
  await section.getByLabel("Základ daně").fill(taxDocumentInput.baseAmount);
  await section.getByLabel("Poznámka").fill(taxDocumentInput.description);
  await section
    .getByLabel("Sazba DPH")
    .selectOption({ label: taxDocumentInput.vatRateLabel });
  await section.getByRole("button", { name: "Přidat doklad" }).click();
}

test.describe("Tax return MVP", () => {
  test("shows inline validation for an empty issued document form", async ({
    page,
  }) => {
    await page.goto("/");

    const issuedDocumentsSection = getSectionByHeading(page, "Vydané doklady");

    await issuedDocumentsSection
      .getByRole("button", { name: "Přidat doklad" })
      .click();

    await expect(issuedDocumentsSection.getByText("Vyplňte číslo dokladu.")).toBeVisible();
    await expect(issuedDocumentsSection.getByText("Vyplňte partnera.")).toBeVisible();
    await expect(issuedDocumentsSection.getByText("Vyplňte DUZP.")).toBeVisible();
    await expect(issuedDocumentsSection.getByText("Vyplňte základ daně.")).toBeVisible();
    await expect(
      issuedDocumentsSection.getByText(
        "Opravte zvýrazněná pole a pak doklad znovu přidejte.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Formulář dokladu obsahuje chyby. Opravte zvýrazněná pole a zkuste to znovu.",
      ),
    ).toBeVisible();
  });

  test("persists added documents and recalculates summaries after reload", async ({
    page,
  }) => {
    await page.goto("/");

    const companySection = getSectionByHeading(page, "Firma a přiznání");

    await companySection.getByLabel("Název společnosti").fill("ACME Software s.r.o.");
    await companySection.getByLabel("IČO").fill("12345678");
    await companySection.getByLabel("DIČ").fill("CZ12345678");
    await companySection.getByLabel("Zdaňovací rok").fill("2026");
    await companySection
      .getByLabel("Perioda DPH")
      .selectOption({ label: "Čtvrtletní plátce" });

    await addTaxDocument(page, "Vydané doklady", {
      baseAmount: "10000",
      description: "Vývoj aplikace",
      documentNumber: "2026-001",
      partnerName: "Contoso a.s.",
      taxableDate: "2026-01-15",
      vatRateLabel: "21 % - základní sazba",
    });
    await addTaxDocument(page, "Přijaté doklady", {
      baseAmount: "3000",
      description: "Kancelářské potřeby",
      documentNumber: "PF-2026-001",
      partnerName: "Dodavatel s.r.o.",
      taxableDate: "2026-01-20",
      vatRateLabel: "12 % - snížená sazba",
    });

    await expect(getSummaryCard(page, "Vydané doklady")).toContainText("1");
    await expect(getSummaryCard(page, "Přijaté doklady")).toContainText("1");
    await expect(getSummaryCard(page, "DPH bilance")).toContainText(
      formatCurrency(1740),
    );
    await expect(getSummaryCard(page, "Daň z příjmů")).toContainText(
      formatCurrency(1470),
    );
    await expect(getSectionByHeading(page, "Vydané doklady")).toContainText(
      "2026-001",
    );
    await expect(getSectionByHeading(page, "Přijaté doklady")).toContainText(
      "PF-2026-001",
    );

    await page.reload();

    await expect(companySection.getByLabel("Název společnosti")).toHaveValue(
      "ACME Software s.r.o.",
    );
    await expect(companySection.getByLabel("Perioda DPH")).toHaveValue(
      "quarterly",
    );
    await expect(getSectionByHeading(page, "Vydané doklady")).toContainText(
      "2026-001",
    );
    await expect(getSectionByHeading(page, "Přijaté doklady")).toContainText(
      "PF-2026-001",
    );
    await expect(getSummaryCard(page, "DPH bilance")).toContainText(
      formatCurrency(1740),
    );
    await expect(
      page.getByText(
        "Doklady a přiznání se ukládají automaticky do tohoto prohlížeče.",
      ),
    ).toBeVisible();
  });

  test("shows the floating AI agent fallback when the API key is missing", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("button", { name: "Otevřít AI daňového agenta" })
      .click();

    const aiAgentDialog = page.getByRole("dialog", { name: "AI daňový agent" });

    await aiAgentDialog
      .getByLabel("Zpráva pro AI agenta")
      .fill("Shrň mi aktuální DPH bilanci.");
    await aiAgentDialog.getByRole("button", { name: "Odeslat" }).click();

    await expect(
      aiAgentDialog
        .locator("article")
        .filter({ hasText: "Shrň mi aktuální DPH bilanci." }),
    ).toBeVisible();
    await expect(
      aiAgentDialog.getByText(
        "AI daňový agent není dostupný, protože na serveru chybí proměnná `OPENAI_API_KEY`.",
      ),
    ).toBeVisible();
  });
});
