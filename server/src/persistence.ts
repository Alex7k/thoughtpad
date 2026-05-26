import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'
import { readNote, writeNote } from './notes'

const messageSync = 0
const messageAwareness = 1

export type SocketData = {
  noteName: string
  controlledAwarenessClients: number[]
}

type Socket = Bun.ServerWebSocket<SocketData>

type AwarenessChange = {
  added: number[]
  updated: number[]
  removed: number[]
}

type Room = {
  doc: Y.Doc
  text: Y.Text
  awareness: awarenessProtocol.Awareness
  sockets: Set<Socket>
  loaded: Promise<void>
  saveTimer?: Timer
}

const rooms = new Map<string, Room>()

function createRoom(noteName: string) {
  const doc = new Y.Doc()
  const text = doc.getText('codemirror')
  const awareness = new awarenessProtocol.Awareness(doc)
  const sockets = new Set<Socket>()

  const room: Room = {
    doc,
    text,
    awareness,
    sockets,
    loaded: readNote(noteName).then((content) => {
      if (text.length === 0 && content.length > 0) {
        text.insert(0, content)
      }
    })
  }

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    broadcastDocUpdate(room, update, origin)
    scheduleSave(noteName, room)
  })

  awareness.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    const changedClients = added.concat(updated, removed)
    const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(encoder, update)
    broadcast(room, encoding.toUint8Array(encoder), origin)
  })

  rooms.set(noteName, room)
  return room
}

export function getRoom(noteName: string) {
  return rooms.get(noteName) ?? createRoom(noteName)
}

export async function replaceRoomText(noteName: string, content: string) {
  const room = getRoom(noteName)
  await room.loaded

  room.doc.transact(() => {
    room.text.delete(0, room.text.length)
    room.text.insert(0, content)
  })

  await writeNote(noteName, content)
}

export async function addSocket(socket: Socket, noteName: string) {
  const room = getRoom(noteName)
  await room.loaded
  room.sockets.add(socket)

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, room.doc)
  send(socket, encoding.toUint8Array(encoder))

  const states = room.awareness.getStates()
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder()
    encoding.writeVarUint(awarenessEncoder, messageAwareness)
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys()))
    )
    send(socket, encoding.toUint8Array(awarenessEncoder))
  }
}

export function removeSocket(socket: Socket) {
  const room = rooms.get(socket.data.noteName)
  if (!room) return

  room.sockets.delete(socket)
  awarenessProtocol.removeAwarenessStates(room.awareness, socket.data.controlledAwarenessClients, null)
}

export function handleSocketMessage(socket: Socket, data: string | Buffer | ArrayBuffer) {
  if (typeof data === 'string') return

  const room = rooms.get(socket.data.noteName)
  if (!room) return

  const decoder = decoding.createDecoder(new Uint8Array(data))
  const encoder = encoding.createEncoder()
  const messageType = decoding.readVarUint(decoder)

  if (messageType === messageSync) {
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, socket)

    if (encoding.length(encoder) > 1) {
      send(socket, encoding.toUint8Array(encoder))
    }
  }

  if (messageType === messageAwareness) {
    const update = decoding.readVarUint8Array(decoder)
    const clients = decodeAwarenessClientIds(update)
    socket.data.controlledAwarenessClients = Array.from(
      new Set(socket.data.controlledAwarenessClients.concat(clients))
    )
    awarenessProtocol.applyAwarenessUpdate(room.awareness, update, socket)
  }
}

function broadcastDocUpdate(room: Room, update: Uint8Array, origin: unknown) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeUpdate(encoder, update)
  const message = encoding.toUint8Array(encoder)

  for (const socket of room.sockets) {
    if (socket !== origin) send(socket, message)
  }
}

function broadcast(room: Room, message: Uint8Array, origin?: unknown) {
  for (const socket of room.sockets) {
    if (socket !== origin) send(socket, message)
  }
}

function send(socket: Socket, message: Uint8Array) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(message)
  }
}

function scheduleSave(noteName: string, room: Room) {
  if (room.saveTimer) clearTimeout(room.saveTimer)
  room.saveTimer = setTimeout(() => {
    void writeNote(noteName, room.text.toString())
  }, 250)
}

function decodeAwarenessClientIds(update: Uint8Array) {
  const decoder = decoding.createDecoder(update)
  const length = decoding.readVarUint(decoder)
  const clients: number[] = []

  for (let index = 0; index < length; index += 1) {
    clients.push(decoding.readVarUint(decoder))
    decoding.readVarUint(decoder)
    decoding.readVarString(decoder)
  }

  return clients
}
