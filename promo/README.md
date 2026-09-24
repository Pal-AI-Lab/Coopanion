# 宣传片与 banner

Coopanion 的宣传片(1920×1080,约 1:40)和各仓库的 banner,都由网页渲染。桌宠用的是
`packages/cortico-world-desktop-pet/web/pet-core.js` 里的真身体;画面每一帧都只由时间 `t` 决定,所以边播边看和逐帧录制得到的画面相同。

| 命令 | 作用 |
|---|---|
| `node promo/build.mjs` | 打包成 `promo/dist/index.html` 与封面页 `promo/dist/cover.html`。前者在浏览器打开后跟着配乐播放,空格暂停,←/→ 跳 5 秒 |
| `electron promo/cover.cjs` | 把封面页截成 `promo/dist/cover.png`,默认 2560×1440;`--size`、`--out` 可改 |
| `electron promo/record.cjs` | 离屏逐帧渲染,经 ffmpeg 输出 `promo/dist/Coopanion-promo.mp4`。`--from`/`--to` 只录一段,`--out` 改输出路径,`--fps` 改帧率(默认 30),`--size 2560x1440` 按该分辨率渲染(画面布局不变,约 0.1 秒一帧);ffmpeg 取自 `$FFMPEG`,没有就用 PATH 里的 |
| `node promo/banner.mjs <companion\|desktop-pet\|cua> <目录>` | 在目录里写 `banner.svg` 与 `banner-dark.svg` |

配乐是花卷Jwyan 的《可爱鲈鱼》,不放在仓库里,构建前要先把它放到 `promo/assets/bgm.mp3`。
节拍网格(155 BPM,从文件第 1.36 秒开始播放)写在 `src/util.js`,换曲子时要一起改。

| 文件 | 内容 |
|---|---|
| `src/main.js` | 时间线、桌宠的调度与各场景 |
| `src/widgets.js` | 字幕、标签、气泡、鼠标指针 |
| `src/wordmark.js` | 标题字:按 Cortico 字标的单线结构补齐所需字母 |
| `src/arcs.js` | 背景的缺口圆弧 |
| `src/cover.js` | 视频封面 |
