#!/usr/bin/env python3
"""WebSocket-бэкенд мультиплеера: комнаты, чат, состояние досок и атаки.

Сервер ничего не знает о правилах игры — он только раздаёт сообщения
участникам комнаты. Вся логика живёт на клиенте.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import string
from dataclasses import dataclass, field

from websockets.server import serve

HOST = "0.0.0.0"
PORT = 8283
MAX_PLAYERS = 8
MAX_NICK = 16
MAX_CHAT = 200
CODE_LENGTH = 5

# Поля состояния, которые пересылаются соперникам как есть.
STATE_FIELDS = ("board", "piece", "gy", "score", "lines", "level", "combo", "over")

log = logging.getLogger("tetris")


@dataclass
class Player:
    id: int
    ws: object
    nick: str
    room: str | None = None


@dataclass
class Room:
    code: str
    players: dict[int, Player] = field(default_factory=dict)

    @property
    def full(self) -> bool:
        return len(self.players) >= MAX_PLAYERS

    def info(self) -> dict:
        return {
            "type": "room",
            "code": self.code,
            "players": [{"id": p.id, "nick": p.nick} for p in self.players.values()],
        }


rooms: dict[str, Room] = {}


def new_code() -> str:
    while True:
        code = "".join(random.choices(string.digits, k=CODE_LENGTH))
        if code not in rooms:
            return code


def clean_nick(value) -> str:
    return (str(value or "")[:MAX_NICK].strip()) or "Игрок"


async def send(ws, payload: dict) -> None:
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        pass  # сокет уже закрыт — уборка произойдёт в finally


async def broadcast(room: Room, payload: dict, exclude: int | None = None) -> None:
    for player in list(room.players.values()):
        if player.id != exclude:
            await send(player.ws, payload)


async def join_room(player: Player, room: Room) -> None:
    room.players[player.id] = player
    player.room = room.code
    await send(player.ws, {"type": "joined", "room": room.code, "you": player.id})
    await broadcast(room, room.info())


async def leave_room(player: Player) -> None:
    room = rooms.get(player.room or "")
    if not room:
        return
    room.players.pop(player.id, None)
    player.room = None
    if not room.players:
        rooms.pop(room.code, None)
        return
    await broadcast(room, room.info())
    await broadcast(room, {"type": "chat", "nick": "*", "msg": f"{player.nick} вышел"})


async def handle_message(player: Player, message: dict) -> None:
    kind = message.get("type")

    if kind == "create":
        player.nick = clean_nick(message.get("nick"))
        await leave_room(player)
        room = Room(new_code())
        rooms[room.code] = room
        await join_room(player, room)
        await send(player.ws, {
            "type": "chat", "nick": "*",
            "msg": f"Комната {room.code} создана. Ты — {player.nick}",
        })

    elif kind == "join":
        player.nick = clean_nick(message.get("nick"))
        room = rooms.get(str(message.get("room") or "").strip())
        if room is None:
            await send(player.ws, {"type": "err", "msg": "Комната не найдена"})
        elif room.full:
            await send(player.ws, {"type": "err", "msg": f"Комната полна ({MAX_PLAYERS}/{MAX_PLAYERS})"})
        else:
            await leave_room(player)
            await join_room(player, room)
            await broadcast(room, {"type": "chat", "nick": "*", "msg": f"{player.nick} зашёл"})

    elif kind == "leave":
        await leave_room(player)

    elif kind == "list":
        await send(player.ws, {"type": "rooms", "rooms": [
            {"code": room.code, "players": len(room.players)}
            for room in rooms.values() if not room.full
        ]})

    elif kind == "chat":
        room = rooms.get(player.room or "")
        text = str(message.get("msg", ""))[:MAX_CHAT].strip()
        if room and text:
            await broadcast(room, {"type": "chat", "nick": player.nick, "msg": text})

    elif kind == "state":
        room = rooms.get(player.room or "")
        if room and len(room.players) > 1:
            payload = {"type": "state", "id": player.id, "nick": player.nick}
            payload.update({key: message.get(key) for key in STATE_FIELDS})
            await broadcast(room, payload, exclude=player.id)

    elif kind == "attack":
        room = rooms.get(player.room or "")
        lines = int(message.get("lines") or 0)
        if room and 0 < lines <= 20:
            # Мусор уходит всем соперникам в комнате — целиться пока некуда.
            await broadcast(room, {
                "type": "attack", "id": player.id, "nick": player.nick, "lines": lines,
            }, exclude=player.id)


async def handler(ws) -> None:
    player = Player(id=id(ws), ws=ws, nick="Игрок")
    log.info("connect %s", player.id)
    try:
        async for raw in ws:
            try:
                message = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if isinstance(message, dict):
                await handle_message(player, message)
    except Exception as err:
        log.debug("socket error: %s", err)
    finally:
        await leave_room(player)
        log.info("disconnect %s", player.id)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    log.info("WebSocket на ws://%s:%s", HOST, PORT)
    async with serve(handler, HOST, PORT, ping_interval=20, ping_timeout=20):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("остановлен")
