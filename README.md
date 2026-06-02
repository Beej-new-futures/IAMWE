# IAMWE

Three.js interactive 3D studio — built with Vite.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at `http://localhost:5173` with hot reload.

## Build for production

```bash
npm run build
```

Output goes to `dist/`.

## Project structure

```
IAMWE/
├── index.html              # Entry point
├── package.json
├── vite.config.js
├── src/
│   └── main.js             # All Three.js logic
└── public/                 # Static assets — served as-is
    ├── IAMWE_LOGO_.svg
    ├── nav_symbol_01.png
    ├── nav_symbol_02.png
    └── models/
        ├── models.json     # List of .glb filenames to load
        ├── HDRI_STUDIO_vol2_004.hdr
        ├── pic_image_1.png
        └── *.glb
```

## Cloudflare Pages settings

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `20` |
