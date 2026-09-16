import { forwardRef, useEffect, useImperativeHandle, useRef, type MutableRefObject } from 'react';
import type { NammuApp, WebSurfaceHandle, WebSurfaceSnapshot } from '@nammu/sdk';

export interface WhatsAppSurfaceHandle { reload(): Promise<void>; setMuted(muted: boolean): Promise<void>; focus(): Promise<void>; navigate(url: string): Promise<void>; }
interface Props { sdk: NammuApp; partitionKey: string; active: boolean; muted: boolean; overlayActive: boolean; url: string; label: string; onReady(): void; onState(snapshot: WebSurfaceSnapshot): void; onFailure(message: string): void; }
const bounds = (node: HTMLElement) => { const rect = node.getBoundingClientRect(); return { x: Math.max(0, rect.left), y: Math.max(0, rect.top), width: Math.max(1, rect.width), height: Math.max(1, rect.height) }; };
const invoke = (ref: MutableRefObject<WebSurfaceHandle | null>, op: (surface: WebSurfaceHandle) => Promise<void>) => ref.current ? op(ref.current) : Promise.resolve();

const WhatsAppSurface = forwardRef<WhatsAppSurfaceHandle, Props>(function WhatsAppSurface({ sdk, partitionKey, active, muted, overlayActive, url, label, onReady, onState, onFailure }, forwardedRef) {
  const hostRef = useRef<HTMLDivElement | null>(null); const surfaceRef = useRef<WebSurfaceHandle | null>(null);
  const latest = useRef({ onReady, onState, onFailure }); latest.current = { onReady, onState, onFailure };
  useImperativeHandle(forwardedRef, () => ({
    reload: () => invoke(surfaceRef, (surface) => surface.control('reload')),
    setMuted: (next) => invoke(surfaceRef, (surface) => surface.control(next ? 'mute' : 'unmute')),
    focus: () => invoke(surfaceRef, (surface) => surface.focus()),
    navigate: (next) => invoke(surfaceRef, (surface) => surface.navigate(next)),
  }), []);
  useEffect(() => {
    const host = hostRef.current; if (!host) return; let cancelled = false; let unsubscribe = () => {}; let retryTimer = 0; let attempts = 0;
    const create = () => void Promise.resolve().then(() => sdk.webSurfaces.create({ capability: 'whatsapp-web', profileKey: 'whatsapp', partitionKey, privateSession: false, url, bounds: bounds(host), visible: active && !overlayActive })).then((surface) => {
      if (cancelled) return surface.destroy(); surfaceRef.current = surface; host.dataset.surfaceReady = 'true'; unsubscribe = surface.onState((snapshot) => latest.current.onState(snapshot)); void surface.control(muted ? 'mute' : 'unmute'); latest.current.onReady();
    }).catch((error) => { if (cancelled) return; const message = String(error); if (message.includes('Gecko integration session is not ready') && attempts < 40) { attempts += 1; retryTimer = window.setTimeout(create, 250); return; } latest.current.onFailure(message); });
    create(); return () => { cancelled = true; window.clearTimeout(retryTimer); unsubscribe(); const surface = surfaceRef.current; surfaceRef.current = null; delete host.dataset.surfaceReady; void surface?.destroy(); };
  }, [partitionKey, sdk, url]);
  useEffect(() => { void surfaceRef.current?.setVisible(active && !overlayActive); if (active && !overlayActive) void surfaceRef.current?.focus(); }, [active, overlayActive]);
  useEffect(() => { void surfaceRef.current?.control(muted ? 'mute' : 'unmute'); }, [muted]);
  useEffect(() => { const node = hostRef.current; if (!node) return; let frame = 0; const update = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; if (surfaceRef.current) void surfaceRef.current.setBounds(bounds(node)); }); }; const observer = new ResizeObserver(update); observer.observe(node); window.addEventListener('resize', update); window.addEventListener('scroll', update, true); return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); if (frame) cancelAnimationFrame(frame); }; }, []);
  return <div ref={hostRef} className={`whatsapp-surface ${active ? 'is-active' : ''}`} aria-label={label}/>;
});
export default WhatsAppSurface;
