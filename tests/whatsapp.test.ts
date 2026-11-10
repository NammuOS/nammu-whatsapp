import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NammuApp } from '@nammu/sdk';
import { MAX_WHATSAPP_ACCOUNTS, WHATSAPP_PROFILE_MIGRATION_KEY, WHATSAPP_TABS_KEY, WHATSAPP_THEMES_KEY, initializeWhatsAppStorage, normalizeWhatsAppTabs } from '../src/whatsapp/whatsappStore';
const root = resolve(import.meta.dir, '..');
const tab = (id: string) => ({ id, name: id, color: '#00a884', unreadCount: 7, isMuted: false, themeId: 'default-dark', url: 'https://evil.invalid/' });

describe('Nammu WhatsApp package', () => {
  it('validates and deduplicates legacy account metadata without retaining fake unread state or arbitrary URLs', () => {
    const tabs = normalizeWhatsAppTabs([tab('wa-account-a'), tab('wa-account-a'), { broken: true }]);
    expect(tabs).toEqual([{ id: 'wa-account-a', name: 'wa-account-a', color: '#00a884', isMuted: false, themeId: 'default-dark', url: 'https://web.whatsapp.com/' }]);
  });
  it('fails explicitly instead of truncating valid accounts above the partition ceiling', () => {
    expect(() => normalizeWhatsAppTabs(Array.from({ length: MAX_WHATSAPP_ACCOUNTS + 1 }, (_, index) => tab(`wa-account-${index}`)))).toThrow('at most 8');
  });
  it('adopts profiles before committing and completing legacy metadata', async () => {
    const order: string[] = []; const legacy = JSON.stringify([tab('wa-account-a'), tab('wa-account-b')]);
    const app = { settings: { getAll: async () => ({}), set: async (key: string) => { order.push(`set:${key}`); return { success: true }; } }, migration: { readLegacyStorage: async (key: string) => key === WHATSAPP_TABS_KEY ? legacy : null, discoverIntegrationProfiles: async () => ({ profileIds: [] }), adoptIntegrationProfile: async ({ partitionKey }: { partitionKey: string }) => { order.push(`adopt:${partitionKey}`); return { status: 'adopted' as const }; }, completeLegacyStorage: async (key: string) => { order.push(`complete:${key}`); return { completed: true }; } } } as unknown as NammuApp;
    await initializeWhatsAppStorage(app);
    expect(order).toEqual(['adopt:wa-account-a', 'adopt:wa-account-b', `set:${WHATSAPP_TABS_KEY}`, `complete:${WHATSAPP_TABS_KEY}`, `set:${WHATSAPP_PROFILE_MIGRATION_KEY}`, `set:${WHATSAPP_THEMES_KEY}`]);
  });
  it('does not rediscover or re-adopt profiles after v1.0.0 package metadata proves migration completed', async () => {
    let discovered = false; let adopted = false; const stored = JSON.stringify([tab('wa-account-a')]);
    const app = { settings: { getAll: async () => ({ [WHATSAPP_TABS_KEY]: stored }), set: async () => ({ success: true }) }, migration: { readLegacyStorage: async (key: string) => key === WHATSAPP_TABS_KEY ? JSON.stringify([tab('wa-account-stale')]) : null, discoverIntegrationProfiles: async () => { discovered = true; return { profileIds: ['wa-account-later'] }; }, adoptIntegrationProfile: async () => { adopted = true; return { status: 'adopted' as const }; }, completeLegacyStorage: async () => ({ completed: true }) } } as unknown as NammuApp;
    const result = await initializeWhatsAppStorage(app);
    expect(result.tabs.map((item) => item.id)).toEqual(['wa-account-a']); expect(discovered).toBe(false); expect(adopted).toBe(false);
  });
  it('recovers approved logical profiles missing from metadata without duplicates', async () => {
    const adopted: string[] = []; let saved = '';
    const app = { settings: { getAll: async () => ({}), set: async (key: string, value: string) => { if (key === WHATSAPP_TABS_KEY) saved = value; return { success: true }; } }, migration: { readLegacyStorage: async (key: string) => key === WHATSAPP_TABS_KEY ? JSON.stringify([tab('wa-account-a')]) : null, discoverIntegrationProfiles: async () => ({ profileIds: ['wa-account-a', 'wa-account-b'] }), adoptIntegrationProfile: async ({ partitionKey }: { partitionKey: string }) => { adopted.push(partitionKey); return { status: 'adopted' as const }; }, completeLegacyStorage: async () => ({ completed: true }) } } as unknown as NammuApp;
    const result = await initializeWhatsAppStorage(app);
    expect(result.tabs.map((item) => item.id)).toEqual(['wa-account-a', 'wa-account-b']); expect(adopted).toEqual(['wa-account-a', 'wa-account-b']); expect(JSON.parse(saved)).toHaveLength(2);
  });
  it('does not read or migrate the unused nammu_whatsapp_settings key', async () => {
    const reads: string[] = [];
    const app = { settings: { getAll: async () => ({}), set: async () => ({ success: true }) }, migration: { readLegacyStorage: async (key: string) => { reads.push(key); return null; }, discoverIntegrationProfiles: async () => ({ profileIds: [] }), adoptIntegrationProfile: async () => ({ status: 'source-not-found' as const }), completeLegacyStorage: async () => ({ completed: true }) } } as unknown as NammuApp;
    await initializeWhatsAppStorage(app); expect(reads.sort()).toEqual([WHATSAPP_TABS_KEY, WHATSAPP_THEMES_KEY].sort());
  });
  it('declares a minimal bounded package and uses only the public WebSurface SDK', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'nammu.app.json'), 'utf8')); const app = readFileSync(resolve(root, 'src/whatsapp/WhatsAppApp.tsx'), 'utf8'); const surface = readFileSync(resolve(root, 'src/host/WebSurface.tsx'), 'utf8');
    expect(manifest.id).toBe('os.nammu.whatsapp'); expect(manifest.capabilities[0]).toMatchObject({ name: 'whatsapp-web', maxSurfaces: 8, maxPartitions: 8, persistentProfile: true }); expect(manifest.capabilities[0].navigation.origins).toEqual(['https://web.whatsapp.com']); expect(manifest.legacyStorageKeys).toEqual([WHATSAPP_TABS_KEY, WHATSAPP_THEMES_KEY]);
    expect(surface).toContain("capability: 'whatsapp-web'"); expect(surface).toContain("profileKey: 'whatsapp'"); expect(app).toContain('{tabs.map((tab) => <WhatsAppSurface');
    for (const source of [app, surface]) expect(source).not.toMatch(/getPlatformCapabilities|geckoEvalChrome|ContextualIdentityService|__TAURI__|src-tauri|web_surface\.rs|nammu_whatsapp_settings/);
  });
});
