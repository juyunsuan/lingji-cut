import type { PromptKind } from './types';

const PROJECT_STYLE = `name: project.style
description: 项目统一风格提示词
version: 1
user: |-
  冷静克制的现代科技纪录片风格，深色背景，低饱和青蓝色点缀，细腻磨砂玻璃层次，电影级侧逆光，构图留白稳定，镜头运动缓慢顺滑，中文无衬线粗体标题，信息层级清晰，避免霓虹紫、强饱和电商橙、营销页式渐变、夸张粒子和廉价光效。
`;

const PLANNING_SEGMENT = `name: planning.segment
description: 字幕分段规划提示词
version: 5
user: |-
  你是一个播客内容分析助手。请先完整理解整篇字幕，再把节目拆成有明确语义边界的段落。
  {{globalPromptLine}}

  段落拆分要求：
  - 必须按真实话题边界拆分，而不是按 token 长度硬切；同一话题的展开与收束可以分成 2-3 段，让卡片承载更细的子主题
  - 段落数量按整期时长动态决定，目标是"每段对应 1 张信息密度合适的卡片"：
    · 短稿（<3 分钟）：4-8 段
    · 中稿（3-8 分钟）：8-16 段
    · 长稿（>8 分钟）：每 30-45 秒一段，建议 12-30 段或更多；超长节目允许超过 30 段
  - 单段时长建议 20-60 秒，过短的过渡 / 客套话尽量并入相邻段，不要硬塞成独立段
  - 单段绝不能超过 60 秒；如果同一话题连续讲了更久，必须按子观点继续拆成多个连续段落
  - startMs / endMs 必须对应该段真正开始与结束的字幕时间
  - 如果前面只是铺垫，不要把时间提前算进该段
  - transcriptExcerpt 保留该段最关键的原始字幕摘录，便于后续逐段生成卡片

  每段必须给出 visualType（"motion" 或 "image"）。**默认必须是 "motion"**，只有当段落同时满足下面"image 强信号"的多个条件时才能选 "image"：
  - "motion"（默认）：总结观点、数据 / 数字对比、抽象概念、流程 / 时间线、列表枚举、评价 / 态度、对比 / 因果、定义、口播解释、提问与回答、过渡铺垫、几乎所有"在讲道理"的段落
  - "image"（仅在强信号下使用，必须同时满足以下 ≥2 条才允许选择）：
    1. 段落核心是一个**具体的、可被一张静态图清晰呈现**的视觉对象：单一产品 / 单一人物 / 单一地点 / 单一场景 / 单一物件特写
    2. 段落出现了**专有名词、品牌名、产品型号、地点名或人物名**，并且该名词就是这段内容的视觉主体（不是顺带提到）
    3. 段落正在做一段画面化的描写（描述长相、场景、氛围、动作姿态），口播此时是在"带观众看"而不是在"讲道理"
  - 反例（必须选 motion，不许选 image）：
    · 只是抽象提到了某个品牌 / 概念，但段落主线是评价或对比 → motion
    · 段落是数字、要点、清单、流程 → motion
    · 段落是观点输出、价值判断、因果分析 → motion
    · 段落是抛问题、做铺垫、转场 → motion
    · 不确定属于哪一类 → motion
  - 硬性配额（重要，写到 LLM 自检里）：整期里 visualType="image" 的段数 **不得超过总段数的 1/3**；如果挑出来的 image 段已经接近这个上限，剩余段必须全部选 motion
  - 选择 "image" 的段落必须在 transcriptExcerpt 或 summary 中明确包含上面 3 条强信号里的具体名词 / 描写，便于人工复核

  coverPrompts 要求（数组中只能且必须 1 条字符串）：
  - 必须使用简体中文；除品牌名、专有名词或必要缩写外，不要出现英文
  - 单条长度 120-200 字（过短画面随机，过长模型会忽略细节）
  - 必须按 主体 → 行为 → 环境 → 画面风格 → 美学词 → 质量词 → 画面文字标题及排版 的顺序组织，权重随位置递减
  - 主体 / 行为 / 环境 用连贯自然语言描述正在发生什么；画面风格 / 美学词 / 质量词 用独立词组串联，禁止展开成句
  - 美学词需覆盖 色彩、灯光光影、景别、构图 四类中至少 3 类，每类 1-2 个独立词组
  - 使用中文逗号"，"或分号"；"分隔要素，禁止使用换行 / 斜杠 / 特殊符号
  - 必须输出画面文字标题：先从整期内容提炼一条 8-14 个汉字的节目标题，用中文引号""…""精确包裹（如""深夜电台·声音档案""），保证 AI 生图的文字准确率
  - 文字排版必须给出具体约束，至少包含：字体族（如 思源黑体 / 苹方 / 站酷高端黑，优先现代中文无衬线，避免花体）、字重（Regular / Medium / Bold，默认 Bold）、字号占画面高度比例（6%-12%）、主文字颜色（给十六进制色值并与背景形成明显对比）、描边 / 阴影 / 光晕 / 渐变中任选 1-2 种、排版位置（顶部居中 / 顶部左对齐 / 居中下沉 / 底部居中 / 左侧竖排 等，避免遮挡主体）
  - 画面中禁止出现多余文字（副标题、署名、水印、logo、日期）与拼写错误；仅保留 1 条标题
  - 面向 16:9 播客封面：主体居中突出、信息聚焦，紧扣节目核心主题 / 关键人物 / 冲突感
  - 避免"美丽、震撼、惊艳"等空泛形容词与营销式堆砌
`;

