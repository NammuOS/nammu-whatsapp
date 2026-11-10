import type { NammuApp } from '@nammu/sdk';

export interface WhatsAppAccountTab { id: string; name: string; phone?: string; color: string; isMuted: boolean; themeId: string; url: string; }
export interface WhatsAppTheme { id: string; name: string; primaryColor: string; backgroundColor: string; bubbleColor: string; }
export const WHATSAPP_TABS_KEY = 'nammu_whatsapp_tabs';
export const WHATSAPP_THEMES_KEY = 'nammu_whatsapp_themes';
export const WHATSAPP_PROFILE_MIGRATION_KEY = 'nammu_whatsapp_profile_migration_v1';
export const MAX_WHATSAPP_ACCOUNTS = 8;
export const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';
export const DEFAULT_WHATSAPP_THEMES: WhatsAppTheme[] = [
  { id: 'default-dark', name: 'WhatsApp Dark (Default)', primaryColor: '#00a884', backgroundColor: '#111b21', bubbleColor: '#005c4b' },
  { id: 'emerald-night', name: 'Emerald Night', primaryColor: '#2ee6a6', backgroundColor: '#0a1017', bubbleColor: '#0d3829' },
  { id: 'midnight-oled', name: 'Midnight OLED Black', primaryColor: '#25d366', backgroundColor: '#000000', bubbleColor: '#0a2318' },
  { id: 'discord-dark', name: 'Discord Blurple', primaryColor: '#5865f2', backgroundColor: '#1e1f22', bubbleColor: '#35373c' },
  { id: 'cyberpunk-neon', name: 'Cyberpunk Neon', primaryColor: '#00f0ff', backgroundColor: '#0d0f18', bubbleColor: '#1a1f36' },
];
const DEFAULT_TAB: WhatsAppAccountTab = { id: 'wa-account-1', name: 'Personal Account', color: '#00a884', isMuted: false, themeId: 'default-dark', url: WHATSAPP_WEB_URL };
const ACCOUNT_ID = /^wa-account-[a-z0-9-]+$/;
const COLOR = /^#[a-f0-9]{6}$/i;

function parse(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } }
function validTab(value: unknown): value is WhatsAppAccountTab {
  if (!value || typeof value !== 'object') return false; const tab = value as Partial<WhatsAppAccountTab>;
  return typeof tab.id === 'string' && ACCOUNT_ID.test(tab.id) && typeof tab.name === 'string' && tab.name.trim().length > 0 && tab.name.length <= 48 && typeof tab.color === 'string' && COLOR.test(tab.color) && typeof tab.isMuted === 'boolean' && typeof tab.themeId === 'string' && tab.themeId.length > 0 && tab.themeId.length <= 48 && (tab.phone === undefined || (typeof tab.phone === 'string' && tab.phone.length <= 24));
}
export function normalizeWhatsAppTabs(value: unknown, fallback = true): WhatsAppAccountTab[] {
  const parsed = parse(value); if (!Array.isArray(parsed)) return fallback ? [{ ...DEFAULT_TAB }] : [];
  const seen = new Set<string>(); const tabs: WhatsAppAccountTab[] = [];
  for (const candidate of parsed) {
    if (!validTab(candidate) || seen.has(candidate.id)) continue; seen.add(candidate.id);
    tabs.push({ id: candidate.id, name: candidate.name.trim(), ...(candidate.phone ? { phone: candidate.phone } : {}), color: candidate.color, isMuted: candidate.isMuted, themeId: candidate.themeId, url: WHATSAPP_WEB_URL });
  }
  if (tabs.length > MAX_WHATSAPP_ACCOUNTS) throw new Error(`WhatsApp supports at most ${MAX_WHATSAPP_ACCOUNTS} isolated accounts. Migration was not changed.`);
  return tabs.length || !fallback ? tabs : [{ ...DEFAULT_TAB }];
}
function validTheme(value: unknown): value is WhatsAppTheme { if (!value || typeof value !== 'object') return false; const theme = value as Partial<WhatsAppTheme>; return typeof theme.id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(theme.id) && typeof theme.name === 'string' && theme.name.trim().length > 0 && theme.name.length <= 64 && typeof theme.primaryColor === 'string' && COLOR.test(theme.primaryColor) && typeof theme.backgroundColor === 'string' && COLOR.test(theme.backgroundColor) && typeof theme.bubbleColor === 'string' && COLOR.test(theme.bubbleColor); }
export function normalizeWhatsAppThemes(value: unknown): WhatsAppTheme[] { const parsed = parse(value); if (!Array.isArray(parsed)) return DEFAULT_WHATSAPP_THEMES.map((theme) => ({ ...theme })); const seen = new Set<string>(); const themes = parsed.filter((item): item is WhatsAppTheme => validTheme(item) && !seen.has(item.id) && Boolean(seen.add(item.id))); return themes.length ? themes.slice(0, 16).map(({ id, name, primaryColor, backgroundColor, bubbleColor }) => ({ id, name: name.trim(), primaryColor, backgroundColor, bubbleColor })) : DEFAULT_WHATSAPP_THEMES.map((theme) => ({ ...theme })); }

