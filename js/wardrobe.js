/**
 * wardrobe.js — 70 件衣橱的独立 SVG 版型
 *
 * 角色身体、头、头发、手臂、腿由 chat.html 里的 SVG 提供；
 * 这里按分类生成每件衣服自己的 SVG 图形，渲染进 data-wd 图层。
 * 每件都有独立轮廓（领口、袖型、裙型、鞋型、帽型、发饰、首饰），
 * 不再用同一路径换 CSS 颜色。
 */

const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const C = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const E = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;

/* ---------------- 上衣 ---------------- */
const TOPS = {
  'top-cream':    { color: '#FFF3E0', body: 'fitted', sleeve: 'short', neck: 'round',  pattern: 'buttons' },
  'top-tee':      { color: '#8FB79A', body: 'loose',  sleeve: 'short', neck: 'round',  pattern: 'hem' },
  'top-pajama':   { color: '#A6C4E4', body: 'loose',  sleeve: 'long',  neck: 'notch',  pattern: 'stars' },
  'top-festival': { color: '#FFF3D6', body: 'fitted', sleeve: 'puff',  neck: 'peter',  pattern: 'sash' },
  'top-mist':     { color: '#A9C6DC', body: 'fitted', sleeve: 'long',  neck: 'sailor', pattern: 'buttons' },
  'top-apricot':  { color: '#F2D2B6', body: 'loose',  sleeve: 'long',  neck: 'turtle', pattern: 'rib' },
  'top-pink':     { color: '#F3C1CB', body: 'loose',  sleeve: 'long',  neck: 'hood',   pattern: 'pocket' },
  'top-green':    { color: '#A8C8A8', body: 'fitted', sleeve: 'long',  neck: 'open',   pattern: 'buttons' },
  'top-lace':     { color: '#FFF8EE', body: 'fitted', sleeve: 'puff',  neck: 'square', pattern: 'lace' },
  'top-cape':     { color: '#C9B7E6', body: 'fitted', sleeve: 'none',  neck: 'cape',   pattern: 'stars' },
};

function topBody(c) {
  if (c.body === 'loose') return 'M82 132 C76 158 74 198 76 242 H144 C146 198 144 158 138 132 Z';
  if (c.body === 'peplum') return 'M84 132 C78 150 76 174 78 200 H142 C144 174 142 150 136 132 Z M78 200 C72 216 68 230 70 240 H150 C152 230 148 216 142 200 Z';
  return 'M84 132 C80 150 78 172 80 242 H140 C142 172 140 150 136 132 Z';
}

function topSleeves(c) {
  if (c.sleeve === 'none') return '';
  const sides = c.sleeve === 'puff'
    ? [P('M84 136 C72 138 66 150 68 162 C78 164 86 158 90 148 Z', c.color), P('M136 136 C148 138 154 150 152 162 C142 164 134 158 130 148 Z', c.color)]
    : c.sleeve === 'long'
    ? [P('M84 136 C72 150 66 186 68 224 L80 226 C82 196 86 168 92 148 Z', c.color), P('M136 136 C148 150 154 186 152 224 L140 226 C138 196 134 168 128 148 Z', c.color)]
    : [P('M84 136 C74 142 70 156 72 170 L86 168 L92 142 Z', c.color), P('M136 136 C146 142 150 156 148 170 L134 168 L128 142 Z', c.color)];
  return sides.join('');
}

