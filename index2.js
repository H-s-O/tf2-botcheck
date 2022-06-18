const {
  Observable,
  share,
  filter,
  bufferToggle,
  debounceTime,
  merge,
  tap,
  delay,
  map,
  of,
  take,
  exhaustMap,
  forkJoin,
  defer,
  interval,
  switchMap,
  startWith,
  iif,
  delayWhen,
  timer,
  scan,
  timeout,
  withLatestFrom,
  throttleTime,
  retry,
} = require('rxjs')
const { Tail } = require('tail')
const { EOL } = require('os')
const yargs = require('yargs')

const { TF2_LOG } = require('./constants')
const { sendCommand } = require('./src/tf2')
const { parseAll } = require('./src/parsers')
const { findBots, getBotMessages, getKickableBot } = require('./src/bots')
const { escapeMessage } = require('./src/utils')
// const test_console = require('./test_console')
// const test_console2 = require('./test_console2')
// const test_console3 = require('./test_console3')
// const test_console4 = require('./test_console4')

const getStartMarkerString = (hash) => `-bc.${hash}-`
const getEndMarkerString = (hash) => `-/bc.${hash}-`

const log = (...args) => tap(() => console.log(...args))
const logTap = () => tap((val) => console.log(val))
const info = (...args) => tap(() => console.info(...args))

const logFile$ = new Observable((observer) => {
  const tail = new Tail(TF2_LOG, { useWatchFile: true })
  tail.on('line', (line) => observer.next(line))
  tail.on('error', (err) => observer.error(err))

  return () => {
    tail.removeAllListeners()
    tail.unwatch()
  }
}).pipe(share())

const connected$ = logFile$.pipe(
  filter((text) => / connected$/.test(text) || text === 'test '),
  tap((text) => console.log('-> new player:', text))
)

const lobbyUpdated$ = logFile$.pipe(
  filter((text) => text === 'Lobby updated'),
  tap((text) => console.log('-> lobby updated'))
)

const GAME_JOIN_MARKER_LOOKUP = `Team Fortress`
const TEAMS_SWITCHED_MARKER_LOOKUP = `Teams have been switched.`
const teamsSwitched$ = logFile$.pipe(
  filter((text) => text === GAME_JOIN_MARKER_LOOKUP || text === TEAMS_SWITCHED_MARKER_LOOKUP),
  scan((acc, val) => val === GAME_JOIN_MARKER_LOOKUP ? null : val === TEAMS_SWITCHED_MARKER_LOOKUP ? true : null, null),
  startWith(null),
  tap((val) => console.log('teams switched:', val))
)
teamsSwitched$.subscribe()

const interval$ = interval(30000).pipe(
  tap(() => console.log('-> 30s interval check'))
)

const triggerCheck$ = merge(
  merge(
    connected$,
    lobbyUpdated$,
  ).pipe(debounceTime(1000)),
  interval$
).pipe(
  throttleTime(20000),
  startWith(true),
)

const getStatus$ = defer(() => {
  const hash = Date.now().toString(36)

  const startMarkerString = getStartMarkerString(hash)
  const endMarkerString = getEndMarkerString(hash)

  const startMarker$ = logFile$.pipe(
    filter((text) => text === `${startMarkerString} `), // echoing always adds a trailing space
    take(1)
  )
  const endMarker$ = logFile$.pipe(
    filter((text) => text === `${endMarkerString} `), // echoing always adds a trailing space
    take(1)
  )

  return forkJoin([
    of(1).pipe(
      tap(() => sendCommand(`"+echo ${startMarkerString}" "+name" "+tf_lobby_debug" "+status"`)),
      delay(250),
      tap(() => sendCommand(`"+echo ${endMarkerString}"`)),
    ),
    logFile$.pipe(
      bufferToggle(startMarker$, () => endMarker$),
      timeout({ first: 10000 }),
      take(1)
    )
  ]).pipe(
    retry(),
    map(([first, second]) => second.slice(1, -1).join(EOL)), // join into single string for parsing
  )
})
// const getStatus$ = defer(() => of(test_console3))

const sendMessages = (bots, status) => of(1).pipe(
  map(() => getBotMessages(bots)),
  switchMap(([message1, message2]) => iif(
    () => message1 !== null,
    of(1).pipe(
      tap(() => {
        console.info('Sending known bots message')
        sendCommand(`"+say ${escapeMessage(message1)}"`)
      }),
    ),
    of(false)
  ).pipe(
    delayWhen(() => message1 !== null && message2 !== null ? timer(1000) : of(false)),
    switchMap(() => iif(
      () => message2 !== null,
      of(2).pipe(
        tap(() => {
          console.info('Sending hijacking bots message')
          sendCommand(`"+say ${escapeMessage(message2)}"`)
        })
      ),
      of(false)
    ))
  )
  )
)

const callVote = (bots, status) => of(1).pipe(
  map(() => getKickableBot(bots, status)),
  switchMap((bot) => iif(
    () => bot !== null,
    of(1).pipe(
      tap(() => {
        console.info(`Attempting to auto-kick bot "${bot.cleanName}", id ${bot.userid}`)
        sendCommand(`"+callvote kick ${bot.userid} cheating" "+say_party ${escapeMessage(`Calling vote on "${bot.cleanName}" (${bot.flag}), id ${bot.userid}`)}"`)
      })
    ),
    of(false)
  ))
)

const votesAndMessages = (status) => of(1).pipe(
  map(() => findBots(status)),
  switchMap((bots) => (bots.length > 0)
    ? sendMessages(bots, status).pipe(
      delay(3000),
      switchMap(() => callVote(bots, status)),
    )
    : of(false)
  )
)

triggerCheck$.pipe(
  info('=== BEGIN CHECK ==='),
  exhaustMap(() => getStatus$.pipe(
    withLatestFrom(teamsSwitched$),
    map(([statusContent, teamsSwitchedStatus]) => parseAll(statusContent, teamsSwitchedStatus)),
    switchMap((result) => (result !== null)
      ? votesAndMessages(result)
      : of(false)
    )
  )),
  info('=== CHECK DONE ===')
).subscribe()
