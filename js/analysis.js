/* 错题分析：默认使用本地规则（离线、0 元）；可在设置中改用 OpenAI 兼容接口。 */

export const CAUSE_TAGS = ['知识缺失', '审题偏差', '方法不当', '粗心失误', '时间不足', '心态波动', '信息不足'];
const ALLOWED_CAUSES = new Set(CAUSE_TAGS);

const KP_RULES = [
  // 职测 · 常识判断
  { subject: '职测', kp: '政治常识', kw: ['政治', '时政', '党', '人大', '政协', '新时代', '全会', '政策', '政府'] },
  { subject: '职测', kp: '法律常识', kw: ['法律', '宪法', '民法', '刑法', '行政法', '劳动合同', '侵权', '诉讼', '法规'] },
  { subject: '职测', kp: '经济常识', kw: ['经济', '市场', '供求', '财政', '货币', '税率', 'GDP', '通货膨胀', '价格'] },
  { subject: '职测', kp: '科技常识', kw: ['科技', '物理', '化学', '生物', '天文', '航天', '能源', '材料', '生活常识'] },
  { subject: '职测', kp: '人文历史', kw: ['历史', '文学', '诗词', '古代', '朝代', '文化', '人物', '名著'] },
  { subject: '职测', kp: '地理国情', kw: ['地理', '气候', '地形', '河流', '山脉', '省份', '国情', '人口'] },
  { subject: '职测', kp: '教育法律法规', kw: ['教育法', '教师法', '未成年人', '义务教育', '师德', '学生伤害'] },

  // 职测 · 言语理解与表达
  { subject: '职测', kp: '逻辑填空', kw: ['逻辑填空', '成语', '实词', '虚词', '语境', '填入', '词语'] },
  { subject: '职测', kp: '片段阅读', kw: ['主旨', '意图', '细节', '标题', '接语', '片段', '文段', '作者'] },
  { subject: '职测', kp: '语句表达', kw: ['语句排序', '排序', '衔接', '病句', '语句表达', '下文'] },
  { subject: '职测', kp: '成语辨析', kw: ['成语辨析', '成语'] },

  // 职测 · 数量分析
  { subject: '职测', kp: '数字推理', kw: ['数字推理', '数列', '找规律'] },
  { subject: '职测', kp: '数学运算', kw: ['工程', '行程', '利润', '浓度', '年龄', '容斥', '排列组合', '概率', '几何', '植树', '鸡兔同笼', '数学运算'] },
  { subject: '职测', kp: '资料分析', kw: ['资料分析', '同比', '环比', '百分点', '基期', '现期', '材料题'] },
  { subject: '职测', kp: '增长率', kw: ['增长率', '增速', '增幅', '增长量', '同比增长', '增长'] },
  { subject: '职测', kp: '比重', kw: ['比重', '占比', '比例'] },
  { subject: '职测', kp: '平均数', kw: ['平均数', '均值'] },
  { subject: '职测', kp: '倍数', kw: ['倍数', '几倍'] },

  // 职测 · 判断推理
  { subject: '职测', kp: '图形推理', kw: ['图形', '对称', '笔画', '折叠', '截面', '九宫格', '立体'] },
  { subject: '职测', kp: '定义判断', kw: ['定义判断', '定义'] },
  { subject: '职测', kp: '类比推理', kw: ['类比', '近义', '反义', '种属', '对应关系'] },
  { subject: '职测', kp: '逻辑判断', kw: ['逻辑判断', '削弱', '加强', '前提', '结论', '真假', '翻译推理', '矛盾', '反对'] },

  // 职测 · 策略选择
  { subject: '职测', kp: '课堂管理', kw: ['课堂', '纪律', '教学秩序', '上课'] },
  { subject: '职测', kp: '家校沟通', kw: ['家长', '家校', '家访', '沟通'] },
  { subject: '职测', kp: '学生心理', kw: ['学生', '心理', '情绪', '自卑', '叛逆', '同伴'] },
  { subject: '职测', kp: '突发事件', kw: ['突发', '受伤', '冲突', '安全事故', '晕倒'] },
  { subject: '职测', kp: '教师职业道德', kw: ['师德', '职业道德', '公平', '尊重', '班主任'] },

  // 综应 · D 类
  { subject: '综应', kp: '教育理念', kw: ['教育理念', '素质教育', '以人为本', '全面发展', '因材施教', '学生观', '教师观'] },
  { subject: '综应', kp: '教育心理学', kw: ['心理学', '学习动机', '认知', '记忆', '迁移', '强化', '皮亚杰', '维果茨基', '马斯洛'] },
  { subject: '综应', kp: '教师职业道德', kw: ['师德', '职业道德', '关爱学生', '为人师表', '教书育人'] },
  { subject: '综应', kp: '教育法律法规', kw: ['教育法', '教师法', '未成年人', '义务教育', '学生伤害', '依法执教'] },
  { subject: '综应', kp: '教育评价', kw: ['评价', '考试', '作业', '双减', '形成性', '终结性'] },
  { subject: '综应', kp: '班级管理', kw: ['班级', '班集体', '班主任', '班干部', '常规管理', '纪律'] },
  { subject: '综应', kp: '学生发展', kw: ['学生发展', '身心', '品德', '个性', '青春期', '同伴'] },
  { subject: '综应', kp: '教学设计', kw: ['教学设计', '教案', '教学目标', '重难点', '教学过程', '板书'] },
  { subject: '综应', kp: '家校合作', kw: ['家长', '家校', '家访', '家长会', '沟通'] },
  { subject: '综应', kp: '心理健康', kw: ['心理', '情绪', '焦虑', '抑郁', '自卑', '人际'] },
  { subject: '综应', kp: '主题班会', kw: ['班会', '主题活动', '德育活动'] },
  { subject: '综应', kp: '教学活动', kw: ['活动方案', '教学活动', '综合实践'] },
  { subject: '综应', kp: '教育实践', kw: ['教育实践', '实践'] },

  // 综应题型
  { subject: '综应', kp: '辨析题', kw: ['辨析'] },
  { subject: '综应', kp: '案例分析', kw: ['案例分析', '案例'] },
  { subject: '综应', kp: '教育方案设计', kw: ['方案设计', '活动设计', '教育方案'] }
];