function topNeck(c) {
  const light = '#FFF8EE';
  if (c.neck === 'round') return `<path d="M96 132 C102 144 118 144 124 132" fill="none" stroke="${light}" stroke-width="2.4"/>`;
  if (c.neck === 'v') return `<path d="M96 132 L110 152 L124 132" fill="none" stroke="${light}" stroke-width="2.4"/>`;
  if (c.neck === 'notch') return `<path d="M96 132 L110 146 L124 132" fill="none" stroke="${light}" stroke-width="2"/>`;
  if (c.neck === 'square') return `<path d="M96 132 H124 V146 H96 Z" fill="${light}" opacity="0.85"/>`;
  if (c.neck === 'sailor') return `<path d="M96 132 L110 150 L124 132" fill="none" stroke="${light}" stroke-width="2.4"/><path d="M104 148 L110 160 L116 148 Z" fill="#E4572E"/>`;
  if (c.neck === 'peter') return `<path d="M94 132 C100 140 106 142 110 142 C114 142 120 140 126 132 C122 128 116 126 110 126 C104 126 98 128 94 132 Z" fill="${light}"/>`;
  if (c.neck === 'turtle') return `<rect x="96" y="122" width="28" height="14" rx="6" fill="${c.color}" stroke="#E8D8C8" stroke-width="1"/>`;
  if (c.neck === 'hood') return `<path d="M84 132 C80 116 92 106 110 106 C128 106 140 116 136 132 C130 122 120 118 110 118 C100 118 90 122 84 132 Z" fill="${c.color}" stroke="#D8C4E6" stroke-width="1"/>`;
  if (c.neck === 'open') return `<path d="M110 132 V240" stroke="#E8D8C8" stroke-width="1.4"/><circle cx="110" cy="160" r="1.6" fill="#E8D8C8"/><circle cx="110" cy="186" r="1.6" fill="#E8D8C8"/><circle cx="110" cy="212" r="1.6" fill="#E8D8C8"/>`;
  if (c.neck === 'cape') return `<path d="M84 132 C62 146 52 178 50 212 C70 198 90 192 110 192 C130 192 150 198 170 212 C168 178 158 146 136 132 Z" fill="${c.color}" stroke="#D8C4E6" stroke-width="1"/><path d="M58 204 C78 194 94 190 110 190 C126 190 142 194 162 204 L160 214 C142 204 126 200 110 200 C94 200 78 204 60 214 Z" fill="#E8D9F6"/>`;
  return '';
}

function topPattern(c) {
  const light = '#FFF8EE';
  if (c.pattern === 'buttons') return [C(110, 166, 1.7, '#C9B3A3'), C(110, 192, 1.7, '#C9B3A3'), C(110, 218, 1.7, '#C9B3A3')].join('');
  if (c.pattern === 'hem') return `<path d="M76 232 H144 V238 H76 Z" fill="${light}" opacity="0.8"/>`;
  if (c.pattern === 'stars') return [C(92, 170, 2, light), C(128, 188, 1.7, light), C(98, 210, 2, light), C(130, 226, 1.6, light)].join('');
  if (c.pattern === 'sash') return `<path d="M80 206 H140 V218 H80 Z" fill="#E7B36A"/>`;
  if (c.pattern === 'rib') return [154, 168, 182, 196, 210, 224].map(y => `<path d="M84 ${y} H136" stroke="#E8C8A8" stroke-width="1.2" opacity="0.7"/>`).join('');
  if (c.pattern === 'pocket') return `<path d="M92 196 H128 V218 H92 Z" fill="#E8AFC0" opacity="0.8"/>`;
  if (c.pattern === 'lace') return [C(90, 158, 1.3, light), C(130, 166, 1.3, light), C(96, 188, 1.3, light), C(124, 202, 1.3, light), C(88, 220, 1.3, light), C(132, 228, 1.3, light)].join('');
  return '';
}

function topArt(id) {
  const c = TOPS[id];
  if (!c) return '';
  return `<g>${P(topBody(c), c.color)}${topSleeves(c)}${topPattern(c)}${topNeck(c)}</g>`;
}

/* ---------------- 下装 ---------------- */
const BOTTOMS = {
  'bottom-denim':  { color: '#7FA8C9', type: 'pants' },
  'bottom-blue':   { color: '#8FB0D6', type: 'pants', pattern: 'stars' },
  'bottom-navy':   { color: '#4F6B86', type: 'pants', pattern: 'stripe' },
  'bottom-gold':   { color: '#E7B36A', type: 'skirt', pattern: 'sash' },
  'bottom-mist':   { color: '#A9C6DC', type: 'wide' },
  'bottom-pink':   { color: '#F3C1CB', type: 'pleated' },
  'bottom-beige':  { color: '#DCC8B0', type: 'pants', pattern: 'cuff' },
  'bottom-green':  { color: '#A8C8A8', type: 'longskirt' },
  'bottom-purple': { color: '#C9B7E6', type: 'flare' },
  'bottom-galaxy': { color: '#B9C8E8', type: 'galaxy' },
};

