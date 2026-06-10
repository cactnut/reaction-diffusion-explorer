// LaTeX のごく一部を MathML に変換する最小実装。
//
// このアプリのモデル数式に出てくる構文だけを賄う:
//   \frac{}{}  ^  _  { }  \left( \right]  主要ギリシャ文字 / 演算子コマンド
//   数字・英字・演算子 ( + - = ( ) [ ] , | )・暗黙の乗算 (隣接)
// ランタイムにライブラリを持たないために自前で書いている (KaTeX/temml 不要)。
// ブラウザは <math> をネイティブ描画する。

/** コマンド → 表示文字 (識別子として mi で出すもの) */
const SYMBOLS: Record<string, string> = {
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
  "\\epsilon": "ε", "\\varepsilon": "ε", "\\zeta": "ζ", "\\eta": "η",
  "\\theta": "θ", "\\kappa": "κ", "\\lambda": "λ", "\\mu": "μ",
  "\\nu": "ν", "\\xi": "ξ", "\\pi": "π", "\\rho": "ρ",
  "\\sigma": "σ", "\\tau": "τ", "\\phi": "φ", "\\chi": "χ",
  "\\psi": "ψ", "\\omega": "ω",
};

/** コマンド → 演算子として mo で出す記号 */
const OP_SYMBOLS: Record<string, string> = {
  "\\cdot": "·",
  "\\times": "×",
};

/** 空白コマンド → mspace 幅 */
const SPACE_WIDTH: Record<string, string> = {
  "\\,": "0.17em",
  "\\;": "0.28em",
  "\\:": "0.22em",
  "\\quad": "1em",
  "\\qquad": "2em",
};

const OPERATORS = new Set(["+", "-", "=", "(", ")", "[", "]", ",", "|", "<", ">", "/"]);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function mo(sym: string): string {
  // ハイフンマイナスは数式用マイナス記号にする
  return `<mo>${esc(sym === "-" ? "−" : sym)}</mo>`;
}

function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "\\") {
      let j = i + 1;
      if (j < src.length && /[a-zA-Z]/.test(src[j])) {
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      } else {
        j = i + 2; // \, \; \! など 1 記号コマンド
      }
      out.push(src.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push(src.slice(i, j));
      i = j;
      continue;
    }
    out.push(c);
    i++;
  }
  return out;
}

/** msup/msub/mfrac の引数は単一要素である必要があるので mrow で包む */
const wrap = (mml: string) => `<mrow>${mml}</mrow>`;

export function texToMathML(tex: string): string {
  const tokens = tokenize(tex);
  let i = 0;

  // 1 つの被演算子 (atom)。後置の ^ _ はここでは扱わない
  function atom(): string {
    const t = tokens[i];
    if (t === undefined) return "";

    if (t === "{") {
      i++;
      const grp = row("}");
      if (tokens[i] === "}") i++;
      // 中身が英字 mi だけなら 1 つの mi にまとめる (多文字ラベル: sat, ratio 等)
      const letters = grp.parts.every((p) => /^<mi>[a-zA-Z]<\/mi>$/.test(p));
      if (grp.parts.length > 1 && letters) {
        return `<mi>${grp.parts.map((p) => p.slice(4, -5)).join("")}</mi>`;
      }
      return wrap(grp.mml);
    }

    if (t === "\\frac") {
      i++;
      const num = atom();
      const den = atom();
      return `<mfrac>${wrap(num)}${wrap(den)}</mfrac>`;
    }

    if (t === "\\left") {
      i++;
      const open = tokens[i++] ?? "";
      const inner = row("\\right");
      if (tokens[i] === "\\right") i++;
      const close = tokens[i++] ?? "";
      const fence = (s: string) =>
        s === "." || s === "" ? "" : `<mo stretchy="true">${esc(s)}</mo>`;
      return `<mrow>${fence(open)}${inner.mml}${fence(close)}</mrow>`;
    }

    if (t in SPACE_WIDTH) {
      i++;
      return `<mspace width="${SPACE_WIDTH[t]}"/>`;
    }
    if (t === "\\cdot" || t === "\\times") {
      i++;
      return `<mo>${OP_SYMBOLS[t]}</mo>`;
    }
    if (t in SYMBOLS) {
      i++;
      return `<mi>${esc(SYMBOLS[t])}</mi>`;
    }
    if (OPERATORS.has(t)) {
      i++;
      return mo(t);
    }
    if (/^[0-9.]+$/.test(t)) {
      i++;
      return `<mn>${esc(t)}</mn>`;
    }
    if (/^[a-zA-Z]$/.test(t)) {
      i++;
      return `<mi>${esc(t)}</mi>`;
    }
    // 想定外のトークンはそのまま mo にして落とさない
    i++;
    return mo(t);
  }

  // atom に後置の上付き / 下付きを付けた 1 単位
  function unit(): string {
    let base = atom();
    while (tokens[i] === "^" || tokens[i] === "_") {
      const op = tokens[i++];
      const script = atom();
      base =
        op === "^"
          ? `<msup>${wrap(base)}${wrap(script)}</msup>`
          : `<msub>${wrap(base)}${wrap(script)}</msub>`;
    }
    return base;
  }

  function row(until?: string): { mml: string; parts: string[] } {
    const parts: string[] = [];
    while (i < tokens.length && tokens[i] !== until && tokens[i] !== "}") {
      parts.push(unit());
    }
    return { mml: parts.join(""), parts };
  }

  const { mml } = row();
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow>${mml}</mrow></math>`;
}
