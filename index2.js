const { Observable, share, filter, bufferToggle, debounceTime, merge } = require('rxjs')
const { createReadStream } = require('fs')
const { Tail } = require('tail')

const { TF2_LOG } = require('./constants')
const { createInterface } = require('readline')

const logFile$ = new Observable((observer) => {
  // const filestream = createReadStream(TF2_LOG, { autoClose: false })
  // const reader = createInterface(filestream)

  // reader.on('line', (line) => observer.next(line))
  // reader.on('close', () => observer.complete())

  // return () => {
  //   reader.removeAllListeners()
  //   reader.close()

  //   filestream.destroy()
  // }

  const tail = new Tail(TF2_LOG)
  tail.on('line', (line) => observer.next(line))
  tail.on('error', (err) => observer.error(err))

  return () => {
    tail.removeAllListeners()
    tail.unwatch()
  }
}).pipe(share())

const connected$ = logFile$.pipe(
  filter((text) => / connected$/.test(text))
)

const lobbyUpdated$ = logFile$.pipe(
  filter((text) => text === 'Lobby updated')
)

const startMarker$ = logFile$.pipe(
  filter((text) => /-bc\.(.+?)-/.test(text))
)

const endMarker$ = logFile$.pipe(
  filter((text) => /-\/bc\.(.+?)-/.test(text))
)

const triggerCheck$ = merge(
  connected$,
  lobbyUpdated$
).pipe(debounceTime(1000))

const statusBlock$ = logFile$.pipe(
  bufferToggle(startMarker$, () => endMarker$)
)

lobbyUpdated$.subscribe((line) => console.log('line:', line))
connected$.subscribe((line) => console.log('line:', line))
triggerCheck$.subscribe(() => console.log('-- trigger check --'))
//statusBlock$.subscribe((block) => console.log('block:\n', block))
