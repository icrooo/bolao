import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Trophy, RotateCcw } from 'lucide-react';

type RankRow = { user_id: string; high_score: number; updated_at: string; name: string };

const OBSTACLES = ['🍺', '🍷', '🥂', '🕶️', '⚽', '🔊', '🔈', '🔉', '📢', '🔔', '🎺', '🥁', '🎤', '🎧', '🎸', '🩴', '🎉', '🪩'];
const CANVAS_W = 600;
const CANVAS_H = 600;
const GROUND_Y = CANVAS_H - 120;
const PLAYER_X = 80;
const PLAYER_W = 44;
const PLAYER_H = 52;
const OBS_W = 32;
const OBS_H = 32;
const GRAVITY = 1.1;
const JUMP_V = -19;
const BASE_SPEED = 6;

export function NeymarGame() {
  const { user, profile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [ranking, setRanking] = useState<RankRow[]>([]);

  const stateRef = useRef({
    playerY: GROUND_Y,
    vY: 0,
    obstacles: [] as { x: number; emoji: string }[],
    speed: BASE_SPEED,
    frame: 0,
    score: 0,
    running: false,
    raf: 0,
    lastSpawn: 0,
  });

  const fetchRanking = useCallback(async () => {
    const { data, error } = await supabase
      .from('neymar_game_scores')
      .select('user_id, high_score, updated_at')
      .order('high_score', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(10);
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { setRanking([]); return; }
    const ids = data.map(r => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('user_id, name').in('user_id', ids);
    const nameMap = new Map((profs ?? []).map(p => [p.user_id, p.name]));
    setRanking(data.map(r => ({ ...r, name: nameMap.get(r.user_id) ?? '—' })));
  }, []);

  const fetchMyHighScore = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('neymar_game_scores')
      .select('high_score')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    setHighScore(data?.high_score ?? 0);
  }, [user]);

  useEffect(() => {
    fetchRanking();
    fetchMyHighScore();
  }, [fetchRanking, fetchMyHighScore]);

  const saveScore = async (final: number) => {
    if (!user || final <= highScore) return;
    const { error } = await supabase
      .from('neymar_game_scores')
      .upsert({ user_id: user.id, high_score: final }, { onConflict: 'user_id' });
    if (error) { toast.error(error.message); return; }
    setHighScore(final);
    toast.success(`Novo recorde: ${final}!`);
    fetchRanking();
  };

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = stateRef.current;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#bfe9ff');
    grd.addColorStop(1, '#e9f7ff');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '40px serif';
    ctx.fillText('☀️', 40, 70);
    ctx.font = '34px serif';
    const c1 = ((w + 200 - (s.frame * 0.5)) % (w + 200)) - 50;
    const c2 = ((w + 200 - (s.frame * 0.3) + w * 0.6) % (w + 200)) - 50;
    ctx.fillText('☁️', c1, 110);
    ctx.fillText('☁️', c2, 170);
    ctx.font = '64px serif';
    ctx.fillText('🏆', w - 100, GROUND_Y + PLAYER_H - 8);
    ctx.fillStyle = '#1f6b3a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('COPA DO MUNDO', w - 130, GROUND_Y + PLAYER_H + 10);
    ctx.fillStyle = '#3a9e6e';
    ctx.fillRect(0, GROUND_Y + PLAYER_H - 4, w, h);
    ctx.fillStyle = '#2d7a55';
    for (let i = 0; i < w; i += 28) {
      const off = (i - (s.frame * s.speed) % 28);
      ctx.fillRect(off, GROUND_Y + PLAYER_H - 4, 14, 5);
    }
    const py = s.playerY;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('NEYMAR', PLAYER_X - 4, py - 8);
    // flip horizontally so 🏃 faces right
    ctx.save();
    ctx.translate(PLAYER_X + PLAYER_W / 2, 0);
    ctx.scale(-1, 1);
    ctx.font = '46px serif';
    ctx.fillText('🏃', -PLAYER_W / 2, py + PLAYER_H - 4);
    ctx.restore();
    ctx.font = '30px serif';
    s.obstacles.forEach(o => {
      ctx.fillText(o.emoji, o.x, GROUND_Y + PLAYER_H - 4);
    });
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`Score: ${s.score}`, 12, 24);
    ctx.fillText(`HI: ${highScore}`, 12, 46);
  }, [highScore]);

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;
    s.frame++;
    s.vY += GRAVITY;
    s.playerY += s.vY;
    if (s.playerY > GROUND_Y) { s.playerY = GROUND_Y; s.vY = 0; }
    // Chrome-dino-like progressive acceleration (2x faster ramp)
    s.speed = BASE_SPEED + s.frame * 0.008;
    const baseGap = Math.max(28, 90 - s.speed * 3.2);
    const randomGap = baseGap + Math.random() * baseGap * 1.6;
    if (s.frame - s.lastSpawn > randomGap) {
      s.obstacles.push({ x: canvas.width, emoji: OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)] });
      if (s.speed > 11 && Math.random() < 0.25) {
        s.obstacles.push({ x: canvas.width + 38 + Math.random() * 30, emoji: OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)] });
      }
      s.lastSpawn = s.frame;
    }
    s.obstacles.forEach(o => { o.x -= s.speed; });
    s.obstacles = s.obstacles.filter(o => o.x > -50);
    for (const o of s.obstacles) {
      if (
        o.x < PLAYER_X + PLAYER_W - 10 &&
        o.x + OBS_W > PLAYER_X + 6 &&
        s.playerY + PLAYER_H > GROUND_Y + PLAYER_H - OBS_H + 4
      ) {
        endGame();
        return;
      }
    }
    if (s.frame % 5 === 0) s.score++;
    setScore(s.score);

    draw(ctx, canvas.width, canvas.height);
    s.raf = requestAnimationFrame(loop);
  }, [draw]);

  const endGame = () => {
    const s = stateRef.current;
    s.running = false;
    cancelAnimationFrame(s.raf);
    setRunning(false);
    setGameOver(true);
    saveScore(s.score);
  };

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    if (s.playerY >= GROUND_Y) { s.vY = JUMP_V; }
  }, []);

  const start = () => {
    const s = stateRef.current;
    s.playerY = GROUND_Y;
    s.vY = 0;
    s.obstacles = [];
    s.speed = BASE_SPEED;
    s.frame = 0;
    s.score = 0;
    s.lastSpawn = 0;
    s.running = true;
    setScore(0);
    setGameOver(false);
    setRunning(true);
    s.raf = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!stateRef.current.running) start();
        else jump();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, loop]);

  useEffect(() => () => cancelAnimationFrame(stateRef.current.raf), []);

  const handleCanvasTap = () => {
    if (!stateRef.current.running) start();
    else jump();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-center text-muted-foreground italic">
        Enquanto, será que Neyney vai pra Copa?
      </p>

      <div className="glass-card p-3">
        <div className="relative w-full overflow-hidden rounded-lg" style={{ background: '#bfe9ff' }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onClick={handleCanvasTap}
            onTouchStart={(e) => { e.preventDefault(); handleCanvasTap(); }}
            className="w-full h-auto block touch-none cursor-pointer"
            style={{ imageRendering: 'pixelated' }}
          />
          {!running && !gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 text-white">
              <p className="font-bold text-lg">Neyney Runner</p>
              <p className="text-xs mb-3">Espaço / Toque para pular</p>
              <button onClick={start} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm active:scale-95 transition-transform">
                Começar
              </button>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
              <p className="font-bold text-lg">Neyney caiu na resenha.</p>
              <p className="text-sm mb-3">Score: {score}</p>
              <button onClick={start} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm active:scale-95 transition-transform">
                <RotateCcw className="h-4 w-4" /> Reiniciar
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-xs mt-2 font-bold tracking-wide">
          SEU RECORDE: <span className="text-primary">{highScore}</span>
        </p>
      </div>

      {ranking.length > 0 && (
        <div className="glass-card p-3 space-y-1.5">
          {ranking.map((r, i) => {
            const isMe = user?.id === r.user_id;
            return (
              <div
                key={r.user_id}
                className={`flex items-center justify-between text-sm px-2 py-1.5 rounded-md ${
                  isMe ? 'bg-green-100 dark:bg-green-900/30 ring-1 ring-primary' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-muted-foreground tabular-nums w-6">{i + 1}.</span>
                  {i === 0 && <Trophy className="h-3.5 w-3.5" style={{ color: '#b8860b' }} />}
                  <span className={`truncate ${isMe ? 'font-bold' : 'font-medium'}`}>
                    {r.name}{isMe && profile ? ' (Você)' : ''}
                  </span>
                </div>
                <span className="font-bold tabular-nums">{r.high_score}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
