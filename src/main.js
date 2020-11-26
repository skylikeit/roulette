const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const $ = require('cheerio')
const { sleep, terminalNotification, subscribe, dateFormatter } = require('./util/subfunctions')

const MINIMAL_STREAK = 3
const INITIAL_BET_AMOUNT = 2

const history = []

const state = {
  ballsPool: [],

  streak: {
    red: {
      counter: 0,
      isCountingAllowed: true,
    },
    black: {
      counter: 0,
      isCountingAllowed: true,
    },
  },

  game: {
    currentWinnerColor: undefined,
    prevWinnerColor: undefined,

    prevActualCounter: 0,

    wallet: undefined,
    initialWallet: undefined,
  },

  resetToInitialValues: function () {
    console.clear()

    this.ballsPool = []

    this.streak.red.counter = 0
    this.streak.red.isCountingAllowed = true
    this.streak.black.counter = 0
    this.streak.black.isCountingAllowed = true
  },

  bet: {
    isStarted: false,
    iterations: 0,
    wins: 0,
    amount: INITIAL_BET_AMOUNT,
  },

  resetBet: function () {
    this.bet.isStarted = false
    this.bet.counter = 0
    this.bet.amount = INITIAL_BET_AMOUNT
  },

  connectionLostKeeperProcess: false,
}

async function initializeBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--window-size=1920,1080', '--window-position=-1921,30', '--incognito'],
  })

  const [page] = await browser.pages()
  await page.goto('https://csgopolygon.gg/')

  return page
}

async function loginViaCookies(page) {
  const cookiesString = await fs.readFile('./src/util/cookies.json')
  const cookies = await JSON.parse(cookiesString)
  await page.setCookie(...cookies)
  await page.reload()
  await sleep(100)

  return page
}

const makeBet = async (color, page) => {
  if (color === 'red') {
    state.bet.iterations += 1

    if (state.bet.isStarted) {
      console.log('Делаю повторную ставку на красное')
      state.bet.amount *= 2
    } else {
      console.log('Делаю начальную ставку на красное')
      state.bet.isStarted = true
    }
  } else {
    state.bet.iterations += 1

    if (state.bet.isStarted) {
      console.log('Делаю повторную ставку на черное.')
      state.bet.amount *= 2
    } else {
      console.log('Делаю начальную ставку на черное.')
      state.bet.isStarted = true
    }
  }

  const input = await page.$('#roulette_amount')
  await input.click({ clickCount: 3 })
  await input.type(String(state.bet.amount))

  // Sleep if button disabled
  const node = await page.$eval('div.rounds', (el) => el.innerHTML)
  if ($('.red_button.betButton', node).attr('disabled')) await sleep(5000)
  else await sleep(500)

  if (color === 'red') {
    page.click('.red_button.betButton')
  } else {
    page.click('.dark_button.betButton')
  }
}

const newRoundHandler = async (page) => {
  /** Gate of lost connection */
  if (state.connectionLostKeeperProcess === true) return
  else state.connectionLostKeeperProcess = true

  state.resetToInitialValues()

  // Wallet handler
  const currentWallet = await page.$eval('i#balance_p', (el) => el.innerHTML)
  state.game.wallet = currentWallet
  if (state.game.initialWallet == null) state.game.initialWallet = currentWallet

  // Refetch current node
  const node = await page.$eval('ul.balls', (el) => el.innerHTML)
  $('.ball span', node).each(function (i) {
    if (i === 9) state.game.currentWinnerColor = $(this).attr('class')
    if (i === 8) state.game.prevWinnerColor = $(this).attr('class')
    state.ballsPool.push([$(this).attr('class'), $(this).text()])
  })

  // Fill streak state
  const revercedPool = [...state.ballsPool].reverse()
  revercedPool.forEach((el) => {
    state.streak.red.isCountingAllowed && (el[0] === 'red' || el[0] === 'green')
      ? (state.streak.red.counter += 1)
      : (state.streak.red.isCountingAllowed = false)

    state.streak.black.isCountingAllowed && (el[0] === 'dark' || el[0] === 'green')
      ? (state.streak.black.counter += 1)
      : (state.streak.black.isCountingAllowed = false)
  })

  // Which color winner handler
  const { red, black } = state.streak
  if (red.counter > black.counter) {
    if (red.counter > MINIMAL_STREAK) {
      /** Is winner handler */
      state.game.prevActualCounter = red.counter

      console.log(`Собираюсь совершить ставку на черное. (На данный момент стрик красных составляет ${state.streak.red.counter})`)
      makeBet('black', page)
    } else {
      /** Is winner handler */
      if (red.counter < state.game.prevActualCounter) {
        console.log(`Победа красных (\x1b[32m+${INITIAL_BET_AMOUNT}\x1b[0m)`)
        state.game.prevActualCounter = 0
        state.bet.wins += 1
      }

      console.log(
        `Жду пока стрик красных будет больше ${MINIMAL_STREAK}. (На данный момент он составляет ${state.streak.red.counter})`,
      )
      state.resetBet()
    }
  } else {
    if (black.counter > MINIMAL_STREAK) {
      /** Is winner handler */
      state.game.prevActualCounter = black.counter

      console.log(
        `Собираюсь совершить ставку на красное. (На данный момент стрик черных составляет ${state.streak.black.counter})`,
      )
      makeBet('red', page)
    } else {
      /** Is winner handler */
      if (black.counter < state.game.prevActualCounter) {
        console.log(`Победа черных (\x1b[32m+${INITIAL_BET_AMOUNT}\x1b[0m)`)
        state.game.prevActualCounter = 0
        state.bet.wins += 1
      }

      console.log(
        `Жду пока стрик черных будет больше ${MINIMAL_STREAK}. (На данный момент он составляет ${state.streak.black.counter})`,
      )
      state.resetBet()
    }
  }

  terminalNotification(state)
  history.push({
    pool: state.ballsPool,
    wallet: state.game.wallet,
  })
}

async function initializeBot(page) {
  subscribe(
    'ul.balls',
    (newVal) => String(newVal).includes('data-rollid') && newRoundHandler(page),
    (cb, newVal, prevValue) => newVal !== prevValue && cb(newVal),
    page,
  )

  subscribe(
    'div.messages',
    async () =>
      await page.reload({ waitUntil: ['networkidle0'] }).then(() => console.log('Connection has been lost. Reloading page.')),
    (cb, newVal) => String(newVal).includes('onnection') && cb(),
    page,
  )

  subscribe(
    'span.progress_timer',
    () => (state.connectionLostKeeperProcess = false),
    (cb, newVal, prevValue) => String(newVal).includes('***ROLLING***') && newVal !== prevValue && cb(),
    page,
  )
}

initializeBrowser()
  .then((page) => loginViaCookies(page))
  .then((page) => initializeBot(page))
  .catch((err) => console.log(err))

process.on('SIGINT', function () {
  console.log('Saving history before completion.')
  fsSync.writeFileSync(
    `${dateFormatter.format(Date.now()).replace(/(, )/g, '.').replace(/(:)/g, '-')}.json`,
    JSON.stringify(history),
  )
  console.log('\nGracefully shutting down from SIGINT (Ctrl-C)')
  process.exit(1)
})
