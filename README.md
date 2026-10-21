# Focus Hour

一个为 MacBook 和 iPhone 设计的轻量 PWA。使用 Next.js、Supabase Auth/Postgres 和 Vercel。第一版支持邮箱登录、每日任务与预计时长、手动拆分步骤、只看接下来约 60 分钟、完成步骤获得积分，以及同一账号的跨设备同步。

## 本地运行

1. 安装 Node.js 20.9 或更新版本。
2. 在 [Supabase](https://supabase.com/dashboard) 创建项目，在 SQL Editor 运行 [`supabase/schema.sql`](supabase/schema.sql)。
3. 在 Supabase → Authentication → Providers 启用 Email。建议使用 Magic Link；开发时在 URL Configuration 将 `http://localhost:3000` 加入 Redirect URLs。
4. 复制 `.env.example` 为 `.env.local`，填入项目 URL 和 publishable/anon key。不要使用 secret/service_role key。
5. 执行 `npm install`、`npm run dev`，打开 `http://localhost:3000`。

## 部署到 Vercel

1. 将本目录推送到 Git 仓库，在 Vercel 导入该仓库；如果仓库根目录不是本目录，将 Root Directory 设为 `focus-hour`。
2. 在 Vercel 项目设置中添加 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，部署。
3. 在 Supabase → Authentication → URL Configuration，将 Vercel 正式域名设为 Site URL，并将 `https://你的域名/**` 加入 Redirect URLs。登录邮件需能回到该域名。
4. 在 Supabase → Database → Publications 中将 `tasks` 和 `steps` 加入 `supabase_realtime` publication，以启用即时跨设备更新；即使不启用，切回页面时也会重新读取。
5. 在 iPhone Safari 打开正式网址，分享 → 添加到主屏幕；MacBook 可在支持的浏览器中安装网页应用。

## 数据与规则

- `tasks`：账号、计划日期、任务标题、总预计分钟数、顺序。
- `steps`：所属任务、账号、步骤标题、预计分钟数、顺序、完成时间。
- Row Level Security 只允许登录用户读写自己的记录；数据库触发器阻止步骤挂到他人的任务上。
- 下一小时按任务和步骤的创建顺序排列未完成步骤，累计不超过 60 分钟。若第一步本身占 60 分钟，则只显示这一步。
- 每完成一个步骤获得 10 积分。积分由已完成步骤实时计算，撤销完成会相应扣回，避免重复计分。
- 日期按设备本地日期选取；同一账号可在两台设备查看同一天的任务。

## 第一版边界

目前只支持手动拆分；AI 自动拆分和推送提醒留待后续。PWA 提供主屏幕入口，但本版需要联网才能读取和修改任务。建议下一版加入离线队列、步骤重排、任务跨天移动及更完整的积分历史。