function bottomArt(id) {
  const c = BOTTOMS[id];
  if (!c) return '';
  const light = '#FFF8EE';
  if (c.type === 'pants') {
    const d = 'M83 236 L137 236 L141 256 L137 328 H115 L110 272 L105 328 H83 L79 256 Z';
    let extra = '';
    if (c.pattern === 'stars') extra = [C(90, 260, 1.6, light), C(128, 276, 1.6, light), C(96, 300, 1.6, light)].join('');
    if (c.pattern === 'stripe') extra = `<path d="M84 244 L80 326" stroke="${light}" stroke-width="3"/><path d="M136 244 L140 326" stroke="${light}" stroke-width="3"/>`;
    if (c.pattern === 'cuff') extra = `<path d="M81 316 H105 V326 H81 Z" fill="${light}" opacity="0.7"/><path d="M115 316 H139 V326 H115 Z" fill="${light}" opacity="0.7"/>`;
    return `<g>${P(d, c.color)}${extra}</g>`;
  }
  if (c.type === 'wide') {
    return `<g>${P('M82 236 L138 236 L148 272 L144 328 H116 L110 282 L104 328 H76 L72 272 Z', c.color)}${P('M80 236 H140 V246 H80 Z', '#7FA8C9')}</g>`;
  }
  if (c.type === 'flare') {
    return `<g>${P('M83 236 L137 236 L148 300 L142 328 H116 L110 282 L104 328 H78 L72 300 Z', c.color)}${P('M80 236 H140 V246 H80 Z', '#B9A6D8')}</g>`;
  }
  if (c.type === 'pleated') {
    const pleats = [78, 92, 106, 120, 134, 148].map(x => `<path d="M110 246 L${x} 312" stroke="#E8AFC0" stroke-width="1.2" opacity="0.7"/>`).join('');
    return `<g>${P('M82 236 L138 236 L158 300 C158 310 150 316 140 316 H80 C70 316 62 310 62 300 Z', c.color)}${pleats}<path d="M80 236 H140 V244 H80 Z" fill="#FFF3D6"/></g>`;
  }
  if (c.type === 'longskirt') {
    return `<g>${P('M82 236 L138 236 L162 306 H58 Z', c.color)}${P('M82 236 H138 V244 H82 Z', '#FFF3D6')}</g>`;
  }
  if (c.type === 'galaxy') {
    return `<g>${P('M82 236 L138 236 L162 306 H58 Z', c.color)}${P('M82 236 L138 236 L146 268 H74 Z', '#C9D6F2', 'opacity="0.6"')}${C(86, 270, 1.7, light)}${C(122, 282, 1.7, light)}${C(100, 294, 1.7, light)}${C(140, 300, 1.7, light)}<path d="M82 232 H138 V240 H82 Z" fill="#E8EEF8"/></g>`;
  }
  // 裙子
  return `<g>${P('M82 236 L138 236 L158 300 C158 310 150 316 140 316 H80 C70 316 62 310 62 300 Z', c.color)}${c.pattern === 'sash' ? '<path d="M80 236 H140 V246 H80 Z" fill="#FFF3D6"/>' : ''}</g>`;
}

/* ---------------- 裙装 ---------------- */
const DRESSES = {
  'dress-cream':  { color: '#FFF3D6', type: 'pinafore' },
  'dress-mist':   { color: '#A9C6DC', type: 'shirt' },
  'dress-pink':   { color: '#F3C1CB', type: 'puff' },
  'dress-green':  { color: '#A8C8A8', type: 'empire' },
  'gown-star':    { color: '#CBB7E8', type: 'star' },
  'gown-rainbow': { color: '#F3B7C6', type: 'rainbow' },
  'gown-moon':    { color: '#9FB6D9', type: 'moon' },
  'gown-flower':  { color: '#E9A6B8', type: 'flower' },
  'gown-dream':   { color: '#F2D9A6', type: 'ball' },
};

