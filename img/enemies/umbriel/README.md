# Umbriel source artwork

The original concept sheet shown in the request must be saved here as
`umbriel_sheet.png`. Register it in the root `assets.txt`:

```text
umbriel_sheet=./img/enemies/umbriel/umbriel_sheet.png
```

`src/umbrielSprites.js` extracts 22 Void Reaver frames and 50 Nocturnus frames
into separate, monochrome, transparent canvases. It excludes the concept
illustrations and headings. Every frame uses a fixed canvas and source scale.
The source image is never drawn directly by the enemy renderer.

The extraction rectangles are provisionally mapped from the chat preview.
They must be checked against the actual image before enabling the encounter.
If the layout differs, update `UMBRIEL_FRAME_ROWS` rather than rescaling
individual character frames.

Until all 72 frames are present, the encounter is disabled to prevent invisible
enemies from damaging the player. No replacement character artwork is used.
