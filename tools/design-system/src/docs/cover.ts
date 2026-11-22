/**
 * The cover's card: Nemia's colours as blocks cut as its hardware is, bleeding off the top edge, the name in Michroma under them and
 * the look's line below it. The blocks are primary 400 wide, surface-container-high 176, secondary 144, tertiary 112 and the label's
 * grey 96, 8 apart; cut at the top right and the bottom left by 28 and 24 (a card's and a table's cut), with a hairline of primary
 * inside the dark block and the one label rounded at 14, as a sticker is.
 */

/** The cover's page. */
export const COVER = `<!-- @dsCard height=320 -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cover</title>
<style>
html, body { margin: 0; }
body { background: var(--md-sys-color-surface); width: 960px; height: 320px; position: relative; overflow: hidden; }
h1 { position: absolute; left: 32px; bottom: 72px; margin: 0; white-space: nowrap; font: 400 60px/0.95 var(--font-michroma); color: var(--md-sys-color-on-surface); }
p { position: absolute; left: 32px; bottom: 36px; margin: 0; font: 400 15px/22px var(--font-barlow); color: var(--md-sys-color-on-surface-variant); }
svg { position: absolute; left: 0; top: 0; }
.yours { fill: var(--md-sys-color-primary); } .alive { fill: var(--md-sys-color-secondary); } .money { fill: var(--md-sys-color-tertiary); }
.rest { fill: var(--md-sys-color-inverse-surface); } .deep { fill: var(--md-sys-color-surface-container-high); }
.edge { fill: none; stroke: var(--md-sys-color-primary); stroke-width: 1; }
</style>
</head>
<body>
<svg width="960" height="112" viewBox="0 0 960 112" role="img" aria-label="Nemia's colours, cut as its hardware is">
<polygon class="yours" points="0,0 372,0 400,28 400,112 28,112 0,84"/>
<polygon class="deep" points="408,0 556,0 584,28 584,112 436,112 408,84"/>
<polygon class="edge" points="424.5,0 546.5,0 567.5,21 567.5,95.5 445.5,95.5 424.5,74.5"/>
<polygon class="alive" points="592,0 712,0 736,24 736,112 616,112 592,88"/>
<polygon class="money" points="744,0 832,0 856,24 856,112 768,112 744,88"/>
<rect class="rest" x="864" y="-14" width="96" height="126" rx="14"/>
</svg>
<h1>Nemia Design System</h1>
<p>Hardware is cut, labels are stuck on.</p>
<script>window.__cells = []; window.__drawn = true;</script>
</body>
</html>
`;
