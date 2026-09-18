# ТЕТРИС — React Bits

Мультиплеерный Тетрис: комнаты, ники, чат, мини-доски соперников по WebSocket.
Весь игровой движок портирован в React-приложение с UI-эффектами в стиле
[React Bits](https://reactbits.dev) — спотлайт-карточки, магнитные кнопки, scramble-заголовок.
Плюс фирменные «лютые» эффекты: zoom + slow-mo тизер перед сломом ряда, неоновые вспышки, виньетка.

Без JSX и без сборщика: React 18 (UMD) самохостится рядом со страницей —
подходит для серверов, где нет node/npm.

## Возможности

- Игра: тетримино, ghost-piece, «следующая фигура», комбо, счёт/уровень/линии.
- Брейк-тизер: перед сломом ряда замедление времени + зум + hue-rotate (в т.ч. на хард-дропе).
- Мультиплеер по WebSocket: создание/вход в комнату по коду (до 8 игроков), чат,
  мини-доски соперников с плавной интерполяцией фигур, ghost + глоу, вспышки при сборе линий,
  «GAME OVER» и «ТЕТРИС!» на мини-досках.
- UI на React: стартовый оверлей, меню мультиплеера, HUD, оверлей GAME OVER.
- Лёгкий перезапуск: `index_legacy.html` — рабочая vanilla-версия (откат).

## Структура

| Файл | Назначение |
|---|---|
| `index.html` | Готовая страница (React-порт), движок и UI инлайн |
| `server.py` | WebSocket-бэкенд 8283 (комнаты, ники, чат, state) |
| `react.production.min.js`, `react-dom.production.min.js` | Самохостed React 18 UMD |
| `engine.js` | Исходный игровой движок (vanilla, до порта) |
| `engine_r.js` | Движок после трансформации (DOM/HUD/Net через колбэки) |
| `net_r.js` | Модуль `Net` (WebSocket-клиент) + `drawOpp` + `sendState` |
| `app.js` | React-UI (`React.createElement`, без JSX) |
| `t.py` | Трансформации движка `engine.js` → `engine_r.js` |
| `build.py` | Сборка финального `index.html` |
| `css_add.txt` | React-Bits-стили |
| `index_legacy.html` | Vanilla-версия для отката |
| `test.js`, `test2.js` | Проверки движка и jsdom-интеграционный тест |

## Деплой

```
# WebSocket-бэкенд :8283
setsid nohup python3 server.py > ws8283.log 2>&1 &

# HTTP :6767 (раздать index.html + react*.js)
setsid nohup python3 -m http.server 6767 --directory . > server6767.log 2>&1 &
```

Открыть `http://<host>:6767/`.

## Пересборка после правок

```
python3 t.py      # engine.js -> engine_r.js  (воспроизводимо, идемпотентно)
python3 build.py  # -> react.html (инлайн движок + app.js + CSS)
```

Затем получить итоговый `index.html` из `react.html`.

## Тесты

```
# движок + Net (node с DOM/WebSocket-заглушками)
node test.js

# полный монтаж приложения в jsdom (нужен npm i jsdom; react/react-dom UMD рядом)
node test2.js
```

## Бэкенд-протокол WS

Клиент → сервер: `create {nick}`, `join {nick, room}`, `leave`, `list`, `chat {msg}`, `state {board, piece, gy, score, lines, level, over}`.
Сервер → клиент: `joined {room, you}`, `err {msg}`, `rooms {rooms:[{code, players}]}`, `room {code, players, host}`, `chat {nick, msg, sys}`, `state {nick, id, ...game}`.