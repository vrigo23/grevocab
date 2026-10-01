(() => {
  'use strict';

  const WORDS = window.GRE_WORDS;
  const BY_WORD = Object.fromEntries(WORDS.map((w) => [w.word, w]));
  const GROUPS = [...new Set(WORDS.map((w) => w.group))].sort((a, b) => a - b);
  const STORE_KEY = 'grevocab.progress.v1';
  const SESSION_CAP = 40;
  const app = document.getElementById('app');

  // ---------- persistence ----------

  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(STORE_KEY));
      if (p && p.words) return p;
    } catch (_) { /* storage unavailable or corrupt: start fresh */ }
    return SRS.emptyProgress();
  }

  let progress = loadProgress();

  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (_) { /* private mode */ }
  }

  // ---------- helpers ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function highlight(sentence, word) {
    const base = word.length > 4 ? word.replace(/(e|y)$/, '') : word;
    return esc(sentence).replace(new RegExp(`\\b(${base}\\w*)`, 'i'), '<mark>$1</mark>');
  }

  function sensesHtml(w) {
    if (w.senses.length === 1) return `<p class="sense">${esc(w.senses[0])}</p>`;
    return `<ol class="senses">${w.senses.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  }

  function detailsHtml(w) {
    return `
      ${sensesHtml(w)}
      <p class="example">“${highlight(w.example, w.word)}”</p>
      <p class="hook"><span class="hook-label">Memory hook</span>${esc(w.hook)}</p>`;
  }

  function counts(list) {
    const c = { new: 0, learning: 0, mastered: 0 };
    for (const w of list) c[SRS.status(progress, w.word)] += 1;
    return c;
  }

  function barHtml(c, total) {
    const pct = (n) => `${(100 * n / total).toFixed(1)}%`;
    return `<div class="bar" role="img" aria-label="${c.mastered} mastered, ${c.learning} learning of ${total}">
      <span class="bar-mastered" style="width:${pct(c.mastered)}"></span><span class="bar-learning" style="width:${pct(c.learning)}"></span></div>`;
  }

  const groupWords = (g) => WORDS.filter((w) => w.group === g);

  // ---------- routing ----------

  let session = null;
  let view = null; // per-view transient state (e.g. flipped card, chosen option)

  // Render synchronously; pushState doesn't fire hashchange, but Back still does.
  function go(hash) {
    if (location.hash !== hash) history.pushState(null, '', hash);
    render();
  }

  window.addEventListener('hashchange', render);

  function render() {
    const [, route, arg] = location.hash.split('/');
    if (route === 'group' && GROUPS.includes(+arg)) renderGroup(+arg);
    else if (route === 'session' && session) renderSession();
    else if (route === 'summary' && session) renderSummary();
    else if (route === 'progress') renderProgressPage();
    else renderHome();
    window.scrollTo(0, 0);
  }

  // ---------- home ----------

  function renderHome() {
    const now = Date.now();
    const due = SRS.dueWords(progress, WORDS, now).length;
    const trouble = SRS.troubleWords(progress, WORDS).length;
    const c = counts(WORDS);
    app.innerHTML = `
      <header class="top">
        <h1>GRE Vocab</h1>
        <a class="link" href="#/progress">Progress &amp; sync</a>
      </header>
      <section class="stats">
        <div><strong>${c.mastered}</strong><span>mastered</span></div>
        <div><strong>${c.learning}</strong><span>learning</span></div>
        <div><strong>${c.new}</strong><span>new</span></div>
      </section>
      ${barHtml(c, WORDS.length)}
      <section class="actions">
        <button class="btn primary" data-action="review" ${due ? '' : 'disabled'}>
          Review due words <span class="pill">${due}</span></button>
        <button class="btn" data-action="trouble" ${trouble ? '' : 'disabled'}>
          Trouble words <span class="pill">${trouble}</span></button>
      </section>
      <h2>Groups</h2>
      <section class="groups">
        ${GROUPS.map((g) => {
          const list = groupWords(g);
          const gc = counts(list);
          const gdue = list.filter((w) => SRS.isDue(progress, w.word, now)).length;
          return `<a class="group-tile ${gc.new === list.length ? 'untouched' : ''}" href="#/group/${g}">
            <span class="g-num">${g}</span>
            ${barHtml(gc, list.length)}
            <span class="g-meta">${gc.mastered}/${list.length}${gdue ? ` · <b>${gdue} due</b>` : ''}</span>
          </a>`;
        }).join('')}
      </section>
      <p class="footnote">Study one group at a time: flashcards first, then the quiz. Words you miss come back sooner;
      words you know move out to 1, 3, 7, 14 and 30 days. A word counts as <em>mastered</em> once it reaches the 7-day box.</p>`;
  }

  // ---------- group ----------

  function renderGroup(g) {
    const list = groupWords(g);
    const c = counts(list);
    const dot = (w) => `<span class="dot ${SRS.status(progress, w.word)}" title="${SRS.status(progress, w.word)}"></span>`;
    app.innerHTML = `
      <header class="top">
        <a class="link back" href="#/">← All groups</a>
        <h1>Group ${g}</h1>
      </header>
      <p class="muted">${c.mastered} mastered · ${c.learning} learning · ${c.new} new</p>
      ${barHtml(c, list.length)}
      <section class="actions grid2">
        <button class="btn primary" data-action="cards" data-group="${g}">Flashcards</button>
        <button class="btn primary" data-action="quiz" data-dir="w2m" data-group="${g}">Quiz: word → meaning</button>
        <button class="btn" data-action="quiz" data-dir="m2w" data-group="${g}">Quiz: meaning → word</button>
        <button class="btn" data-action="quiz" data-dir="mix" data-group="${g}">Mixed quiz</button>
      </section>
      <h2>Words</h2>
      <section class="wordlist">
        ${list.map((w) => `<details class="word-row">
          <summary>${dot(w)}<span class="w">${esc(w.word)}</span><span class="d">${esc(w.senses[0])}</span></summary>
          <div class="word-detail">${detailsHtml(w)}</div>
        </details>`).join('')}
      </section>`;
  }

  // ---------- sessions ----------

  function startSession(words, opts) {
    if (!words.length) return;
    session = SRS.createSession(SRS.shuffle(words.map((w) => w.id)), opts);
    prepareCard();
    go('#/session');
  }

  function prepareCard() {
    const id = SRS.currentId(session);
    if (id === null) { view = null; return; }
    const w = WORDS[id];
    if (session.kind === 'card') {
      view = { word: w, flipped: false };
    } else {
      const dir = session.dir === 'mix' ? (Math.random() < 0.5 ? 'w2m' : 'm2w') : session.dir;
      view = { q: SRS.buildQuestion(WORDS, w, dir), chosen: null };
    }
  }

  function sessionHeader() {
    const p = SRS.sessionProgress(session);
    const remaining = session.queue.length - session.pos;
    return `<header class="session-top">
      <button class="icon-btn" data-action="end" aria-label="End session">✕</button>
      <div class="sbar"><span style="width:${(100 * p.done / p.total).toFixed(1)}%"></span></div>
      <span class="muted small">${p.done}/${p.total}${remaining > p.total - p.done ? ' +review' : ''}</span>
    </header>`;
  }

  function renderSession() {
    if (!view) return go('#/summary');
    if (session.kind === 'card') renderCard();
    else renderQuestion();
  }

  function renderCard() {
    const w = view.word;
    app.innerHTML = `${sessionHeader()}
      <p class="session-title muted small">${esc(session.title)}</p>
      <div class="card ${view.flipped ? 'flipped' : ''}" ${view.flipped ? '' : 'data-action="flip" role="button" tabindex="0"'}>
        <div class="card-word">${esc(w.word)}</div>
        ${view.flipped ? `<div class="card-back">${detailsHtml(w)}</div>` : '<p class="muted hint">Recall the meaning, then tap to check <kbd>space</kbd></p>'}
      </div>
      ${view.flipped ? `<div class="grade-row">
        <button class="btn again" data-action="grade" data-correct="0">Didn't know <kbd>1</kbd></button>
        <button class="btn good" data-action="grade" data-correct="1">Knew it <kbd>2</kbd></button>
      </div>` : ''}`;
  }

  function renderQuestion() {
    const { q, chosen } = view;
    const answered = chosen !== null;
    const w = q.word;
    const prompt = q.dir === 'w2m'
      ? `<div class="q-word">${esc(w.word)}</div><p class="muted small">Choose the meaning</p>`
      : `<div class="q-meaning">${esc(SRS.meaningText(w))}</div><p class="muted small">Which word has this meaning?</p>`;
    const options = q.options.map((o, i) => {
      let cls = 'option';
      if (answered) {
        if (i === q.answer) cls += ' correct';
        else if (i === chosen) cls += ' wrong';
        else cls += ' faded';
      }
      const main = q.dir === 'w2m' ? esc(SRS.meaningText(o)) : `<b>${esc(o.word)}</b>`;
      const reveal = answered && i !== q.answer
        ? `<span class="reveal">${q.dir === 'w2m' ? `= <b>${esc(o.word)}</b>` : esc(SRS.meaningText(o))}</span>` : '';
      return `<button class="${cls}" data-action="choose" data-i="${i}" ${answered ? 'disabled' : ''}>
        <kbd>${i + 1}</kbd><span class="opt-text">${main}${reveal}</span></button>`;
    }).join('');
    const right = chosen === q.answer;
    const feedback = answered ? `
      <div class="feedback ${right ? 'ok' : 'bad'}">
        <p class="verdict">${right ? '✓ Correct' : `✗ Not quite. <b>${esc(w.word)}</b> means:`}</p>
        ${detailsHtml(w)}
        ${!right && chosen !== null ? `<p class="trap-note">You picked the meaning of <b>${esc(q.options[chosen].word)}</b>. Notice the difference: it will come back in a few cards.</p>` : ''}
      </div>
      <button class="btn primary next" data-action="next">Next <kbd>enter</kbd></button>` : '';
    app.innerHTML = `${sessionHeader()}
      <p class="session-title muted small">${esc(session.title)}</p>
      <div class="question">${prompt}</div>
      <div class="options">${options}</div>
      ${feedback}`;
    if (answered) app.querySelector('.next').focus({ preventScroll: true });
  }

  function submit(correct) {
    const w = session.kind === 'card' ? view.word : view.q.word;
    if (SRS.answer(session, w.id, correct)) {
      SRS.grade(progress, w.word, correct, session.kind === 'card' ? 'card' : 'quiz', Date.now());
      saveProgress();
    }
  }

  function nextCard() {
    SRS.advance(session);
    prepareCard();
    renderSession();
    window.scrollTo(0, 0);
  }

  function renderSummary() {
    const p = SRS.sessionProgress(session);
    const missed = session.missed.map((id) => WORDS[id]);
    const label = session.kind === 'card' ? 'knew on first look' : 'right on first try';
    app.innerHTML = `
      <header class="top"><h1>Session done</h1></header>
      <p class="session-title muted">${esc(session.title)}</p>
      <section class="stats">
        <div><strong>${session.firstTryCorrect}/${p.done}</strong><span>${label}</span></div>
        <div><strong>${missed.length}</strong><span>to work on</span></div>
      </section>
      <section class="actions grid2">
        ${missed.length ? `<button class="btn primary" data-action="retry">Quiz the missed words</button>` : ''}
        <a class="btn" href="#/">Home</a>
      </section>
      ${missed.length ? `<h2>Missed</h2><section class="wordlist">${missed.map((w) => `
        <details class="word-row"><summary><span class="w">${esc(w.word)}</span><span class="d">${esc(w.senses[0])}</span></summary>
        <div class="word-detail">${detailsHtml(w)}</div></details>`).join('')}</section>` : '<p>Clean sweep. Nice work.</p>'}`;
  }

  // ---------- progress & sync ----------

  function renderProgressPage() {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(progress))));
    const c = counts(WORDS);
    app.innerHTML = `
      <header class="top"><a class="link back" href="#/">← Home</a><h1>Progress &amp; sync</h1></header>
      <p>${c.mastered} mastered · ${c.learning} learning · ${c.new} new, out of ${WORDS.length} words.</p>
      <h2>Move progress to another device</h2>
      <p class="muted">Progress is saved in this browser only. To continue on your phone or laptop, copy this code there and paste it below.</p>
      <textarea class="code" readonly rows="4">${esc(code)}</textarea>
      <button class="btn" data-action="copy">Copy code</button>
      <h2>Load progress from another device</h2>
      <textarea class="code" id="import-code" rows="4" placeholder="Paste a progress code here"></textarea>
      <button class="btn primary" data-action="import">Load progress</button>
      <p id="import-msg" class="muted small" role="status"></p>
      <h2>Start over</h2>
      <button class="btn danger" data-action="reset">Reset all progress</button>`;
  }

  // ---------- events ----------

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const g = +el.dataset.group;
    if (a === 'review') {
      startSession(SRS.dueWords(progress, WORDS, Date.now()).slice(0, SESSION_CAP), { kind: 'quiz', dir: 'mix', title: 'Review: due words' });
    } else if (a === 'trouble') {
      startSession(SRS.troubleWords(progress, WORDS).slice(0, SESSION_CAP), { kind: 'quiz', dir: 'w2m', title: 'Trouble words' });
    } else if (a === 'cards') {
      startSession(groupWords(g), { kind: 'card', title: `Group ${g} · flashcards` });
    } else if (a === 'quiz') {
      const names = { w2m: 'word → meaning', m2w: 'meaning → word', mix: 'mixed' };
      startSession(groupWords(g), { kind: 'quiz', dir: el.dataset.dir, title: `Group ${g} · ${names[el.dataset.dir]}` });
    } else if (a === 'flip') {
      view.flipped = true;
      renderCard();
    } else if (a === 'grade') {
      submit(el.dataset.correct === '1');
      nextCard();
    } else if (a === 'choose') {
      if (view.chosen !== null) return;
      view.chosen = +el.dataset.i;
      submit(view.chosen === view.q.answer);
      renderQuestion();
    } else if (a === 'next') {
      nextCard();
    } else if (a === 'end') {
      view = null;
      go(Object.keys(session.graded).length ? '#/summary' : '#/');
    } else if (a === 'retry') {
      const missed = session.missed.map((id) => WORDS[id]);
      startSession(missed, { kind: 'quiz', dir: 'mix', title: 'Missed words' });
    } else if (a === 'copy') {
      const ta = app.querySelector('textarea.code');
      ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject())
        .then(() => { el.textContent = 'Copied ✓'; })
        .catch(() => { document.execCommand('copy'); el.textContent = 'Copied ✓'; });
    } else if (a === 'import') {
      const msg = app.querySelector('#import-msg');
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(app.querySelector('#import-code').value.trim()))));
        if (!data || typeof data.words !== 'object') throw new Error('bad');
        const known = Object.keys(data.words).filter((k) => BY_WORD[k]);
        progress = { version: 1, words: Object.fromEntries(known.map((k) => [k, data.words[k]])) };
        saveProgress();
        msg.textContent = `Loaded progress for ${known.length} words.`;
      } catch (_) {
        msg.textContent = "That code didn't work. Make sure you copied all of it.";
      }
    } else if (a === 'reset') {
      if (confirm('Erase all progress on this device? This cannot be undone.')) {
        progress = SRS.emptyProgress();
        saveProgress();
        go('#/');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (location.hash !== '#/session' || !view || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (session.kind === 'card') {
      if (!view.flipped && (k === ' ' || k === 'Enter')) { e.preventDefault(); view.flipped = true; renderCard(); }
      else if (view.flipped && (k === '1' || k === '2')) { submit(k === '2'); nextCard(); }
    } else if (view.chosen === null && /^[1-9]$/.test(k) && +k <= view.q.options.length) {
      view.chosen = +k - 1;
      submit(view.chosen === view.q.answer);
      renderQuestion();
    } else if (view.chosen !== null && (k === 'Enter' || k === ' ')) {
      e.preventDefault();
      nextCard();
    }
    if (k === 'Escape') app.querySelector('[data-action="end"]').click();
  });

  render();
})();