function dressArt(id) {
  const c = DRESSES[id];
  if (!c) return '';
  const light = '#FFF8EE';
  const body = P('M84 132 C80 150 78 172 80 196 H140 C142 172 140 150 136 132 Z', c.color);
  const sash = `<path d="M80 190 H140 V202 H80 Z" fill="${light}"/>`;
  if (c.type === 'pinafore') {
    return `<g>${P('M86 132 L94 158 L100 158 L94 132 Z', c.color)}${P('M134 132 L126 158 L120 158 L126 132 Z', c.color)}${body}${P('M80 196 C70 222 62 262 56 302 H164 C158 262 150 222 140 196 Z', c.color)}${sash}</g>`;
  }
  if (c.type === 'shirt') {
    return `<g>${body}${P('M96 132 L110 150 L124 132 Z', light)}${P('M80 196 C70 222 62 262 56 302 H164 C158 262 150 222 140 196 Z', c.color)}${sash}<path d="M110 202 V296" stroke="${light}" stroke-width="1.2"/>${C(110, 216, 1.6, light)}${C(110, 238, 1.6, light)}${C(110, 260, 1.6, light)}</g>`;
  }
  if (c.type === 'puff') {
    return `<g>${body}${P('M84 136 C72 138 66 150 68 162 C78 164 86 158 90 148 Z', c.color)}${P('M136 136 C148 138 154 150 152 162 C142 164 134 158 130 148 Z', c.color)}${P('M80 196 C72 216 66 236 62 252 H158 C154 236 148 216 140 196 Z', c.color)}${P('M62 244 C56 262 52 280 48 296 H172 C168 280 164 262 158 244 Z', light, 'opacity="0.55"')}${P('M48 288 C44 296 42 302 42 308 H178 C178 302 176 296 172 288 Z', c.color)}${sash}</g>`;
  }
  if (c.type === 'empire') {
    return `<g>${P('M84 132 C80 150 78 168 80 186 H140 C142 168 140 150 136 132 Z', c.color)}${P('M80 186 C74 220 66 264 60 306 H160 C154 264 146 220 140 186 Z', c.color)}${P('M80 182 H140 V192 H80 Z', light)}${C(110, 160, 1.6, light)}${C(110, 176, 1.6, light)}</g>`;
  }
  if (c.type === 'star') {
    return `<g>${body}${P('M80 196 C70 222 62 262 56 302 H164 C158 262 150 222 140 196 Z', c.color)}${sash}${[C(92, 240, 2, light), C(132, 252, 2, light), C(78, 270, 2, light), C(118, 280, 2, light), C(146, 292, 2, light), C(100, 296, 2, light)].join('')}</g>`;
  }
  if (c.type === 'rainbow') {
    return `<g>${body}${P('M80 196 C72 214 66 234 62 252 H158 C154 234 148 214 140 196 Z', '#D8C4F0')}${P('M62 244 C56 262 52 280 48 296 H172 C168 280 164 262 158 244 Z', '#B9E3F0')}${P('M48 288 C44 296 42 302 42 308 H178 C178 302 176 296 172 288 Z', '#FFD1DC')}${sash}</g>`;
  }
  if (c.type === 'moon') {
    return `<g>${P('M84 150 C62 190 50 250 52 296 C64 272 74 232 82 198 Z', '#C9D6F2', 'opacity="0.72"')}${P('M136 150 C158 190 170 250 168 296 C156 272 146 232 138 198 Z', '#C9D6F2', 'opacity="0.72"')}${P('M84 132 C80 150 78 168 80 188 H140 C142 168 140 150 136 132 Z', c.color)}${P('M80 188 C74 222 66 266 60 306 H160 C154 266 146 222 140 188 Z', c.color)}<path d="M118 248 a10 10 0 1 0 9 12 a8 8 0 0 1 -9 -12 z" fill="${light}"/>${P('M80 184 H140 V194 H80 Z', '#E8EEF8')}</g>`;
  }
  if (c.type === 'flower') {
    const flowers = [92, 124, 104].map((x, i) => {
      const y = 246 + i * 18;
      return C(x, y, 3, light) + C(x - 4, y + 4, 3, light) + C(x + 4, y + 4, 3, light) + C(x, y + 8, 3, light);
    }).join('');
    return `<g>${body}${P('M80 196 C70 222 62 262 56 302 H164 C158 262 150 222 140 196 Z', c.color)}${P('M92 196 H128 L136 286 H84 Z', light, 'opacity="0.92"')}${sash}${flowers}</g>`;
  }
  // ball
  return `<g>${body}${P('M80 196 C64 220 50 262 42 306 H178 C170 262 156 220 140 196 Z', c.color)}${P('M52 250 C48 258 44 266 42 274 H178 C176 266 172 258 168 250 Z', light, 'opacity="0.55"')}${P('M42 296 C40 302 38 306 38 310 H182 C182 306 180 302 178 296 Z', light)}<path d="M80 190 H140 V202 H80 Z" fill="#C99A4A"/>${[C(84, 236, 2, light), C(136, 248, 2, light), C(66, 270, 2, light), C(154, 280, 2, light), C(98, 292, 2, light), C(122, 298, 2, light)].join('')}</g>`;
}

/* ---------------- 鞋子 ---------------- */
const SHOES = {
  'shoe-brown':  { color: '#8A6844', type: 'flat' },
  'shoe-pink':   { color: '#D9A5A0', type: 'slipper' },
  'shoe-white':  { color: '#FFFDF9', type: 'sneaker' },
  'shoe-red':    { color: '#B04A28', type: 'mary' },
  'shoe-mist':   { color: '#A9C6DC', type: 'ballet' },
  'shoe-apricot':{ color: '#E7C3A0', type: 'sandal' },
  'shoe-green':  { color: '#8FB79A', type: 'rain' },
  'shoe-purple': { color: '#C9B7E6', type: 'snow' },
  'shoe-cream':  { color: '#FFF8EE', type: 'star' },
  'shoe-crystal':{ color: '#DCEBF7', type: 'crystal' },
};

