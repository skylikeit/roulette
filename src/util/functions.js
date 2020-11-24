const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const terminalNotification = (state) =>
  console.log(
    '\x1b[1m',
    ...state.balls.map((el, i, arr) => {
      if (i === arr.length - 1) {
        return el[0] === 'red'
          ? `\x1b[47m\x1b[35m[\x1b[31m${el[1]}\x1b[35m]`
          : el[0] === 'dark'
          ? `\x1b[47m\x1b[35m[\x1b[30m${el[1]}\x1b[35m]`
          : `\x1b[47m\x1b[35m[\x1b[32m${el[1]}\x1b[35m]`;
      } else {
        return el[0] === 'red'
          ? `\x1b[47m\x1b[31m${el[1]}`
          : el[0] === 'dark'
          ? `\x1b[47m\x1b[30m${el[1]}`
          : `\x1b[47m\x1b[32m${el[1]}`;
      }
    }),
    '\x1b[0m'
  );

module.exports = { sleep, terminalNotification };
