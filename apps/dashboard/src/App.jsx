import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

function LoginScreen() {
  const signInWithTwitch = () => {
    supabase.auth.signInWithOAuth({
      provider: 'twitch',
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="wordmark">SIDEKICK</h1>
        <p className="tagline">Give your mods superpowers.</p>
        <div className="stack">
          <button className="twitch" onClick={signInWithTwitch}>
            Sign in with Twitch
          </button>
          <button className="kick" disabled title="Kick OAuth wired up in a later step">
            Sign in with Kick
          </button>
        </div>
      </div>
    </div>
  );
}

const TELESTRATOR_COLORS = ['#14141a', '#2b4cff', '#ff4757', '#ffc700', '#7b2ff7'];

function TelestratorPanel({ channel }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const ctxRef = useRef(null);
  const strokeIdRef = useRef(null);
  const [color, setColor] = useState(TELESTRATOR_COLORS[0]);
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      ctxRef.current = canvas.getContext('2d');
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const normalizedPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const drawSegment = (from, to) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.strokeStyle = colorRef.current;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
    ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
    ctx.stroke();
  };

  const lastPointRef = useRef(null);

  const onPointerDown = (e) => {
    const id = crypto.randomUUID();
    strokeIdRef.current = id;
    const point = normalizedPoint(e);
    lastPointRef.current = point;
    channel?.send({
      type: 'broadcast',
      event: 'draw_stroke',
      payload: { strokeId: id, x: point.x, y: point.y, color: colorRef.current, phase: 'start' },
    });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = (e) => {
    const point = normalizedPoint(e);
    const last = lastPointRef.current;
    if (last) drawSegment(last, point);
    lastPointRef.current = point;
    channel?.send({
      type: 'broadcast',
      event: 'draw_stroke',
      payload: {
        strokeId: strokeIdRef.current,
        x: point.x,
        y: point.y,
        color: colorRef.current,
        phase: 'draw',
      },
    });
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    lastPointRef.current = null;
    strokeIdRef.current = null;
  };

  const clearDrawing = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    channel?.send({ type: 'broadcast', event: 'clear_drawing', payload: {} });
  };

  return (
    <div className="telestrator-wrap">
      <div className="telestrator-toolbar">
        {TELESTRATOR_COLORS.map((c) => (
          <button
            key={c}
            className={`color-swatch ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
        <button className="ghost" onClick={clearDrawing}>
          Clear
        </button>
      </div>
      <div className="telestrator-board" ref={containerRef}>
        <canvas ref={canvasRef} onPointerDown={onPointerDown} />
      </div>
    </div>
  );
}

function AlertsPanel() {
  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const [resultText, setResultText] = useState('');

  const enableAlerts = async () => {
    setStatus('working');
    const { data, error } = await supabase.functions.invoke('twitch-subscribe');
    if (error) {
      setStatus('error');
      setResultText(error.message);
      return;
    }
    setStatus('done');
    setResultText(JSON.stringify(data.results, null, 2));
  };

  return (
    <div className="alerts-wrap">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Alerts</h2>
      <p style={{ color: '#52586b', maxWidth: 420 }}>
        Registers follow, sub, raid, and cheer events with Twitch so they show up on your overlay
        the moment they happen. Safe to click more than once.
      </p>
      <button className="primary" onClick={enableAlerts} disabled={status === 'working'}>
        {status === 'working' ? 'Enabling…' : 'Enable Alerts'}
      </button>
      {resultText && (
        <pre className="alerts-result">{resultText}</pre>
      )}
    </div>
  );
}

function TimerDisplay({ endsAt, label }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, endsAt - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const totalSeconds = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  return (
    <div style={{ textAlign: 'center' }}>
      {label && <div style={{ fontSize: '0.7em', opacity: 0.7 }}>{label}</div>}
      <div>{mm}:{ss}</div>
    </div>
  );
}

function WidgetContent({ widget }) {
  switch (widget.type) {
    case 'image':
      return (
        <img
          src={widget.props?.url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
      );
    case 'timer':
      return <TimerDisplay endsAt={widget.props?.endsAt} label={widget.props?.label} />;
    case 'text':
    default:
      return <>{widget.props?.text || widget.type}</>;
  }
}

function Canvas({ sceneId, broadcasterId }) {
  const [widgets, setWidgets] = useState([]);
  const dragState = useRef(null);

  useEffect(() => {
    if (!sceneId) return;
    supabase
      .from('widgets')
      .select('*')
      .eq('scene_id', sceneId)
      .then(({ data, error }) => {
        if (error) console.error('widgets fetch error', error);
        else setWidgets(data);
      });
  }, [sceneId]);

  const addWidget = async (type, props, size) => {
    const { data, error } = await supabase
      .from('widgets')
      .insert({
        scene_id: sceneId,
        broadcaster_id: broadcasterId,
        type,
        props,
        position: { x: 40, y: 40, w: size.w, h: size.h, rotation: 0 },
      })
      .select()
      .single();

    if (error) {
      console.error('add widget error', error);
      return;
    }
    setWidgets((prev) => [...prev, data]);
  };

  const addTextWidget = () => addWidget('text', { text: 'New Text' }, { w: 220, h: 60 });

  const addImageWidget = () => {
    const url = window.prompt('Image URL:');
    if (!url) return;
    addWidget('image', { url }, { w: 200, h: 200 });
  };

  const addTimerWidget = () => {
    const seconds = parseInt(window.prompt('Timer duration in seconds:', '60'), 10);
    if (!seconds || seconds <= 0) return;
    const label = window.prompt('Label (optional):', '') || '';
    addWidget('timer', { endsAt: Date.now() + seconds * 1000, label }, { w: 160, h: 80 });
  };

  const startDrag = (widget, e) => {
    dragState.current = {
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: widget.position.x,
      origY: widget.position.y,
    };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  };

  const onDrag = (e) => {
    const d = dragState.current;
    if (!d) return;
    const nextX = d.origX + (e.clientX - d.startX);
    const nextY = d.origY + (e.clientY - d.startY);
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === d.id ? { ...w, position: { ...w.position, x: nextX, y: nextY } } : w
      )
    );
  };

  const endDrag = async () => {
    const d = dragState.current;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    dragState.current = null;
    if (!d) return;
    const moved = widgets.find((w) => w.id === d.id);
    if (!moved) return;
    const { error } = await supabase
      .from('widgets')
      .update({ position: moved.position })
      .eq('id', d.id);
    if (error) console.error('persist position error', error);
  };

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar">
        <button className="ghost" onClick={addTextWidget}>
          + Add Text
        </button>
        <button className="ghost" onClick={addImageWidget}>
          + Add Image
        </button>
        <button className="ghost" onClick={addTimerWidget}>
          + Add Timer
        </button>
      </div>
      <div className="canvas-board">
        {widgets.map((w) => (
          <div
            key={w.id}
            className="canvas-widget"
            style={{
              left: w.position.x,
              top: w.position.y,
              width: w.position.w,
              height: w.position.h,
            }}
            onMouseDown={(e) => startDrag(w, e)}
          >
            <WidgetContent widget={w} />
          </div>
        ))}
        {widgets.length === 0 && (
          <div className="canvas-empty">Add a widget above to place your first one.</div>
        )}
      </div>
    </div>
  );
}

function SoundboardPanel({ broadcasterId, channel }) {
  const [sounds, setSounds] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase
      .from('sounds')
      .select('*')
      .eq('broadcaster_id', broadcasterId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('sounds fetch error', error);
        else setSounds(data);
      });
  }, [broadcasterId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    const path = `${broadcasterId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('sounds').upload(path, file);

    if (uploadError) {
      console.error('sound upload error', uploadError);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('sounds').getPublicUrl(path);

    const { data, error } = await supabase
      .from('sounds')
      .insert({
        broadcaster_id: broadcasterId,
        name: file.name.replace(/\.[^/.]+$/, ''),
        storage_path: publicUrlData.publicUrl,
      })
      .select()
      .single();

    if (error) console.error('sound row insert error', error);
    else setSounds((prev) => [...prev, data]);
    setUploading(false);
  };

  const playSound = (sound) => {
    channel?.send({
      type: 'broadcast',
      event: 'play_sound',
      payload: { url: sound.storage_path },
    });
  };

  return (
    <div>
      <h2>Soundboard</h2>
      <div className="sound-grid">
        {sounds.map((s) => (
          <button key={s.id} className="sound-btn" onClick={() => playSound(s)}>
            {s.name}
          </button>
        ))}
      </div>
      <label className="upload-btn ghost">
        {uploading ? 'Uploading…' : '+ Upload Sound'}
        <input type="file" accept="audio/*" hidden onChange={handleUpload} disabled={uploading} />
      </label>
    </div>
  );
}

function DashboardShell({ session, profile }) {
  const [scenes, setScenes] = useState([]);
  const [activeSceneId, setActiveSceneId] = useState(null);
  const [liveSceneId, setLiveSceneId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overlayUrlCopied, setOverlayUrlCopied] = useState(false);
  const [mainView, setMainView] = useState('scene');
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    const ch = supabase.channel(`broadcaster-${session.user.id}`);
    ch.subscribe();
    setChannel(ch);
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session.user.id]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await supabase.from('broadcasters').upsert({ id: session.user.id });

      const { data: broadcaster } = await supabase
        .from('broadcasters')
        .select('live_scene_id')
        .eq('id', session.user.id)
        .single();

      const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('broadcaster_id', session.user.id)
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error('scenes fetch error', error);
      } else {
        setScenes(data);
        if (data.length > 0) setActiveSceneId(data[0].id);
      }
      setLiveSceneId(broadcaster?.live_scene_id ?? null);
      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [session.user.id]);

  const createScene = async () => {
    const name = `Scene ${scenes.length + 1}`;
    const { data, error } = await supabase
      .from('scenes')
      .insert({ broadcaster_id: session.user.id, name })
      .select()
      .single();

    if (error) {
      console.error('create scene error', error);
      return;
    }
    setScenes((prev) => [...prev, data]);
    setActiveSceneId(data.id);
  };

  const pushLive = async () => {
    const { error } = await supabase
      .from('broadcasters')
      .update({ live_scene_id: activeSceneId })
      .eq('id', session.user.id);
    if (error) {
      console.error('push live error', error);
      return;
    }
    setLiveSceneId(activeSceneId);
  };

  // In production, VITE_OVERLAY_BASE_URL is set at build time to
  // https://sidekik.dpdns.org/live/. In local dev it's unset, so we
  // fall back to guessing the overlay dev server on port 5174.
  const overlayBase =
    import.meta.env.VITE_OVERLAY_BASE_URL || window.location.origin.replace('5173', '5174') + '/';
  const overlayUrl = `${overlayBase}?broadcaster=${session.user.id}`;

  const copyOverlayUrl = async () => {
    await navigator.clipboard.writeText(overlayUrl);
    setOverlayUrlCopied(true);
    setTimeout(() => setOverlayUrlCopied(false), 1500);
  };

  const activeScene = scenes.find((s) => s.id === activeSceneId);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <h2>Scenes</h2>
          <ul className="scene-list">
            {scenes.map((scene) => (
              <li key={scene.id}>
                <button
                  className={scene.id === activeSceneId ? 'active' : ''}
                  onClick={() => setActiveSceneId(scene.id)}
                >
                  {scene.name}
                  {scene.id === liveSceneId && <span className="live-tag">LIVE</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <SoundboardPanel broadcasterId={session.user.id} channel={channel} />
        <div className="sidebar-bottom">
          <button className="primary" onClick={createScene}>
            + New Scene
          </button>
          <button className="ghost" onClick={copyOverlayUrl}>
            {overlayUrlCopied ? 'Copied!' : 'Copy Overlay URL'}
          </button>
        </div>
      </aside>

      <header className="topbar">
        <span className="brand-mark">SIDEKICK</span>
        <div className="view-tabs">
          <button
            className={mainView === 'scene' ? 'active' : ''}
            onClick={() => setMainView('scene')}
          >
            Scene
          </button>
          <button
            className={mainView === 'telestrator' ? 'active' : ''}
            onClick={() => setMainView('telestrator')}
          >
            Telestrator
          </button>
          <button
            className={mainView === 'alerts' ? 'active' : ''}
            onClick={() => setMainView('alerts')}
          >
            Alerts
          </button>
        </div>
        <span className="live-badge">
          <span className="live-dot" />
          LIVE
        </span>
        <div className="user-chip">
          {profile?.avatar_url && <img src={profile.avatar_url} alt="" />}
          <span>{profile?.display_name || profile?.username || session.user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        {mainView === 'telestrator' ? (
          <TelestratorPanel channel={channel} />
        ) : mainView === 'alerts' ? (
          <AlertsPanel />
        ) : loading ? (
          <div className="canvas-placeholder">
            <span>loading scenes…</span>
          </div>
        ) : activeScene ? (
          <>
            <div className="scene-header">
              <strong>{activeScene.name}</strong>
              <button
                className={activeSceneId === liveSceneId ? 'primary' : 'primary'}
                onClick={pushLive}
                disabled={activeSceneId === liveSceneId}
              >
                {activeSceneId === liveSceneId ? 'Currently Live' : 'Push Live'}
              </button>
            </div>
            <Canvas sceneId={activeScene.id} broadcasterId={session.user.id} />
          </>
        ) : (
          <div className="canvas-placeholder">
            <strong>Nothing here yet</strong>
            <span>Click "+ New Scene" to build your first one.</span>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('profile fetch error', error);
        else setProfile(data);
      });
  }, [session]);

  if (!ready) return null;

  return session ? <DashboardShell session={session} profile={profile} /> : <LoginScreen />;
}