function shoeArt(id) {
  const c = SHOES[id];
  if (!c) return '';
  const dark = '#5F4A3B';
  const light = '#FFF8EE';
  if (c.type === 'sneaker') return `<g>${P('M84 338 H102 V350 H80 V344 A6 6 0 0 1 84 338 Z', c.color)}${P('M115 338 H133 A6 6 0 0 1 137 344 V350 H115 Z', c.color)}<path d="M84 344 H102" stroke="${dark}" stroke-width="1.2"/><path d="M84 347 H102" stroke="${dark}" stroke-width="1.2"/><path d="M115 344 H137" stroke="${dark}" stroke-width="1.2"/><rect x="80" y="350" width="27" height="3" rx="1.5" fill="${dark}"/><rect x="113" y="350" width="29" height="3" rx="1.5" fill="${dark}"/></g>`;
  if (c.type === 'slipper') return `<g><path d="M84 340 H104 V350 H80 V345 A5 5 0 0 1 84 340 Z" fill="${c.color}"/><path d="M115 340 H135 A5 5 0 0 1 139 345 V350 H115 Z" fill="${c.color}"/><path d="M86 338 H100" stroke="#FFF8EE" stroke-width="3"/><path d="M118 338 H134" stroke="#FFF8EE" stroke-width="3"/></g>`;
  if (c.type === 'mary') return `<g>${P('M84 340 H104 A4 4 0 0 1 108 344 V350 H80 V345 A5 5 0 0 1 84 340 Z', c.color)}${P('M115 340 H135 A5 5 0 0 1 140 345 V350 H115 Z', c.color)}<path d="M86 340 H102" stroke="${dark}" stroke-width="2"/><path d="M118 340 H134" stroke="${dark}" stroke-width="2"/><rect x="80" y="350" width="27" height="3" rx="1.5" fill="${dark}"/><rect x="113" y="350" width="29" height="3" rx="1.5" fill="${dark}"/></g>`;
  if (c.type === 'ballet') return `<g>${P('M82 346 H104 V350 H80 V348 A3 3 0 0 1 82 346 Z', c.color)}${P('M116 346 H138 A3 3 0 0 1 140 348 V350 H116 Z', c.color)}<path d="M92 346 L96 338 L100 346 Z" fill="#F3C1CB"/><path d="M120 346 L124 338 L128 346 Z" fill="#F3C1CB"/></g>`;
  if (c.type === 'sandal') return `<g><path d="M80 348 H104 V350 H80 Z" fill="${c.color}"/><path d="M116 348 H140 V350 H116 Z" fill="${c.color}"/><path d="M84 342 L100 348" stroke="${c.color}" stroke-width="2"/><path d="M120 342 L136 348" stroke="${c.color}" stroke-width="2"/></g>`;
  if (c.type === 'rain') return `<g>${P('M84 328 H104 V350 H80 V334 A6 6 0 0 1 84 328 Z', c.color)}${P('M116 328 H136 A6 6 0 0 1 140 334 V350 H116 Z', c.color)}<path d="M80 334 H104" stroke="${light}" stroke-width="2"/><path d="M116 334 H140" stroke="${light}" stroke-width="2"/><rect x="80" y="350" width="27" height="3" rx="1.5" fill="${dark}"/><rect x="113" y="350" width="29" height="3" rx="1.5" fill="${dark}"/></g>`;
  if (c.type === 'snow') return `<g>${P('M84 330 H104 V350 H80 V336 A6 6 0 0 1 84 330 Z', c.color)}${P('M116 330 H136 A6 6 0 0 1 140 336 V350 H116 Z', c.color)}${C(86, 330, 5, '#FFF8EE')}${C(96, 330, 4, '#FFF8EE')}${C(122, 330, 4, '#FFF8EE')}${C(134, 330, 5, '#FFF8EE')}<rect x="80" y="350" width="27" height="3" rx="1.5" fill="${dark}"/><rect x="113" y="350" width="29" height="3" rx="1.5" fill="${dark}"/></g>`;
  if (c.type === 'star') return `<g>${P('M84 334 H104 V350 H80 V340 A5 5 0 0 1 84 334 Z', c.color)}${P('M116 334 H136 A5 5 0 0 1 140 340 V350 H116 Z', c.color)}<path d="M92 336 l1.6 3.4 3.7 .3 -2.8 2.4 .9 3.6 -3.4-2 -3.4 2 .9-3.6 -2.8-2.4 3.7-.3z" fill="#F4D35E"/><path d="M124 336 l1.6 3.4 3.7 .3 -2.8 2.4 .9 3.6 -3.4-2 -3.4 2 .9-3.6 -2.8-2.4 3.7-.3z" fill="#F4D35E"/></g>`;
  if (c.type === 'crystal') return `<g><path d="M84 340 H104 A4 4 0 0 1 108 344 V350 H80 V345 A5 5 0 0 1 84 340 Z" fill="${c.color}" opacity="0.9"/><path d="M115 340 H135 A5 5 0 0 1 140 345 V350 H115 Z" fill="${c.color}" opacity="0.9"/><rect x="80" y="350" width="27" height="3" rx="1.5" fill="#B9D6E8"/><rect x="113" y="350" width="29" height="3" rx="1.5" fill="#B9D6E8"/><circle cx="90" cy="346" r="1.2" fill="#FFF8EE"/><circle cx="122" cy="347" r="1.2" fill="#FFF8EE"/></g>`;
  // flat
  return `<g>${P('M84 342 H102 A6 6 0 0 1 108 348 V350 H80 V348 A5 5 0 0 1 84 342 Z', c.color)}${P('M115 342 H133 A5 5 0 0 1 138 348 V350 H115 Z', c.color)}<rect x="80" y="350" width="27" height="3" rx="1.5" fill="${dark}"/><rect x="113" y="350" width="29" height="3" rx="1.5" fill="${dark}"/></g>`;
}