const MODULE_FALLBACK_KP = {
  常识判断: ['常识判断'],
  言语理解与表达: ['言语理解与表达'],
  数量分析: ['数量分析'],
  判断推理: ['判断推理'],
  策略选择: ['策略选择'],
  辨析题: ['教育理念'],
  案例分析: ['案例分析'],
  教育方案设计: ['教育方案设计'],
  其他: ['待补充考点']
};

const MODULE_DEFAULT_CAUSES = {
  常识判断: ['知识缺失'],
  言语理解与表达: ['审题偏差', '方法不当'],
  数量分析: ['方法不当', '粗心失误'],
  判断推理: ['方法不当', '审题偏差'],
  策略选择: ['审题偏差', '知识缺失'],
  辨析题: ['知识缺失', '方法不当'],
  案例分析: ['方法不当', '知识缺失'],
  教育方案设计: ['方法不当', '知识缺失'],
  其他: ['知识缺失']
};

const REFLECTION_RULES = [
  { cause: '知识缺失', phrases: ['不会做', '不会', '没学过', '没背过', '忘记', '记不清', '没印象', '知识点不熟', '概念不清', '没记住'] },
  { cause: '审题偏差', phrases: ['看错', '没看清', '看漏', '审题', '没注意', '忽略', '问的是', '选错', '理解错', '单位看错', '主体看错', '范围看错'] },
  { cause: '方法不当', phrases: ['方法不对', '思路', '公式用错', '硬算', '不会列式', '步骤', '答题结构', '要点没写全', '结构不全', '没思路'] },
  { cause: '粗心失误', phrases: ['粗心', '算错', '抄错', '笔误', '计算失误', '马虎', '填错', '涂错'] },
  { cause: '时间不足', phrases: ['时间不够', '来不及', '超时', '没做完', '做太慢', '时间紧'] },
  { cause: '心态波动', phrases: ['紧张', '慌', '焦虑', '心态', '压力大', '发挥失常'] }
];

const CAUSE_ADVICE = {
  知识缺失: '先回看相关概念、公式和典型例题，再做 2—3 道同类题确认。',
  审题偏差: '动笔前圈出提问对象、范围、单位和限制条件，避免凭印象作答。',
  方法不当: '复盘标准解题步骤，标出自己思路偏离的环节，再独立重做一遍。',
  粗心失误: '保留草稿，检查单位、选项和计算过程，把检查步骤固定下来。',
  时间不足: '按题型限时训练，先易后难，单题超时就标记跳过。',
  心态波动: '用固定的开题流程稳定节奏，先做熟题建立信心。',
  信息不足: '补全题干、答案或自评错因后，点「重新分析」会得到更准确的判断。'
};

