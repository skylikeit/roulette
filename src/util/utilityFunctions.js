const colors = require('colors')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const terminalNotification = (state) => {
  const countProfit = () =>
    state.game.initialWallet <= state.game.wallet
      ? colors.green(`+${state.game.wallet - state.game.initialWallet}`)
      : colors.red(state.game.wallet - state.game.initialWallet)

  console.log('')
  console.log(
    colors.bgBlack(
      ...state.ballsPool.map((el, i, arr) => {
        if (i === arr.length - 1) {
          return el[0] === 'red'
            ? `${el[1]}`.bold.red.underline
            : el[0] === 'dark'
            ? `${el[1]}`.bold.grey.underline
            : `${el[1]}`.bold.green.underline
        } else {
          return el[0] === 'red' ? `${el[1]}`.bold.red : el[0] === 'dark' ? `${el[1]}`.bold.grey : `${el[1]}`.bold.green
        }
      }),
    ),
    `\n\nСовершенно ставок: ${state.bet.iterations}\nПобед: ${state.bet.wins}\nТекущий баланс: ${
      state.game.wallet
    } (${countProfit()})`,
  )

  /** Dev mode */
  // console.log('\n', '***DEV MODE***'.rainbow.bold.underline, '\n', state.game, '\n', state.streak, '\n', state.bet)
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

module.exports = { sleep, terminalNotification, dateFormatter }