/* ---------------- 帽子 ---------------- */
const HATS = {
  'hat-cap':     { color: '#4F6B86', type: 'cap' },
  'hat-beret':   { color: '#B04A28', type: 'beret' },
  'hat-mist':    { color: '#A9C6DC', type: 'bucket' },
  'hat-apricot': { color: '#F2D2B6', type: 'beanie' },
  'hat-pink':    { color: '#F3C1CB', type: 'sun' },
  'hat-green':   { color: '#A8C8A8', type: 'headband' },
  'hat-cream':   { color: '#FFF3D6', type: 'flower' },
  'hat-purple':  { color: '#C9B7E6', type: 'bunny' },
  'hat-crown':   { color: '#F4D35E', type: 'crown' },
};

function hatArt(id) {
  const c = HATS[id];
  if (!c) return '';
  const light = '#FFF8EE';
  if (c.type === 'cap') return `<g>${P('M72 66 C78 34 142 34 148 66 Z', c.color)}${P('M64 66 Q110 84 156 66 L156 73 Q110 91 64 73 Z', c.color)}${C(110, 42, 3, c.color)}</g>`;
  if (c.type === 'beret') return `<g>${E(110, 52, 38, 13, c.color, 'transform="rotate(-8 110 52)"')}${E(110, 60, 30, 5, c.color)}${C(142, 40, 7, light)}</g>`;
  if (c.type === 'bucket') return `<g>${P('M78 62 C82 38 138 38 142 62 Z', c.color)}${E(110, 64, 38, 8, c.color)}<path d="M74 64 H146" stroke="${light}" stroke-width="2"/></g>`;
  if (c.type === 'beanie') return `<g>${P('M78 66 C80 34 140 34 142 66 Z', c.color)}${P('M76 62 H144 V72 H76 Z', c.color)}${C(110, 32, 6, light)}</g>`;
  if (c.type === 'sun') return `<g>${P('M84 62 C88 38 132 38 136 62 Z', c.color)}${E(110, 64, 48, 9, c.color)}<path d="M78 64 H142" stroke="${light}" stroke-width="2"/></g>`;
  if (c.type === 'headband') return `<g><path d="M74 78 C78 42 142 42 146 78" fill="none" stroke="${c.color}" stroke-width="6"/><path d="M100 50 L104 58 L112 58 L106 63 L108 70 L101 66 L94 70 L97 62 L91 58 L99 57 Z" fill="${light}"/></g>`;
  if (c.type === 'flower') return `<g>${[84, 98, 112, 126, 140].map(x => C(x, 58, 6, c.color) + C(x, 58, 2.5, light)).join('')}${C(110, 52, 5, '#E9A6B8')}</g>`;
  if (c.type === 'bunny') return `<g><path d="M80 58 C74 28 82 16 92 24 C100 32 94 52 96 60 Z" fill="${c.color}"/><path d="M78 58 C72 30 80 18 90 26 C98 34 92 52 94 60 Z" fill="#F6E3EE" opacity="0.5"/><path d="M140 58 C146 28 138 16 128 24 C120 32 126 52 124 60 Z" fill="${c.color}"/><path d="M142 58 C148 30 140 18 130 26 C122 34 128 52 126 60 Z" fill="#F6E3EE" opacity="0.5"/><path d="M80 62 C86 50 94 50 98 62 Z" fill="${c.color}"/><path d="M122 62 C126 50 134 50 140 62 Z" fill="${c.color}"/></g>`;
  // crown
  return `<g><path d="M88 64 L94 44 L104 58 L110 38 L116 58 L126 44 L132 64 Z" fill="${c.color}" stroke="#E0B93F" stroke-width="1.2"/><path d="M88 64 H132 V70 H88 Z" fill="#E0B93F"/>${C(110, 52, 2.2, light)}${C(97, 60, 1.6, '#F3A6B8')}${C(123, 60, 1.6, '#A9C6DC')}</g>`;
}

