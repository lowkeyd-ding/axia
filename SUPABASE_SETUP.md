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

## 步骤 4：创建数据库表

1. 打开 Supabase 项目
2. 点击左侧 **SQL Editor**
3. 粘贴以下 SQL 并运行：

```sql
-- 创建存储数据的表
CREATE TABLE IF NOT EXISTS axia_data (
  id TEXT PRIMARY KEY DEFAULT 'axia_data',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 允许匿名访问（anon key）
ALTER TABLE axia_data ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许所有人读取和写入
CREATE POLICY "Allow all" ON axia_data FOR ALL USING (true);
```

4. 点击 **Run** 执行

## 步骤 5：重新部署

1. 推送代码后，Vercel 会自动部署
2. 或者手动触发部署：
   ```bash
   cd /Users/lowkeyd/jia-di
   git commit --allow-empty -m "触发部署"
   git push origin main
   ```

## 验证

打开 https://axia.vercel.app，在一个设备添加数据，等待几秒后在另一个设备刷新页面，应该能看到同步的数据。
