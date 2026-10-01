/* ============================================================
   DeckAI · modo presentación
   ============================================================ */

const Present = (() => {
  const $ = id => document.getElementById(id);
  const K = 0.2; // escala fija de las miniaturas del índice

  let i = 0;
  let timer = null;
  let seconds = 0;
  let open = false;

  function layoutName(id) {
    const l = LAYOUTS.find(x => x.id === id);
    return l ? l.name : 'Diapositiva';
  }

  function show(n) {
    const deck = App.deck();
    if (!deck.slides.length) return;
    i = Math.max(0, Math.min(n, deck.slides.length - 1));
    Render.one($('presentDeck'), deck, i);

    $('pCur').textContent = i + 1;
    $('pTotal').textContent = deck.slides.length;
    $('pProgress').style.width = ((i + 1) / deck.slides.length * 100) + '%';
    $('presentNotes').textContent = deck.slides[i].notes || '(sin notas)';
    App.fitPresent();
  }

  function next() { show(i + 1); }
  function prev() { show(i - 1); }

  function tick() {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    $('pTimer').textContent = `${m}:${s}`;
  }

  function toggleNotes() {
    $('presentNotes').hidden = !$('presentNotes').hidden;
  }

  function toggleOverview() {
    const ov = $('overview');
    if (ov.hidden) {
      const deck = App.deck();
      $('overviewGrid').innerHTML = deck.slides.map((s, n) => `
        <div class="ov-item" data-i="${n}">
          <div class="thumb-frame"><div class="deck" style="transform:scale(${K})">${Render.slide(s, deck, n)}</div></div>
          <p>${n + 1}. ${Store.esc(s.title || layoutName(s.layout))}</p>
        </div>`).join('');
      ov.hidden = false;
      ov.scrollTop = 0;
    } else {
      ov.hidden = true;
    }
  }

  function start() {
    const deck = App.deck();
    if (!deck.slides.length) { Store.toast('No hay nada que presentar todavía.'); return; }
    open = true;
    i = App.state.ui.selected || 0;
    seconds = 0;
    $('present').hidden = false;
    $('overview').hidden = true;
    $('presentNotes').hidden = true;
    show(i);
    timer = setInterval(tick, 1000);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function stop() {
    open = false;
    clearInterval(timer);
    $('present').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  function init() {
    $('pNext').onclick = next;
    $('pPrev').onclick = prev;
    $('pExit').onclick = stop;
    $('pNotes').onclick = toggleNotes;
    $('pOverview').onclick = toggleOverview;

    $('overviewGrid').addEventListener('click', e => {
      const item = e.target.closest('.ov-item');
      if (!item) return;
      $('overview').hidden = true;
      show(parseInt(item.dataset.i, 10));
    });

    $('present').addEventListener('click', e => {
      if (e.target.closest('.present-bar') || e.target.closest('.overview') || e.target.closest('.present-notes')) return;
      next();
    });

    document.addEventListener('keydown', e => {
      if (!open) return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown':
          e.preventDefault(); next(); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault(); prev(); break;
        case 'Home': e.preventDefault(); show(0); break;
        case 'End': e.preventDefault(); show(App.deck().slides.length - 1); break;
        case 'Escape':
          if (!$('overview').hidden) $('overview').hidden = true;
          else if (!$('presentNotes').hidden) $('presentNotes').hidden = true;
          else stop();
          break;
        case 'f': case 'F5':
          e.preventDefault();
          document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
          break;
        case 'n': case 'N': toggleNotes(); break;
        case 'o': case 'O': toggleOverview(); break;
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && open) { /* el usuario salió con F11/Esc */ }
    });
  }

  return { init, start, stop, show, next, prev, isOpen: () => open };
})();