const SUBJECT_NAMES = ['职测', '综应'];

function norm(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function uniq(list) {
  return [...new Set(list.map((x) => norm(x)).filter(Boolean))];
}

export function splitKnowledgePoints(text) {
  if (Array.isArray(text)) return uniq(text);
  return uniq(String(text || '').split(/[,，、;；\n]/));
}

export function detectKnowledgePoints(question) {
  const subject = SUBJECT_NAMES.includes(question.subject) ? question.subject : '职测';
  const userPoints = splitKnowledgePoints(question.knowledgePoints || []);
  const haystack = norm([question.stem, question.source, userPoints.join(' ')].join(' '));
  const scored = [];

  for (const rule of KP_RULES) {
    if (rule.subject !== subject) continue;
    let score = 0;
    for (const keyword of rule.kw) {
      if (haystack.includes(keyword)) score += keyword.length >= 4 ? 3 : 2;
    }
    if (score > 0) scored.push({ kp: rule.kp, score });
  }

  scored.sort((a, b) => b.score - a.score || a.kp.localeCompare(b.kp, 'zh'));
  const detected = scored.slice(0, 5).map((item) => item.kp);
  const fallback = MODULE_FALLBACK_KP[question.module] || ['待补充考点'];
  const combined = uniq([...userPoints, ...detected]);
  return (combined.length ? combined : uniq(fallback)).slice(0, 7);
}

function detectCauses(question) {
  const selfCauses = uniq(question.selfCauseTags || []).filter((x) => ALLOWED_CAUSES.has(x) && x !== '信息不足');
  const scores = new Map();
  const add = (cause, n) => scores.set(cause, (scores.get(cause) || 0) + n);

  selfCauses.forEach((cause) => add(cause, 5));

  const haystack = norm([question.stem, question.myAnswer, question.note, question.source].join(' '));
  for (const rule of REFLECTION_RULES) {
    for (const phrase of rule.phrases) {
      if (haystack.includes(phrase)) add(rule.cause, 3);
    }
  }

  const hasMy = norm(question.myAnswer).length > 0;
  const hasCorrect = norm(question.correctAnswer).length > 0;
  if (hasMy && hasCorrect && norm(question.myAnswer) !== norm(question.correctAnswer)) {
    add('审题偏差', 1);
    add('方法不当', 1);
  }
  if (!hasMy && hasCorrect) {
    add('知识缺失', 1);
    add('时间不足', 1);
  }

  const defaultCauses = MODULE_DEFAULT_CAUSES[question.module] || ['知识缺失'];
  defaultCauses.forEach((cause, index) => add(cause, Math.max(1, 2 - index)));

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || CAUSE_TAGS.indexOf(a[0]) - CAUSE_TAGS.indexOf(b[0]))
    .map(([cause]) => cause);

  // 自评原因优先展示，再补充规则判断，最多 3 个。
  return uniq([...selfCauses, ...ranked]).slice(0, 3);
}

/**
 * 本地规则分析：不联网、不调用任何付费服务。
 * @param {object} question
 * @returns {object} analysis
 */
export function analyzeLocal(question) {
  const knowledgePoints = detectKnowledgePoints(question);
  const textLength = norm([question.stem, question.myAnswer, question.correctAnswer, question.note].join('')).length;
  const hasSignal = textLength >= 8 || (question.selfCauseTags || []).length > 0;
  const hasImage = (question.attachments || []).length > 0;
  const causes = detectCauses(question);

  let causeTags = causes;
  let reason;
  let advice;

  if (!hasSignal) {
    causeTags = ['信息不足'];
    reason = hasImage
      ? '题目图片已保存，但 V1 不识别图片文字，暂时无法判断具体错因。补全题干、答案或自评错因后重新分析会更准确。'
      : '当前题目文字信息较少，暂时无法判断具体错因。可以先保存，补全题干、答案或自评错因后再重新分析。';
    advice = CAUSE_ADVICE['信息不足'];
  } else {
    const top = causeTags[0] || '知识缺失';
    const kpText = knowledgePoints.slice(0, 3).join('、');
    const selfPrefix = (question.selfCauseTags || []).length ? '结合你的自评，' : '';
    reason = `${selfPrefix}本题主要指向「${causeTags.join(' + ')}」；涉及考点：${kpText}。${CAUSE_ADVICE[top]}`;
    advice = `复盘动作：用 3 分钟口述「${kpText}」的解题步骤，再做 1 道同类题验证。`;
    if (question.subject === '综应') {
      advice = `复盘动作：对照参考答案拆分「${kpText}」的答题要点，检查是否漏点、层次是否清楚。`;
    }
  }

  return {
    knowledgePoints,
    causeTags,
    reason: reason.slice(0, 240),
    advice,
    provider: 'local',
    createdAt: new Date().toISOString()
  };
}

