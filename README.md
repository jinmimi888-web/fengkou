# 锋口 · 入场研判台

个人观察池、仓位流水、实时盈亏、总仓报表，以及股票 / 虚拟货币新闻研判。

界面为简体中文。内容不构成投资建议。

## 本地运行

```bash
npm install
npm run dev
```

需要 Node 22。默认在 `http://localhost:8080`。

登录、每人独立数据、模型研判需要在运行环境里配置账号与数据库（Better Auth + Postgres / PGLite）。行情来自公开报价接口。

## 功能

- 股票与虚拟货币观察池、多维入场研判
- 买入卖出流水、平均成本、实时浮动盈亏
- 总仓报表：总盈亏、胜率、集中度
- 观察池新闻自动收集
- 用户名账户，各自保存资料与仓位
- 法律与说明页：`/about` 关于锋口、`/privacy` 隐私政策、`/terms` 用户协议

## Auth env

See GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET.
- Production Google callback: https://fengkou-jinmimi888-1336.vercel.app/api/auth/callback/google
- Local Google callback: http://localhost:8080/api/auth/callback/google
- Production Twitter callback: https://fengkou-jinmimi888-1336.vercel.app/api/auth/callback/twitter
- Local Twitter callback: http://localhost:8080/api/auth/callback/twitter
- Core: BETTER_AUTH_URL, BETTER_AUTH_SECRET, DATABASE_URL, VITE_AUTH_ENABLED
- No GROK_AUTH_* broker vars are required for social buttons.
