# Electrical panel map

An interactive map of a home electrical panel. A QR code on the panel door opens a site that shows which breaker cuts what, where the cables run inside the walls, and what to do when something trips. The site works offline and the data is encrypted with a password.

**Live demo:** [swchck.github.io/epanel](https://swchck.github.io/epanel/) (password `demo`).

It has three parts:

| Part | Where | What for |
|---|---|---|
| Landing page | `/` on GitHub Pages | What it is, how to get your own, a live demo |
| Web app | `/app/` on GitHub Pages | What the QR code opens. A PWA that works offline |
| Desktop app | Tauri, builds in GitHub Releases | Where the panel is filled in and published |

A site made for a real panel is a viewer only: no landing page, no demo and no editor. Its root forwards to `/app/`, which asks for the password, or opens the panel right away when the password comes in the QR link. A static site has nowhere to save changes, so maintenance marks and device notes are added in the desktop app and appear on the site after the next publish. Such sites are made from the [epanel-site](https://github.com/swchck/epanel-site) template. It holds only the encrypted `panel.enc.json` and a workflow that builds the viewer from this repository (`VITE_SITE=viewer`) with that file inside, so every site picks up viewer fixes on its next publish.

The interface is available in Russian, English, Serbian (Latin), Spanish and German, with light and dark themes.

## Features

- **Panel.** DIN-rail modules in true proportions: breakers, RCDs, RCBOs, arc fault devices, fuses, voltage relays with a display, meters, surge protectors, time switches, impulse relays, dimmers, 12/24 V power supplies, transfer switches, UPSs, N/PE busbars and smart-home bus modules. Filter by type, room, tag or issue. Simulation: switch a device off and see what loses power. Panel view or a compact list.
- **Floor plan, 2D and 3D.** Sockets, lights, appliances, data outlets and junction boxes (visible or concealed) at their real height. Doors and windows, wall lengths, ceiling heights, cable runs with no-drill zones, photos of the walls before plastering.
- **What to switch off?** Pick a socket and get an answer like "row 2, fifth from the left". Smart-home relays and contactors do not count as isolation: the app points to the protective breaker upstream.
- **Something tripped.** A step-by-step guide: part of the flat, an RCD, the whole flat, voltage swings, a burning smell. Meters and breakers outside the flat (for example in the floor box on the landing) come with directions to find them. Contacts with a call button.
- **Checks.** Cable size against breaker rating, circuit load with diversity factors, selectivity, cascaded RCDs, wet rooms, RCD type for inverter appliances, supply capacity, phase balance, bus addresses and bus power.
- **Single-line diagram,** built automatically.
- **Smart home.** KNX, DALI, Modbus, Zigbee, Z-Wave, Matter / Thread, Wiren Board: physical addresses, actuator channels, group addresses, room panels.
- **Networks and conduits.** Ethernet, HDMI, coax, empty conduits with a pull string: where every cable goes.
- **Maintenance.** A schedule (RCD test, terminal re-torque, meter readings) with a log under each task. The editor suggests a task as soon as a matching device is added.
- **Labels and QR codes.** Breaker labels at 17.5 mm per module, a QR code for the door and one for every device.
- **Editor.** Everything above is edited in the interface: panel, plan (background from PNG, JPG, SVG or PDF), photos, documents. Notes and instructions support basic Markdown. The draft is kept on the device; the result goes to a file or straight to the site.

## Data security

- Everything lives in one encrypted file, `public/app/panel.enc.json`: AES-256-GCM with a key derived from the password via PBKDF2-SHA256 (310,000 iterations). Photos and documents are inside the same file.
- The host has no server or database; decryption happens in the browser.
- The QR code carries the password in the URL fragment (`#/?k=…`). Browsers never send the fragment to the server, and the app removes the password from the address bar right away.
- Plain YAML/JSON is only for seeding and development. Do not commit it with real data.

## Get your own

### The easy way: the desktop app

You only need a free GitHub account. No forking, no tokens.

1. Download the desktop app from [Releases](https://github.com/swchck/epanel/releases/latest) and open it.
2. Choose **Create a new panel**, or open the `.panel` file your electrician sent you.
3. Fill in the panel and the plan. The app asks for a password the first time you save.
4. In **Save & publish**, press **Sign in with GitHub**, confirm the code on github.com, then **Create a new site** and **Publish**. The site address is filled in for the QR codes automatically.
5. In **Labels & QR**, print the door sticker and the breaker labels (at 100% scale).

### For electricians

Describe the panel in the desktop app on your side and give the client the `.panel` file. The client opens it in the app and publishes the site from their own GitHub account; yours is not involved.

### By hand

1. Fork the repository. In **Settings → Pages**, set the source to **GitHub Actions**.
2. Open `https://<user>.github.io/<repo>/app/`. At first it shows the demo with the password `demo`.
3. Open the **Editor**, fill in the panel and the plan, or import a `.panel` file. On the **General** tab, enter the site address (`https://<user>.github.io/<repo>/app/`): the QR codes point there.
4. In **Save & publish**, publish in one of two ways:
   - with the **Publish** button, using a fine-grained GitHub token with *Contents: Read and write* on this repository only;
   - by hand: download `panel.enc.json` and replace `public/app/panel.enc.json` in the repository.

To have CI check the data itself, add a `PANEL_PASSWORD` secret to the repository. Without it only the file format is checked.

## Desktop app

The same app in a Tauri shell. It opens and saves `.panel` files through the system dialogs, and double-clicking a `.panel` file opens it in the editor.

### Sign in with GitHub

The desktop app publishes through **Sign in with GitHub** (OAuth device flow): it shows a code, the user confirms it on github.com, then picks a repository or creates a new site. A new site is generated from the `epanel-site` template, and GitHub Pages is turned on automatically. The web app keeps the pasted-token option.

To enable the button in your own builds:

1. Register an OAuth App: **Settings → Developer settings → OAuth Apps → New OAuth App**. The homepage and callback URLs can both be the site address; they are not used. Turn on **Enable Device Flow** and keep **Expire user access tokens** on: tokens last 8 hours, and the app refreshes them without a client secret.
2. Copy the **Client ID**. It is not a secret and is built into the app as is.
3. For releases, add it as a repository variable (**Settings → Secrets and variables → Actions → Variables**) named `OAUTH_CLIENT_ID`. For local builds, put `VITE_GITHUB_CLIENT_ID=<client id>` and `REPO_URL=https://github.com/<user>/<repo>` in `.env.local`.
4. Put a copy of [epanel-site](https://github.com/swchck/epanel-site) next to your repository, named `<repo>-site`, mark it as a template (**Settings → General → Template repository**) and set its `EPANEL_REPO` variable to your repository. New sites are generated from it; without it, creating a site fails.

The app asks for the `repo` scope: GitHub does not allow turning on Pages for a new repository without it.

Builds appear in Releases after pushing a `v*` tag. They are unsigned: on macOS, open the app the first time with right-click → Open.

## Development

```bash
npm install
npm run dev            # http://localhost:5180/ (landing) and /app/
npm run desktop        # Tauri in development mode
npm test               # vitest
npm run lint
npm run typecheck
npm run i18n:check     # every key translated into all 5 languages
npm run build          # landing + app into dist/
npm run desktop:build  # desktop build
npm run seed:demo      # rebuild the demo files from data/*.yaml
npm run icons          # PWA icons from public/icon.svg
npm run og-image       # link preview image, public/og.png
npm run dmg-background # macOS installer background
```

Layout:

```
src/domain/      pure logic without Vue: data schema (zod), power graph, loads, checks, encryption
src/editor/      editor operations on the data
src/components/  panel (SVG), plan (SVG and three.js), editor, shared components, shadcn-vue
src/views/       app screens
src/landing/     landing page
src/lib/         GitHub publishing and sign-in, Markdown, media helpers
src/platform/    files and links: browser or Tauri
src-tauri/       desktop shell
data/            demo apartments (YAML) and their images
scripts/         seed, validate, KNX demo generator, translation check
```

Stack: Vue 3, TypeScript, Vite, Tailwind CSS 4, shadcn-vue, Pinia, vue-i18n, zod, three.js, vite-plugin-pwa, Tauri 2.

## Limitations

The checks are simplified: copper conductors, concealed wiring, the voltage from the settings. They do not replace a wiring design or an inspection by an electrician.

There is no live data yet. Devices have an `entity` field reserved for a future integration with Home Assistant or a smart meter.
