const { sleep } = require('./utilityFunctions')

/**
 * Subscribe to the selector updates
 * @param {string} selector
 * @param {string} page
 * @param {string} prevValue
 * @returns {Promise<void>} Nothing
 * @callback (cb) What should happen
 * @callback (conditionСb) The condition for execution
 */
async function subscribe(selector, cb, conditionСb, page, prevValue) {
  const newVal = await page.$eval(selector, (el) => el.innerHTML).catch(() => page.reload())

  conditionСb(cb, newVal, prevValue)

  await sleep(1000)
  subscribe(selector, cb, conditionСb, page, newVal)
}

module.exports = { subscribe }