const COVER_REGENERATION = `name: cover.regeneration
description: 封面提示词重生成（视觉系统：短视频缩略图 · B站知识区 / YouTube thumbnail 风）
version: 7
user: |-
  你是一名服务于知识类短视频 / 播客节目的封面提示词工程师，目标是产出 B 站知识区 / YouTube 高点击率缩略图风格的 16:9 封面。
  请结合本期字幕内容，重生成 1 条可直接喂给 AI 生图模型的封面提示词。

  已有整期创作提示词：
  {{globalPrompt}}

  当前封面提示词（仅用于参考，可改写）：
  {{currentPrompt}}

  {{styleSystemBlock}}
`;

const CARDS_SEGMENT = `name: cards.segment
description: 段落 Motion Card 生成提示词（电子杂志 × 电子墨水 · 深色变体 · Bento Grid 版式；motion-only）
version: 10
user: |-
  任务：只为当前 segment 生成 **1 张 Motion Card**（renderMode="motion-card"）。本提示词不再处理 image 段落，image 段在上游直接走 card.image 链路，不会进入这里。

  上下文：
  - 全局提示：{{globalPrompt}}
  - 节目总结：{{programSummary}}
  - 关键词：{{keywords}}
  - segment：{{segmentId}}｜{{segmentTitle}}｜{{segmentStartMs}}-{{segmentEndMs}}ms
  - 摘要：{{segmentSummary}}
  - 摘录：{{segmentTranscriptExcerpt}}
  - 单卡提示：{{cardPrompt}}
  {{currentCardSection}}

  时间轴：startMs/endMs/displayDurationMs 必须围绕当前段核心表达；不提前覆盖铺垫、转场或相邻段。

  ===== Motion Card 通用技术约束（不可违反）=====
  - type 必须从 summary / data / insight / chapter / quote / motion 中选；renderMode="motion-card"。
  - motionCard.html 必须是可直接插入卡片容器的 HTML 片段，包含内联 <style> 和同步 <script>，并用 gsap.timeline({ paused: true }) 构建动画。
  - 布局必须使用百分比、CSS clamp、flex 或容器尺寸自适应，禁止硬编码只适配 1920×1080。
  - 如需分步动画，使用 GSAP timeline 的 position 参数顺序编排；不要依赖运行时随机或异步逻辑。
  - 禁止 import / export / async / await / useCurrentFrame / useVideoConfig / globalThis / require / fetch / setTimeout / setInterval / new Date 这类副作用 API；唯一允许的 window 用法是 window.__lingjiMotionTimelines = window.__lingjiMotionTimelines || []; window.__lingjiMotionTimelines.push(localTimeline)。
  - 可用内联 <style>；不引入外部字体 / 网络资源；不输出 markdown 代码块；不写注释解释画面。
  - 内容忠于字幕，不编造数字与人名；画面里不要出现 Source / AI Generated / 节目水印之类小字。
  - 性能：最多 1 标题 + 1 副标题 / 注释 + 1 个数据可视化主元素 + 至多 6 个数据/列表项 + 1 层 hairline 装饰；禁止粒子雨 / blur 氛围光 / 大量 path / 逐帧随机 / CameraMotionBlur。
  - 可用运行时：{{sandboxReference}}

  ===== 字幕驱动动画契约（六类卡片通用，必须严格执行）=====
  入场窗（永远存在）：
  - 入场基准窗 = [0, min(18, durationInFrames * 0.25)] 帧。
  - serif 主标题以 translateY(H*0.04) + opacity 0→1 入场；mono meta / hairline 跟随其后 4-8 帧入场。
  - 入场结束后**不要再触发任何 opacity 0↔1 的闪烁**，已可见的元素必须保持稳定。

  内容分步（核心）—— **step = tile**：
  - Bento Grid 下，**每个 tile 整体作为一个 step**；tile 是版式里的一个网格单元（grid 区域），不是单个文字行。
  - 把卡片所有 tile 按"主→次"或"上→下、左→右"的视觉阅读顺序依次记作 step[0..N-1]。
  - 当 subtitles.length >= N：step[i]（即 tile[i]）的揭示窗 = [subtitles[i].relativeStartFrame, subtitles[i].relativeStartFrame + 12]，揭示用 translateY(H*0.025) + opacity 0→1，禁止 scale 大于 1.04，禁止 rotate，禁止 blur 入场。
  - 当 subtitles.length < N：把 durationInFrames 等分成 N 个 beat，step[i] 揭示窗 = [入场窗末 + beatLen * i, 入场窗末 + beatLen * i + 12]。
  - 已揭示的 tile 必须保持 opacity:1 与最终 translate 状态直到卡片末尾；**绝对禁止在揭示后再让它消失或再次入场**。
  - tile **内部子元素**（如 kicker / title / lead 之类）在同一 tile 的揭示窗内 4-8 帧错峰入场即可，不要再单独占用 subtitle step；同一 tile 内子元素之间错峰**不得超过 12 帧**。

  退场窗（可选）：
  - 仅当 durationInFrames > 90 时启用，窗 = [durationInFrames - 14, durationInFrames]，整卡 opacity 1→0.0 单调下降，不允许任何元素反向运动。

  动画反禁忌（**违反任意一条都视为生成失败，必须重做**）：
  1. 禁止任何 opacity 在同一元素上出现 0→1→0 / 1→0→1 类反复；揭示后就保持。
  2. 禁止使用 Math.sin / Math.cos / random / noise2D / noise3D 调制 opacity / scale / translate；只能用 gsap.from 或 gsap.to 的固定时段 tween。
  3. 禁止 spring 类无限物理动画；用 GSAP power2.out、power3.out、expo.out 等确定性 easing。
  4. 禁止任何元素在不同帧间发生位置 / 尺寸的"瞬移"（即 interpolate 区间外不留出 clamp）。
  5. 禁止整卡级 scale / rotate / 摄影机抖动 / 翻页效果。
  6. 禁止循环抖动 / 持续呼吸缩放；唯一允许的"微动"是 hairline 长度从 0→100% 的一次性单调揭示。

  布局反禁忌（杜绝文字遮挡）：
  - 顶层容器**必须使用 display:'grid'**（不再是 flex column），通过 gridTemplateColumns / gridTemplateRows 描述结构；gap: H * 0.035（≈20px @ H=580），padding: H * 0.08 上下 / W * 0.07 左右；不要把多个元素摞到同一坐标。
  - tile **本身禁止任何 background / border / borderRadius / boxShadow / filter**；Bento 的"块感"只允许靠 ① gap 留白 ② tile 之间一条 1px hairline 分隔线（rgba(236,231,218,0.18)）实现。
  - hairline 分隔线如需绝对定位，必须严格落在 gap 中央（gap 内居中、长度不超出 tile 边缘 H * 0.04）；不允许任何 hairline 压在 tile 内的文字 / 图表上。
  - 任何使用 position:'absolute' 的子元素必须显式给出 left/right/top/bottom 四角中的至少 2 个，并保证矩形不与其它绝对定位元素相交。
  - 单个 tile 内文字行 fontSize 之和 + gap 之和必须 ≤ 该 tile 的高度 - 2 * tilePaddingY；如果内容溢出，缩短文案、不要缩字号到不可读。
  - 数据可视化区域（图 / 表）与文字区域必须放在**不同 tile**，或用一行 hairline / 一个明确 gap 隔开；图表不允许压在文字之上。
  - 中文字符不要给 letterSpacing < 0 的负字距；西文标号才允许 -0.01em ~ -0.02em。

  {{styleSystemBlock}}

  节目定位：
  {{programContext}}
`;