export async function initializeWhatsAppStorage(app: NammuApp): Promise<{ tabs: WhatsAppAccountTab[]; themes: WhatsAppTheme[] }> {
  const settings = await app.settings.getAll();
  const [legacyTabs, legacyThemes] = await Promise.all([
    app.migration.readLegacyStorage(WHATSAPP_TABS_KEY), app.migration.readLegacyStorage(WHATSAPP_THEMES_KEY),
  ]);
  // v1.0.0 completed adoption before persisting package metadata. Existing
  // package metadata plus a completed Core legacy-storage read is therefore a
  // safe upgrade signal. Never rediscover historical profiles after that point:
  // a user may have closed an account shortcut or an old Core build may later
  // recreate a legacy directory, neither of which authorizes another adoption.
  const profileMigrationComplete = settings[WHATSAPP_PROFILE_MIGRATION_KEY] === 'complete'
    || (legacyTabs === null && settings[WHATSAPP_TABS_KEY] !== undefined);
  const discovered = profileMigrationComplete
    ? { profileIds: [] }
    : await app.migration.discoverIntegrationProfiles({ migrationId: 'whatsapp-core-v1' });
  const tabs = normalizeWhatsAppTabs(legacyTabs ?? settings[WHATSAPP_TABS_KEY]); const known = new Set(tabs.map((tab) => tab.id));
  const recovered = discovered.profileIds.filter((id) => ACCOUNT_ID.test(id) && !known.has(id)).map((id, index): WhatsAppAccountTab => ({ id, name: `Account ${tabs.length + index + 1}`, color: '#53bdeb', isMuted: false, themeId: 'default-dark', url: WHATSAPP_WEB_URL }));
  const merged = normalizeWhatsAppTabs([...tabs, ...recovered]); const themes = normalizeWhatsAppThemes(legacyThemes ?? settings[WHATSAPP_THEMES_KEY]);
  if (legacyTabs !== null || recovered.length > 0) {
    for (const tab of merged) await app.migration.adoptIntegrationProfile({ migrationId: 'whatsapp-core-v1', legacyProfileId: tab.id, partitionKey: tab.id });
    await app.settings.set(WHATSAPP_TABS_KEY, JSON.stringify(merged)); if (legacyTabs !== null) await app.migration.completeLegacyStorage(WHATSAPP_TABS_KEY);
  } else if (settings[WHATSAPP_TABS_KEY] === undefined) await app.settings.set(WHATSAPP_TABS_KEY, JSON.stringify(merged));
  if (!profileMigrationComplete) await app.settings.set(WHATSAPP_PROFILE_MIGRATION_KEY, 'complete');
  if (legacyThemes !== null) { await app.settings.set(WHATSAPP_THEMES_KEY, JSON.stringify(themes)); await app.migration.completeLegacyStorage(WHATSAPP_THEMES_KEY); }
  else if (settings[WHATSAPP_THEMES_KEY] === undefined) await app.settings.set(WHATSAPP_THEMES_KEY, JSON.stringify(themes));
  return { tabs: merged, themes };
}
let saveQueue = Promise.resolve();
export function saveWhatsAppTabs(app: NammuApp, tabs: WhatsAppAccountTab[]) { const normalized = normalizeWhatsAppTabs(tabs); saveQueue = saveQueue.then(() => app.settings.set(WHATSAPP_TABS_KEY, JSON.stringify(normalized)).then(() => undefined)); return saveQueue; }
