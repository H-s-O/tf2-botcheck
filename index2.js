const { Observable, share, filter, bufferToggle, debounceTime, merge, tap, delay, map, of, take, exhaustMap, forkJoin, defer, interval, switchMap, pipe, startWith, concat, endWith, throttleTime, EMPTY, iif, delayWhen, timer } = require('rxjs')
const { Tail } = require('tail')
const { EOL } = require('os')

const { TF2_LOG, STATE_ACTIVE, STATE_SPAWNING, STALLED_EXCLUDE_TIME_LIMIT } = require('./constants')
const { sendCommand } = require('./src/tf2')
const { parseAll, mergeStatusAndLobby } = require('./src/parsers')
const { findBots, botInfoString } = require('./src/bots')
const { censorName, censorMessage, messageChecksum, escapeMessage } = require('./src/utils')
const test_console = require('./test_console')

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
  startWith(true),
  throttleTime(30000),
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
      take(1)
    )
  ]).pipe(
    map(([first, second]) => second.slice(1, -1).join(EOL)), // join into single string for parsing
  )
})
// const getStatus$ = defer(() => of(test_console))

const sendMessages = (bots, currentPlayerInfo) => of(1).pipe(
  map(() => {
    const foundBots = bots.filter(({ flag, connected, state }) =>
      flag === 'namedbot'
      && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)))
    const foundDuplicates = bots.filter(({ flag, connected, state }) =>
      flag === 'hijackerbot'
      && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)))

    let message1 = null, message2 = null
    let needsGlobalCensor = foundBots.some(({ censor, state }) => censor && state === STATE_ACTIVE)
    if (foundBots.length > 0) {
      const list1 = foundBots.map(({ cleanName, state, connected, realTeam, censor }) => {
        return `${censor && (state === STATE_ACTIVE || needsGlobalCensor)
          ? censorName(cleanName)
          : needsGlobalCensor
            ? censorMessage(cleanName)
            : cleanName}${botInfoString(state, connected, realTeam)}`
      }).join(', ')
      let content1 = `Found ${foundBots.length} bot${foundBots.length > 1 ? 's' : ''}`
      if (needsGlobalCensor) {
        content1 = censorMessage(content1)
      }
      const checksum1 = messageChecksum(content1).toString(36).toUpperCase().padStart(2, '0')
      let heading1 = `[BOT CHECK |${checksum1}]`
      if (needsGlobalCensor) {
        heading1 = censorMessage(heading1)
      }
      message1 = `${heading1} ${content1}: ${list1}`
      console.info('Known bots message to send:')
      console.info(message1)
    }
    if (foundDuplicates.length > 0) {
      const list2 = foundDuplicates.map(({ cleanName, state, connected, realTeam }) => {
        return `${needsGlobalCensor ? censorMessage(cleanName) : cleanName}${botInfoString(state, connected, realTeam)}`
      }).join(', ')
      let content2 = `Found ${foundDuplicates.length} name-stealing bot${foundDuplicates.length > 1 ? 's' : ''}`
      if (needsGlobalCensor) {
        content2 = censorMessage(content2)
      }
      const checksum2 = messageChecksum(content2).toString(36).toUpperCase().padStart(2, '0')
      let heading2 = `[BOT CHECK |${checksum2}]`
      if (needsGlobalCensor) {
        heading2 = censorMessage(heading2)
      }
      message2 = `${heading2} ${content2}: ${list2}`
      console.info('Hijacking bots message to send:')
      console.info(message2)
    }

    return [message1, message2]
  }),
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

const callVote = (bots, currentPlayerInfo) => of(1).pipe(
  log('(callVote)'),
  tap(() => sendCommand('"+say_party callvote"'))
)

const votesAndMessages = (parsed) => of(parsed).pipe(
  map((result) => [findBots(mergeStatusAndLobby(result.status, result.lobbyDebug), result.currentPlayer), result.currentPlayer]),
  switchMap(([bots, currentPlayer]) => (bots.length > 0)
    ? sendMessages(bots, currentPlayer).pipe(
      delay(3000),
      switchMap(() => callVote(bots, currentPlayer)),
    )
    : of(false)
  )
)

triggerCheck$.pipe(
  info('=== BEGIN CHECK ==='),
  exhaustMap(() => getStatus$.pipe(
    map((statusContent) => parseAll(statusContent)),
    switchMap((result) => (result.currentPlayer && result.lobbyDebug.length > 0 && result.status.length > 0)
      ? votesAndMessages(result)
      : of(false)
    )
  )),
  info('=== CHECK DONE ===')
).subscribe()