/* ---------------- 头饰 ---------------- */
const HAIRS = {
  'hair-bow':    { color: '#E4572E', type: 'bow' },
  'hair-star':   { color: '#F4D35E', type: 'star' },
  'hair-mist':   { color: '#A9C6DC', type: 'ribbon' },
  'hair-apricot':{ color: '#F2D2B6', type: 'pearl' },
  'hair-pink':   { color: '#F3C1CB', type: 'flower' },
  'hair-green':  { color: '#A8C8A8', type: 'headband' },
  'hair-cream':  { color: '#FFF3D6', type: 'bunny' },
  'hair-purple': { color: '#C9B7E6', type: 'feather' },
  'hair-crown':  { color: '#F4D35E', type: 'crown' },
};

function hairArt(id) {
  const c = HAIRS[id];
  if (!c) return '';
  const light = '#FFF8EE';
  if (c.type === 'bow') return `<g>${P('M138 64 C150 56 160 62 156 72 C152 80 142 78 138 72 Z', c.color)}${P('M138 80 C150 88 160 82 156 72 C152 64 142 66 138 72 Z', c.color)}${C(138, 72, 3, '#B03A1E')}</g>`;
  if (c.type === 'star') return `<g><path d="M72 56 l2.6 6 6.4 .5 -4.9 4.2 1.5 6.3 -5.6-3.4 -5.6 3.4 1.5-6.3 -4.9-4.2 6.4-.5z" fill="${c.color}" stroke="#E0B93F" stroke-width="1"/></g>`;
  if (c.type === 'ribbon') return `<g><path d="M138 60 C148 50 160 54 158 66 C156 76 144 76 140 68 Z" fill="${c.color}"/><path d="M138 76 C148 86 160 82 158 70 C156 60 144 60 140 68 Z" fill="${c.color}"/><path d="M138 68 C132 74 132 86 138 90" fill="none" stroke="${c.color}" stroke-width="3"/></g>`;
  if (c.type === 'pearl') return `<g><path d="M76 62 C82 52 96 48 104 54" fill="none" stroke="${c.color}" stroke-width="4"/>${C(82, 55, 3, light)}${C(90, 50, 3, light)}${C(98, 52, 3, light)}</g>`;
  if (c.type === 'flower') return `<g>${C(80, 62, 4, c.color)}${C(76, 66, 4, c.color)}${C(84, 66, 4, c.color)}${C(80, 70, 4, c.color)}${C(80, 66, 2, light)}</g>`;
  if (c.type === 'headband') return `<g><path d="M70 92 C74 52 146 52 150 92" fill="none" stroke="${c.color}" stroke-width="5"/><path d="M84 58 L90 48 L96 58 Z" fill="${light}"/></g>`;
  if (c.type === 'bunny') return `<g><path d="M140 58 C146 38 142 30 136 34 C130 40 134 52 136 60 Z" fill="${c.color}"/><path d="M136 58 C132 42 134 34 138 36 C142 42 140 52 140 60 Z" fill="${light}" opacity="0.6"/></g>`;
  if (c.type === 'feather') return `<g><path d="M140 80 C148 52 160 38 168 34 C166 52 158 70 144 84 Z" fill="${c.color}" opacity="0.9"/><path d="M142 78 C150 62 158 50 164 42" stroke="${light}" stroke-width="1.6"/></g>`;
  // crown
  return `<g><path d="M84 64 L92 50 L100 60 L110 46 L120 60 L128 50 L136 64 L132 72 L88 72 Z" fill="${c.color}" stroke="#E0B93F" stroke-width="1"/>${C(110, 62, 2.5, light)}</g>`;
}

