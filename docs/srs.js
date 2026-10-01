// Spaced-repetition and question-building logic. No DOM access, so it can be
// unit-tested in Node (see tests/srs.test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SRS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 864e5;
  // Leitner boxes: days until the next review after a correct answer.
  const INTERVALS = [0, 1, 3, 7, 14, 30];
  const MAX_BOX = INTERVALS.length - 1;
  const MASTERED_BOX = 3;
  const OPTION_COUNT = 5;
  // A missed word comes back this many cards later in the same session.
  const REQUEUE_GAP = 4;

  function emptyProgress() {
    return { version: 1, words: {} };
  }

  // Update a word's record after an answer. `kind` is 'card' (self-graded
  // flashcard) or 'quiz'. A first-time quiz success skips a box because
  // recognising the meaning among close traps is stronger evidence.
  function grade(progress, word, correct, kind, now) {
    const r = progress.words[word] || { b: 0, r: 0, w: 0 };
    if (correct) {
      r.r += 1;
      r.b = r.b === 0 ? (kind === 'quiz' ? 2 : 1) : Math.min(r.b + 1, MAX_BOX);
    } else {
      r.w += 1;
      r.b = 1;
    }
    r.due = now + INTERVALS[r.b] * DAY;
    r.last = now;
    progress.words[word] = r;
    return r;
  }

  function status(progress, word) {
    const r = progress.words[word];
    if (!r) return 'new';
    return r.b >= MASTERED_BOX ? 'mastered' : 'learning';
  }

  function isDue(progress, word, now) {
    const r = progress.words[word];
    return !!r && r.due <= now;
  }

  // Words that are due, most overdue and least known first.
  function dueWords(progress, words, now) {
    return words
      .filter((w) => isDue(progress, w.word, now))
      .sort((a, b) => {
        const ra = progress.words[a.word], rb = progress.words[b.word];
        return ra.b - rb.b || ra.due - rb.due;
      });
  }

  // Words answered wrong more often than right, or missed recently.
  function troubleWords(progress, words) {
    return words
      .filter((w) => {
        const r = progress.words[w.word];
        return r && r.w > 0 && (r.w >= r.r || r.b <= 1);
      })
      .sort((a, b) => progress.words[b.word].w - progress.words[a.word].w);
  }

  function shuffle(arr, rand) {
    rand = rand || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function meaningText(w) {
    return w.senses.length > 1 ? w.senses.map((s, i) => `${i + 1}. ${s}`).join('  ') : w.senses[0];
  }

  // Pick wrong answers from the word's precomputed traps (near-meaning,
  // opposite-meaning and look-alike words; synonyms are already excluded).
  // Mostly from the strongest traps so questions stay hard, plus some
  // variety so the same set of options doesn't repeat every time.
  function pickDistractors(words, w, n, rand) {
    n = n || OPTION_COUNT - 1;
    const traps = w.traps.map((i) => words[i]);
    const strong = shuffle(traps.slice(0, 7), rand).slice(0, Math.ceil(n * 0.75));
    const rest = shuffle(traps.filter((t) => !strong.includes(t)), rand);
    const picks = [];
    const seen = new Set([meaningText(w)]);
    for (const t of strong.concat(rest)) {
      if (picks.length === n) break;
      const m = meaningText(t);
      if (seen.has(m)) continue;
      seen.add(m);
      picks.push(t);
    }
    return picks;
  }

  // Build a multiple-choice question. dir: 'w2m' (word -> meaning) or
  // 'm2w' (meaning -> word). Options are word objects; the UI decides
  // whether to show each option's word or meaning.
  function buildQuestion(words, w, dir, rand) {
    const options = shuffle([w].concat(pickDistractors(words, w, OPTION_COUNT - 1, rand)), rand);
    return { word: w, dir, options, answer: options.indexOf(w) };
  }

  // Session queue: each word is graded on its first answer only; misses are
  // re-inserted a few cards later until answered correctly.
  function createSession(ids, opts) {
    return {
      kind: opts.kind,
      dir: opts.dir || 'w2m',
      title: opts.title || '',
      queue: ids.slice(),
      pos: 0,
      total: ids.length,
      graded: {},
      firstTryCorrect: 0,
      missed: [],
    };
  }

  function currentId(session) {
    return session.pos < session.queue.length ? session.queue[session.pos] : null;
  }

  // Returns true if this answer is the word's first in the session (and so
  // should update long-term progress).
  function answer(session, id, correct) {
    const first = !(id in session.graded);
    if (first) {
      session.graded[id] = correct;
      if (correct) session.firstTryCorrect += 1;
      else session.missed.push(id);
    }
    if (!correct) {
      const at = Math.min(session.pos + 1 + REQUEUE_GAP, session.queue.length);
      session.queue.splice(at, 0, id);
    }
    return first;
  }

  function advance(session) {
    session.pos += 1;
    return currentId(session);
  }

  function sessionProgress(session) {
    return { done: Object.keys(session.graded).length, total: session.total };
  }

  return {
    DAY, INTERVALS, MASTERED_BOX, OPTION_COUNT, REQUEUE_GAP,
    emptyProgress, grade, status, isDue, dueWords, troubleWords,
    shuffle, meaningText, pickDistractors, buildQuestion,
    createSession, currentId, answer, advance, sessionProgress,
  };
});
