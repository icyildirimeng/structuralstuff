# Structural Stuff


Structural engineering tools. Home page: https://icyildirimeng.github.io/structuralstuff/

## Preliminary Member Sizer
Quick preliminary sizing of structural members for scheme design and coordination meetings.
Every result shows the check that governs.

**Live:** https://icyildirimeng.github.io/structuralstuff/prelim-sizer/

| Tab | What it sizes |
|---|---|
| RC slab | One-way, flat plate, flat slab with drop panels (min h, punching, flexure, fire) |
| PT slab | Two-way / one-way, load balancing, Class U stresses, punching, tendons |
| PT vs RC | Five floor systems compared for one bay |
| RC beam / PT beam | Depth and width from span, tributary and loads |
| Steel beam / Composite | Lightest W-shape per depth; deck, studs, camber, frequency |
| RC column / Steel column | Load takedown, strength vs slenderness, P–M |
| Shear walls | ASCE 7-22 wind, wall length for overturning, shear and drift |
| Transfer | RC or steel girder under column loads |

**Codes:** ACI 318-19, AISC 360-22, ASCE 7-22. US units. Steel shapes: AISC Shapes Database v16.0.

## Disclaimer
For preliminary sizing only. Not a substitute for final design by a licensed engineer.
Results are provided as-is with no warranty.

## Editing
Source is in `prelim-sizer/src/` (`engine.js` = calculations, `ui.js` = interface, `page.html` = layout and styles).
`prelim-sizer/index.html` is the built, self-contained page served by GitHub Pages.
