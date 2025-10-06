<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let roomCode = '';
let playerName = '';
let avatar = '';
let isHost = false;
let role = 'investor'; // assigned after start
let sectorsUnlocked = 0;
let sectors = [];
let investments = {};

// === HOST FUNCTIONS ===
function createRoom(hostName){
  isHost = true;
  socket.emit('createRoom', hostName, (res)=>{
    if(res.ok){
      roomCode = res.roomCode;
      document.getElementById('hostRoomCode').innerText = 'Room Code: ' + roomCode;
      showHostPanel();
    } else alert('Error creating room');
  });
}

function startGame(){
  socket.emit('startGame', roomCode, (res)=>{
    if(res.error) alert(res.error);
    else document.getElementById('status').innerText = 'Game started!';
  });
}

function flashNews(sectorId, positive){
  socket.emit('flashNews', {roomCode, sectorId, positive}, (res)=>{
    if(res.error) alert(res.error);
  });
}

function unlockSectors(count){
  socket.emit('unlockSectors', {roomCode, targetCount: count}, (res)=>{
    if(res.error) alert(res.error);
  });
}

function endGame(){
  socket.emit('endGame', roomCode, (res)=>{
    if(res.error) alert(res.error);
  });
}

// === PLAYER FUNCTIONS ===
function joinRoom(code,name,av){
  roomCode = code;
  playerName = name;
  avatar = av;
  socket.emit('joinRoom',{roomCode, name, avatar}, (res)=>{
    if(res.ok){
      sectorsUnlocked = res.sectorsUnlocked;
      sectors = res.sectors;
      displaySectors(sectors,sectorsUnlocked);
    } else alert(res.error);
  });
}

function submitInvestment(){
  socket.emit('submitInvestment', {roomCode, investments}, (res)=>{
    if(res.error) alert(res.error);
    else document.getElementById('status').innerText = 'Investments submitted!';
  });
}

function sendTip(tipId,target){
  socket.emit('sendTip',{roomCode, tipId, target}, (res)=>{
    if(res.error) alert(res.error);
    else document.getElementById('status').innerText = 'Tip sent!';
  });
}

// === SOCKET EVENTS ===
socket.on('playersUpdate', players=>{
  const list = document.getElementById('playerList');
  list.innerHTML='';
  players.forEach(p=>{
    const li = document.createElement('li');
    li.textContent = ⁠ ${p.name} (${p.role}) - Remaining: ${p.remaining} ⁠;
    list.appendChild(li);
  });
});

socket.on('gameStarted', data=>{
  role = data.players.find(p=>p.id===socket.id)?.role || 'investor';
  sectorsUnlocked = data.sectorsUnlocked;
  sectors = data.players.find(p=>p.id===socket.id)?.investments || sectors;
  document.getElementById('status').innerText = ⁠ Game started! You are: ${role} ⁠;
  displaySectors(sectors,sectorsUnlocked);
});

socket.on('news', data=>{
  const newsDiv = document.getElementById('newsFeed');
  const msg = document.createElement('div');
  msg.textContent = data.text;
  newsDiv.appendChild(msg);
});

socket.on('sectorsUnlocked', count=>{
  sectorsUnlocked = count;
  displaySectors(sectors,count);
});

socket.on('receiveTip', data=>{
  alert(⁠ Tip from ${data.from}: ${data.tip.text} ⁠);
});

socket.on('impostorTipSeen', data=>{
  if(isHost) console.log('Impostor tip:', data);
});

socket.on('gameEnded', data=>{
  let text = 'Game Over!\n';
  text += ⁠ Impostor: ${data.impostor.name}\n ⁠;
  text += 'Results:\n';
  data.results.forEach(r=> text+= ⁠ ${r.name} (${r.role}): ${r.total}\n ⁠);
  alert(text);
});

// === DISPLAY SECTORS ===
function displaySectors(sectorList,count){
  const div = document.getElementById('sectors');
  div.innerHTML='';
  sectorList.forEach(s=>{
    const lock = s.locked && s.id>=count ? ' (Locked)' : '';
    const el = document.createElement('div');
    el.textContent = ⁠ ${s.name} ROI:${s.roi}% ESG:${s.esg}${lock} ⁠;
    div.appendChild(el);
  });
}

// Example: update investments object when user inputs amounts
function updateInvestment(sid, amt){ investments[sid] = Number(amt);}
</script>
