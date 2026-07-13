# Supabase 数据同步设置指南

## 步骤 1：创建 Supabase 项目

1. 打开 https://supabase.com 并登录
2. 点击 **New Project**
3. 填写项目信息：
   - Organization: 选择你的组织
   - Name: `axia-sync` 或其他名称
   - Database Password: 设置一个强密码（记住它）
   - Region: 选择离你最近的区域（如 `ap-east-1` 香港）
4. 点击 **Create new project**
5. 等待项目创建完成（可能需要几分钟）

## 步骤 2：获取 API 配置

1. 进入项目后，点击左侧 **Project Settings**（齿轮图标）
2. 点击 **API**
3. 找到以下信息并复制：
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon public** key: 以 `eyJ...` 开头的长字符串

## 步骤 3：在 Vercel 设置环境变量

1. 打开 https://vercel.com/lowkeyd-ding/axia/settings/environment-variables
2. 添加两个环境变量：

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | 你的 Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 anon public key |

3. 点击 **Save**

## 步骤 4：创建数据库表（按用户隔离 + RLS）

1. 打开 Supabase 项目
2. 点击左侧 **SQL Editor**
3. **新建一个空查询**，把仓库里 `supabase/migrations/0001_per_user_rls.sql` 的内容粘贴进去
4. 点击 **Run** 执行

这段 SQL 会：

- 删掉旧的 `axia_data` 表（旧表所有用户共享一行 + 公开可读写，已不安全）
- 新表的主键直接是 `auth.users(id)`，每用户一行
- 启用 RLS，唯一策略：用户只能访问自己的那行
- 匿名访客（未登录）默认被拒绝

> ⚠️ **老用户会丢数据**。因为 `ON DELETE CASCADE`，用户被删时数据也被删；并且切到新表后，之前那行 `'axia_data'` 的旧数据已经丢。如果有需要保留的数据，先在 SQL Editor 里把它导出。

## 步骤 5：开启邮箱 + 密码登录

1. 在 Supabase 项目里点击左侧 **Authentication** → **Providers**
2. 确保 **Email** 处于 enabled
3. （可选）关闭 "Confirm email" 让本地测试更顺，生产环境建议打开

## 步骤 6：重新部署

1. 推送代码后，Vercel 会自动部署
2. 或者手动触发部署：
   ```bash
   cd /Users/lowkeyd/jia-di
   git commit --allow-empty -m "触发部署"
   git push origin main
   ```

## 验证

打开 https://axia.vercel.app：

- 用账号 A 注册 → 添加几条数据 → 等几秒
- 退出登录
- 用账号 B 注册 → **应该看不到 A 的任何数据**（隔离生效）
- 退出登录，再用账号 A 登录 → 数据依然在

## 数据隔离原理

```
┌──────────────┐
│  Browser     │
│  ┌────────┐  │
│  │ store  │  │
│  └────────┘  │
│       │      │
│       │ user.id + access_token (从 supabase.auth.getSession() 拿)
│       ▼      │
└───────┬──────┘
        │
        │ HTTPS (RLS 在 Supabase 端校验)
        ▼
┌─────────────────────────────┐
│  Supabase PostgreSQL        │
│  Table: axia_data           │
│    user_id  data  updated_at│
│    ───────  ────  ──────────│
│    A的UUID  {...}  ...       │  ← RLS: auth.uid() = user_id 才能读写
│    B的UUID  {...}  ...       │
└─────────────────────────────┘
```

- 客户端直接用 **带 access token 的 supabase-js** 调表，**不再走** `/api/sync` 路由
- 服务端路由 `src/app/api/sync/route.ts` 已删除（避免"用 anon key 替任意用户读写"的反模式）
- 匿名访客：即使拿到 anon key，也读不到任何行（没有给 anon role 的 policy）
