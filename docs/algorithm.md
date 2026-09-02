# 量子ウォークとQart

[READMEへ戻る](../README.md)

## 状態と干渉

Qartで用いる量子ウォークは、格子上に置かれた一つの種から始まる。そこから複素振幅が広がり、重なり、干渉しながら模様をつくっていく。

全体の状態は、各格子点$(x,y)$における二つの複素振幅を使って、次のように表される。

```math
|\Psi(t)\rangle=\sum_{x,y}
\left[\psi_0(x,y,t)|x,y,0\rangle+\psi_1(x,y,t)|x,y,1\rangle\right]
```

量子ウォークの特徴は、単に確率が場所から場所へ移るのではなく、位相を持った振幅が移動し、重なり、干渉することにある。

QartではまずHadamard演算によって二つの振幅を混ぜる。このとき二つの振幅の位相関係によって、強め合いと打ち消し合いが生じる。その強さを決める干渉項は、

```math
2\operatorname{Re}(\psi_0\psi_1^*)
```

として現れる。

## 量子ウォークの1ステップにおける数式

### 初期状態

選択した位置に、二つの内部状態を位相$\theta$をもつ等重ね合わせとして置く。

```math
|\Psi(0)\rangle=|x_0,y_0\rangle\otimes
\frac{|0\rangle+e^{i\theta}|1\rangle}{\sqrt{2}}
```

### $C_x$：横移動前のコイン混合

同じ位置にある二つの複素振幅を足し引きし、強め合いと打ち消し合いを作る。

```math
\begin{pmatrix}\psi'_0\\\psi'_1\end{pmatrix}
=\frac{1}{\sqrt{2}}
\begin{pmatrix}1&1\\1&-1\end{pmatrix}
\begin{pmatrix}\psi_0\\\psi_1\end{pmatrix}
```

### $S_x$：x方向の条件付き移動

内部状態0は左へ、内部状態1は右へ、それぞれ一マス移動する。

```math
S_x|x,y,0\rangle=|x-1,y,0\rangle,\qquad
S_x|x,y,1\rangle=|x+1,y,1\rangle
```

### $\Phi_t$：位置依存の位相回転

振幅の大きさは変えず、「波の向き」だけを回転させる。これによって次の干渉の仕方が変わる。

```math
\Phi_t(x,y)=
\begin{pmatrix}e^{i\phi_t(x,y)}&0\\0&e^{-i\phi_t(x,y)}\end{pmatrix}
```

振幅の大きさを保ったまま、位置ごとに二つの状態の位相を逆向きに回転させる。

### $C_y$：縦移動前のコイン混合

縦方向へ分かれる直前に、二つの複素振幅をもう一度足し引きする。

```math
\begin{pmatrix}\psi''_0\\\psi''_1\end{pmatrix}
=\frac{1}{\sqrt{2}}
\begin{pmatrix}1&1\\1&-1\end{pmatrix}
\begin{pmatrix}\psi'_0\\\psi'_1\end{pmatrix}
```

各コイン混合の式は、その操作の直前と直後の振幅を表している。

### $S_y$：y方向の条件付き移動

内部状態0は上へ、内部状態1は下へ、それぞれ一マス移動する。

```math
S_y|x,y,0\rangle=|x,y-1,0\rangle,\qquad
S_y|x,y,1\rangle=|x,y+1,1\rangle
```

### 1量子ステップ全体

右端の$C_x$から左向きに、五つの操作を順に適用する。

```math
|\Psi(t+1)\rangle=S_y C_y\Phi_t S_x C_x|\Psi(t)\rangle
```

つまり、「干渉させる → 移動させる → 位相を変える」ことを繰り返すことで、波が格子全体へ広がり、複雑な干渉模様が生まれる。

### 位置ごとの確率

量子ウォークモデル上で、その位置が観測される確率は、二つの振幅の大きさを二乗して足したものになる。

```math
P_t(x,y)=|\psi_0(x,y,t)|^2+|\psi_1(x,y,t)|^2
```

### 全確率の保存

全格子点の確率を足すと1になる。

```math
\sum_{x,y}P_t(x,y)=1
```

### 干渉の指標

二つの振幅の位相関係を$-1$から$+1$で表す。

```math
\chi(x,y)=\frac{2\operatorname{Re}(\psi_0\psi_1^*)}
{|\psi_0|^2+|\psi_1|^2}
```

分母が0でない位置で定義する。コイン混合後の0成分では正なら強め合い、負なら打ち消し合いを示す。1成分では逆になる。二つの成分を足した位置ごとの確率は、コイン混合の前後で変わらない。

## 現在の実装に関する補足

- 種は、選択した位置の近くに小さく広げて置く。上の初期状態の式は、一つの格子点に置く場合を表している。
- 複数の種を置くと、複素振幅を加え、全体の確率が1になるように正規化する。
- 格子の端を越えた振幅は、反対側へ移動する。
- それぞれの種から広がる波は、100〜180ステップの間に徐々に薄くなる。180ステップでその種の振幅を取り除き、残った状態を正規化する。この処理は、波を消すために加えたものである。
- 花は、干渉の強さが3ステップ以上持続した場所から、周囲の花との間隔も考慮して選ぶ。花の形と残光は、画面上の表現として加えたものである。
- 花の位置は同じ状態の変化に対して同じ結果になる。細い線の初期位置などには乱数を使う。

## コード

| 処理 | ファイル・関数 |
| --- | --- |
| 状態の更新 | [src/main.ts](../src/main.ts)：`quantumStep()` |
| コイン混合 | `applyCoin()` |
| 条件付き移動 | `shiftX()`、`shiftY()` |
| 位相回転 | `applyPhase()` |
| 種・花・波の減衰 | `seed()`、`growBlooms()`、`waveOpacity()` |
| 画面上の描画 | [src/renderer.ts](../src/renderer.ts) |
| 確率保存などのテスト | [tests/artwork.test.mjs](../tests/artwork.test.mjs) |

## 参考文献

- C. Di Franco, M. Mc Gettrick, T. Machida, Th. Busch, [*Alternate two-dimensional quantum walk with a single-qubit coin*](https://arxiv.org/abs/1107.4400), Physical Review A 84, 042337 (2011).
- S. E. Venegas-Andraca, [*Quantum walks: a comprehensive review*](https://arxiv.org/abs/1201.4780), Quantum Information Processing 11, 1015–1106 (2012).

[権利表記](../NOTICE.md)
