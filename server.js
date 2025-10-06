// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" }});
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.get('/', (req,res)=> res.sendFile(__dirname + '/index.html'));

// Sector master (client shows public fields; server keeps hidden multipliers)
const SECTORS = [
  {id:0,name:"Renewable Energy",roi:8,beta:0.9,esg:9,locked:false,desc:"Large-scale solar & wind",hiddenMult:1.40},
  {id:1,name:"Fossil Fuels",roi:12,beta:1.4,esg:2,locked:false,desc:"Coal & oil plants",hiddenMult:0.80},
  {id:2,name:"Electric Vehicles",roi:10,beta:1.2,esg:8,locked:true,desc:"EV manufacturing & infra",hiddenMult:1.25},
  {id:3,name:"Green Infrastructure",roi:6,beta:0.8,esg:7,locked:false,desc:"Public-private green projects",hiddenMult:1.10},
  {id:4,name:"Waste Management",roi:7,beta:0.7,esg:9,locked:true,desc:"Recycling & waste-to-energy",hiddenMult:1.30},
  {id:5,name:"Water Conservation",roi:9,beta:0.9,esg:8,locked:true,desc:"Water treatment & reuse",hiddenMult:1.15},
  {id:6,name:"Carbon Credits",roi:15,beta:1.5,esg:10,locked:true,desc:"Carbon trading instruments",hiddenMult:1.50},
  {id:7,name:"Green Buildings",roi:9,beta:1.1,esg:8,locked:false,desc:"Energy efficient constructions",hiddenMult:1.20},
  {id:8,name:"Sustainable Agriculture",roi:8,beta:1.0,esg:8,locked:false,desc:"Climate-smart farming",hiddenMult:1.15},
  {id:9,name:"Solar Manufacturing",roi:10,beta:1.3,esg:9,locked:true,desc:"Panel & cell manufacturing",hiddenMult:1.35},
  {id:10,name:"Hydrogen Energy",roi:18,beta:1.8,esg:9,locked:true,desc:"Early-stage hydrogen tech",hiddenMult:1.60},
  {id:11,name:"ESG Mutual Fund",roi:6,beta:0.7,esg:8,locked:false,desc:"Diversified ESG fund",hiddenMult:1.10}
];

// Pre-written tip messages (some misleading)
const TIP_MESSAGES = [
  {id:0,text:"EV stocks are crashing — avoid them (FALSE)",truth:false},
  {id:1,text:"Carbon credits expected to surge (TRUE)",truth:true},
  {id:2,text:"Coal plants will have a sudden demand spike (MIXED)",truth:false},
  {id:3,text:"Solar manufacturing facing component shortage (TRUE)",truth:true},
  {id:4,text:"Water projects to get extra funding (TRUE)",truth:true},
  {id:5,text:"Green buildings under regulatory review (FALSE)",truth:false}
];

let rooms = {}; // roomCode -> room state

function genCode(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }

