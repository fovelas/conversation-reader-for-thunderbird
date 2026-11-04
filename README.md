# Conversation Reader for Thunderbird

![Conversation Reader conversation view mockup](docs/images/conversation-tab-mockup.png)

Conversation Reader for Thunderbird opens selected emails in a clean, chronological conversation view inside Thunderbird.

The screenshot uses dummy messages for demonstration.

## Features

- Open selected messages from the toolbar or inbox context menu.
- Group related replies into one conversation.
- Collapse quoted text and highlight your own messages.
- Reply to a message or open the original email.
- Export a conversation as Markdown.
- Choose a predefined accent color.

## Requirements

Thunderbird 137 or later.

## Build environment

The reproducible release build uses:

- OS: Windows 10 with WSL2 (Debian)
- Node.js: 26.13.0 ([official Node.js site](https://nodejs.org/))
- npm: 12.2.1 ([official npm documentation](https://docs.npmjs.com/))

## Build

This project uses TypeScript and Vite. From the repository root, install the exact dependency versions from the committed lockfile and build the extension:

```bash
npm ci
npm run build
```

`npm ci` uses `package-lock.json` without updating it. Use `npm install` only when intentionally changing dependencies or regenerating the lockfile.

The generated extension is placed in `dist/`. Load `dist/manifest.json` as a temporary add-on in Thunderbird.

## Release packaging

The XPI must contain the files inside `dist/`, not the `dist/` directory itself. From the repository root:

```bash
(cd dist && zip -r -FS ../conversation-reader-1.0.1.xpi . -x '*.xpi' '*.zip' 'mockup.html')
unzip -t conversation-reader-1.0.1.xpi
```

Keep `dist/` and `node_modules/` out of the source archive. The source archive must include the committed `package-lock.json` and the build instructions in this README.

## License

MPL-2.0. See [LICENSE](LICENSE).