function normalizeCause(value) {
  const text = norm(value);
  if (ALLOWED_CAUSES.has(text)) return text;
  if (/知识|考点|概念/.test(text)) return '知识缺失';
  if (/审题|看错|理解/.test(text)) return '审题偏差';
  if (/方法|思路|技巧/.test(text)) return '方法不当';
  if (/粗心|计算|抄写/.test(text)) return '粗心失误';
  if (/时间/.test(text)) return '时间不足';
  if (/心态|紧张|焦虑/.test(text)) return '心态波动';
  return '';
}

function parseJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI 返回为空');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI 返回不是有效 JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export function apiEndpoint(baseUrl) {
  const base = norm(baseUrl).replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function buildPrompt(question) {
  return [
    `科目：${question.subject}`,
    `模块：${question.module}`,
    `题目：${question.stem || '（仅图片，无文字）'}`,
    `我的答案：${question.myAnswer || '（未填写）'}`,
    `正确答案：${question.correctAnswer || '（未填写）'}`,
    `自评错因：${(question.selfCauseTags || []).join('、') || '（未选择）'}`,
    `我的考点标注：${splitKnowledgePoints(question.knowledgePoints || []).join('、') || '（未填写）'}`,
    '',
    '请分析这道事业单位 D 类错题，只输出一个 JSON 对象，不要 Markdown，不要额外解释。格式：',
    '{"knowledgePoints":["考点1","考点2"],"causeTags":["知识缺失"],"reason":"120字以内的简短原因","advice":"一句可执行的复盘建议"}',
    `causeTags 只能从这些值里选：${CAUSE_TAGS.filter((x) => x !== '信息不足').join('、')}。`
  ].join('\n');
}

/**
 * 联网分析：OpenAI 兼容 Chat Completions（可接 Ollama / 其他兼容服务）。
 * 失败时抛出错误，由调用方回退到本地规则。
 */
export async function analyzeRemote(question, api) {
  const endpoint = apiEndpoint(api.baseUrl);
  if (!endpoint) throw new Error('尚未配置 API 地址');
  if (!api.model) throw new Error('尚未配置模型名称');
  if (!navigator.onLine) throw new Error('当前处于离线状态');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (api.apiKey) headers.Authorization = `Bearer ${api.apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: api.model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content: '你是事业单位 D 类考试（职测+综应）的错题分析助手。判断错因要克制、具体，只输出合法 JSON。'
          },
          { role: 'user', content: buildPrompt(question) }
        ]
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`接口返回 ${response.status}${body ? `：${body.slice(0, 120)}` : ''}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = parseJsonObject(content);
    const knowledgePoints = uniq(Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : []).slice(0, 7);
    const causeTags = uniq(
      (Array.isArray(parsed.causeTags) ? parsed.causeTags : []).map(normalizeCause)
    ).filter(Boolean).slice(0, 4);
    const reason = norm(parsed.reason).slice(0, 240);
    if (!reason) throw new Error('AI 未返回原因分析');
    return {
      knowledgePoints: knowledgePoints.length ? knowledgePoints : detectKnowledgePoints(question),
      causeTags: causeTags.length ? causeTags : ['知识缺失'],
      reason,
      advice: norm(parsed.advice).slice(0, 160),
      provider: 'api',
      model: api.model,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('联网分析超时（30 秒）');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function mergeKnowledgePoints(a, b) {
  return uniq([...(a || []), ...(b || [])]).slice(0, 10);
}