io.on('connection', socket => {
  console.log('conn', socket.id);

  // Host creates room
  socket.on('createRoom', (hostName, cb) => {
    const code = genCode();
    rooms[code] = {
      hostId: socket.id,
      hostName,
      players: [], // {id,name,avatar,role,investments:{sid:amt},remaining,lastSubmit}
      impostorId: null,
      sectorsUnlocked: SECTORS.filter(s=>!s.locked).length,
      gameStarted: false,
      newsHistory: []
    };
    socket.join(code);
    cb && cb({ok:true, roomCode: code});
    console.log('Room',code,'created by',hostName);
  });

  // Join room (players and host can call)
  socket.on('joinRoom', ({roomCode, name, avatar}, cb) => {
    const room = rooms[roomCode];
    if(!room){ cb && cb({error:'room not found'}); return; }
    if(room.players.length >= 8){ cb && cb({error:'room full'}); return; }
    // add player
    const player = { id: socket.id, name, avatar, role:'investor', investments:{}, remaining:100, lastSubmit:null };
    room.players.push(player);
    socket.join(roomCode);
    // notify room
    io.to(roomCode).emit('playersUpdate', room.players.map(p=>({name:p.name, avatar:p.avatar, role:p.role, remaining:p.remaining})));
    // send client sectors & current unlocked count
    cb && cb({ok:true, sectors: SECTORS.map(s => ({id:s.id,name:s.name,roi:s.roi,beta:s.beta,esg:s.esg,locked:s.locked,desc:s.desc})), sectorsUnlocked: room.sectorsUnlocked});
  });

  // Host starts game => assign one impostor randomly among players
  socket.on('startGame', (roomCode, cb) => {
    const room = rooms[roomCode];
    if(!room || socket.id !== room.hostId){ cb && cb({error:'not host/room'}); return; }
    if(room.players.length < 2){ cb && cb({error:'need 2 players min'}); return; }
    room.gameStarted = true;
    // assign random impostor among players (not host)
    const idx = Math.floor(Math.random()*room.players.length);
    room.impostorId = room.players[idx].id;
    room.players.forEach(p => p.role = (p.id === room.impostorId) ? 'impostor' : 'investor');
    io.to(roomCode).emit('gameStarted', {sectorsUnlocked: room.sectorsUnlocked, players: room.players.map(p=>({name:p.name,id:p.id,role:p.role,avatar:p.avatar}))});
    cb && cb({ok:true});
    console.log('Game started in',roomCode,'impostor:',room.players[idx].name);
  });

  // Host flashes news (positive/negative)
  socket.on('flashNews', ({roomCode, sectorId, positive}, cb) => {
    const room = rooms[roomCode];
    if(!room || socket.id !== room.hostId){ cb && cb({error:'not allowed'}); return; }
    const news = {sectorId, positive, text: (positive ? 'Positive update' : 'Negative update'), time:Date.now()};
    room.newsHistory.push(news);
    io.to(roomCode).emit('news', {sectorId, positive, text: SECTORS[sectorId].name + (positive? ' — Positive policy/news' : ' — Negative / Delay')});
    cb && cb({ok:true});
  });

  // Host unlocks sectors (targetCount or 'all')
  socket.on('unlockSectors', ({roomCode, targetCount}, cb) => {
    const room = rooms[roomCode];
    if(!room || socket.id !== room.hostId){ cb && cb({error:'not allowed'}); return; }
    if(targetCount === 'all') room.sectorsUnlocked = SECTORS.length;
    else room.sectorsUnlocked = Math.min(SECTORS.length, Math.max(room.sectorsUnlocked, Number(targetCount)));
    io.to(roomCode).emit('sectorsUnlocked', room.sectorsUnlocked);
    cb && cb({ok:true});
  });

  // Player submits investments
  socket.on('submitInvestment', ({roomCode, investments}, cb) => {
    const room = rooms[roomCode];
    if(!room){ cb && cb({error:'no room'}); return; }
    const player = room.players.find(p=>p.id===socket.id);
    if(!player){ cb && cb({error:'not joined'}); return; }
    // validate
    let total = 0;
    for(const k in investments){
      const sid = Number(k);
      const amt = Number(investments[k]) || 0;
      if(!Number.isFinite(sid) || sid < 0 || sid >= SECTORS.length){ cb && cb({error:'bad sector'}); return; }
      // can't invest into locked sector
      if(sid >= room.sectorsUnlocked && SECTORS[sid].locked){ cb && cb({error:`sector locked: ${SECTORS[sid].name}`}); return; }
      if(amt < 0){ cb && cb({error:'negative amt'}); return; }
      total += amt;
    }
    if(total > 100 + 1e-6){ cb && cb({error:'total>100'}); return; }
    // save
    player.investments = {};
    for(const k in investments) player.investments[k] = Number(investments[k]);
    player.remaining = Math.max(0, 100 - total);
    player.lastSubmit = Date.now();
    // notify host and room
    io.to(roomCode).emit('playersUpdate', room.players.map(p=>({name:p.name,avatar:p.avatar,role:p.role,remaining:p.remaining})));
    cb && cb({ok:true});
  });

  // Impostor sends a tip (prewritten) to targetName or 'ALL'
  socket.on('sendTip', ({roomCode, tipId, target}, cb) => {
    const room = rooms[roomCode];
    if(!room){ cb && cb({error:'no room'}); return; }
    if(socket.id !== room.impostorId){ cb && cb({error:'not impostor'}); return; }
    const tip = TIP_MESSAGES.find(t=>t.id === Number(tipId));
    if(!tip){ cb && cb({error:'bad tip'}); return; }
    // Host should see all tips (as requested)
    io.to(room.hostId).emit('impostorTipSeen', {from: 'Impostor', tip, target});
    // deliver to target
    if(target === 'ALL'){
      room.players.forEach(p => {
        if(p.id !== room.impostorId) io.to(p.id).emit('receiveTip', {from:'Impostor', tip});
      });
    } else {
      const targ = room.players.find(p => p.name === target);
      if(targ) io.to(targ.id).emit('receiveTip', {from:'Impostor', tip});
    }
    cb && cb({ok:true});
  });

  // End game -> apply hidden multipliers and calculate
  socket.on('endGame', (roomCode, cb) => {
    const room = rooms[roomCode];
    if(!room || socket.id !== room.hostId){ cb && cb({error:'not allowed'}); return; }
    // compute for each investor (exclude impostor)
    const results = [];
    room.players.forEach(p=>{
      if(p.role === 'impostor'){
        results.push({name:p.name, role:'impostor', total:null});
        return;
      }
      let totalVal = 0; // final value after multipliers
      for(const sidStr in p.investments){
        const sid = Number(sidStr);
        const amt = Number(p.investments[sidStr]) || 0;
        const mult = SECTORS[sid].hiddenMult;
        totalVal += amt * mult;
      }
      // if they invested nothing, totalVal = remaining (keep remaining as cash without multiplier)
      totalVal += (p.remaining || 0); // leftover stays as 1x
      results.push({name:p.name, role:'investor', total: totalVal});
    });
    // sort descending by total (nulls at end)
    const scored = results.filter(r=>r.total!==null).sort((a,b)=>b.total - a.total);
    const winner = scored.length ? scored[0] : null;
    const impostor = room.players.find(p=>p.role==='impostor');
    io.to(roomCode).emit('gameEnded', {results, winner, impostor: impostor ? {name: impostor.name} : null, multipliers: SECTORS.map(s=>({id:s.id, mult:s.hiddenMult}))});
    cb && cb({ok:true});
  });

  socket.on('disconnect', () => {
    // remove player from rooms
    for(const code in rooms){
      const room = rooms[code];
      const idx = room.players.findIndex(p=>p.id === socket.id);
      if(idx !== -1){
        room.players.splice(idx,1);
        io.to(code).emit('playersUpdate', room.players.map(p=>({name:p.name,avatar:p.avatar,role:p.role,remaining:p.remaining})));
      }
      if(room.hostId === socket.id){
        // host disconnected -> notify players and delete room
        io.to(code).emit('hostDisconnected');
        delete rooms[code];
      }
    }
  });
});

http.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
