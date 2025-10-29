import 'dotenv/config';
import express from 'express';
import { Telegraf } from 'telegraf';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import tmp from 'tmp';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Thiếu BOT_TOKEN trong biến môi trường');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const ALLOWED_DOMAINS = [
  'tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com',
  'douyin.com', 'v.douyin.com'
];
const URL_RE = /(https?:\/\/[^\s]+)/i;

function pickUrl(text) {
  const m = text?.match?.(URL_RE);
  if (!m) return null;
  const url = m[1];
  if (ALLOWED_DOMAINS.some(d => url.includes(d))) return url;
  return null;
}

function runYtDlp(url, outDir) {
  return new Promise((resolve, reject) => {
    const args = [
      url,
      '-o', `${outDir}/%(title).200B [%(id)s].%(ext)s`,
      '-f', 'bv*+ba/b[ext=mp4]/b',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '-q', '--no-warnings'
    ];
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', d => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exit ${code}\n${stderr}`));
      }
      try {
        const files = fs.readdirSync(outDir)
          .filter(f => /(\.mp4|\.mov|\.m4v|\.webm)$/i.test(f))
          .map(f => `${outDir}/${f}`)
          .sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        if (!files.length) return reject(new Error('Không tìm thấy file video sau khi tải.'));
        resolve(files[0]);
      } catch (e) { reject(e); }
    });
  });
}

bot.start(ctx => ctx.reply(
  'Chào bạn! 👋 Dán link TikTok/Douyin (kể cả link rút gọn) vào đây, mình sẽ tải và gửi video.\n' +
  'Ví dụ:\n• https://www.tiktok.com/... hoặc https://vm.tiktok.com/...\n• https://www.douyin.com/... hoặc https://v.douyin.com/...'
));

bot.on('text', async (ctx) => {
  const url = pickUrl(ctx.message.text?.trim());
  if (!url) return;

  try {
    await ctx.sendChatAction('upload_video');
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const outDir = tmpDir.name;

    let filePath;
    try { filePath = await runYtDlp(url, outDir); }
    catch (e) {
      tmpDir.removeCallback();
      await ctx.reply('⚠️ Không tải được video. Link có thể sai/riêng tư/bị chặn. Hãy gửi link chia sẻ công khai.');
      return;
    }

    const stat = fs.statSync(filePath);
    const sizeMB = stat.size / (1024 * 1024);
    const fileName = path.basename(filePath);

    if (sizeMB <= 2000) {
      try {
        await ctx.replyWithVideo({ source: fs.createReadStream(filePath), filename: fileName }, { caption: fileName.slice(0, 1024) });
      } catch {
        await ctx.replyWithDocument({ source: fs.createReadStream(filePath), filename: fileName }, { caption: fileName.slice(0, 1024) });
      }
    } else {
      await ctx.replyWithDocument(
        { source: fs.createReadStream(filePath), filename: fileName },
        { caption: fileName.slice(0, 900) + '\n\n(File >2GB, gửi dạng tài liệu)' }
      );
    }
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Có lỗi bất ngờ. Thử lại giúp mình nhé.');
  }
});

const app = express();
app.use(express.json());
app.use(bot.webhookCallback('/webhook'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`Listening on ${PORT}`);
  const url = process.env.RENDER_EXTERNAL_URL;
  if (url) {
    try {
      await bot.telegram.setWebhook(`${url}/webhook`);
      console.log('Webhook set to', `${url}/webhook`);
    } catch (e) {
      console.error('Set webhook error:', e);
    }
  } else {
    console.warn('RENDER_EXTERNAL_URL is undefined; cannot set webhook automatically.');
  }
});
