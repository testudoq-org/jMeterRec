# Capultura Marketing Site

Static marketing site for the Capultura Chrome extension.
Designed to be deployed to any static host or GitHub Pages.

## Structure

```
website/
  index.html       — Landing page (hero, features, workflow, CTA, footer)
  support.html     — Support center (FAQ, contact form, quick links)
  css/main.css     — Custom design system
  js/particles.js  — Three.js ambient particle background
  js/main.js       — Landing page GSAP scroll animations
  js/support.js    — Support page FAQ & contact interactions
  favicon.png      — Site favicon
```

## Dependencies (via CDN)

- **Tailwind CSS** — Play CDN for utility styling
- **Three.js** (r128) — WebGL particle field
- **GSAP** (3.12.5) + **ScrollTrigger** — Scroll-driven reveal animations
- **Google Fonts** — Inter + JetBrains Mono

No build step is required. Zero dependencies to install.

## Local Preview

Open `index.html` directly in any modern browser:

```sh
# From the repo root on Windows PowerShell
start website\index.html

# Or navigate manually
website/index.html
```

## Deployment

### GitHub Pages

1. Move the contents of `website/` to your `gh-pages` branch (or serve from repo root if using GitHub Pages root deployment).
2. Ensure files are served from the domain root so `href="/"` and `href="support.html"` work correctly.

### Generic Static Host

Upload the entire `website/` directory to any static host (Netlify, Vercel, AWS S3, Cloudflare Pages, etc.). All assets are self-contained with CDN-loaded dependencies.

### Subdirectory deployment

If hosting under a subpath (e.g., `https://example.com/site/`), update internal links from `href="/"` to `href="./"` and `href="support.html"` to `href="./support.html"`.

## Design Notes

- Dark glassmorphism theme with cyan/purple/pink accents
- Three.js particle background responds to mouse movement
- GSAP ScrollTrigger animations for hero, features, and workflow sections
- Fully responsive (mobile-first breakpoints at 480px, 768px)
- WCAG-friendly contrast ratios
