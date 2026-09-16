import React from 'react';
import { createRoot } from 'react-dom/client';
import { getNammuSDK } from '@nammu/sdk';
import WhatsAppApp from './whatsapp/WhatsAppApp';
import { initializeWhatsAppStorage } from './whatsapp/whatsappStore';

const root = createRoot(document.getElementById('root')!);
const sdk = getNammuSDK();
root.render(<div className="whatsapp-loading">Opening WhatsApp…</div>);
void initializeWhatsAppStorage(sdk)
  .then(async ({ tabs, themes }) => {
    root.render(<WhatsAppApp sdk={sdk} initialTabs={tabs} themes={themes}/>);
    await sdk.ready();
  })
  .catch((error) => root.render(<div className="whatsapp-fatal"><h1>WhatsApp could not open</h1><p>{error instanceof Error ? error.message : 'Account data could not be loaded safely.'}</p></div>));
