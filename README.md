# Saeed — Full Suite (Cloudflare Worker + Admin UI)

داخل بسته:
- `src/worker.js` ← ربات تلگرام + وب‌اپ ساده `/admin` + API پیشرفت + امتحان کوچک
- `wrangler.toml` ← تنظیمات بایندینگ‌ها (AI, KV, D1) و متغیرها
- `schema.sql` ← اسکیما D1 (کاربران، گفتگو، کوییز و نتایج)
- `.github/workflows/deploy.yml` ← دیپلوی از گیت‌هاب (اختیاری)

## نصب سریع (Dashboard)
1) Cloudflare → Workers → Create → Quick Edit → محتوای `src/worker.js` همین بسته را پیست کن → Deploy.
2) Settings → Bindings:
   - AI → `AI`
   - KV → `CHAT_KV`
   - D1 → `DB`
   - Secrets: `TELEGRAM_BOT_TOKEN`, `SETUP_TOKEN` (+ اختیاری: `TELEGRAM_WEBHOOK_SECRET`, `HUGGINGFACE_API_KEY`, `OPENAI_API_KEY`)
   - Vars: طبق `wrangler.toml`
3) وبهوک: `/setup-webhook?sec=<SETUP_TOKEN>`
4) داشبورد: `/admin` (باز)

## نکات
- برای هزینه صفر، `ALLOW_OPENAI_SPEND="false"` بماند.
- اگر می‌خواهی تحلیل تصویر همیشه OpenAI باشد: `ALLOW_OPENAI_SPEND="true"` + `OAI_VISION_MODE="force"` + کلید OpenAI.
- برای دیدن تنظیمات: در تلگرام `/diag` بزن.
