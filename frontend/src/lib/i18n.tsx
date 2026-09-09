"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { API_BASE } from "./api";
import { onDataChanged } from "./data-events";

export type AppLang = "zh-CN" | "en-US";

export function resolveAppLang(value: string | undefined | null): AppLang | null {
  if (value === "zh" || value === "zh-CN") {
    return "zh-CN";
  }
  if (value === "en" || value === "en-US") {
    return "en-US";
  }
  return null;
}

type LangPair = Record<AppLang, string>;

const DICT: Record<string, LangPair> = {
  pageTitle: { "zh-CN": "设置", "en-US": "Settings" },
  pageDesc: {
    "zh-CN": "管理账户、安全与系统偏好",
    "en-US": "Manage account, security and system preferences",
  },
  secAccount: { "zh-CN": "账户设置", "en-US": "Account" },
  secSecurity: { "zh-CN": "安全设置", "en-US": "Security" },
  secSystem: { "zh-CN": "系统设置", "en-US": "System" },
  secAi: { "zh-CN": "AI 配置", "en-US": "AI configuration" },
  aiHint: {
    "zh-CN": "可配置多家 AI 服务，仅一个作为系统使用",
    "en-US": "Configure multiple AI providers, only one acts as the system AI",
  },
  aiProviderName: {
    "zh-CN": "{name}",
    "en-US": "{name}",
  },
  aiUseAsSystem: { "zh-CN": "设为系统使用", "en-US": "Use as system AI" },
  aiInUse: { "zh-CN": "系统使用中", "en-US": "In use" },
  aiNotConfigured: {
    "zh-CN": "未配置服务地址与密钥",
    "en-US": "No endpoint or key configured",
  },
  aiKeyConfigured: { "zh-CN": "密钥已配置", "en-US": "Key configured" },
  aiKeyNotSet: { "zh-CN": "未配置密钥", "en-US": "Key not set" },
  aiEditTitle: { "zh-CN": "编辑配置", "en-US": "Edit configuration" },
  aiBaseUrlLabel: { "zh-CN": "服务地址", "en-US": "API endpoint" },
  aiBaseUrlPlaceholder: {
    "zh-CN": "https://api.example.com/v1",
    "en-US": "https://api.example.com/v1",
  },
  aiApiKeyLabel: { "zh-CN": "API 密钥", "en-US": "API key" },
  aiApiKeyPlaceholder: {
    "zh-CN": "请输入密钥",
    "en-US": "Enter the API key",
  },
  aiSave: { "zh-CN": "保存配置", "en-US": "Save" },
  aiConfigure: { "zh-CN": "配置", "en-US": "Configure" },
  aiActiveChanged: {
    "zh-CN": "系统使用 AI 已切换",
    "en-US": "System AI switched",
  },
  aiConfiguredSuccess: {
    "zh-CN": "AI 配置已保存",
    "en-US": "AI configuration saved",
  },
  aiTest: { "zh-CN": "测试", "en-US": "Test" },
  aiTesting: { "zh-CN": "测试中", "en-US": "Testing" },
  aiTestSuccess: {
    "zh-CN": "连接成功，密钥有效",
    "en-US": "Connected, key is valid",
  },
  aiTestNotConfigured: {
    "zh-CN": "请先配置服务地址与密钥",
    "en-US": "Configure endpoint and key first",
  },
  aiTestUnreachable: {
    "zh-CN": "无法连接服务商",
    "en-US": "Provider unreachable",
  },
  aiTestUnauthorized: {
    "zh-CN": "服务可达，但 API 密钥无效",
    "en-US": "Reachable but the API key is invalid",
  },
  aiTestHttpError: {
    "zh-CN": "服务返回错误（HTTP {status}）",
    "en-US": "Provider returned an error (HTTP {status})",
  },
  aiTestTimedOut: { "zh-CN": "连接超时", "en-US": "Connection timed out" },
  rowUsername: { "zh-CN": "用户名", "en-US": "Username" },
  rowUsernameDesc: {
    "zh-CN": "点击修改当前登录用户名",
    "en-US": "Click to change your username",
  },
  rowPassword: { "zh-CN": "登录密码", "en-US": "Password" },
  rowPasswordDesc: {
    "zh-CN": "点击展开修改登录密码",
    "en-US": "Click to change password",
  },
  editorUsernameTitle: { "zh-CN": "修改用户名", "en-US": "Change username" },
  labelNewUsername: { "zh-CN": "新用户名", "en-US": "New username" },
  hintUsername: {
    "zh-CN": "用户名与登录相关，修改后请使用新用户名登录",
    "en-US": "Username is used for sign-in; sign in with the new name after change",
  },
  btnCancel: { "zh-CN": "取消", "en-US": "Cancel" },
  btnSave: { "zh-CN": "保存", "en-US": "Save" },
  btnConfirm: { "zh-CN": "确认修改", "en-US": "Confirm" },
  rowAccountStatus: { "zh-CN": "账户状态", "en-US": "Account status" },
  rowAccountStatusDesc: {
    "zh-CN": "账户当前使用状态",
    "en-US": "Current status of the account",
  },
  statusOk: { "zh-CN": "正常", "en-US": "Active" },
  editorPasswordTitle: { "zh-CN": "修改密码", "en-US": "Change password" },
  labelOldPassword: { "zh-CN": "原密码", "en-US": "Current password" },
  labelNewPassword: { "zh-CN": "修改密码", "en-US": "New password" },
  labelConfirmPassword: {
    "zh-CN": "确认修改密码",
    "en-US": "Confirm new password",
  },
  hintPassword: {
    "zh-CN": "新密码长度需为 6-128 位",
    "en-US": "New password must be 6-128 characters",
  },
  rowNotify: { "zh-CN": "登录安全提醒", "en-US": "Login alerts" },
  rowNotifyDesc: {
    "zh-CN": "登录后向信息箱写入登录时间、IP 与设备信息",
    "en-US": "Record login time, IP and device into the inbox after sign-in",
  },
  rowLanguage: { "zh-CN": "界面语言", "en-US": "Language" },
  rowLanguageDesc: {
    "zh-CN": "设置界面显示语言",
    "en-US": "Language of the interface",
  },
  rowAssistant: { "zh-CN": "助手提示", "en-US": "Assistant hint" },
  rowAssistantDesc: {
    "zh-CN": "在首页底部显示内容来源提示",
    "en-US": "Show the content source hint at the bottom of home",
  },
  rowTheme: { "zh-CN": "主题", "en-US": "Theme" },
  rowThemeDesc: {
    "zh-CN": "当前跟随浅色冷静主题",
    "en-US": "Currently following the light calm theme",
  },
  themeLight: { "zh-CN": "浅色", "en-US": "Light" },
  themeDark: { "zh-CN": "深色", "en-US": "Dark" },
  rowVersion: { "zh-CN": "版本信息", "en-US": "Version" },
  rowVersionDesc: {
    "zh-CN": "PipeMind 地下管网数字化管理平台",
    "en-US": "PipeMind underground pipeline digital management platform",
  },
  secDevices: { "zh-CN": "登录设备", "en-US": "Devices" },
  secTokens: { "zh-CN": "令牌管理", "en-US": "Token management" },
  devEmpty: { "zh-CN": "暂无会话记录", "en-US": "No active sessions" },
  devEmptyDesc: {
    "zh-CN": "本账号当前没有有效会话",
    "en-US": "This account has no active session",
  },
  devCurrent: { "zh-CN": "当前设备", "en-US": "This device" },
  actRefresh: { "zh-CN": "刷新", "en-US": "Refresh" },
  devUnknown: { "zh-CN": "未知设备", "en-US": "Unknown device" },
  actSignOut: { "zh-CN": "下线", "en-US": "Sign out" },
  rowToken: { "zh-CN": "刷新令牌", "en-US": "Refresh token" },
  rowTokenDesc: {
    "zh-CN": "会话续期时自动轮换，旧令牌立即失效",
    "en-US": "Rotated on each renewal; the old token is revoked instantly",
  },
  tokenEnabled: { "zh-CN": "自动轮换", "en-US": "Auto rotation" },
  rowTokenExpiry: {
    "zh-CN": "当前令牌有效期",
    "en-US": "Current token expires",
  },
  rowTokenExpiryDesc: {
    "zh-CN": "本次会话刷新令牌的到期时间",
    "en-US": "Expiry of the refresh token in this session",
  },
  rowOtherTokens: { "zh-CN": "其他设备令牌", "en-US": "Other devices" },
  actSignOutAll: { "zh-CN": "全部下线", "en-US": "Sign out all" },
  logout: { "zh-CN": "退出登录", "en-US": "Log out" },
  help: { "zh-CN": "帮助", "en-US": "Help" },
  guideAccess: { "zh-CN": "引导式访问", "en-US": "Guided tour" },
  guideSkip: { "zh-CN": "跳过", "en-US": "Skip" },
  guidePrev: { "zh-CN": "上一步", "en-US": "Back" },
  guideNext: { "zh-CN": "下一步", "en-US": "Next" },
  guideDone: { "zh-CN": "完成", "en-US": "Finish" },
  guideActive: {
    "zh-CN": "引导式操作",
    "en-US": "Guided action",
  },
  guideCompleteNow: { "zh-CN": "我已按指引完成", "en-US": "Done as guided" },
  guideDismiss: { "zh-CN": "忽略", "en-US": "Dismiss" },
  guideActionAccountChangeUsername: {
    "zh-CN": "修改用户名",
    "en-US": "Change username",
  },
  guideActionAccountChangePassword: {
    "zh-CN": "修改密码",
    "en-US": "Change password",
  },
  guideActionSessionsRevoke: {
    "zh-CN": "下线设备",
    "en-US": "Sign out device",
  },
  guideActionSessionsRevokeOthers: {
    "zh-CN": "下线其他设备",
    "en-US": "Sign out other devices",
  },
  guideActionAiSetActive: {
    "zh-CN": "切换系统 AI",
    "en-US": "Switch system AI",
  },
  guideActionAiSave: {
    "zh-CN": "保存 AI 配置",
    "en-US": "Save AI configuration",
  },
  guideActionDataFileShared: {
    "zh-CN": "调整数据共享",
    "en-US": "Adjust data sharing",
  },
  guideActionDataFileRemove: {
    "zh-CN": "删除数据文件",
    "en-US": "Remove data file",
  },
  guideStepOpenSettings: {
    "zh-CN": "打开左侧“设置”页",
    "en-US": "Open Settings from the left menu",
  },
  guideStepUsername1: {
    "zh-CN": "在“账户设置”中点击“用户名”行",
    "en-US": "In Account, click the Username row",
  },
  guideStepUsername2: {
    "zh-CN": "输入 {value} 并点击保存",
    "en-US": "Enter {value} and click Save",
  },
  guideStepPassword1: {
    "zh-CN": "在“安全设置”中点击“登录密码”行",
    "en-US": "In Security, click the Password row",
  },
  guideStepPassword2: {
    "zh-CN": "填写原密码与新密码 {value} 并确认修改",
    "en-US": "Fill the current and new password {value}, then confirm",
  },
  guideStepDevice1: {
    "zh-CN": "在“登录设备”栏目找到目标设备",
    "en-US": "In Devices, find the target device",
  },
  guideStepDevice2: {
    "zh-CN": "点击该设备对应的“下线”按钮",
    "en-US": "Click Sign out on that device",
  },
  guideStepDevicesAll1: {
    "zh-CN": "在“登录设备”栏目点击“全部下线”",
    "en-US": "In Devices, click Sign out all",
  },
  guideStepAiActive1: {
    "zh-CN": "在“AI 配置”栏目找到 {provider}",
    "en-US": "In AI configuration, find {provider}",
  },
  guideStepAiActive2: {
    "zh-CN": "点击该提供方的“设为系统使用”",
    "en-US": "Click Use as system AI on that provider",
  },
  guideStepAiSave1: {
    "zh-CN": "在“AI 配置”栏目点击 {provider} 的“配置”",
    "en-US": "In AI configuration, click Configure on {provider}",
  },
  guideStepAiSave2: {
    "zh-CN": "填写服务地址 / 密钥并保存配置",
    "en-US": "Fill the endpoint / key and save",
  },
  guideLoading: {
    "zh-CN": "正在获取引导进度…",
    "en-US": "Loading guided steps…",
  },
  gHomeThinkingTitle: {
    "zh-CN": "深度思考",
    "en-US": "Deep thinking",
  },
  gHomeThinkingBody: {
    "zh-CN": "点击开启后，Agent 会先推理再作答，适合复杂问题。",
    "en-US": "When enabled, the agent reasons before answering, great for complex questions.",
  },
  gHomeSearchTitle: { "zh-CN": "联网搜索", "en-US": "Web search" },
  gHomeSearchBody: {
    "zh-CN": "开启后可结合实时网络信息回答问题。",
    "en-US": "When enabled, answers can include live web information.",
  },
  gHomeInputTitle: {
    "zh-CN": "对话输入框",
    "en-US": "Chat input",
  },
  gHomeInputBody: {
    "zh-CN": "输入问题后按 Enter 发送，Shift + Enter 可换行。",
    "en-US": "Type a question and press Enter to send; Shift + Enter for a new line.",
  },
  gHomeSendTitle: { "zh-CN": "发送消息", "en-US": "Send message" },
  gHomeSendBody: {
    "zh-CN": "输入内容后点击此处即可发送。",
    "en-US": "Click to send your message.",
  },
  gFlowCanvasTitle: {
    "zh-CN": "无限画布",
    "en-US": "Infinite canvas",
  },
  gFlowCanvasBody: {
    "zh-CN": "拖拽可平移、滚轮缩放；双击或右键空白处弹出“开始菜单”，自由新建节点。",
    "en-US": "Drag to pan, scroll to zoom; double-click or right-click the canvas to open the Start menu and create nodes freely.",
  },
  gFlowToolsTitle: {
    "zh-CN": "视图工具",
    "en-US": "View tools",
  },
  gFlowToolsBody: {
    "zh-CN": "此处可放大、缩小，或一键自适应视图内容。",
    "en-US": "Zoom in, zoom out, or fit the content to the view.",
  },
  gFlowMinimapTitle: { "zh-CN": "小地图", "en-US": "Minimap" },
  gFlowMinimapBody: {
    "zh-CN": "实时总览画布内容，可拖拽小地图快速导航。",
    "en-US": "Overview the canvas and drag to navigate quickly.",
  },
  gSettingsAccountTitle: {
    "zh-CN": "账户设置",
    "en-US": "Account settings",
  },
  gSettingsAccountBody: {
    "zh-CN": "在这里查看账户状态或修改登录用户名。",
    "en-US": "Review account status or change your username here.",
  },
  gSettingsSecurityTitle: {
    "zh-CN": "安全设置",
    "en-US": "Security settings",
  },
  gSettingsSecurityBody: {
    "zh-CN": "修改登录密码，或开关登录安全提醒。",
    "en-US": "Change your password or toggle login alerts.",
  },
  gSettingsSessionsTitle: {
    "zh-CN": "登录设备与令牌",
    "en-US": "Devices and tokens",
  },
  gSettingsSessionsBody: {
    "zh-CN": "查看当前在线设备，可单独下线或将其他设备全部下线。",
    "en-US": "View active devices and sign out a device or all other devices.",
  },
  gSettingsAiTitle: { "zh-CN": "AI 配置", "en-US": "AI configuration" },
  gSettingsAiBody: {
    "zh-CN": "为不同 AI 服务配置地址与密钥，并选择系统使用的 AI。",
    "en-US": "Set endpoints and keys for AI providers and pick the system AI.",
  },
  gMcpStatusTitle: { "zh-CN": "连接与统计", "en-US": "Status & stats" },
  gMcpStatusBody: {
    "zh-CN": "顶部展示 MCP 服务是否运行，以及服务名、版本、会话数、工具总数等实时统计，可随时点击刷新。",
    "en-US": "The header shows whether the MCP service is running, with live stats like name, version, sessions and total tools; refresh anytime.",
  },
  gMcpGroupsTitle: { "zh-CN": "工具目录", "en-US": "Tool catalog" },
  gMcpGroupsBody: {
    "zh-CN": "下方按组列出 AI 可调用的全部工具；带红色“高危”标签的工具必须由你在界面引导卡中手动确认，不会后台自动执行。",
    "en-US": "Below, every tool callable by the AI is grouped; tools marked High risk require your manual confirmation through an on-screen guide card and never auto-run.",
  },
  gDataUploadTitle: { "zh-CN": "上传文件", "en-US": "Upload files" },
  gDataUploadBody: {
    "zh-CN": "点击“选择文件”上传数据，文件流式传输到你的私有空间；默认不共享。",
    "en-US": "Click Choose file to upload data; files stream into your private space and stay private by default.",
  },
  gDataMineTitle: { "zh-CN": "我的文件", "en-US": "My files" },
  gDataMineBody: {
    "zh-CN": "管理自己上传的文件：下载、删除，或打开右侧开关共享给其他用户。",
    "en-US": "Manage your own uploads: download, delete, or turn on the switch to share with others.",
  },
  gDataSharedTitle: { "zh-CN": "共享数据", "en-US": "Shared data" },
  gDataSharedBody: {
    "zh-CN": "这里列出其他用户共享的数据，可查看属主并下载；你的共享文件也会出现在其他用户此处。",
    "en-US": "Data shared by other users appears here with its owner and download access; your shared files show up here for others.",
  },
  navHome: { "zh-CN": "首页", "en-US": "Home" },
  navAgent: { "zh-CN": "Flow", "en-US": "Flow" },
  navMcp: { "zh-CN": "MCP", "en-US": "MCP" },
  navData: { "zh-CN": "数据", "en-US": "Data" },
  navDevices: { "zh-CN": "设备", "en-US": "Devices" },
  navApi: { "zh-CN": "API", "en-US": "API" },
  navDefects: { "zh-CN": "错误记录", "en-US": "Defects" },
  navSettings: { "zh-CN": "设置", "en-US": "Settings" },
  agentCenterTitle: {
    "zh-CN": "PipeMind Flow 简化您的工作流程",
    "en-US": "PipeMind Flow simplifies your workflow",
  },
  agentCenterHint: {
    "zh-CN": "双击画布自由新建节点",
    "en-US": "Double-click the canvas to create a node",
  },
  flowStartMenu: { "zh-CN": "开始菜单", "en-US": "Start menu" },
  chatTitle: { "zh-CN": "PipeMind 助手", "en-US": "PipeMind Assistant" },
  chatEphemeral: { "zh-CN": "会话不保存", "en-US": "Not saved" },
  chatEmpty: {
    "zh-CN": "你好，我是 PipeMind 助手。\n有什么可以帮你？",
    "en-US": "Hi, I am the PipeMind assistant.\nHow can I help you?",
  },
  chatPlaceholder: {
    "zh-CN": "输入消息，Enter 发送",
    "en-US": "Type a message, Enter to send",
  },
  chatTyping: { "zh-CN": "助手思考中…", "en-US": "Assistant is thinking…" },
  chatSendFailed: {
    "zh-CN": "发送失败，请稍后重试",
    "en-US": "Failed to send, please try again",
  },
  chatHistoryShow: { "zh-CN": "展开对话记录", "en-US": "Show history" },
  chatHistoryHide: { "zh-CN": "收起对话记录", "en-US": "Hide history" },
  viewZoomIn: { "zh-CN": "放大", "en-US": "Zoom in" },
  viewZoomOut: { "zh-CN": "缩小", "en-US": "Zoom out" },
  viewFit: { "zh-CN": "自适应视图", "en-US": "Fit view" },
  inboxTitle: { "zh-CN": "信息箱", "en-US": "Inbox" },
  inboxMarkAllRead: { "zh-CN": "全部已读", "en-US": "Mark all read" },
  inboxEmpty: { "zh-CN": "暂无信息", "en-US": "No messages" },
  typeLogin: { "zh-CN": "登录", "en-US": "Sign-in" },
  typeAnnouncement: { "zh-CN": "公告", "en-US": "Announcement" },
  typeSystem: { "zh-CN": "系统", "en-US": "System" },
  homeThinking: { "zh-CN": "深度思考", "en-US": "Deep think" },
  homeWebSearch: { "zh-CN": "联网搜索", "en-US": "Web search" },
  homePlaceholder: {
    "zh-CN": "输入您的问题，Enter 发送，Shift + Enter 换行",
    "en-US": "Ask anything, Enter to send, Shift + Enter for new line",
  },
  homeHint: {
    "zh-CN": "内容由 Agent 生成，请仔细甄别后使用",
    "en-US": "Content is generated by the Agent, verify before use",
  },
  mapLegendTitle: { "zh-CN": "管段图例", "en-US": "Pipe legend" },
  mapSegmentsStat: {
    "zh-CN": "{count} 段 · {km} km",
    "en-US": "{count} segs · {km} km",
  },
  mapScale: { "zh-CN": "比例尺", "en-US": "Scale" },
  mapNorth: { "zh-CN": "北", "en-US": "North" },
  mapBaseReady: {
    "zh-CN": "底图：{name} · 已就绪",
    "en-US": "Base map: {name} · Ready",
  },
  mapBaseEmpty: { "zh-CN": "底图为空", "en-US": "Base map is empty" },
  mapBaseLoading: {
    "zh-CN": "正在加载底图…",
    "en-US": "Loading base map…",
  },
  mapBaseMatching: {
    "zh-CN": "正在匹配所在行政区…",
    "en-US": "Matching the administrative region…",
  },
  mapBaseMatchFailed: {
    "zh-CN": "底图自动匹配失败（可能无外网），仅显示管线与网格",
    "en-US": "Auto-region lookup failed (offline?). Showing pipes and grid only.",
  },
  mapChinaLoading: {
    "zh-CN": "正在加载中国全国底图…",
    "en-US": "Loading China base map…",
  },
  mapChinaName: { "zh-CN": "中国全国", "en-US": "China" },
  mapChinaFailed: {
    "zh-CN": "中国全国底图加载失败",
    "en-US": "Failed to load the China base map",
  },
  mapStatusNoSource: {
    "zh-CN": "尚未选择数据源，当前显示中国全国底图；请在右上角选择 GIS 数据源",
    "en-US":
      "No GIS source selected — showing the China base map. Pick a source at the top right.",
  },
  mapStatusSource: {
    "zh-CN": "数据源：{name} · {count} 条管线",
    "en-US": "Source: {name} · {count} pipes",
  },
  mapStatusLoadFailed: {
    "zh-CN": "管道数据加载失败，请重新选择数据源",
    "en-US": "Failed to load pipe data. Please pick another source.",
  },
  mapStatusLocated: {
    "zh-CN": "已定位{code}",
    "en-US": "Located{code}",
  },
  mapStatusFocusOtherFile: {
    "zh-CN":
      "定位指令来自其它数据文件（#{fileId}），当前图纸展示的不是该文件，已忽略",
    "en-US":
      "Focus belongs to another data file (#{fileId}); the current sheet is not showing it, so the move was ignored.",
  },
  mapHoverPipe: { "zh-CN": "管道", "en-US": "Pipe" },
  mapHoverType: { "zh-CN": "类型", "en-US": "Type" },
  mapHoverDiameter: { "zh-CN": "管径", "en-US": "Diameter" },
  mapHoverMaterial: { "zh-CN": "材质", "en-US": "Material" },
  mapHoverDepth: { "zh-CN": "埋深", "en-US": "Depth" },
  mapHoverLength: { "zh-CN": "长度", "en-US": "Length" },
  mapNetUnknown: { "zh-CN": "未知", "en-US": "Unknown" },
  mapNetWater: { "zh-CN": "给水", "en-US": "Water" },
  mapNetDrainage: { "zh-CN": "排水", "en-US": "Drainage" },
  mapNetSewage: { "zh-CN": "污水", "en-US": "Sewage" },
  mapNetRain: { "zh-CN": "雨水", "en-US": "Stormwater" },
  mapNetHeating: { "zh-CN": "供热", "en-US": "Heating" },
  mapNetGas: { "zh-CN": "燃气", "en-US": "Gas" },
  mapNetPower: { "zh-CN": "电力", "en-US": "Electric" },
  mapNetTelecom: { "zh-CN": "通讯", "en-US": "Telecom" },
  homeChatFailed: {
    "zh-CN": "回复失败，请稍后重试",
    "en-US": "Failed to reply, please try again",
  },
  loginAccount: { "zh-CN": "账号", "en-US": "Account" },
  loginAccountPlaceholder: {
    "zh-CN": "请输入账号",
    "en-US": "Enter your account",
  },
  loginPassword: { "zh-CN": "密码", "en-US": "Password" },
  loginPasswordPlaceholder: {
    "zh-CN": "请输入密码",
    "en-US": "Enter your password",
  },
  loginRemember: { "zh-CN": "记住登录", "en-US": "Remember me" },
  loginForgot: { "zh-CN": "忘记密码", "en-US": "Forgot password?" },
  loginSubmit: { "zh-CN": "进入工作空间", "en-US": "Enter workspace" },
  loginSubtitle: {
    "zh-CN": "登录 PipeMind 地下管网数字化管理平台",
    "en-US": "Sign in to the PipeMind pipeline platform",
  },
  agreePrefix: {
    "zh-CN": "登录视为您已阅读并同意PipeMind",
    "en-US": "Signing in means you agree to PipeMind",
  },
  terms: { "zh-CN": "服务条款", "en-US": "Terms of Service" },
  privacy: { "zh-CN": "隐私政策", "en-US": "Privacy Policy" },
  copyright: {
    "zh-CN": "© 2026 PipeMind 地下管网系统 · 如遇登录问题请联系系统管理员",
    "en-US": "© 2026 PipeMind · Contact the administrator if you have sign-in issues",
  },
  toastUsernameLength: {
    "zh-CN": "用户名长度需为 2-64 个字符",
    "en-US": "Username must be 2-64 characters",
  },
  toastUsernameChars: {
    "zh-CN": "用户名仅支持字母、数字、下划线与连字符",
    "en-US": "Username may contain letters, numbers, underscores and hyphens",
  },
  toastUsernameUpdated: { "zh-CN": "用户名已更新", "en-US": "Username updated" },
  toastOldPasswordRequired: {
    "zh-CN": "请输入原密码",
    "en-US": "Enter your current password",
  },
  toastNewPasswordLen: {
    "zh-CN": "新密码长度需为 6-128 位",
    "en-US": "New password must be 6-128 characters",
  },
  toastPasswordMismatch: {
    "zh-CN": "两次输入的新密码不一致",
    "en-US": "The two new passwords do not match",
  },
  toastPasswordUpdated: { "zh-CN": "密码已修改", "en-US": "Password changed" },
  toastSaveFailed: {
    "zh-CN": "保存失败，请稍后重试",
    "en-US": "Save failed, please try again",
  },
  toastChangeFailed: {
    "zh-CN": "修改失败，请稍后重试",
    "en-US": "Update failed, please try again",
  },
  toastOperationFailed: {
    "zh-CN": "操作失败，请稍后重试",
    "en-US": "Operation failed, please try again",
  },
  toastDeviceSignedOut: {
    "zh-CN": "该设备已下线",
    "en-US": "Device signed out",
  },
  toastNoOthersSignedOut: {
    "zh-CN": "没有其他设备需要下线",
    "en-US": "No other device to sign out",
  },
  toastLoginFieldsRequired: {
    "zh-CN": "请输入账号和密码",
    "en-US": "Enter your account and password",
  },
  toastLoginFailed: {
    "zh-CN": "登录失败，请稍后重试",
    "en-US": "Sign-in failed, please try again",
  },
  toastBadCredentials: {
    "zh-CN": "用户名或密码错误",
    "en-US": "Incorrect username or password",
  },
  toastUsernameTaken: {
    "zh-CN": "用户名已被占用",
    "en-US": "Username is already taken",
  },
  toastWrongOldPassword: {
    "zh-CN": "原密码错误",
    "en-US": "Current password is incorrect",
  },
  toastCredentialError: {
    "zh-CN": "账户凭据异常，请联系管理员",
    "en-US": "Account credentials are invalid, contact the administrator",
  },
  toastSessionExpired: {
    "zh-CN": "登录状态已失效，请重新登录",
    "en-US": "Session expired, please sign in again",
  },
  toastAccountDisabled: {
    "zh-CN": "账号已被禁用",
    "en-US": "Account has been disabled",
  },
  toastSessionNotFound: {
    "zh-CN": "会话不存在或已被移除",
    "en-US": "Session not found or already removed",
  },
  toastKeyFetchFailed: {
    "zh-CN": "无法获取加密公钥，请稍后重试",
    "en-US": "Unable to fetch the encryption key, please try again",
  },
  toastKeyMissing: {
    "zh-CN": "加密公钥缺失，请稍后重试",
    "en-US": "Encryption key is missing, please try again",
  },
  toastSignedOutOthersCount: {
    "zh-CN": "已下线 {count} 个其他设备",
    "en-US": "Signed out {count} other device(s)",
  },
};

