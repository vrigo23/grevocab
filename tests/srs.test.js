const test = require('node:test');
const assert = require('node:assert/strict');
const SRS = require('../docs/srs.js');

global.window = {};
require('../docs/words.js');
const WORDS = window.GRE_WORDS;
const byWord = Object.fromEntries(WORDS.map((w) => [w.word, w]));

// Deterministic PRNG so option picks are reproducible.
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('word data is complete', () => {
  assert.equal(WORDS.length, 959);
  assert.equal(new Set(WORDS.map((w) => w.word)).size, WORDS.length);
  for (const w of WORDS) {
    assert.ok(w.senses.length >= 1 && w.senses.every((s) => s.length > 2), w.word);
    assert.ok(w.example && w.hook && w.tags.length, w.word);
    assert.ok(w.traps.length >= SRS.OPTION_COUNT - 1, `${w.word} has too few traps`);
  }
});

test('source PDF copy errors are corrected', () => {
  assert.notEqual(byWord.utterly.senses[0], byWord.undermine.senses[0]);
  assert.notEqual(byWord.palpable.senses[0], byWord.oust.senses[0]);
  assert.notEqual(byWord.regress.senses[0], byWord.refute.senses[0]);
  assert.notEqual(byWord.lull.senses[0], byWord.languid.senses[1]);
});

test('questions never offer a synonym as a wrong answer', () => {
  const rand = seeded(42);
  for (const w of WORDS) {
    for (const dir of ['w2m', 'm2w']) {
      const q = SRS.buildQuestion(WORDS, w, dir, rand);
      assert.equal(q.options.length, SRS.OPTION_COUNT);
      assert.equal(q.options[q.answer], w);
      assert.equal(new Set(q.options).size, q.options.length);
      for (const o of q.options) {
        if (o !== w) assert.ok(!w.syn.includes(o.id), `${w.word}: synonym ${o.word} offered`);
      }
    }
  }
});

test('traps include near-meaning and opposite-meaning words', () => {
  const traps = (word) => byWord[word].traps.map((i) => WORDS[i].word);
  assert.ok(traps('loquacious').includes('taciturn'));
  assert.ok(traps('spurious').includes('specious'));
  assert.ok(!traps('loquacious').includes('verbose'));
});

test('grading moves words through Leitner boxes', () => {
  const p = SRS.emptyProgress();
  const now = Date.UTC(2026, 0, 1);
  SRS.grade(p, 'abound', true, 'quiz', now);
  assert.equal(p.words.abound.b, 2);
  assert.equal(p.words.abound.due, now + 3 * SRS.DAY);
  SRS.grade(p, 'abound', true, 'quiz', now);
  assert.equal(SRS.status(p, 'abound'), 'mastered');
  SRS.grade(p, 'abound', false, 'quiz', now);
  assert.equal(p.words.abound.b, 1);
  assert.equal(SRS.status(p, 'abound'), 'learning');

  SRS.grade(p, 'belie', true, 'card', now);
  assert.equal(p.words.belie.b, 1);
  assert.equal(SRS.status(p, 'wary'), 'new');
});

test('due and trouble lists', () => {
  const p = SRS.emptyProgress();
  const now = Date.UTC(2026, 0, 1);
  SRS.grade(p, 'abound', false, 'quiz', now);
  SRS.grade(p, 'belie', true, 'quiz', now);
  assert.deepEqual(SRS.dueWords(p, WORDS, now + SRS.DAY).map((w) => w.word), ['abound']);
  assert.deepEqual(SRS.dueWords(p, WORDS, now + 3 * SRS.DAY).map((w) => w.word), ['abound', 'belie']);
  assert.deepEqual(SRS.troubleWords(p, WORDS).map((w) => w.word), ['abound']);
});

test('session re-queues misses but grades only the first answer', () => {
  const s = SRS.createSession([1, 2, 3, 4, 5, 6], { kind: 'quiz' });
  assert.equal(SRS.currentId(s), 1);
  assert.equal(SRS.answer(s, 1, false), true);
  assert.equal(s.queue[1 + SRS.REQUEUE_GAP], 1);
  let seen = [1];
  let id;
  while ((id = SRS.advance(s)) !== null) {
    const first = SRS.answer(s, id, true);
    assert.equal(first, !seen.includes(id));
    seen.push(id);
  }
  assert.equal(s.firstTryCorrect, 5);
  assert.deepEqual(s.missed, [1]);
  assert.deepEqual(SRS.sessionProgress(s), { done: 6, total: 6 });
});
