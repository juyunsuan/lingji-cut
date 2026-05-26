import type { PromptKind } from './types';

const PROJECT_STYLE = `name: project.style
description: 项目统一风格提示词
version: 1
user: |-
  冷静克制的现代科技纪录片风格，深色背景，低饱和青蓝色点缀，细腻磨砂玻璃层次，电影级侧逆光，构图留白稳定，镜头运动缓慢顺滑，中文无衬线粗体标题，信息层级清晰，避免霓虹紫、强饱和电商橙、营销页式渐变、夸张粒子和廉价光效。
`;

const PLANNING_SEGMENT = `name: planning.segment
description: 字幕分段规划提示词
version: 4
user: |-
  你是一个播客内容分析助手。请先完整理解整篇字幕，再把节目拆成有明确语义边界的段落。
  {{globalPromptLine}}
  {{projectStylePromptBlock}}

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
version: 5
user: |-
  你是一名服务于知识类短视频 / 播客节目的封面提示词工程师，目标是产出 B 站知识区 / YouTube 高点击率缩略图风格的 16:9 封面。
  请结合本期字幕内容，重生成 1 条可直接喂给 AI 生图模型的封面提示词。

  已有整期创作提示词：
  {{globalPrompt}}

  项目统一风格要求：
  {{projectStylePrompt}}

  当前封面提示词（仅用于参考，可改写）：
  {{currentPrompt}}

  ===== 视觉系统：短视频缩略图 / Thumbnail 风（默认锁定，禁止替换）=====
  美学锚点：B 站知识区头部 UP 主缩略图 × YouTube 解说类频道 thumbnail × 商业短视频封面。
  整张封面必须是"真实场景照片 + 卡通插画元素 + 大字综艺标题"的混合体，靠夸张冲突制造点击欲。

  Design DNA（违反任何一条，缩略图感都会垮）：
  1. 强冲突主体 —— 一个真实人物 / 物件 + 一个夸张卡通元素（夸张表情吉祥物、卡通监控摄像头、巨大眼睛、卡通箭头、对话气泡、放大镜、警示标志等），两者之间存在视觉冲突或戏剧关系
  2. 字必须大、必须狠 —— 主标题字号占画面高度 18%-28%，是整张图的视觉焦点，比脸还显眼
  3. 真实 + 卡通混合 —— 不要纯插画、不要纯写实，必须是合成感（真实办公室照片 + 卡通摄像头叠加；真实人物背影 + 卡通对话气泡）
  4. 单一霓虹 accent —— 只允许 cyan(#00E5FF) / lime(#A6FF00) / magenta(#FF2EC4) 三选一，全图围绕这一种 accent 配色，禁止双 accent
  5. 暗色科技底 —— 背景统一偏暗（深蓝黑 #0A0E1A / 暗灰 #14161C / 黑紫 #0F0A1A），制造 accent 发光感

  ===== 颜色 token（硬性锁定）=====
  - 背景色 bg：从 #0A0E1A / #14161C / #0F0A1A 中选 1
  - accent（霓虹主色，全图配额 ≤ 25% 面积，整张图只允许这一种霓虹）：cyan #00E5FF / lime #A6FF00 / magenta #FF2EC4 三选一
  - 主标题填色 = accent 本色或更浅一档高光色
  - 主标题描边 = 纯黑 #000000，描边粗度占字高 8%-12%（厚到看不清字内细节为止）
  - 高光边 = 纯白 #FFFFFF，1-2px 极细，沿描边外侧
  - 3D 立体投影 = 黑色或 accent 深色，向右下偏移 4%-8% 字高，硬阴影不要 blur
  - 副标题颜色 = 纯白 #FFFFFF + 纯黑描边；或 accent 反色 + 黑描边

  【提示词结构规范】
  单条提示词必须按以下 7 个维度、严格按序组织，用中文逗号"，"或分号"；"串联，整体长度 140-220 字：

  1. 主体（自然语言）
     - 真实人物或真实物件，明确动作姿态、外貌、服装、视角（背对镜头 / 侧脸 / 半身 / 仰视等）
     - 示例：一位男性程序员背对镜头坐在办公桌前；一只手伸向手机屏幕的特写；一摞堆到天花板的文件
  2. 卡通元素 / 戏剧冲突（自然语言，必填）
     - 在主体周围叠加 1 个夸张卡通元素，用于制造视觉冲突或戏剧关系
     - 可选：卡通监控摄像头带巨大眼睛盯着主体；夸张卡通箭头指向某处；漂浮的对话气泡 / 思考气泡；卡通警示标志；放大镜聚焦在细节上；爆炸符号；表情夸张的吉祥物
     - 必须明确卡通元素的位置（画面左上 / 右上 / 中部 / 围绕主体）与情绪（盯着、嘲讽、警告、惊讶等）
  3. 环境（自然语言）
     - 真实场景 + 暗色科技氛围：开放式办公室 / 深夜书房 / 服务器机房 / 街头夜景 / 复古录音室
     - 必须暗色调，桌面 / 屏幕 / 墙面有 accent 色的微光反射，强化 accent 统一感
  4. 画面风格（独立词组，严格照抄以下组合）
     - "真实摄影合成，卡通插画叠加，互联网短视频封面设计，B站知识区缩略图风，YouTube thumbnail style"
  5. 美学词（独立词组，必须覆盖以下 4 类，每类至少 1 个）
     - 色彩：高饱和度，强对比，深色科技底，单色霓虹点缀（cyan / lime / magenta 三选一并明确写出色名）
     - 灯光：戏剧化布光，霓虹氛围光，硬光高对比，accent 色边缘光
     - 构图：中心冲击构图 / 三分构图 / 对角线动势，主体居中或偏左，标题占据视觉黄金区
     - 装饰：背景斜切几何分割线，accent 色发光边框，暗色径向渐变，accent 色装饰箭头条 / 锯齿条
  6. 质量词（独立词组，2-3 个）
     - 4K 超清，锐利清晰，富有层次的合成质感，大师级缩略图设计
  7. 画面文字（必须包含主标题，可选副标题，由以下两段组成）
     - 7.1 文本：先从整期字幕提炼 1 条 4-8 个汉字的主标题（要狠、要冲突、要带钩子，例如"公司合法监控""你被算法骗了""老板不会告诉你"），用中文引号""…""精确包裹；可再追加 1 条 ≤6 字副标题（""摸鱼的你！""""我不允许""），同样用引号包裹
     - 7.2 排版约束（独立词组串联，必填项不可省）：
       · 字体族（主标题）：粗体综艺封面字 / 阿里妈妈数黑体 / 站酷酷黑 / 字魂综艺粗黑 / 优设标题黑；禁止衬线、禁止花体、禁止手写
       · 字重：Black / Heavy（必须最重的一档）
       · 字号：主标题占画面高度 18%-28%（不能更小），副标题占画面高度 6%-10%
       · 主标题填色：accent 霓虹色（必须明确写出 cyan #00E5FF / lime #A6FF00 / magenta #FF2EC4 之一）
       · 描边：纯黑 #000000 厚描边，粗度约字高 10%
       · 高光：1-2px 纯白 #FFFFFF 高光边沿描边外侧
       · 立体投影：黑色硬阴影向右下偏移约字高 6%，无模糊
       · 副标题：白色填色 + 黑色描边，可倾斜 6°-10° 制造冲突感
       · 排版位置：主标题居中或居中偏下，覆盖画面下半部 1/3；副标题贴在主标题右上或左下角；都不得遮挡主体面部
       · 主副标题之间允许加 1 条 accent 色装饰短线 / 箭头 / 锯齿条作为视觉串联

  【强制规则】
  - 主体 / 卡通元素 / 环境 必须是可读的自然语言句子，清晰交代"谁、和什么卡通元素、在哪里"
  - 画面风格 / 美学词 / 质量词 / 排版约束 必须是独立词组，用中文逗号串联，禁止展开成长句
  - 越靠前权重越高，严格按 主体 → 卡通元素 → 环境 → 风格 → 美学 → 质量 → 文字与排版 的顺序排布
  - 整体长度 140-220 字；必须包含 1 个夸张卡通元素 + 1 条主标题 + 至多 1 条副标题
  - 使用中文逗号"，"或分号"；"分隔要素，禁止使用换行、斜杠 /、括号堆叠或其它特殊符号
  - 必须使用简体中文；色值、字体族名、风格锚点英文（YouTube thumbnail / B站）可保留
  - 文字标题必须用中文引号""…""精确包裹，保证 AI 生图的文字准确率
  - 整张图只允许出现 1 条主标题 + 至多 1 条副标题，禁止期号、署名、水印、logo、日期、二维码、UI 控件
  - 标题文本必须紧扣本期核心冲突 / 反差 / 钩子，禁止"美丽、震撼、惊艳、极致、终极"等空泛形容词
  - accent 色全图只能出现 1 种霓虹（cyan / lime / magenta 三选一），禁止双霓虹混搭
  - 面向 16:9 封面：主体不能被裁掉、标题不能贴边、卡通元素与主体必须有清晰的空间关系
  - 禁止裸露、暴力、政治敏感、真人换脸、明星肖像、品牌侵权

  【参考示例】（仅示范格式与颗粒度，不要照抄内容；该示例使用 cyan accent）
  一位男性程序员背对镜头坐在开放式办公桌前面对三块显示器敲键盘，画面右上角悬浮着一只夸张的卡通监控摄像头，摄像头有一只巨大的卡通眼睛圆睁着死死盯着员工后脑，整体氛围紧张戏剧化，环境是深夜暗色调开放式办公室，桌面与屏幕透出青色微光打在墙面与天花板上，真实摄影合成，卡通插画叠加，互联网短视频封面设计，B站知识区缩略图风，YouTube thumbnail style，高饱和度，强对比，深色科技底 #0A0E1A，单色霓虹点缀 cyan #00E5FF，戏剧化布光，霓虹氛围光，硬光高对比，cyan 边缘光，中心冲击构图，主体居中偏左，背景斜切几何分割线，cyan 发光边框，暗色径向渐变，cyan 装饰箭头条，4K 超清，锐利清晰，大师级缩略图设计，画面下半部居中呈现主标题""公司合法监控""，字魂综艺粗黑，Black，字号约占画面高度 24%，主色 cyan #00E5FF 霓虹填充，纯黑 #000000 厚描边约字高 10%，1-2px 纯白 #FFFFFF 高光边，黑色硬阴影向右下偏移字高 6%，主标题右上方贴一条副标题""摸鱼的你！""为白色填色配纯黑描边并倾斜 8°，主副标题之间加一条 cyan 锯齿装饰条作为视觉串联，全部文字均不遮挡主体面部
`;

