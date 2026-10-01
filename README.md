# GRE Vocab Trainer

A small static website for memorising the 960-word GregMat GRE vocab list (32 groups × 30 words),
built around the hardest part of GRE vocab: telling apart words whose meanings are close.

Open `docs/index.html` in a browser. No install and no server needed.

## How it works

- **Flashcards**: see the word, recall the meaning, flip, then grade yourself.
- **Quiz: word → meaning / meaning → word / mixed**: 5 options, where the wrong answers are
  deliberately close:
  - near-meaning and **opposite-meaning** words from the same "meaning family"
    (e.g. *loquacious* vs *taciturn*, *laconic*, *reticent*);
  - **look-alike** words (e.g. *spurious* vs *specious*);
  - words from the same group.

  True synonyms are never used as wrong answers, so every question has exactly one right answer.
  After a miss, the app shows which word the meaning you picked belongs to, and the word comes
  back a few cards later.
- **Spaced repetition** (Leitner boxes): words you get right move out to 1 → 3 → 7 → 14 → 30
  days. A miss sends a word back to tomorrow. *Review due words* on the home screen collects
  everything that's due; *Trouble words* collects your most-missed words.
- Every word has an **example sentence** and a **memory hook**.
- Progress is saved in your browser. Use **Progress & sync** to copy a code from one device
  and paste it on another.
- Keyboard: `space` flips, `1`/`2` grade cards, `1`–`5` answer, `enter` goes to the next question, `esc` ends the session.

## Project layout

```
(source PDF not committed; parse it with scripts/parse_pdf.py)
data/words.json            parsed from the PDF (scripts/parse_pdf.py)
data/fixes.json            corrections for 4 rows where the PDF repeats the previous definition
data/extras/*.txt          per word: meaning-family tags | example sentence | memory hook
scripts/build.py           merges the above and precomputes quiz traps -> docs/words.js
docs/                      the website (index.html, app.js, srs.js, style.css, words.js)
tests/                     unit tests for the quiz and spaced-repetition logic
```

### Meaning-family tags

Each word has tags like `talk.wordy` or `talk.quiet`. Words that share a full tag are
synonyms. Words that share only the domain (`talk`) are near-meaning traps. `CLUSTERS` in
`scripts/build.py` groups leaves whose definitions overlap too much to be fair wrong answers.

## Development

```
python3 scripts/parse_pdf.py path/to/GregMat_Vocab.pdf  # only if the PDF changes (needs pdftotext)
npm run build                                         # regenerate docs/words.js after editing data/
npm test                                              # run unit tests
npm run serve                                         # optional local server on :8080
```

## Hosting on GitHub Pages

Settings → Pages → *Deploy from a branch* → pick the branch and the `/docs` folder.

## Roadmap

- [x] Parse the PDF into data
- [x] Flashcards, group picker and saved progress
- [x] Close-meaning MCQ with smart distractors and spaced repetition (plus reverse and mixed modes)
- [ ] "Find the twin" (Sentence Equivalence style): pick the 2 of 6 words that mean the same
- [ ] Confusables drill: side-by-side pairs like *turbid/turgid*, *ingenuous/disingenuous*
- [ ] Fill-in-the-blank sentences using the example sentences
