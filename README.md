# Nammu WhatsApp

The independent, signed WhatsApp integration for Nammu OS. It hosts WhatsApp Web through the public `@nammu/sdk` WebSurface contract. Nammu OS owns browser engines, persistent profiles, permissions, migration, and native isolation; this package owns only product UI and logical account metadata.

## Development

```sh
bun install
bun test
bun run typecheck
bun run build
```

The package requests no filesystem, clipboard, camera, microphone, shell, or native-process permissions. Website-owned functionality remains mediated by the Core-owned browser runtime.
