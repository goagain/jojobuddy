import type { MasterResume } from "./schema";

export const SAMPLE_MASTER_RESUME: MasterResume = {
  identity: {
    name: "示例候选人",
    email: "you@example.com",
    phone: "+86 138-0000-0000",
    location: "上海",
    headline: "全栈工程师 / 偏后端与平台",
    summary:
      "5 年互联网研发经验，擅长把业务需求拆成可落地的系统，用可观测性和自动化把交付质量拉稳。熟悉高并发接口、数据管道与内部工具建设。",
    links: [
      { label: "GitHub", url: "https://github.com/you" },
      { label: "LinkedIn", url: "https://linkedin.com/in/you" },
    ],
  },
  skills: [
    {
      category: "Languages",
      items: ["TypeScript", "Python", "Go", "SQL"],
    },
    {
      category: "Backend",
      items: ["Node.js", "FastAPI", "PostgreSQL", "Redis", "Kafka"],
    },
    {
      category: "Frontend",
      items: ["React", "Next.js", "Tailwind CSS"],
    },
    {
      category: "Infra",
      items: ["Docker", "Kubernetes", "AWS", "CI/CD", "OpenTelemetry"],
    },
  ],
  experiences: [
    {
      id: "exp-platform",
      company: "北极星科技",
      title: "高级软件工程师",
      location: "上海",
      startDate: "2023-03",
      endDate: "present",
      businessContext:
        "ToB 数据平台，服务增长团队做实时漏斗分析与实验配置。核心挑战是查询延迟、权限模型和多人协作配置冲突。",
      techStack: [
        "TypeScript",
        "Next.js",
        "FastAPI",
        "PostgreSQL",
        "Redis",
        "Kafka",
        "Kubernetes",
      ],
      senioritySignals: [
        "主导跨 3 个团队的技术方案",
        "带 2 名初级工程师",
        "对核心路径 SLA 负责",
      ],
      bullets: [
        {
          id: "exp-platform-1",
          raw: "把实时漏斗查询 P95 从 4.2s 降到 780ms",
          situation: "增长团队的实时漏斗在高峰期经常超时，分析师不敢用。",
          task: "在不改产品语义的前提下把核心查询打到 1s 内。",
          action:
            "拆冷热数据、给高频维度加物化视图，并用 Redis 缓存实验配置快照。",
          result: "P95 从 4.2s 降到 780ms，超时率从 9% 降到 0.4%。",
          impactMetrics: [
            { name: "查询 P95", value: 81, unit: "%", direction: "decrease" },
            { name: "超时率", value: 8.6, unit: "pp", direction: "decrease" },
          ],
          keywords: ["低延迟", "物化视图", "缓存", "实时分析"],
          tags: ["backend", "performance", "data"],
        },
        {
          id: "exp-platform-2",
          raw: "设计多租户权限模型，减少错误授权事故",
          situation: "客户数增加后，运营误配权限导致两次数据串租。",
          task: "重新设计 RBAC + 行级隔离，并让配置可审计。",
          action:
            "引入租户作用域中间件、权限变更审计日志，以及配置发布前的 dry-run。",
          result: "上线后 12 个月零串租事故，权限配置工单处理时间下降 40%。",
          impactMetrics: [
            { name: "串租事故", value: 0, unit: "count", direction: "absolute" },
            { name: "工单处理时长", value: 40, unit: "%", direction: "decrease" },
          ],
          keywords: ["多租户", "RBAC", "审计", "安全"],
          tags: ["backend", "security", "collaboration"],
        },
        {
          id: "exp-platform-3",
          raw: "搭建实验配置协作流，减少发布冲突",
          situation: "产品、数据、研发同时改实验配置，经常互相覆盖。",
          task: "给配置加上版本、评审和一键回滚。",
          action:
            "做了配置 diff、审批流和 Kafka 驱动的配置广播，前端用乐观锁提示冲突。",
          result: "错误发布从每周 3 次降到每月不足 1 次，实验上线周期从 2 天压到 4 小时。",
          impactMetrics: [
            { name: "错误发布", value: 85, unit: "%", direction: "decrease" },
            { name: "上线周期", value: 79, unit: "%", direction: "decrease" },
          ],
          keywords: ["实验平台", "协作", "发布", "Kafka"],
          tags: ["fullstack", "platform", "collaboration"],
        },
      ],
    },
    {
      id: "exp-growth",
      company: "流光互娱",
      title: "软件工程师",
      location: "杭州",
      startDate: "2020-07",
      endDate: "2023-02",
      businessContext:
        "移动游戏运营后台，覆盖活动配置、支付对账和客服工具。业务峰值出现在版本日和节日活动。",
      techStack: ["Python", "Django", "MySQL", "Redis", "Celery", "React"],
      senioritySignals: ["独立负责活动配置服务", "版本日值班"],
      bullets: [
        {
          id: "exp-growth-1",
          raw: "把活动配置从手工 SQL 改成可视化发布",
          situation: "运营靠研发写 SQL 配活动，版本日经常配错。",
          task: "做一个可回滚的活动配置后台。",
          action:
            "用 Django + React 做配置编辑器，校验规则写进 schema，发布走灰度开关。",
          result: "活动上线从平均 6 小时降到 40 分钟，版本日配置事故下降 70%。",
          impactMetrics: [
            { name: "上线时长", value: 89, unit: "%", direction: "decrease" },
            { name: "配置事故", value: 70, unit: "%", direction: "decrease" },
          ],
          keywords: ["配置中心", "灰度", "后台", "运营效率"],
          tags: ["fullstack", "internal-tools"],
        },
        {
          id: "exp-growth-2",
          raw: "重建支付对账任务，把漏单排查从半天压到分钟级",
          situation: "支付渠道对账靠人工表格，漏单要翻日志。",
          task: "自动化三方对账并给出差异原因。",
          action:
            "Celery 定时拉取渠道账单，按订单号对账，差异自动打标并推送到客服工具。",
          result: "日对账从 4 小时降到 12 分钟，漏单发现时间从 T+1 变成 15 分钟内。",
          impactMetrics: [
            { name: "对账时长", value: 95, unit: "%", direction: "decrease" },
            { name: "漏单发现时延", value: 15, unit: "min", direction: "absolute" },
          ],
          keywords: ["对账", "异步任务", "支付", "可靠性"],
          tags: ["backend", "data", "reliability"],
        },
      ],
    },
  ],
  projects: [
    {
      id: "proj-observability",
      name: "内部可观测性套件",
      role: "发起人",
      summary:
        "给中台服务补齐 tracing / 指标 / 错误预算看板，减少排障时在日志里盲搜。",
      techStack: ["OpenTelemetry", "Grafana", "Prometheus", "Python"],
      bullets: [
        {
          id: "proj-obs-1",
          raw: "统一接入 OpenTelemetry，核心服务排障时间下降 55%",
          situation: "出问题要同时翻三套日志和两套监控。",
          task: "统一 trace id，并把黄金指标接到同一张板上。",
          action:
            "封装 OTel SDK 起步模板，强制 HTTP / DB / 队列中间件注入，Grafana 做服务红图。",
          result: "P1 故障平均定位时间从 48 分钟降到 22 分钟。",
          impactMetrics: [
            { name: "故障定位时长", value: 54, unit: "%", direction: "decrease" },
          ],
          keywords: ["可观测性", "OpenTelemetry", "SRE"],
          tags: ["infra", "reliability"],
        },
      ],
    },
  ],
  education: [
    {
      school: "示例大学",
      degree: "本科",
      field: "计算机科学",
      startDate: "2016-09",
      endDate: "2020-06",
      highlights: ["数据结构与分布式系统方向"],
    },
  ],
  certifications: [
    { name: "AWS Certified Developer – Associate", issuer: "Amazon", date: "2024" },
  ],
  languages: [
    { name: "中文", level: "母语" },
    { name: "English", level: "专业工作能力" },
  ],
  softSkills: ["跨团队协作", "技术方案评审", "带教初级工程师", "版本日值班与事故复盘"],
};
