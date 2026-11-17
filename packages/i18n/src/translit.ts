/**
 * O'zbek lotin yozuvidan kirill yozuviga o'girish.
 * Interfeys matnlarining kirill varianti lotin tarjimasidan avtomatik hosil qilinadi.
 * `{placeholder}` ichidagi matn o'zgartirilmaydi.
 */

const APOSTROPHES = /[ʻʼ‘’`´]/g;
const VOWELS = new Set('aeiouAEIOU'.split(''));

const DIGRAPHS: [string, string][] = [
  ["o'", 'ў'],
  ["g'", 'ғ'],
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['yo', 'ё'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['ye', 'е'],
];

const SINGLE: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н',
  o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', c: 'с', w: 'в',
  "'": 'ъ',
};

function isLetter(ch: string | undefined): boolean {
  return !!ch && /\p{L}/u.test(ch);
}

/** "SH" yoki "Sh" — ikkalasi ham bitta katta kirill harf. */
function applyCase(src: string, out: string): string {
  return src[0] !== src[0].toLowerCase() ? out.toUpperCase() : out;
}

function translitWord(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i).toLowerCase();
    const prev = text[i - 1];
    const wordStart = !isLetter(prev) && prev !== "'";

    // "yo'q" = й + ў (yo diftongi emas)
    if (rest.startsWith("yo'")) {
      out += applyCase(text[i], 'й');
      i += 1;
      continue;
    }
    // "s'h" — s va h alohida (masalan, Is'hoq)
    if (rest.startsWith("s'h")) {
      out += applyCase(text[i], 'с') + applyCase(text[i + 2], 'ҳ');
      i += 3;
      continue;
    }
    const dg = DIGRAPHS.find(([lat]) => rest.startsWith(lat));
    if (dg) {
      out += applyCase(text.slice(i, i + 2), dg[1]);
      i += 2;
      continue;
    }
    const ch = rest[0];
    if (ch === 'e' && (wordStart || VOWELS.has(prev ?? ''))) {
      out += applyCase(text[i], 'э');
      i += 1;
      continue;
    }
    if (ch === "'" && !isLetter(prev)) {
      // so'z boshidagi/oxiridagi oddiy apostrof (qo'shtirnoq) — o'zgarmaydi
      out += text[i];
      i += 1;
      continue;
    }
    const mapped = SINGLE[ch];
    out += mapped !== undefined ? applyCase(text[i], mapped) : text[i];
    i += 1;
  }
  return out;
}

export function latinToCyrillic(input: string): string {
  const text = input.replace(APOSTROPHES, "'");
  // {placeholder}, URL va /yo'llar o'zgarmasin
  return text
    .split(/(\{[^}]*\}|https?:\/\/\S+|\/[\w/-]+)/g)
    .map((part, idx) => (idx % 2 === 1 ? part : translitWord(part)))
    .join('');
}
