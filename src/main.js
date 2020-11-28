const fs = require('fs')
const fsAsync = require('fs').promises

const puppeteer = require('puppeteer')
const $ = require('cheerio')
const inquirer = require('inquirer')
const colors = require('colors')

const { subscribe } = require('./util/subFunctions')
const { sleep, terminalNotification, dateFormatter } = require('./util/utilityFunctions')

const MINIMAL_STREAK = 3
const INITIAL_BET_AMOUNT = 8
let STARTUP_MODE = undefined
let COOKIE_ID = undefined

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
  /** Initial dialog */
  await inquirer
    .prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Which mode do you want to use?',
        choices: ['Headless', 'Browser'],
      },
      {
        type: 'list',
        name: 'cookie',
        message: 'Select the appropriate account.',
        choices: [
          { name: 'Main (edikm3)', value: 'cb42aae19ac47d49b00af92303cbcde1' },
          { name: 'Alex (alexvalkov)', value: 'e4055d2386a3efae0fe1507853f9e31c' },
          { name: 'Dev (skylikeit)', value: '141691fc4f290ff7f7df9531348957d3' },
          new inquirer.Separator(),
          { name: 'Enter it below', value: false },
        ],
      },
    ])
    .then(async ({ mode, cookie }) => {
      STARTUP_MODE = mode
      cookie
        ? (COOKIE_ID = cookie)
        : (COOKIE_ID = await inquirer
            .prompt({
              type: 'input',
              name: 'enteredCookie',
              message: 'Enter cookieID.',
            })
            .then(({ enteredCookie }) => enteredCookie))
    })

  /** Puppeteer initialize */
  const browser = await puppeteer.launch({
    headless: STARTUP_MODE === 'Headless' ? true : false,
    defaultViewport: null,
    args: ['--window-size=1920,1080', '--window-position=-1921,30', '--incognito'],
  })
  const [page] = await browser.pages()
  await page.goto('https://csgopolygon.gg/')

  return page
}

async function loginViaCookies(page) {
  const cookiesString = await fsAsync.readFile('./src/util/cookies.json')
  const cookies = await JSON.parse(cookiesString)
  cookies[0].value = COOKIE_ID
  await page.setCookie(...cookies)
  await page.reload()
  await sleep(100)

  return page
}

const makeBet = async (color, page) => {
  if (color === 'red') {
    state.bet.iterations += 1

    if (state.bet.isStarted) {
      state.bet.amount *= 2
      console.log(`Делаю повторную ставку, размером ${state.bet.amount}, на красное`)
    } else {
      state.bet.isStarted = true
      console.log(`Делаю начальную ставку, размером ${state.bet.amount}, на красное.`)
    }
  } else {
    state.bet.iterations += 1

    if (state.bet.isStarted) {
      state.bet.amount *= 2
      console.log(`Делаю повторную ставку, размером ${state.bet.amount}, на черное.`)
    } else {
      state.bet.isStarted = true
      console.log(`Делаю начальную ставку, размером ${state.bet.amount}, на черное.`)
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

  console.clear()

  state.resetToInitialValues()

  const pushToStateCurrentBalanceHandler = async (page, state) => {
    const currentWallet = await page.$eval('i#balance_p', (el) => el.innerHTML)
    state.game.wallet = currentWallet
    if (state.game.initialWallet == null) state.game.initialWallet = currentWallet
  }
  await pushToStateCurrentBalanceHandler(page, state)

  const pushToStateCurrentBallsPoolHandler = async (page, state) => {
    const node = await page.$eval('ul.balls', (el) => el.innerHTML)
    $('.ball span', node).each(function (i) {
      if (i === 9) state.game.currentWinnerColor = $(this).attr('class')
      if (i === 8) state.game.prevWinnerColor = $(this).attr('class')
      state.ballsPool.push([$(this).attr('class'), $(this).text()])
    })
  }
  await pushToStateCurrentBallsPoolHandler(page, state)

  const calculateCurrentStreaksOfColorsHandler = async (state) => {
    const revercedPool = [...state.ballsPool].reverse()
    revercedPool.forEach((el) => {
      state.streak.red.isCountingAllowed && (el[0] === 'red' || el[0] === 'green')
        ? (state.streak.red.counter += 1)
        : (state.streak.red.isCountingAllowed = false)

      state.streak.black.isCountingAllowed && (el[0] === 'dark' || el[0] === 'green')
        ? (state.streak.black.counter += 1)
        : (state.streak.black.isCountingAllowed = false)
    })
  }
  await calculateCurrentStreaksOfColorsHandler(state)

  // Reveal winner
  const revealWinnerHandler = async (state) => {
    const { red, black } = state.streak
    if (red.counter > black.counter) {
      if (red.counter > MINIMAL_STREAK) {
        /** Is winner handler */
        state.game.prevActualCounter = red.counter
        makeBet('black', page)
      } else {
        /** Is winner handler */
        if (red.counter < state.game.prevActualCounter) {
          console.log(`Победа красных (+${colors.green(INITIAL_BET_AMOUNT)})`)
          state.game.prevActualCounter = 0
          state.bet.wins += 1
        }
        console.log(`Жду пока стрик красных будет больше ${MINIMAL_STREAK}. (Текущий стрик ${state.streak.red.counter})`)
        state.resetBet()
      }
    } else {
      if (black.counter > MINIMAL_STREAK) {
        /** Is winner handler */
        state.game.prevActualCounter = black.counter
        makeBet('red', page)
      } else {
        /** Is winner handler */
        if (black.counter < state.game.prevActualCounter) {
          console.log(`Победа черных (+${colors.green(INITIAL_BET_AMOUNT)})`)
          state.game.prevActualCounter = 0
          state.bet.wins += 1
        }
        console.log(`Жду пока стрик черных будет больше ${MINIMAL_STREAK}. (Текущий стрик ${state.streak.black.counter})`)
        state.resetBet()
      }
    }
  }
  await revealWinnerHandler(state)

  history.push({
    pool: state.ballsPool,
    wallet: state.game.wallet,
  })

  await sleep(100)
  terminalNotification(state)
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
  fs.writeFileSync(`${dateFormatter.format(Date.now()).replace(/(, )/g, '.').replace(/(:)/g, '-')}.json`, JSON.stringify(history))
  console.log('\nGracefully shutting down from SIGINT (Ctrl-C)')
  process.exit(1)
})