const SCRIPT_REVIEW = `name: script.review
description: 口播稿 AI 审查提示词
version: 2
system: |-
  你是一位专业的口播稿审查编辑。请审查用户提供的口播稿，从以下维度给出批注：

  1. **事实准确性**（severity: error）：数据是否有来源、表述是否可能有误
  2. **表达流畅性**（severity: warning）：是否有书面化表达、长句、不适合口播的措辞
  3. **逻辑连贯性**（severity: warning）：段落过渡是否自然、论述是否有跳跃
  4. **口语化程度**（severity: info）：可以更口语化的表达建议

  业务规则：
  - 批注数量控制在 3~8 条，聚焦最重要的问题
  - 不要对标题格式（# ## 等）做批注
user: |-
  请审查下面这篇口播稿：

  {{scriptText}}
`;


const CARD_IMAGE = `name: card.image
description: 段落图片卡文生图提示词（中文）
version: 4
user: |-
  你是一名资深中文文生图提示词工程师，服务于一档播客 / 口播节目的"段落图片卡"。
  请基于下方节目级与段落级信息，为当前段落生成 1 段可直接喂给文生图模型的**简体中文**提示词。

  ===== 节目级上下文 =====
  整期创作提示词：{{globalPrompt}}
  节目级总结：{{programSummary}}
  节目关键词：{{keywords}}
  {{styleSystemBlock}}
  ===== 当前段落信息 =====
  段落 id：{{segmentId}}
  段落标题：{{segmentTitle}}
  段落摘要：{{segmentSummary}}
  段落字幕摘录：{{segmentExcerpt}}

  ===== 当前卡片结构（cards.segment 已确定，必须保持视觉一致）=====
  卡片标题：{{cardTitle}}
  卡片描述：{{cardContent}}
  显示模式：{{displayMode}}（fullscreen 优先大画面构图；pip 优先方构图或竖构图）
  画幅比例：{{aspectRatio}}

  ===== 用户单卡追加提示（可选）=====
  {{cardPromptHint}}

  【提示词结构规范】
  请按以下 6 个维度，按序、用中文逗号"，"或分号"；"串联，整体长度 100-180 字：
  1. 主体（自然语言）：明确"画面里有谁/有什么"，给出形态、材质、数量、外貌等可视化要素
  2. 行为 / 状态（自然语言）：主体正在做什么、神态、互动关系
  3. 环境（自然语言）：场景、时间、天气、空间氛围、关键道具
  4. 画面风格（独立词组，选 1 种为主）：写实摄影 / 编辑插画 / 极简线条 / 3D 渲染 / 中式水墨 / 赛博朋克 / 等距信息图 等
  5. 美学词（独立词组，覆盖色彩 / 灯光 / 景别 / 构图 中至少 3 类，每类 1-2 个）
  6. 质量词（独立词组，2-3 个）：8K 高清 / 电影质感 / 细腻纹理 / 大师构图 等

  【强制规则】
  - 必须使用简体中文；除品牌名、专有名词或必要缩写外，不要出现英文
  - 主体 / 行为 / 环境 必须是可读的自然语言句子；风格 / 美学 / 质量 必须是独立词组，禁止展开成长句
  - 紧扣当前段落的核心视觉对象，不要堆砌"美丽、震撼、惊艳"等空泛形容词
  - **画面里禁止出现任何文字、UI 元素、字幕条、Logo、水印、二维码、署名、日期**
  - 禁止出现裸露、暴力、政治敏感、品牌侵权等违规元素
  - 必须按 fullscreen / pip 与 aspectRatio 暗示的画幅设计构图（横/方/竖），不要让主体被裁掉
  - 禁止使用换行 / 斜杠 / markdown 代码块；只输出一段连续的中文描述`;

const CARD_VIDEO = `name: card.video
description: 段落视频卡提示词
version: 2
user: |-
  你是 AI 视频导演。基于以下 segment 信息，输出一段适合直接喂给文生视频模型的英文 prompt：

  标题：{{segmentTitle}}
  摘要：{{segmentSummary}}
  关键句：{{segmentExcerpt}}
  显示模式：{{displayMode}}
  画幅比例：{{aspectRatio}}
  时长：{{durationSeconds}} 秒

  要求：
  1. 给出主体、动作、镜头运动（推 / 拉 / 摇 / 跟）、转场节奏；
  2. 时长内逻辑闭合，避免镜头跳切显得断裂；
  3. 不出现任何文字 / Logo / UI 元素；
  4. 直接输出英文 prompt，不要任何前后缀或解释。
`;


export const DEFAULT_PROMPT_YAML: Record<PromptKind, string> = {
  'project.style': PROJECT_STYLE,
  'planning.segment': PLANNING_SEGMENT,
  'cover.regeneration': COVER_REGENERATION,
  'cards.segment': CARDS_SEGMENT,
  'script.review': SCRIPT_REVIEW,
  'card.image': CARD_IMAGE,
  'card.video': CARD_VIDEO,
};
