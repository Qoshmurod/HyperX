import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latinToCyrillic } from '../src/translit.ts';

test('basic words', () => {
  assert.equal(latinToCyrillic('Toshkent'), 'Тошкент');
  assert.equal(latinToCyrillic("o'zbek tili"), 'ўзбек тили');
  assert.equal(latinToCyrillic("G'alaba"), 'Ғалаба');
  assert.equal(latinToCyrillic('qishloq xoʻjaligi'), 'қишлоқ хўжалиги');
  assert.equal(latinToCyrillic('hisobot'), 'ҳисобот');
  assert.equal(latinToCyrillic('Yangi topshiriq'), 'Янги топшириқ');
  assert.equal(latinToCyrillic("ma'lumot"), 'маълумот');
  assert.equal(latinToCyrillic('Ekspert'), 'Эксперт');
  assert.equal(latinToCyrillic('yer'), 'ер');
  assert.equal(latinToCyrillic('SHAHAR'), 'ШАҲАР');
});

test('placeholders and paths are kept', () => {
  assert.equal(latinToCyrillic('Salom, {name}!'), 'Салом, {name}!');
  assert.equal(latinToCyrillic('Havola: /tasks/new'), 'Ҳавола: /tasks/new');
});

test('dictionaries', async () => {
  const { messages, t, LOCALES } = await import('../dist/index.js');
  const base = Object.keys(messages('uz')).sort();
  for (const l of LOCALES) assert.deepEqual(Object.keys(messages(l)).sort(), base, l);
  assert.equal(t('uz-Cyrl', 'nav.tasks'), 'Топшириқлар');
  assert.equal(t('ru', 'integrations.import_result', { ok: 3, failed: 1 }), 'Результат импорта: 3 успешно, 1 с ошибкой');
});
