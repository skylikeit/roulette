const puppeteer = require('puppeteer')
const fs = require('fs').promises

async function initializeBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--window-size=1920,1080', '--window-position=-1921,30', '--incognito'],
  })

  const [page] = await browser.pages()
  await page.goto('https://csgopolygon.gg/')

  return { page, browser }
}

async function authentication(page) {
  await page.waitForSelector('input[id="login_username"]')
  await page.focus('input[id="login_username"')
  await page.keyboard.type('skylikeit')
  await page.focus('input[id="login_password"]')
  await page.keyboard.type('8802skyZ')
  await page.click('div.window_sign_in_buttons button.window_default_green_button_inline')

  await page.setDefaultTimeout(200000)

  return { page, browser }
}

async function getCookies(page) {
  await page.waitForSelector('i#balance_p')

  const cookies = await page.cookies()
  await fs.writeFile('./cookies.json', JSON.stringify(cookies, null, 2))
  await browser.close()
}

initializeBrowser()
  .then((page, browser) => authentication(page, browser))
  .then((page, browser) => getCookies(page, browser))
  .then(() => console.log('End'))
  .catch((err) => console.log('ERROR:', err))