const CARDS_SEGMENT = `name: cards.segment
description: 段落 Motion Card 生成提示词（电子杂志 × 电子墨水 · 深色变体；motion-only）
version: 7
user: |-
  任务：只为当前 segment 生成 **1 张 Motion Card**（renderMode="motion-card"）。本提示词不再处理 image 段落，image 段在上游直接走 card.image 链路，不会进入这里。

  上下文：
  - 全局提示：{{globalPrompt}}
  - 项目风格：{{projectStylePrompt}}
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
  - motionCard.sourceCode 必须定义 const MotionComponent = (props) => { ... } 并 return JSX。
  - props 现在是 { frame, fps, durationInFrames, width, height, subtitles }；布局必须基于 width / height 自适应，**禁止硬编码 1920 / 1080**。
  - subtitles 是一个数组（可能为空），每项形如 { startMs, endMs, text, relativeStartFrame, relativeEndFrame }，已按时间升序、relative*Frame 已对齐卡片起点为 0；**所有分步动画必须按 subtitles 顺序触发**，没有 subtitles 时退化为 beats 等分节奏。
  - 禁止 import / export / async / await / useCurrentFrame / useVideoConfig / window / globalThis / require / fetch / setTimeout / setInterval / new Date 这类副作用 API。
  - 纯内联 style；不引入外部字体 / 网络资源；不输出 markdown 代码块；不写注释解释画面。
  - 内容忠于字幕，不编造数字与人名；画面里不要出现 Source / AI Generated / 节目水印之类小字。
  - 性能：最多 1 标题 + 1 副标题 / 注释 + 1 个数据可视化主元素 + 至多 6 个数据/列表项 + 1 层 hairline 装饰；禁止粒子雨 / blur 氛围光 / 大量 path / 逐帧随机 / CameraMotionBlur。
  - 可用 API：{{sandboxReference}}

  ===== 字幕驱动动画契约（六类卡片通用，必须严格执行）=====
  入场窗（永远存在）：
  - 入场基准窗 = [0, min(18, durationInFrames * 0.25)] 帧。
  - serif 主标题以 translateY(H*0.04) + opacity 0→1 入场；mono meta / hairline 跟随其后 4-8 帧入场。
  - 入场结束后**不要再触发任何 opacity 0↔1 的闪烁**，已可见的元素必须保持稳定。

  内容分步（核心）：
  - 把卡片的"可分步内容单元"（要点、数据项、表格行、饼图扇区、章节副标、引文等）依次记作 step[0..N-1]。
  - 当 subtitles.length >= N：step[i] 的揭示窗 = [subtitles[i].relativeStartFrame, subtitles[i].relativeStartFrame + 12]，揭示用 translateY(H*0.025) + opacity 0→1，禁止 scale 大于 1.04，禁止 rotate，禁止 blur 入场。
  - 当 subtitles.length < N：把 durationInFrames 等分成 N 个 beat，step[i] 揭示窗 = [入场窗末 + beatLen * i, 入场窗末 + beatLen * i + 12]。
  - 已揭示的 step 必须保持 opacity:1 与最终 translate 状态直到卡片末尾；**绝对禁止在揭示后再让它消失或再次入场**。

  退场窗（可选）：
  - 仅当 durationInFrames > 90 时启用，窗 = [durationInFrames - 14, durationInFrames]，整卡 opacity 1→0.0 单调下降，不允许任何元素反向运动。

  动画反禁忌（**违反任意一条都视为生成失败，必须重做**）：
  1. 禁止任何 opacity 在同一元素上出现 0→1→0 / 1→0→1 类反复；揭示后就保持。
  2. 禁止使用 Math.sin / Math.cos / random / noise2D / noise3D 调制 opacity / scale / translate；只能用 interpolate(frame, [from,to], [a,b], { extrapolateRight:'clamp', extrapolateLeft:'clamp', easing: Easing.out(Easing.cubic) })。
  3. 禁止 spring overshoot > 1.05；调用 spring 时必须给 { config: { damping: 200, stiffness: 120, mass: 0.6 } } 或等价稳态参数。
  4. 禁止任何元素在不同帧间发生位置 / 尺寸的"瞬移"（即 interpolate 区间外不留出 clamp）。
  5. 禁止整卡级 scale / rotate / 摄影机抖动 / 翻页效果。
  6. 禁止循环抖动 / 持续呼吸缩放；唯一允许的"微动"是 hairline 长度从 0→100% 的一次性单调揭示。

  布局反禁忌（杜绝文字遮挡）：
  - 顶层容器使用 display:'flex'; flexDirection:'column'; gap: H * 0.04，padding: H * 0.08 上下 / W * 0.07 左右；不要把多个元素摞到同一坐标。
  - 任何使用 position:'absolute' 的子元素必须显式给出 left/right/top/bottom 四角中的至少 2 个，并保证矩形不与其它绝对定位元素相交。
  - 文字行 fontSize 之和 + gap 之和必须 ≤ height - 2 * paddingY；如果内容溢出，缩短文案、不要缩字号到不可读。
  - 数据可视化区域（图 / 表）与文字区域必须用一行 hairline 或一个明确 gap 隔开；图表不允许压在文字之上。
  - 中文字符不要给 letterSpacing < 0 的负字距；西文标号才允许 -0.01em ~ -0.02em。

  ===== 视觉系统：电子杂志 × 电子墨水（深色变体）=====
  美学锚点：Monocle 杂志的版式 × 电子墨水的克制 × 深色科技纪录片的影调。整张卡是一页杂志，不是一个营销弹窗。

  Design DNA（违反任何一条，杂志感都会垮）：
  1. 克制优于炫技 —— 不用阴影、不用浮动卡片、不用 padding box，一切信息靠**大字号 + 字体对比 + 网格留白**承载。
  2. 结构优于装饰 —— 不要"装饰性 emoji"、不要彩色图标墙、不要发光晕圈；装饰只允许 1px hairline 横线、单个序号、单个 SVG 数据图形。
  3. 内容层级 = 字号 + 字体共同定义 —— 最大衬线 = 主标题；中衬线 = 副标；大无衬线 = lead；小无衬线 = body；等宽 = meta。
  4. 节奏靠留白 —— 卡片四周内边距 ≥ H * 0.08，正文与标题间距 ≥ H * 0.04，hairline 上下间距 ≥ H * 0.03。

  主题 tokens（深色变体，硬性锁定，禁止替换）：
  - 画布底色 paper：#0E0E10
  - 主文字 ink：#ECE7DA
  - 弱化文字 ink-mute：#8A8478
  - hairline 颜色：rgba(236,231,218,0.18)
  - 单一 accent：#0A84FF（系统蓝；**整张卡只能出现在 1 个语义焦点**：1 个关键数字 / 1 条进度图填充色 / 1 段高亮单词 / 1 条 accent 短横线，四选一）
  - 数据图填充：未达成区 = rgba(236,231,218,0.12)（轨道）、已达成区 = #0A84FF；对比第二色用 ink-mute #8A8478，**绝不要引入第二种霓虹**。
  - 禁止：任何渐变 / box-shadow / filter:blur 用于氛围光 / border-radius > 4px / 第二种 accent 色 / 霓虹紫 / 强饱和橙 / 营销绿。

  字体栈：
  - serif：'Noto Serif SC','Source Han Serif SC','Songti SC','STSong',Georgia,'Times New Roman',serif
  - sans：'PingFang SC','Hiragino Sans GB','Source Han Sans SC','Noto Sans SC','Helvetica Neue',Helvetica,Arial,sans-serif
  - mono：'SF Mono','JetBrains Mono','Source Code Pro',Menlo,Consolas,monospace

  排版阶梯（H = height）：
  - hero serif：H * 0.13 ~ H * 0.18，fontWeight 500-600，letterSpacing -0.01em，lineHeight 1.05，中文 ≤ 8 字 / 行
  - lead sans：H * 0.045 ~ H * 0.06，fontWeight 400，lineHeight 1.45
  - body sans：H * 0.032 ~ H * 0.04，fontWeight 400，lineHeight 1.5，opacity 0.85
  - meta mono：H * 0.022 ~ H * 0.028，fontWeight 500，letterSpacing 0.14em，textTransform 'uppercase'
  - 数据大字（data 类型主数）：H * 0.28 ~ H * 0.4，fontWeight 600，serif，accent 色；单位用 sans 小字跟在右下角，opacity 0.7

  ===== 六类 type 的版式 + 动画规范（强制对应，按 type 实现）=====

  • type="chapter"（章节扉页）
    版式：顶部 mono meta（"VOL." + 章节号）→ 中部 serif hero（≤ 6 字母题）→ accent 短横线（width * 0.08）→ 底部 mono（节目名 / 期号）。
    分步单元 step：[meta, hero, accent-bar, footer]，按 subtitles 顺序揭示；如果字幕只有 1-2 行，把 hero 放在第 1 行揭示，其它步骤回退到等分 beats。
    动画：accent-bar 用 transform: scaleX(0→1)、transformOrigin:'left'，按 step 揭示窗一次到位；不要循环。

  • type="summary"（段落总结）
    版式：顶部 mono kicker（编号 + 标签）→ serif 主标题（段落标题 ≤ 14 字）→ 居左 hairline（width * 0.12）→ sans lead 段落要点（≤ 60 字，1-2 句话，不要列表 ul / li）。
    分步单元 step：[kicker, title, hairline, lead-sentence-1, lead-sentence-2?]；把 lead 文案按句号 / 问号 / 感叹号切成 1-2 句，每句一个 step。
    动画：每句揭示用 translateY(H*0.025)+opacity，揭示完成后维持；hairline 用 scaleX(0→1) 单调揭示。

  • type="quote"（金句）
    版式：居左 serif 大字引文（H * 0.11 起步），起首一个超大引号 " 或「（字号 = 引文 * 1.6，accent 色）；引文下 mono meta："—— 出处 / 说话人 / 时间戳"。
    分步单元 step：[quote-mark, quote-text, attribution]；引号先到位 → 引文按字幕逐句揭示（如果引文 ≥ 2 句，每句一个 step）→ 出处最后揭示。
    动画：引号用 opacity 0→1 + translateY(H*0.02)，绝不缩放；引文按 step 揭示，禁止打字机逐字效果（容易卡顿）；出处揭示后保持。

  • type="insight"（观点 / 结论）
    版式：serif 中标题（结论一句话，≤ 18 字）→ hairline → 3 行 body 要点（每行 ≤ 18 字），每行前一个 mono 编号 01 / 02 / 03，**编号 accent 色，文字 ink 色**。
    分步单元 step：[headline, hairline, point-01, point-02, point-03]；要点数量 ≤ 3，宁可少也不要多。
    动画：每条要点的编号先轻微入场（translateY+opacity），紧跟着同一 step 内的文字部分一起到位；不要让编号和文字分两个时间点。

  • type="data"（数据 / 数字对比 / 表格 / 图表）—— **本类是这次重构的重点**
    根据数据形态从下列子布局里选 1 种：
      (a) 大数字 + 解释（单值）：顶部 mono kicker → serif 大数（accent） + sans 单位 → hairline → body 一句解释。
      (b) 双值对比：两个数横向并列，accent 给主数，ink-mute 给对照数；中间一个 mono 标签（如 "VS" 或差值）。
      (c) 柱状图（bar）：≤ 5 个 SVG <rect>，等间距纵向条形，下方 mono 标签 + 上方 serif 小数字；轨道色 rgba(236,231,218,0.12)，已揭示部分 accent。
      (d) 进度环 / 饼图（donut / pie）：单个 SVG <circle> 用 stroke-dasharray 揭示一段角度（推荐用 progress-ring 方式而不是真正的多片 pie，复杂度低且不易出错）；中央放 serif 大百分比。
      (e) 折线图（line）：单条 SVG <polyline>，用 strokeDasharray + strokeDashoffset 从 100%→0% 揭示，stroke accent，不要填充。
      (f) 表格（table）：用 div + flex 网格（不要用 <table>），最多 4 行 × 3 列；首行 mono 表头（ink-mute、letterSpacing 0.14em），数据行用 serif 数字 + sans 标签；行与行之间用 1px hairline 分隔；揭示按行进行，不要按单元格。
    技术栈硬约束：所有图表必须用**纯 SVG + Remotion 原语**（@remotion/shapes 的 Rect / Circle / Polygon、原生 <svg> + <rect>/<circle>/<path>/<polyline>），禁止引入 recharts、d3、chart.js、任何第三方图表库；禁止 canvas / WebGL。
    分步单元 step：根据子布局拆分 —— 单值 = [kicker, number, hairline, explain]；对比 = [kicker, value-A, vs-label, value-B, explain]；bar/line/donut = [kicker, axis/baseline, item-1, item-2, ..., item-N, explain]；table = [kicker, header-row, row-1, ..., row-N, explain]。
    数字增长动画（适用于 (a)(b)(c)(d) 主数字）：每个 step 在揭示窗内，数值从 0 / 起始值 interpolate 到目标值（Easing.out(Easing.cubic)、clamp 两端），用 Math.round 处理整数、用 toFixed(1) 处理一位小数；**绝对不要每帧 Math.random / noise**。
    图表入场动画：
      - bar：每根柱子的 height（或 width）从 0 长到目标值，按 step 顺序触发；柱子之间不重叠、不挡文字。
      - line：strokeDashoffset 从总长 → 0，单调一次性揭示。
      - donut：strokeDashoffset 从 circumference → circumference*(1-pct)，单调一次性揭示，中央数字与环同步增长。
      - table：每行 translateY(H*0.02) + opacity 揭示；揭示后保持。
    数据真实性：所有数字 / 比例必须直接来自 segmentTranscriptExcerpt / segmentSummary；如果原文没有具体数字，请用 type="insight" 而不是 type="data" 编造数据。

  • type="motion"（兜底 / 抽象概念）—— 极简 statement
    版式：serif 中文短标题居中（≤ 10 字）→ hairline → 一句 sans 注解（≤ 24 字）→ 允许一个轻量 SVG 几何（直线 / 圆环 / 三角，stroke 1.5px，accent 描边，不填充）。
    分步单元 step：[title, hairline, annotation, glyph]，按 subtitles 顺序揭示；几何描边可用 strokeDasharray 一次性单调揭示。

  ===== 强制视觉硬规则 =====
  - 容器：position relative，背景 #0E0E10 满铺，flexDirection column；不要在外层加任何 borderRadius / boxShadow。
  - 不允许任何 div 出现 background 为渐变、半透明白色磨砂、彩色发光圈。
  - 不允许使用 emoji / 装饰性 unicode（★ ✦ ◆ ⚡ 之类）；装饰只用纯几何 SVG 或 mono 数字编号。
  - 整张卡的非黑非白彩色块面积之和 ≤ 8%（accent + 数据已揭示区合计配额）。
  - 中文与西文混排时，西文（年份 / 缩写 / Vol. / 单位）用 mono；中文用 serif / sans。
  - 每张卡必须包含至少 1 行 mono meta，强化"杂志一页"的元数据氛围。
  - 入场仅允许 translateY + opacity；禁止 scale / rotate / blur 入场；禁止全屏 zoom-in。

  ===== 失败示例（生成完毕后必须自查）=====
  - ✗ 用 emoji ✨ 或 🚀 当标题修饰
  - ✗ 卡片中间一个彩色渐变发光圆球作为氛围背景
  - ✗ 标题用纯无衬线 + 100% 蓝色 + box-shadow
  - ✗ 把段落摘要原文 80+ 字塞进卡片
  - ✗ 出现两种以上 accent 色（蓝 + 橙 / 蓝 + 黄）
  - ✗ 数字卡的数字用无衬线（必须 serif）
  - ✗ 出现 border-radius:16px 的圆角卡片浮层
  - ✗ "Source: …" / "AI Generated" / 节目水印 等小字
  - ✗ 某个文字行揭示后又消失再揭示
  - ✗ 柱状图柱子之间或与轴标签发生重叠
  - ✗ 用 Math.sin(frame/10) 驱动 opacity 制造闪烁
  - ✗ 引入 recharts / chart.js / d3 / canvas

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
version: 2
user: |-
  你是一名资深中文文生图提示词工程师，服务于一档播客 / 口播节目的"段落图片卡"。
  请基于下方节目级与段落级信息，为当前段落生成 1 段可直接喂给文生图模型的**简体中文**提示词。

  ===== 节目级上下文 =====
  整期创作提示词：{{globalPrompt}}
  项目统一风格要求：{{projectStylePrompt}}
  节目级总结：{{programSummary}}
  节目关键词：{{keywords}}

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
version: 1
user: |-
  你是 AI 视频导演。基于以下 segment 信息，输出一段适合直接喂给文生视频模型的英文 prompt：

  标题：{{segmentTitle}}
  摘要：{{segmentSummary}}
  关键句：{{segmentExcerpt}}
  项目统一风格要求：{{projectStylePrompt}}
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
