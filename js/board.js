/**
 * board.js — render papan catur & interaksi.
 * Dipakai oleh app.js. chess.js global (vendor) menangani aturan permainan.
 *
 * Konvensi warna: 'w' = putih, 'b' = hitam. Pion memakai simbol unicode.
 */
(function () {
  'use strict';

  const PIECE = {
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
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
        const dark = (idx + Math.floor(idx / 8)) % 2 === 0;
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
          html = `<span class="pc">${PIECE[cell.type]}</span>`;
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
  }

  window.RomanticBoard = Board;
})();
