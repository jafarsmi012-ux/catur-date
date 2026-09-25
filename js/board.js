/**
 * board.js — render papan catur & interaksi.
 * Dipakai oleh app.js. chess.js global (vendor) menangani aturan permainan.
 *
 * Konvensi warna: 'w' = putih, 'b' = hitam.
 * SEMUA bidak digambar pakai SVG custom (bukan unicode) supaya bentuknya
 * konsisten di semua HP/font dan bebas dari corak salib (raja/gajah unicode
 * memang sering bercorak salib — tidak sesuai untuk pengguna muslim).
 * Warna bidak via currentColor di CSS (.sq.w/.sq.b).
 */
(function () {
  'use strict';

  /**
   * Set bidak SVG (viewBox 0 0 100 100), semuanya TANPA corak salib.
   * Raja = mahkota 3 lancip berbulatan; Pion = satu bulatan di atas badan.
   */
  const SVG_BODY =
    '<svg viewBox="0 0 100 100" class="pc-svg" aria-hidden="true" focusable="false">';
  const PIECE_SVG = {
    // PION: kepala bulat + leher + badan + alas
    p: SVG_BODY +
      '<circle cx="50" cy="26" r="13"/>' +
      '<path d="M42 37 L58 37 L61 48 L39 48 Z"/>' +
      '<path d="M32 50 L68 50 C73 50 76 54 75 58 L70 68 L30 68 L25 58 C24 54 27 50 32 50 Z"/>' +
      '<rect x="26" y="71" width="48" height="7" rx="3"/>' +
      '<rect x="20" y="80" width="60" height="9" rx="4.5"/>' +
      '</svg>',
    // KUDA: profil kepala kuda
    n: SVG_BODY +
      '<path d="M34 82 C30 66 33 52 44 42 L40 34 C39 31 42 29 45 31 L50 35 C58 30 68 33 72 42 L77 55 C78 59 75 61 72 60 L64 56 C61 63 60 72 62 82 Z"/>' +
      '<circle cx="60" cy="44" r="3.5"/>' +
      '<rect x="24" y="82" width="52" height="8" rx="4"/>' +
      '</svg>',
    // GAJAH (bishop): kubah runcing DENGAN BULATAN kecil di puncak (bukan salib)
    b: SVG_BODY +
      '<circle cx="50" cy="14" r="6"/>' +
      '<path d="M50 22 C60 32 66 42 66 52 C66 61 59 66 50 66 C41 66 34 61 34 52 C34 42 40 32 50 22 Z"/>' +
      '<path d="M38 68 L62 68 L65 78 L35 78 Z"/>' +
      '<rect x="26" y="80" width="48" height="9" rx="4.5"/>' +
      '</svg>',
    // BENTENG (rook): menara dengan gerigi
    r: SVG_BODY +
      '<path d="M26 18 L38 18 L38 26 L45 26 L45 18 L55 18 L55 26 L62 26 L62 18 L74 18 L74 32 L68 38 L68 62 L74 70 L74 74 L26 74 L26 70 L32 62 L32 38 L26 32 Z"/>' +
      '<rect x="22" y="77" width="56" height="9" rx="4"/>' +
      '</svg>',
    // RATU: mahkota 5 lancip berbulatan (lebih tinggi & rame dari raja)
    q: SVG_BODY +
      '<circle cx="12" cy="30" r="5.5"/>' +
      '<circle cx="31" cy="20" r="5.5"/>' +
      '<circle cx="50" cy="16" r="5.5"/>' +
      '<circle cx="69" cy="20" r="5.5"/>' +
      '<circle cx="88" cy="30" r="5.5"/>' +
      '<path d="M8 34 L20 66 L80 66 L92 34 L70 48 L59 26 L50 46 L41 26 L30 48 Z"/>' +
      '<rect x="17" y="68" width="66" height="7" rx="3"/>' +
      '<rect x="12" y="77" width="76" height="9" rx="4.5"/>' +
      '</svg>',
    // RAJA: mahkota 3 lancip berbulatan di puncak (TANPA salib)
    k: SVG_BODY +
      '<circle cx="15" cy="34" r="7"/>' +
      '<circle cx="50" cy="21" r="7"/>' +
      '<circle cx="85" cy="34" r="7"/>' +
      '<path d="M10 38 L23 69 L77 69 L90 38 L63 53 L50 28 L37 53 Z"/>' +
      '<rect x="19" y="71" width="62" height="8" rx="3"/>' +
      '<rect x="13" y="81" width="74" height="9" rx="4.5"/>' +
      '</svg>',
  };
  const PIECE_ID = { p: 'pion', n: 'kuda', b: 'gajah', r: 'benteng', q: 'ratu', k: 'raja' };

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  class Board {
    /**
     * @param {HTMLElement} el wadah papan
     * @param {object} opts { onSquareTapped(sq), flipped:bool }
     */
    constructor(el, opts) {
      this.el = el;
      this.onSquareTapped = (opts && opts.onSquareTapped) || function () {};
      this.flipped = false;
      this.squares = {}; // 'a1'.. -> element
      this._build();
    }

    _build() {
      this.el.classList.add('board');
      this.el.innerHTML = '';
      const order = [];
      for (let i = 0; i < 64; i++) order.push(i);
      if (this.flipped) order.reverse();
      for (const idx of order) {
        const file = FILES[idx % 8];
        const rank = 8 - Math.floor(idx / 8);
        const sq = file + rank;
        const div = document.createElement('div');
        const dark = (idx + Math.floor(idx / 8)) % 2 === 1;
        div.className = 'sq ' + (dark ? 'dark' : 'light');
        div.dataset.sq = sq;
        // tampilkan huruf file di baris terbawah & angka rank di kolom paling kiri
        const coords = [];
        const isBottomRow = this.flipped ? rank === 8 : rank === 1;
        const isLeftFile = this.flipped ? file === 'h' : file === 'a';
        if (isBottomRow) coords.push(file);
        if (isLeftFile) coords.push(rank);
        div.dataset.coord = coords.join('');
        div.addEventListener('click', () => this.onSquareTapped(sq));
        this.el.appendChild(div);
        this.squares[sq] = div;
      }
      this.el.classList.toggle('flipped', this.flipped);
    }

    setFlipped(v) {
      if (this.flipped === v) return;
      this.flipped = v;
      // rebuild supaya urutan DOM sesuai orientasi (haptik lebih jelas)
      this._build();
    }

    /**
     * Gambar posisi dari objek chess.js.
     * @param {Chess} game
     * @param {object} view { selected:'e2', moves:{e4:'move',d3:'capture'}, lastMove:{from,to}, checkSq:'e1' }
     */
    render(game, view) {
      view = view || {};
      // peta posisi -> pion
      const pos = {};
      const boardArr = game.board();
      for (const row of boardArr) {
        for (const cell of row) {
          if (cell) pos[cell.square] = cell;
        }
      }
      for (const sq of Object.keys(this.squares)) {
        const el = this.squares[sq];
        const cell = pos[sq];
        let html = '';
        if (cell) {
          html = `<span class="pc">${PIECE_SVG[cell.type]}</span>`;
          el.classList.add(cell.color); // .w / .b untuk pewarnaan
        } else {
          el.classList.remove('w', 'b');
        }
        if (view.moves && view.moves[sq]) {
          html += view.moves[sq] === 'capture'
            ? '<span class="ring"></span>'
            : '<span class="dot"></span>';
        }
        el.innerHTML = html;
        el.classList.toggle('sel', view.selected === sq);
        el.classList.toggle('last', !!(view.lastMove && (view.lastMove.from === sq || view.lastMove.to === sq)));
        el.classList.toggle('check', view.checkSq === sq);
      }
    }

    static moveDests(game, from) {
      const dests = {};
      if (!from) return dests;
      for (const m of game.moves({ square: from, verbose: true })) {
        dests[m.to] = m.captured ? 'capture' : 'move';
      }
      return dests;
    }

    static findCheckSquare(game) {
      if (!game.in_check()) return null;
      const turn = game.turn();
      for (const row of game.board()) {
        for (const cell of row) {
          if (cell && cell.type === 'k' && cell.color === turn) return cell.square;
        }
      }
      return null;
    }

    static pieceName(letter) {
      return PIECE_ID[letter] || letter;
    }

    /** SVG bidak (tanpa corak salib) untuk dipakai modul lain (app.js) */
    static svg(type) {
      return PIECE_SVG[type] || '';
    }
  }

  window.RomanticBoard = Board;
})();
