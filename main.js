// Tiny Tower Defense prototype (plain JS)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cashEl = document.getElementById('cash');
const waveEl = document.getElementById('wave');
const startBtn = document.getElementById('startWave');

let W = 800, H = 600;
function resize() {
  W = innerWidth; H = innerHeight;
  canvas.width = W; canvas.height = H;
}
addEventListener('resize', resize);
resize();

// Simple path: list of waypoints
const path = [
  {x: 50, y: H/2},
  {x: W*0.25, y: H*0.25},
  {x: W*0.5, y: H*0.5},
  {x: W*0.75, y: H*0.4},
  {x: W-50, y: H/2}
];

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

// Enemy (bloon-like)
class Enemy {
  constructor(hp=3, speed=60){
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed; // pixels per second
    this.wayIndex = 0;
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
    ctx.fillStyle = 'rgba(21,101,192,0.08)';
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
    enemies.push(new Enemy(1 + Math.floor(wave/3), 60 + wave*5));
    count--;
    if(count<=0){
      clearInterval(spawnTimer);
      spawning = false;
    }
  }, spawnInterval*1000);
}

// Input: place tower
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if(cash >= 50){
    towers.push(new Tower(x,y));
    cash -= 50; updateUI();
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
        // simple game over: reset
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
  ctx.lineWidth = 24;
  ctx.lineCap = 'round';
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
}

updateUI();
requestAnimationFrame(loop);
