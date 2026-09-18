import asyncio
import json
import random
import string

from websockets.server import serve


class Room:
    def __init__(self, code):
        self.code = code
        self.clients = {}
        self.nicks = {}


rooms = {}
clients = {}


def rand_code(n=5):
    return ''.join(random.choices(string.digits, k=n))


async def send(ws, obj):
    try:
        await ws.send(json.dumps(obj))
    except Exception:
        pass


async def broadcast(room, obj, exclude=None):
    for cid, ws in list(room.clients.items()):
        if cid != exclude:
            await send(ws, obj)


async def room_info(room):
    return {
        'type': 'room',
        'code': room.code,
        'players': [
            {'id': cid, 'nick': room.nicks[cid]}
            for cid in room.clients
        ],
    }


async def handler(ws):
    cid = None
    code = None
    nick = None
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
                mtype = msg.get('type')
            except Exception:
                continue

            if mtype == 'create':
                nick = (msg.get('nick') or 'player')[:16].strip() or 'player'
                code = rand_code()
                while code in rooms:
                    code = rand_code()
                room = Room(code)
                rooms[code] = room
                cid = id(ws)
                room.clients[cid] = ws
                room.nicks[cid] = nick
                clients[cid] = (ws, code, nick)
                await send(ws, {'type': 'joined', 'room': code, 'you': cid})
                await broadcast(room, await room_info(room))
                await send(ws, {
                    'type': 'chat', 'nick': '*',
                    'msg': f'Комната {code} создана. Ты: {nick}',
                })

            elif mtype == 'join':
                nick = (msg.get('nick') or 'player')[:16].strip() or 'player'
                room_code = str(msg.get('room') or '').strip()
                room = rooms.get(room_code)
                if not room:
                    await send(ws, {'type': 'err', 'msg': 'Комната не найдена'})
                    continue
                if len(room.clients) >= 8:
                    await send(ws, {'type': 'err', 'msg': 'Комната полна (8/8)'})
                    continue
                code = room_code
                cid = id(ws)
                room.clients[cid] = ws
                room.nicks[cid] = nick
                clients[cid] = (ws, code, nick)
                await send(ws, {'type': 'joined', 'room': code, 'you': cid})
                await broadcast(room, await room_info(room))
                await broadcast(room, {
                    'type': 'chat', 'nick': '*',
                    'msg': f'{nick} зашёл в комнату',
                })

            elif mtype == 'leave':
                break

            elif mtype == 'list':
                open_rooms = [
                    {'code': r.code, 'players': len(r.clients)}
                    for r in rooms.values()
                ]
                await send(ws, {'type': 'rooms', 'rooms': open_rooms})

            elif mtype == 'chat':
                text = str(msg.get('msg', ''))[:200].strip()
                if not code or not text:
                    continue
                room = rooms.get(code)
                if room:
                    payload = {'type': 'chat', 'nick': nick, 'msg': text}
                    await broadcast(room, payload)
                    await send(ws, payload)

            elif mtype == 'state':
                if not code:
                    continue
                room = rooms.get(code)
                if room and len(room.clients) > 1:
                    await broadcast(room, {
                        'type': 'state',
                        'id': cid,
                        'nick': nick,
                        'board': msg.get('board'),
                        'piece': msg.get('piece'),
                        'gy': msg.get('gy'),
                        'score': msg.get('score'),
                        'lines': msg.get('lines'),
                        'level': msg.get('level'),
                        'over': msg.get('over', 0),
                    }, exclude=cid)
    except Exception:
        pass
    finally:
        if code:
            clients.pop(cid, None)
            room = rooms.get(code)
            if room:
                room.clients.pop(cid, None)
                room.nicks.pop(cid, None)
                if not room.clients:
                    rooms.pop(code, None)
                else:
                    await broadcast(room, await room_info(room))
                    await broadcast(room, {
                        'type': 'chat', 'nick': '*',
                        'msg': f'{nick} вышел',
                    })


async def main():
    async with serve(handler, '0.0.0.0', 8283):
        await asyncio.Future()


asyncio.run(main())