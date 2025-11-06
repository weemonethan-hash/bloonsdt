// Tiny Tower Defense prototype with map choices and placement blocking

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cashEl = document.getElementById('cash');
const waveEl = document.getElementById('wave');
const startBtn = document.getElementById('startWave');
const mapSelect = document.getElementById('mapSelect');

let W = 800, H = 600;
function resize() {
  W = innerWidth; H = innerHeight;
  canvas.width = W; canvas.height = H;
  computePixelPath();
}
addEventListener('resize', resize);
resize();

// Maps use normalized coordinates (0..1) so they scale with canvas size.
const maps = [
  {
    name: 'Meadow',
    pathWidth: 24,
    waypoints: [
      {x: 0.05, y: 0.5},
      {x: 0.25, y: 0.25},
      {x: 0.5, y: 0.5},
      {x: 0.75, y: 0.4},
      {x: 0.95, y: 0.5}
    ]
  },
  {
    name: 'River Run',
    pathWidth: 28,
    waypoints: [
      {x: 0.02, y: 0.3},
      {x: 0.2, y: 0.35},
      {x: 0.4, y: 0.65},
      {x: 0.6, y: 0.6},
      {x: 0.8, y: 0.35},
      {x: 0.98, y: 0.4}
    ]
  },
  {
    name: 'Circuit',
    pathWidth: 20,
    waypoints: [
      {x: 0.1, y: 0.6},
      {x: 0.3, y: 0.2},
      {x: 0.5, y: 0.6},
      {x: 0.7, y: 0.2},
      {x: 0.9, y: 0.6}
    ]
  }
];

let currentMapIndex = 0;
let path = []; // pixel coordinates computed from current map
let pathWidth = 24;

function populateMapSelect(){
  maps.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.name;
    mapSelect.appendChild(opt);
  });
}
populateMapSelect();

mapSelect.addEventListener('change', (e) => {
  setMap(parseInt(e.target.value, 10));
});

function setMap(i){
  currentMapIndex = i;
  pathWidth = maps[i].pathWidth;
  computePixelPath();
  // clear towers/enemies/projectiles
  towers = [];
  enemies = [];
  projectiles = [];
  spawning = false;
}

// compute pixel path from normalized waypoints
function computePixelPath(){
  const m = maps[currentMapIndex];
  path = m.waypoints.map(p => ({ x: Math.round(p.x * W), y: Math.round(p.y * H) }));
}

setMap(0); // initialize

// Game state
let cash = 100;
let wave = 0;
let lives = 20;
let enemies = [];
let towers = [];
let projectiles = [];
let spawning = false;

// Utility
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function distPoints(x1,y1,x2,y2){ return Math.hypot(x2-x1,y2-y1); }

// Distance from point P to segment AB
function pointSegmentDistance(px,py, ax,ay, bx,by){
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const vv = vx*vx + vy*vy;
  if(vv === 0) return Math.hypot(px-ax, py-ay);
  let t = (wx*vx + wy*vy) / vv;
  t = Math.max(0, Math.min(1, t));
  const projx = ax + t * vx;
  const projy = ay + t * vy;
  return Math.hypot(px - projx, py - projy);
}

// Check whether a point is inside the path area (can't place towers there)
function isOnPath(x,y){
  const radius = pathWidth / 2 + 12; // extra 12 = tower radius padding
  for(let i=0;i<path.length-1;i++){
    const a = path[i], b = path[i+1];
    const d = pointSegmentDistance(x,y, a.x,a.y, b.x,b.y);
    if(d <= radius) return true;
  }
  return false;
}

// Check overlapping other towers
function overlapsOtherTower(x,y){
  for(const t of towers){
    if(distPoints(x,y,t.x,t.y) < 28) return true;
  }
  return false;
}

// Enemy (bloon-like)
class Enemy {
  constructor(hp=3, speed=60){
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed; // pixels per second
    this.wayIndex = 0;
    // start at first waypoint
    this.pos = {x: path[0].x, y: path[0].y};
    this.reached = false;
  }
  update(dt){
    if(this.reached) return;
    const target = path[Math.min(this.wayIndex+1, path.length-1)];
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const d = Math.hypot(dx,dy);
    if(d < 1){
      if(this.wayIndex < path.length-1) this.wayIndex++;
      else { this.reached = true; return; }
    } else {
      const vx = dx / d * this.speed;
      const vy = dy / d * this.speed;
      this.pos.x += vx * dt;
      this.pos.y += vy * dt;
    }
  }
  draw(ctx){
    ctx.fillStyle = '#ff6f00';
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, 12, 0, Math.PI*2);
    ctx.fill();
    // HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(this.pos.x - 12, this.pos.y - 18, 24, 4);
    ctx.fillStyle = 'lime';
    ctx.fillRect(this.pos.x - 12, this.pos.y - 18, 24 * (this.hp/this.maxHp), 4);
  }
}

