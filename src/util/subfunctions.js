const colors = require('colors')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const terminalNotification = (state) => {
  const countProfit = () =>
    state.game.initialWallet <= state.game.wallet
      ? `\x1b[32m+${state.game.wallet - state.game.initialWallet}\x1b[0m`
      : `\x1b[31m-${state.game.initialWallet - state.game.wallet}\x1b[0m`

  console.log(' ')
  console.log(
    ...state.ballsPool.map((el, i, arr) => {
      if (i === arr.length - 1) {
        return el[0] === 'red'
          ? `${el[1]}`.bold.red.underline
          : el[0] === 'dark'
          ? `${el[1]}`.bold.black.underline
          : `${el[1]}`.bold.green.underline
      } else {
        return el[0] === 'red' ? `${el[1]}`.bold.red : el[0] === 'dark' ? `${el[1]}`.bold.black : `${el[1]}`.bold.green
      }
    }),
    `\n\nСовершенно ставок: ${state.bet.iterations}\nПобед: ${state.bet.wins}\nТекущий баланс: ${
      state.game.wallet
    } (${countProfit()})`,
  )
}

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

const dateFormatter = new Intl.DateTimeFormat('ru', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false,
  timeZone: 'UTC',
})

module.exports = { sleep, terminalNotification, subscribe, dateFormatter }