/* ---------------- 首饰 ---------------- */
const JEWELRY = {
  'jewelry-necklace': { color: '#E7B36A', type: 'necklace' },
  'jewelry-bracelet': { color: '#B04A28', type: 'bracelet' },
  'jewelry-mist':     { color: '#A9C6DC', type: 'pearl' },
  'jewelry-apricot':  { color: '#F2D2B6', type: 'pendant' },
  'jewelry-pink':     { color: '#F3C1CB', type: 'flower' },
  'jewelry-green':    { color: '#A8C8A8', type: 'earring' },
  'jewelry-cream':    { color: '#FFF3D6', type: 'ring' },
  'jewelry-purple':   { color: '#C9B7E6', type: 'brooch' },
  'jewelry-moon':     { color: '#F6EBCF', type: 'moon' },
};

function jewelryArt(id) {
  const c = JEWELRY[id];
  if (!c) return '';
  const light = '#FFF8EE';
  if (c.type === 'necklace') return `<g><path d="M99 152 C104 162 116 162 121 152" fill="none" stroke="${c.color}" stroke-width="1.6"/><circle cx="110" cy="161" r="2.4" fill="${c.color}"/></g>`;
  if (c.type === 'bracelet') return `<g><ellipse cx="74" cy="220" rx="6" ry="2.4" fill="none" stroke="${c.color}" stroke-width="2"/></g>`;
  if (c.type === 'pearl') return `<g><path d="M97 152 C102 164 118 164 123 152" fill="none" stroke="#DCC8B0" stroke-width="1.2"/>${C(103, 158, 2, c.color)}${C(108, 161, 2, c.color)}${C(113, 161, 2, c.color)}${C(118, 158, 2, c.color)}</g>`;
  if (c.type === 'pendant') return `<g><path d="M99 152 C104 162 116 162 121 152" fill="none" stroke="${c.color}" stroke-width="1.6"/><path d="M110 158 l2 4 4 .4 -3 2.6 1 4 -4-2.2 -4 2.2 1-4 -3-2.6 4-.4z" fill="${c.color}"/></g>`;
  if (c.type === 'flower') return `<g><ellipse cx="74" cy="220" rx="6" ry="2.4" fill="none" stroke="#DCC8B0" stroke-width="1.2"/>${C(70, 216, 2, c.color)}${C(74, 214, 2, c.color)}${C(78, 216, 2, c.color)}${C(74, 219, 2, c.color)}</g>`;
  if (c.type === 'earring') return `<g>${C(70, 98, 2, c.color)}${C(150, 98, 2, c.color)}${C(70, 104, 1.5, light)}${C(150, 104, 1.5, light)}</g>`;
  if (c.type === 'ring') return `<g><ellipse cx="74" cy="228" rx="3.2" ry="2" fill="none" stroke="${c.color}" stroke-width="1.4"/><circle cx="74" cy="225" r="1.6" fill="${light}"/></g>`;
  if (c.type === 'brooch') return `<g><circle cx="96" cy="180" r="4" fill="${c.color}"/><circle cx="96" cy="180" r="1.6" fill="${light}"/><path d="M100 180 H106" stroke="${c.color}" stroke-width="1.2"/></g>`;
  // moon
  return `<g><path d="M99 152 C104 162 116 162 121 152" fill="none" stroke="#E7B36A" stroke-width="1.6"/><path d="M110 157 a5 5 0 1 0 4 6 a4 4 0 0 1 -4 -6z" fill="${c.color}"/></g>`;
}

const ART = {
  top: topArt,
  bottom: bottomArt,
  dress: dressArt,
  shoes: shoeArt,
  hat: hatArt,
  hair: hairArt,
  jewelry: jewelryArt,
};

export function renderWardrobe(wrapper, look) {
  if (!wrapper) return;
  const set = (layer, html) => {
    const el = wrapper.querySelector(`[data-wd="${layer}"]`);
    if (el) el.innerHTML = html || '';
  };
  const dress = look.dress || 'dress-none';
  const hasDress = dress !== 'dress-none';
  set('shoes', ART.shoes(look.shoes));
  set('bottom', hasDress ? '' : ART.bottom(look.bottom));
  set('top', hasDress ? '' : ART.top(look.top));
  set('dress', hasDress ? ART.dress(dress) : '');
  set('jewelry', ART.jewelry(look.jewelry));
  set('hair', ART.hair(look.hair));
  set('hat', ART.hat(look.hat));
  set('crown', dress === 'gown-dream' && (look.hat === 'hat-none') ? `<g><path d="M94 58 L100 50 L106 58 L112 48 L118 58 L124 52 L122 64 L96 64 Z" fill="#F4D35E" stroke="#E0B93F" stroke-width="1"/></g>` : '');
}