// Tower
class Tower {
  constructor(x,y){
    this.x = x; this.y = y;
    this.range = 120;
    this.fireRate = 1.0; // shots per second
    this.cooldown = 0;
    this.damage = 1;
  }
  update(dt){
    this.cooldown -= dt;
    if(this.cooldown <= 0){
      // find nearest enemy in range
      let nearest = null, nd = Infinity;
      for(const e of enemies){
        if(e.reached) continue;
        const d = dist({x:this.x,y:this.y}, e.pos);
        if(d <= this.range && d < nd){
          nearest = e; nd = d;
        }
      }
      if(nearest){
        this.shoot(nearest);
        this.cooldown = 1/this.fireRate;
      }
    }
  }
  shoot(enemy){
    projectiles.push(new Projectile(this.x,this.y, enemy, this.damage));
  }
  draw(ctx){
    ctx.fillStyle = '#1565c0';
    ctx.beginPath();
    ctx.rect(this.x-14,this.y-14,28,28);
    ctx.fill();
    // range (light)
    ctx.fillStyle = 'rgba(21,101,192,0.06)';
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.range,0,Math.PI*2);
    ctx.fill();
  }
}

// Projectile
class Projectile {
  constructor(x,y, target, damage=1){
    this.x = x; this.y = y; this.target = target; this.speed = 400; this.damage = damage;
    this.dead = false;
  }
  update(dt){
    if(this.dead || this.target.reached) { this.dead = true; return; }
    const dx = this.target.pos.x - this.x;
    const dy = this.target.pos.y - this.y;
    const d = Math.hypot(dx,dy);
    if(d < 6){
      this.target.hp -= this.damage;
      this.dead = true;
      if(this.target.hp <= 0){
        const idx = enemies.indexOf(this.target);
        if(idx >= 0) enemies.splice(idx,1);
        cash += 10;
        updateUI();
      }
    } else {
      const vx = dx / d * this.speed;
      const vy = dy / d * this.speed;
      this.x += vx * dt;
      this.y += vy * dt;
    }
  }
  draw(ctx){
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x,this.y,4,0,Math.PI*2);
    ctx.fill();
  }
}

// Spawning waves
function startWave() {
  if(spawning) return;
  wave++;
  updateUI();
  spawning = true;
  let count = 10 + wave * 2;
  let spawnInterval = 0.6;
  const spawnTimer = setInterval(() => {
    // ensure path exists
    if(path.length > 0){
      enemies.push(new Enemy(1 + Math.floor(wave/3), 60 + wave*5));
    }
    count--;
    if(count<=0){
      clearInterval(spawnTimer);
      spawning = false;
    }
  }, spawnInterval*1000);
}

// Input: place tower
const TOWER_COST = 50;
let mouse = {x:0, y:0, valid:false};

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  mouse.x = x; mouse.y = y;
  // placement validity
  const canAfford = cash >= TOWER_COST;
  const onPath = isOnPath(x,y);
  const overlap = overlapsOtherTower(x,y);
  mouse.valid = canAfford && !onPath && !overlap;
});

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  // validate again to be safe
  if(cash >= TOWER_COST && !isOnPath(x,y) && !overlapsOtherTower(x,y)){
    towers.push(new Tower(x,y));
    cash -= TOWER_COST; updateUI();
  } else {
    // optionally could give feedback
  }
});

startBtn.addEventListener('click', startWave);
function updateUI(){
  cashEl.textContent = cash;
  waveEl.textContent = wave;
}

// Game loop
let last = performance.now();
function loop(now){
  const dt = Math.min((now - last)/1000, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
function update(dt){
  // update enemies
  for(const e of enemies) e.update(dt);
  // handle enemies reaching end
  for(let i = enemies.length-1; i>=0; i--){
    if(enemies[i].reached){
      enemies.splice(i,1);
      lives--;
      if(lives <= 0){
        alert('Game Over');
        location.reload();
      }
    }
  }
  for(const t of towers) t.update(dt);
  for(const p of projectiles) p.update(dt);
  // remove dead projectiles
  for(let i = projectiles.length-1; i>=0; i--) if(projectiles[i].dead) projectiles.splice(i,1);
}
function draw(){
  ctx.clearRect(0,0,W,H);
  // draw path
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = pathWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for(let i=1;i<path.length;i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  // dark center line for visual
  ctx.strokeStyle = '#6d4c41';
  ctx.lineWidth = Math.max(2, pathWidth/6);
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for(let i=1;i<path.length;i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();

  // waypoints small
  ctx.fillStyle = '#3e2723';
  for(const p of path){ ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); }

  for(const e of enemies) e.draw(ctx);
  for(const t of towers) t.draw(ctx);
  for(const p of projectiles) p.draw(ctx);

  // ghost tower placement indicator
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, 14, 0, Math.PI*2);
  ctx.fillStyle = mouse.valid ? 'rgba(21,101,192,0.9)' : 'rgba(192,21,21,0.9)';
  ctx.fill();
  // ring to show path blocking radius (for debugging/feedback)
  if(!mouse.valid){
    // show reason by highlighting path region if on path
    if(isOnPath(mouse.x, mouse.y)){
      ctx.strokeStyle = 'rgba(255,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, pathWidth/2 + 12, 0, Math.PI*2);
      ctx.stroke();
    } else if (overlapsOtherTower(mouse.x, mouse.y)){
      ctx.strokeStyle = 'rgba(255,165,0,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 28, 0, Math.PI*2);
      ctx.stroke();
    } else if (cash < TOWER_COST){
      ctx.strokeStyle = 'rgba(128,128,128,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 18, 0, Math.PI*2);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 18, 0, Math.PI*2);
    ctx.stroke();
  }
}

updateUI();
requestAnimationFrame(loop);
