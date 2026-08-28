# Visual thesis — the computational herbarium

## Direction and rationale

Code Prediction Lab is a **botanical field guide**, not a dashboard. Each experiment is treated as a specimen: identify it, make a field note, observe it under controlled conditions, and preserve a trustworthy record. The metaphor fits the learning mechanism precisely—prediction precedes observation—and makes runtime metadata feel like a useful specimen label rather than infrastructure chrome.

The interface borrows pressed-paper warmth, ruled specimen sheets, ink annotations, taxonomic numbering, and deep glasshouse green. Decoration must explain state: branching stems indicate a hypothesis becoming an observation; specimen tabs orient learners in the four-step process. There is no generic gradient hero and no ornamental card grid.

## Palette

Light is the primary treatment; the dark treatment evokes a night greenhouse and follows the user’s system preference.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| paper / background | `#F3F0E4` | `#17231E` | pressed field-book paper / night glasshouse |
| sheet / surface | `#FFFDF5` | `#213129` | working sheet |
| ink / text | `#183027` | `#F4F0DF` | main copy |
| graphite / muted | `#52635B` | `#B9C5BD` | secondary copy |
| fern / accent | `#176B4A` | `#7FD3A7` | primary actions, links |
| pollen | `#D4A72C` | `#E6BE55` | prediction markers, focus |
| success | `#277348` | `#82D3A4` | confirmed/runs |
| warning | `#916513` | `#F0C96B` | mismatches |
| danger | `#A13A35` | `#FF9D92` | execution errors |

All body pairs are targeted at WCAG AA (4.5:1 or better). State always includes an icon or label, never color alone.

## Type and spacing

- Display/field-guide headings: Georgia, Cambria, `Times New Roman`, serif. The familiar engraved-book character supports the herbarium concept without a network font.
- Interface, code, metadata: system UI and `ui-monospace` stacks. No third-party font requests.
- Scale: 14 / 16 / 18 / 23 / 32 / clamp(42–68) px. Body is never below 16 px.
- Spacing follows a 4 px base: 4, 8, 12, 16, 24, 32, 48, 64. Reading measure is capped at 70 characters.
- Corners are clipped or lightly rounded (2–12 px), like labels and pages rather than soft SaaS tiles.

## Layout and interaction grammar

- A persistent field-guide masthead anchors identity and local/offline status.
- The home view opens with one illustrated spread and a direct “Start an experiment” action, followed by the four-part learning loop and specimen list.
- The lab is a single vertical trail: **Specimen → Prediction → Observation → Field note**. Only the current section is visually dominant; completed sections gain a small stamped check.
- Exercise switching uses a native select on narrow screens and an indexed list on wide screens. Run is impossible until a substantive prediction is recorded.
- Results arrive directly below the run control and announce via a polite live region. Keyboard shortcuts: `Ctrl/⌘ + Enter` runs when prediction and code are valid; `Esc` closes dialogs.
- Receipts are local-first. Export is always free. Deletion requires a specific confirmation.

## Motion policy

State changes use 180–240 ms opacity and translate transitions: a result rises a few pixels from the run button, and stamped checks scale once from their origin. Nothing loops. With `prefers-reduced-motion: reduce`, transforms and smooth scrolling are removed and all transitions become effectively instant.

## Original asset plan and provenance

### Hero: `field-guide-hero`

- Subject: an open botanical field notebook in which a branching plant grows from tiny monospaced code marks into pinned observation labels; four small stages suggested by seed, shoot, leaf, pressed specimen.
- World/materials: cream rag paper, graphite, dark green ink, brass specimen pin, faint measurement rules, hand-cut paper collage layered with precise scientific engraving.
- Light/lens: soft north-window light, slight top-down oblique view, tactile shadows, editorial still life.
- Palette words: parchment, fern, moss, pollen yellow, carbon ink.
- Composition: landscape, visual mass on the right and quiet paper on the left for adjacent page copy; no interface mockup.
- Negative list: no people, no hands, no screens, no brand marks, no readable text, no watermark, no logo, no neon gradients, no plastic 3D, no photorealistic clutter.

Generation prompt (verbatim):

> Use case: stylized-concept. Asset type: responsive landing-page hero illustration. Primary request: Create an original botanical field-guide still life about learning code through prediction and observation. Scene: an open cream rag-paper specimen notebook where a delicate branching fern grows from abstract tiny monospaced code-like marks into four pinned observation labels, with seed, shoot, leaf and pressed specimen subtly suggesting a four-step learning cycle. Style: hand-cut paper collage blended with precise 19th-century scientific botanical engraving, contemporary editorial restraint. Composition: landscape, visual detail concentrated to the right and center, calm pale paper breathing room on the left, no interface mockup. Lighting: soft north-window light, gentle tactile shadows, slight top-down oblique view. Palette: parchment, deep fern green, moss, pollen yellow, carbon ink. Materials: deckled paper, graphite, green ink, one small brass specimen pin. Constraints: original image, no people, no hands, no screens, no brands, no readable text, no watermark, no logos, no neon gradient, no glossy plastic 3D, no visual clutter.

- Generator: Azure AI Foundry factory image deployment via `/opt/fleet/lib/gen-image.sh`.
- Date: 2026-08-28.
- License/provenance: newly generated for Code Prediction Lab; no third-party source imagery or named-artist imitation.
- Source candidate retained in `assets/src/` with prompt sidecar. Production crops are optimized AVIF/WebP with a JPEG fallback under `public/assets/`.

All interface icons are original inline SVG strokes using the same ink-and-specimen-label grammar.
