import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

function useQueryParam(name) {
  const [value] = useState(() => new URLSearchParams(window.location.search).get(name));
  return value;
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
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      );
    case 'timer':
      return <TimerDisplay endsAt={widget.props?.endsAt} label={widget.props?.label} />;
    case 'text':
    default:
      return <>{widget.props?.text}</>;
  }
}

function TelestratorLayer({ broadcasterId }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lastPointsRef = useRef({}); // strokeId -> {x, y} in normalized coords

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctxRef.current = canvas.getContext('2d');
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!broadcasterId) return;

    const channel = supabase
      .channel(`telestrator-${broadcasterId}`)
      .on('broadcast', { event: 'draw_stroke' }, (msg) => {
        const { strokeId, x, y, color, phase } = msg.payload;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx) return;

        if (phase === 'start') {
          lastPointsRef.current[strokeId] = { x, y };
          return;
        }

        const last = lastPointsRef.current[strokeId];
        if (last) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(last.x * canvas.width, last.y * canvas.height);
          ctx.lineTo(x * canvas.width, y * canvas.height);
          ctx.stroke();
        }
        lastPointsRef.current[strokeId] = { x, y };
      })
      .on('broadcast', { event: 'clear_drawing' }, () => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        lastPointsRef.current = {};
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [broadcasterId]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  );
}

function AlertLayer({ broadcasterId }) {
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!broadcasterId) return;

    const channel = supabase
      .channel(`events-${broadcasterId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events_log', filter: `broadcaster_id=eq.${broadcasterId}` },
        (payload) => {
          setAlert(payload.new);
          setTimeout(() => setAlert(null), 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [broadcasterId]);

  if (!alert) return null;

  return (
    <div className="alert-banner">
      {alert.payload?.display_text ?? `New ${alert.event_type}!`}
    </div>
  );
}

export default function App() {
  const broadcasterId = useQueryParam('broadcaster');
  const [liveSceneId, setLiveSceneId] = useState(null);
  const [widgets, setWidgets] = useState([]);

  // Track which scene is live for this broadcaster, and react instantly
  // when they hit "Push Live" on the dashboard.
  useEffect(() => {
    if (!broadcasterId) return;

    supabase
      .from('broadcasters')
      .select('live_scene_id')
      .eq('id', broadcasterId)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('broadcaster fetch error', error);
        else setLiveSceneId(data?.live_scene_id ?? null);
      });

    const channel = supabase
      .channel(`broadcaster-${broadcasterId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'broadcasters', filter: `id=eq.${broadcasterId}` },
        (payload) => setLiveSceneId(payload.new.live_scene_id)
      )
      .on('broadcast', { event: 'play_sound' }, (msg) => {
        const audio = new Audio(msg.payload.url);
        audio.play().catch((err) => console.error('audio play error', err));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [broadcasterId]);

  // Load + live-sync the widgets belonging to whichever scene is live.
  useEffect(() => {
    if (!liveSceneId) {
      setWidgets([]);
      return;
    }

    supabase
      .from('widgets')
      .select('*')
      .eq('scene_id', liveSceneId)
      .then(({ data, error }) => {
        if (error) console.error('widgets fetch error', error);
        else setWidgets(data);
      });

    const channel = supabase
      .channel(`scene-${liveSceneId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'widgets', filter: `scene_id=eq.${liveSceneId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setWidgets((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setWidgets((prev) => prev.map((w) => (w.id === payload.new.id ? payload.new : w)));
          } else if (payload.eventType === 'DELETE') {
            setWidgets((prev) => prev.filter((w) => w.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveSceneId]);

  if (!broadcasterId) {
    return (
      <div style={{ padding: 20, color: 'red', fontFamily: 'monospace' }}>
        Missing ?broadcaster=... in the URL.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {widgets.map((w) => (
        <div
          key={w.id}
          style={{
            position: 'absolute',
            left: w.position.x,
            top: w.position.y,
            width: w.position.w,
            height: w.position.h,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: '#14141a',
          }}
        >
          <WidgetContent widget={w} />
        </div>
      ))}
      <TelestratorLayer broadcasterId={broadcasterId} />
      <AlertLayer broadcasterId={broadcasterId} />
    </div>
  );
}
