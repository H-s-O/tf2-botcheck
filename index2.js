const { Observable, share, filter, bufferToggle, debounceTime, merge, tap, delay, map, of, take, exhaustMap, forkJoin, defer, interval } = require('rxjs')
const { Tail } = require('tail')
const { EOL } = require('os')

const { TF2_LOG, STATE_ACTIVE, STATE_SPAWNING, STALLED_EXCLUDE_TIME_LIMIT } = require('./constants')
const { sendCommand } = require('./src/tf2')
const { parseAll, mergeStatusAndLobby } = require('./src/parsers')
const { findBots } = require('./src/bots')

const getStartMarkerString = (hash) => `-bc.${hash}-`
const getEndMarkerString = (hash) => `-/bc.${hash}-`

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
  tap((text) => console.log('-> user connected:', text))
)

const lobbyUpdated$ = logFile$.pipe(
  filter((text) => text === 'Lobby updated'),
  tap((text) => console.log('-> lobby updated'))
)

const interval$ = interval(30000).pipe(
  tap(() => console.log('-> 30s interval check'))
)

const triggerCheck$ = merge(
  connected$,
  lobbyUpdated$,
  interval$
).pipe(
  debounceTime(1000),
  tap(() => console.log('-- trigger check --'))
)

const doCheck$ = defer(() => {
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
      take(1)
    ),
    logFile$.pipe(
      bufferToggle(startMarker$, () => endMarker$),
      take(1)
    )
  ]).pipe(
    map(([first, second]) => second.slice(1, -1).join(EOL)), // join into single string for parsing
    map((statusContent) => {
      // console.log('statusContent:\n', statusContent)
      const result = parseAll(statusContent)
      // console.log(result.currentPlayer)
      // console.table(result.lobbyDebug)
      // console.table(result.status)
      if (result.currentPlayer && result.lobbyDebug.length > 0 && result.status.length > 0) {
        const merged = mergeStatusAndLobby(result.status, result.lobbyDebug)
        //console.table(merged)
        const bots = findBots(merged, result.currentPlayer)
        const foundBots = bots.filter(({ flag, connected, state }) =>
          flag === 'namedbot'
          && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)));
        const foundDuplicates = bots.filter(({ flag, connected, state }) =>
          flag === 'hijackerbot'
          && (state === STATE_ACTIVE || (state === STATE_SPAWNING && connected < STALLED_EXCLUDE_TIME_LIMIT)));
        if (foundBots.length === 0 && foundDuplicates.length === 0) {
          // Nothing suspicious found, exit
          // if (!SIMULATE) {
          //   SEND_COMMAND('"+playgamesound Player.HitSoundBeepo"');
          // }
          // console.info('No bots or duplicates found, exiting');
          sendCommand('+say_party "no bots"')
        } else {
          sendCommand('+say_party "some bots found"')
        }
      }
    })
  )
})

triggerCheck$.pipe(
  exhaustMap(() => doCheck$),
  tap((val) => console.log('val:', val))
).subscribe()

//lobbyUpdated$.subscribe((line) => console.log('line:', line))
//connected$.subscribe((line) => console.log('line:', line))
//triggerCheck$.subscribe(() => console.log('-- trigger check --'))
//statusBlock$.subscribe((block) => console.log('block:\n', block))
