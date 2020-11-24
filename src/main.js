const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const $ = require('cheerio');
const { sleep, terminalNotification } = require('./util/functions');

const MINIMAL_STREAK = 3;
const INITIAL_BET_AMOUNT = 2;

const state = {
  balls: [],

  red: {
    value: 0,
    streak: false,
  },
  black: {
    value: 0,
    streak: false,
  },
  stopStreak: function (color) {
    this[color].streak = false;
  },

  bet: {
    isStarted: false,
    counter: 0,
    amount: INITIAL_BET_AMOUNT,
    color: undefined,
  },
  // If this.bet.isStarted false do:
  startBet: function () {
    this.bet.isStarted = true;
  },
  // If this.red.value less than MINIMAL_STREAK do:
  resetBet: function () {
    this.bet.isStarted = false;
    this.bet.amount = INITIAL_BET_AMOUNT;
    this.bet.counter = 0;
    this.bet.color = undefined;
  },
  initializeBet: function (color) {
    this.bet.counter += 1;
    this.bet.color = color;
  },
  // If this.bet.isStarted true do:
  lose: function () {
    this.bet.amount *= 2;
  },

  isUpdated: false,
  update: function () {
    this.isUpdated = true;
  },
  newRound: function () {
    // console.clear();

    this.balls = [];
    this.isUpdated = false;

    this.red.value = 0;
    this.black.value = 0;
    this.red.streak = true;
    this.black.streak = true;
  },
};

async function initializeBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--window-size=1920,1080',
      '--window-position=-1921,0',
      '--incognito',
    ],
  });

  const page = await browser.newPage();
  await page.goto('https://csgopolygon.gg/');
  await page.exposeFunction('onBallsUpdate', () => state.update());
  await page.exposeFunction('onChatUpdate', async (text) => {
    if (String(text).includes('Server Connection lost')) {
      console.log('Connection has been lost. Reloading page.');
      await page.reload();
    }
  });

  return page;
}

async function loginViaCookies(page) {
  const cookiesString = await fs.readFile('./src/util/cookies.json');
  const cookies = await JSON.parse(cookiesString);
  await page.setCookie(...cookies);
  await page.reload();
  await sleep(100);

  return page;
}

async function subscriptions(page) {
  await page.evaluate(() => {
    $('ul.balls').bind('DOMSubtreeModified', () => window.onBallsUpdate());
    $('div.messages').bind('DOMSubtreeModified', (e) =>
      window.onChatUpdate(e.currentTarget.textContent.trim())
    );
  });

  return page;
}

const makeBet = async (color, page) => {
  await sleep(5000);

  if (color === 'red') {
    state.initializeBet(color);

    if (state.bet.isStarted) {
      console.log('Делаю повторную ставку на красное');
      state.lose();
    } else {
      console.log('Делаю начальную ставку на красное');
      state.startBet();
    }
  } else {
    state.initializeBet(color);

    if (state.bet.isStarted) {
      console.log('Делаю повторную ставку на черное');
      state.lose();
    } else {
      console.log('Делаю начальную ставку на черное');
      state.startBet();
    }
  }

  // await page.focus('#roulette_amount');
  // page.keyboard.type(String(state.bet.amount));

  const input = await page.$('#roulette_amount');
  await input.click({ clickCount: 3 });
  await input.type(String(state.bet.amount));

  if (color === 'red') page.click('.red_button.betButton');
  else page.click('.dark_button.betButton');
};

const gameHandler = (page) => {
  let ballsReverse = [...state.balls];
  ballsReverse.reverse();

  ballsReverse.forEach((el) => {
    state.red.streak && (el[0] === 'red' || el[0] === 'green')
      ? (state.red.value += 1)
      : state.stopStreak('red');

    state.black.streak && (el[0] === 'dark' || el[0] === 'green')
      ? (state.black.value += 1)
      : state.stopStreak('black');
  });

  const { red, black } = state;

  if (red.value > black.value) {
    if (red.value > MINIMAL_STREAK) {
      console.log(
        `Gonna bet on black color, cause red streak is ${state.red.value}`
      );
      makeBet('black', page);
    } else {
      state.resetBet();
      console.log(
        `Gonna wait until red streak is more than ${MINIMAL_STREAK} (Current streak is ${state.red.value})`
      );
    }
  } else {
    if (black.value > MINIMAL_STREAK) {
      console.log(
        `Gonna bet on red color, cause black streak is ${state.black.value}`
      );
      makeBet('red', page);
    } else {
      state.resetBet();
      console.log(
        `Gonna wait until black streak is more than ${MINIMAL_STREAK} (Current streak is ${state.black.value})`
      );
    }
  }
};

async function monitor(page) {
  console.clear();
  console.log('Waiting for a new round...');

  state.update();

  setInterval(async () => {
    if (state.isUpdated) {
      // Bring to default values
      state.newRound();

      // Refetch current node
      const node = await page.evaluate(
        () => document.querySelector('ul.balls').innerHTML
      );

      // Push balls to state
      $('.ball span', node).each(function () {
        state.balls.push([$(this).attr('class'), $(this).text()]);
      });

      gameHandler(page);

      terminalNotification(state);

      await sleep(6000);
      console.log('Bet: ', state.bet, '\n');
    }
  }, 200);
}

new Promise((res, rej) => {
  res(initializeBrowser());
})
  .then((page) => loginViaCookies(page))
  .then((page) => subscriptions(page))
  .then((page) => monitor(page))
  .catch((err) => console.log(err));

process.on('SIGINT', function () {
  console.log('\nGracefully shutting down from SIGINT (Ctrl-C)');
  process.exit(1);
});
