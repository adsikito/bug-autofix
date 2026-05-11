# 🐛 Bug Autofix

> 监听 GitHub Issue，用 Claude AI 自动分析并修复代码 Bug

## ✨ 有什么用？

- 📥 通过 GitHub Webhook 接收 Issue 事件
- 🧠 调用 Anthropic Claude 分析 Bug 根因
- 🔧 自动生成修复代码并提交 PR
- ⚡ 从 Issue 到修复，全流程自动化

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js + TypeScript |
| AI | Anthropic Claude API |
| 集成 | GitHub Webhook / REST API |
| 配置 | Zod + dotenv |

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/YOUR_USERNAME/bug-autofix.git
cd bug-autofix
