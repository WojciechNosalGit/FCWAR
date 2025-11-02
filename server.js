// server.js
// === Prosty serwer HTTP + WebSocket dla gry FC WAR ===
// Uruchomienie:
//   npm init -y
//   npm install ws
//   node server.js
// Otwórz w przeglądarce: http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const file = path.join(__dirname, "index.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(file).pipe(res);
  } else {
    res.writeHead(404);
    res.end("404");
  }
});

const wss = new WebSocket.Server({ server });
console.log("🌐 Serwer uruchomiony: ws://localhost:3000");

const rooms = {}; // {roomId: {host, guest, hostCard, guestCard}}

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }
    const { type, payload } = data;

    if (type === "create_room") {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = { host: ws, guest: null };
      ws._roomId = roomId;
      ws._role = "host";
      send(ws, { type: "room_created", payload: { roomId } });
      console.log(`🆕 Pokój ${roomId} utworzony`);
    }

    if (type === "join_room") {
      const { roomId } = payload;
      const room = rooms[roomId];
      if (!room) return send(ws, { type: "error", payload: "room_not_found" });
      if (room.guest) return send(ws, { type: "error", payload: "room_full" });
      room.guest = ws;
      ws._roomId = roomId;
      ws._role = "guest";
      send(ws, { type: "room_joined", payload: { roomId } });
      send(room.host, { type: "guest_joined" });
      console.log(`👥 Pokój ${roomId}: dołączył gracz`);
    }

    if (type === "play_card") {
      const { roomId, from, card } = payload;
      const room = rooms[roomId];
      if (!room) return;
      if (from === "host") room.hostCard = card;
      if (from === "guest") room.guestCard = card;

      const both = room.hostCard && room.guestCard;
      if (both) {
        // Proste porównanie: większe "id" wygrywa
        const hostVal = room.hostCard.id;
        const guestVal = room.guestCard.id;
        let winner = "draw";
        if (hostVal > guestVal) winner = "host";
        if (guestVal > hostVal) winner = "guest";
        send(room.host, {
          type: "battle_result",
          payload: {
            winner,
            myRole: "host",
            myCard: room.hostCard,
            oppCard: room.guestCard,
          },
        });
        send(room.guest, {
          type: "battle_result",
          payload: {
            winner,
            myRole: "guest",
            myCard: room.guestCard,
            oppCard: room.hostCard,
          },
        });
        room.hostCard = null;
        room.guestCard = null;
      } else {
        const opp = from === "host" ? room.guest : room.host;
        send(opp, { type: "opponent_played" });
      }
    }
  });

  ws.on("close", () => {
    const roomId = ws._roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const other = ws._role === "host" ? room.guest : room.host;
    send(other, { type: "error", payload: "opponent_disconnected" });
    delete rooms[roomId];
    console.log(`❌ Pokój ${roomId} zamknięty`);
  });
});

server.listen(3000);