const SERVER_MESSAGE_KEY: Record<string, string> = {
  "用户名或密码错误": "toastBadCredentials",
  "用户名已被占用": "toastUsernameTaken",
  "原密码错误": "toastWrongOldPassword",
  "原密码校验失败": "toastWrongOldPassword",
  "账户凭据异常，请联系管理员": "toastCredentialError",
  "登录状态已失效，请重新登录": "toastSessionExpired",
  "账号已被禁用": "toastAccountDisabled",
  "会话不存在或已被移除": "toastSessionNotFound",
  "无法获取加密公钥，请稍后重试": "toastKeyFetchFailed",
  "加密公钥缺失，请稍后重试": "toastKeyMissing",
  "新密码长度需为 6-128 位": "toastNewPasswordLen",
};

const STORAGE_KEY = "pm_language";

interface I18nValue {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
  t: (key: string) => string;
}

const INITIAL_I18N: I18nValue = {
  lang: "zh-CN",
  setLang: () => {
    void 0;
  },
  t: (key: string) => key,
};

const I18nContext = createContext<I18nValue>(INITIAL_I18N);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLang>("zh-CN");

  const syncFromServer = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        credentials: "include",
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        settings?: Record<string, string>;
      };
      const next = resolveAppLang(data.settings?.["system.language"]);
      if (next) {
        setLangState(next);
        try {
          globalThis.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          void 0;
        }
      }
    } catch {
      void 0;
    }
  };

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = globalThis.localStorage.getItem(STORAGE_KEY);
    } catch {
      void 0;
    }
    const local = resolveAppLang(stored);
    if (local) {
      setLangState(local);
    }
    void syncFromServer();
    const unsubscribe = onDataChanged(() => {
      void syncFromServer();
    });
    return unsubscribe;
  }, []);

  const setLang = (next: AppLang): void => {
    setLangState(next);
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      void 0;
    }
  };

  const t = (key: string): string => {
    const pair = DICT[key];
    return pair?.[lang] ?? key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/**
 * @param {I18nValue["t"]} t - 翻译函数
 * @param {string} message - 服务端返回的原始消息
 * @returns {string} 本地化后的消息文本
 */
export function localizeServerMessage(
  t: I18nValue["t"],
  message: string,
): string {
  const key = SERVER_MESSAGE_KEY[message];
  if (key) {
    return t(key);
  }
  return message;
}
