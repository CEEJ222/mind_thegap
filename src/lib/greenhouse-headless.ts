import { chromium } from 'playwright-core'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  process.env.CHROME_PATH,
].filter(Boolean) as string[]

function findChrome(): string {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('Chrome not found. Set CHROME_PATH env var or install Chrome.')
}

export interface GreenhouseHeadlessPayload {
  /** Answers keyed by Greenhouse field name (first_name, last_name, email, etc.) */
  formAnswers: Record<string, string>
  /** PDF/docx buffer for resume upload */
  resumeBuffer?: Buffer
  resumeFileName?: string
}

export async function submitGreenhouseHeadless(
  jobUrl: string,
  payload: GreenhouseHeadlessPayload
): Promise<{ ok: boolean; error?: string }> {
  const executablePath = findChrome()
  const browser = await chromium.launch({
    executablePath,
    headless: false,  // Non-headless to pass reCAPTCHA scoring (runs on local machine)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  })

  // Write resume to a temp file if provided
  let resumeTempPath: string | null = null
  if (payload.resumeBuffer) {
    const ext = payload.resumeFileName?.endsWith('.docx') ? '.docx' : '.pdf'
    resumeTempPath = path.join(os.tmpdir(), `resume_gh_${Date.now()}${ext}`)
    fs.writeFileSync(resumeTempPath, payload.resumeBuffer)
  }

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(30_000)

    // Mask headless / bot signals to avoid reCAPTCHA blocks
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    // Force https — use original job URL (not /application, which doesn't exist on all boards)
    const safeUrl = jobUrl.replace(/^http:\/\//i, 'https://')
    console.log('[GH headless] Navigating to', safeUrl)
    await page.goto(safeUrl, { waitUntil: 'load', timeout: 30_000 })

    // Log what loaded for debugging
    const pageTitle = await page.title()
    console.log('[GH headless] Loaded:', page.url(), '|', pageTitle)

    // Greenhouse may be embedded in an iframe — detect and switch to it
    // Wait briefly for iframes to appear
    await page.waitForTimeout(3_000)

    // Find a Greenhouse iframe (boards.greenhouse.io or greenhouse.io embed)
    const frames = page.frames()
    let targetFrame = frames.find(f =>
      f.url().includes('greenhouse.io') || f.url().includes('boards.greenhouse.io')
    ) || null

    if (!targetFrame) {
      // Wait up to 10s for a Greenhouse iframe to appear
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        await page.waitForTimeout(500)
        targetFrame = page.frames().find(f => f.url().includes('greenhouse.io')) || null
        if (targetFrame) break
      }
    }

    // Resolve the locator context: use iframe frame if found, else main page
    const ctx = targetFrame
      ? page.frameLocator(`iframe[src*="greenhouse.io"]`)
      : null

    if (targetFrame) {
      console.log('[GH headless] Switching to Greenhouse iframe:', targetFrame.url())
    }

    const formSelector = '#application_form, form, [data-qa="application-form"]'

    if (ctx) {
      // Wait for form, then wait for actual input fields to render (React takes time)
      await ctx.locator(formSelector).first().waitFor({ timeout: 20_000 }).catch(() => {
        console.warn('[GH headless] No form in iframe')
      })
      await ctx.locator('input[id="first_name"], input[name="first_name"]').first()
        .waitFor({ timeout: 15_000 })
        .catch(() => console.warn('[GH headless] first_name field not found in iframe'))
    } else {
      // No iframe — look in main page, try clicking Apply if needed
      const formFound = await page.waitForSelector(formSelector, { timeout: 10_000 })
        .then(() => true).catch(() => false)
      if (!formFound) {
        const applyBtn = page.locator(
          'a:has-text("Apply for this job"), button:has-text("Apply for this job"), a:has-text("Apply now")'
        ).first()
        if (await applyBtn.count() > 0) {
          console.log('[GH headless] Clicking Apply button')
          await applyBtn.click()
          await page.waitForSelector(formSelector, { timeout: 15_000 }).catch(() => {
            console.warn('[GH headless] No form after clicking Apply')
          })
        } else {
          console.warn('[GH headless] No form and no Apply button on page')
        }
      }
    }

    // Log found fields for debugging (by both name and id)
    const fieldLocator = ctx
      ? ctx.locator('input[name], input[id], select[name], select[id], textarea[name], textarea[id]')
      : page.locator('input[name], input[id], select[name], select[id], textarea[name], textarea[id]')
    const fieldNames = await fieldLocator.evaluateAll(
      (els) => (els as HTMLElement[]).map((el) => {
        const e = el as HTMLInputElement
        return `${el.tagName.toLowerCase()}${e.id ? `[id="${e.id}"]` : ''}${e.name ? `[name="${e.name}"]` : ''}`
      })
    )
    console.log('[GH headless] Fields found:', fieldNames.join(', ') || '(none)')

    // Helper to get a locator for a named field (searches iframe or main page)
    const fieldLocatorFor = (selector: string) =>
      ctx ? ctx.locator(selector).first() : page.locator(selector).first()

    // Fill fields by name attribute (matches our form_answers keys)
    const { formAnswers } = payload
    for (const [fieldName, value] of Object.entries(formAnswers)) {
      if (!value) continue

      // Match by name OR id (Greenhouse embed uses id, standard boards use name)
      const inputSel = `input[name="${fieldName}"], input[id="${fieldName}"]`
      const textareaSel = `textarea[name="${fieldName}"], textarea[id="${fieldName}"]`
      const selectSel = `select[name="${fieldName}"], select[id="${fieldName}"]`

      const inputEl = fieldLocatorFor(inputSel)
      const textareaEl = fieldLocatorFor(textareaSel)
      const selectEl = fieldLocatorFor(selectSel)

      if (await inputEl.count() > 0) {
        const type = await inputEl.getAttribute('type')
        if (type === 'file') continue
        if (type === 'radio') {
          const radio = fieldLocatorFor(`input[name="${fieldName}"][value="${value}"]`)
          if (await radio.count() > 0) await radio.click()
          continue
        }
        await inputEl.fill(String(value))
      } else if (await textareaEl.count() > 0) {
        await textareaEl.fill(String(value))
      } else if (await selectEl.count() > 0) {
        try {
          await selectEl.selectOption({ value: String(value) })
        } catch {
          try {
            await selectEl.selectOption({ label: String(value) })
          } catch {
            console.warn(`[GH headless] Could not select "${value}" for field "${fieldName}"`)
          }
        }
      } else {
        const labelEl = fieldLocatorFor(`label:has-text("${fieldName.replace(/_/g, ' ')}")`)
        if (await labelEl.count() > 0) {
          const forAttr = await labelEl.getAttribute('for')
          if (forAttr) {
            const associated = fieldLocatorFor(`#${CSS.escape(forAttr)}`)
            if (await associated.count() > 0) await associated.fill(String(value))
          }
        }
      }
    }

    // Upload resume file
    if (resumeTempPath) {
      const fileInput = fieldLocatorFor('input[type="file"]')
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(resumeTempPath)
        console.log('[GH headless] Resume uploaded:', resumeTempPath)
      } else {
        console.warn('[GH headless] No file input found for resume')
      }
    }

    // Submit the form
    const submitBtn = fieldLocatorFor(
      'input[type="submit"], button[type="submit"], button:has-text("Submit Application"), button:has-text("Submit"), button:has-text("Apply for this Job")'
    )

    if (await submitBtn.count() === 0) {
      return { ok: false, error: 'Could not find submit button on Greenhouse form' }
    }

    await submitBtn.click()

    // Wait for post-submit signal — check both parent page and iframe
    await page.waitForTimeout(5_000)

    // Check iframe content for confirmation (embedded forms update the iframe, not the parent URL)
    let iframeText = ''
    if (targetFrame) {
      iframeText = await targetFrame.locator('body').innerText().catch(() => '')
    }

    // Check parent page for error signals
    const errorText = (await page.locator('[class*="error"], .alert-danger, [role="alert"]').allTextContents())
      .map(t => t.trim()).filter(Boolean)
    const iframeErrorText = targetFrame
      ? (await targetFrame.locator('[class*="error"], .alert-danger, [role="alert"]').allTextContents())
          .map(t => t.trim()).filter(Boolean)
      : []
    const allErrors = [...errorText, ...iframeErrorText]
    if (allErrors.length > 0) {
      return { ok: false, error: `Form errors: ${allErrors.join('; ').slice(0, 300)}` }
    }

    const currentUrl = page.url()
    const isConfirmed =
      /confirmation|thank you|application.*received|successfully.*submitted/i.test(currentUrl) ||
      /thank you|application.*received|successfully.*submitted/i.test(iframeText.slice(0, 1000))

    if (isConfirmed) {
      console.log('[GH headless] Submission confirmed')
    } else {
      console.log('[GH headless] Submission sent — no error detected, marking as applied. URL:', currentUrl)
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[GH headless] Error:', msg)
    return { ok: false, error: `Headless submit failed: ${msg}` }
  } finally {
    if (resumeTempPath && fs.existsSync(resumeTempPath)) {
      fs.unlinkSync(resumeTempPath)
    }
    await browser.close()
  }
}
