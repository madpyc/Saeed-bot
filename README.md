# سعید – ربات معلم الکترونیک (Cloudflare Workers + D1 + KV + WebApp)

> اولویت با OpenAI (GPT‑5 متن و Vision)؛ اگر محدودیت/خطا بود → Workers AI → Hugging Face.

## راه‌اندازی سریع
1) ورود به کلودفلر: `wrangler login`
2) منابع بساز:
   ```bash
   wrangler d1 create saeed_db
   wrangler kv namespace create SESSIONS
   ```
3) سکرت‌ها را ست کن:
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_BOT_USERNAME
   wrangler secret put OPENAI_API_KEY    # برای GPT-5/vision
   wrangler secret put HF_API_TOKEN      # اختیاری
   wrangler secret put WEBAPP_URL        # مثلا https://<subdomain>.workers.dev/webapp
   ```
4) مهاجرت دیتابیس:
   ```bash
   npm run migrate
   ```
5) دیپلوی:
   ```bash
   npm run deploy
   ```
6) وبهوک تلگرام:
   ```bash
   npm run webhook -- --url=https://<your-worker-subdomain>.workers.dev/webhook
   ```

## معماری و ویژگی‌ها
- **Cloudflare Worker (Hono)**: وبهوک تلگرام + سرو وب‌اپ.
- **KV**: حافظه کوتاه‌مدت مکالمه؛ **D1**: آرشیو (نمونه جدول conversations).
- **Provider Fallback**: `openai (gpt-5, gpt-5-vision) → workersai → huggingface` با ریت‌رِزیلینس (backoff 429, micro-batching).
- **Vision**: عکس تلگرام → دریافت مستقیم URL امن → تحلیل با OpenAI Vision.
- **WebApp**: ارسال داده از داخل تلگرام به ربات.

## کانفیگ مهم
- ترتیب را با `PROVIDER_ORDER` تغییر بده. پیش‌فرض: `openai,workersai,huggingface`.
- مدل‌ها: `OPENAI_TEXT_MODEL=gpt-5`, `OPENAI_VISION_MODEL=gpt-5-vision` (قابل تغییر در wrangler.toml).
- **BATCH_WINDOW_MS**: زمان پنجره‌ی کوچیک برای هموار کردن انفجار درخواست‌ها (پیش‌فرض 120ms).

## نکات عملی
- اگر 429 خوردی، بک‌آف و فالبک فعاله. کلید OpenAI را قوی نگه دار.
- برای بینایی روی Workers/HF بعداً می‌تونی provider vision اضافه کنی.
- توسعه محلی: `npm run dev` (با persist لوکال).

## TODO
- ذخیره تاریخچه کامل در D1 (اکنون نمونه دارد؛ جریان کامل‌سازی بعدی است).
- Vision روی Workers/HF.
- درس‌های مرحله‌ای با کوییز.

## R2 (اختیاری ولی توصیه‌شده برای Vision)
- R2 را بساز: `wrangler r2 bucket create saeed-bucket`
- سپس در `wrangler.toml` بایندینگ `R2` و `R2_PUBLIC_BASE` را تنظیم کن.
- اگر `R2_PUBLIC_BASE` خالی باشد، فایل‌ها از مسیر Worker روی `/r2/:key` سرو می‌شوند.
