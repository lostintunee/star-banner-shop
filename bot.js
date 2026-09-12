import { Bot } from 'grammy';
import { addProduct, getProduct } from './db.js';

const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0);

// In-memory draft state while the admin is creating a product (single admin, low volume).
const pending = new Map(); // chatId -> { fileId, fileType, caption }

export function startBot() {
  const bot = new Bot(process.env.BOT_TOKEN);

  if (!ADMIN_ID) {
    bot.use(async (ctx, next) => {
      if (ctx.from) {
        console.log(`[bootstrap] Сообщение от Telegram ID: ${ctx.from.id} (@${ctx.from.username || 'без username'})`);
        await ctx.reply(
          `Ваш Telegram ID: ${ctx.from.id}\n\nУкажите его в .env как ADMIN_TELEGRAM_ID и перезапустите бота, чтобы получить доступ к загрузке контента.`
        );
      }
      return next();
    });
  }

  bot.command('start', async (ctx) => {
    const code = ctx.match?.trim();

    if (!code) {
      if (ctx.from?.id === ADMIN_ID) {
        return ctx.reply(
          'Привет! Пришли мне фото или видео — я спрошу цену в звёздах и создам товар.'
        );
      }
      return ctx.reply('Привет! Это бот для покупки контента за Telegram Stars ⭐');
    }

    const product = getProduct(code);
    if (!product) {
      return ctx.reply('Товар не найден или уже недоступен.');
    }

    await ctx.api.raw.sendInvoice({
      chat_id: ctx.chat.id,
      title: product.title || 'Эксклюзивный контент',
      description: product.description || `Оплата ${product.priceStars} ⭐ в Telegram Stars`,
      payload: product.id,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: product.title || 'Контент', amount: product.priceStars }],
    });
  });

  bot.on('message:photo', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const photo = ctx.message.photo.at(-1);
    pending.set(ctx.chat.id, {
      fileId: photo.file_id,
      fileType: 'photo',
      caption: ctx.message.caption || '',
    });
    await ctx.reply('Фото получено. Сколько звёзд за него взять? Напиши число, например 100.');
  });

  bot.on('message:video', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const video = ctx.message.video;
    pending.set(ctx.chat.id, {
      fileId: video.file_id,
      fileType: 'video',
      caption: ctx.message.caption || '',
    });
    await ctx.reply('Видео получено. Сколько звёзд за него взять? Напиши число, например 100.');
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const draft = pending.get(ctx.chat.id);
    if (!draft) return;

    const price = parseInt(ctx.message.text.trim(), 10);
    if (!Number.isFinite(price) || price <= 0) {
      return ctx.reply('Нужно целое положительное число звёзд, например 100.');
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    addProduct({
      id,
      fileId: draft.fileId,
      fileType: draft.fileType,
      priceStars: price,
      title: draft.caption || 'Эксклюзивный контент',
      description: draft.caption || '',
    });
    pending.delete(ctx.chat.id);

    const me = await ctx.api.getMe();
    const link = `https://t.me/${me.username}?start=${id}`;
    await ctx.reply(
      `Готово! ⭐\n\nЦена: ${price} Stars\nСсылка на оплату: ${link}\n\nКод товара для баннера на сайте: ${id}`
    );
  });

  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.api.raw.answerPreCheckoutQuery({
      pre_checkout_query_id: ctx.preCheckoutQuery.id,
      ok: true,
    });
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    const product = getProduct(payload);
    if (!product) {
      return ctx.reply('Оплата прошла, но товар не найден. Напишите администратору.');
    }
    if (product.fileType === 'video') {
      await ctx.replyWithVideo(product.fileId, { caption: 'Спасибо за покупку! 🎉' });
    } else {
      await ctx.replyWithPhoto(product.fileId, { caption: 'Спасибо за покупку! 🎉' });
    }
  });

  bot.catch((err) => {
    console.error('Ошибка бота:', err);
  });

  bot.start();
  console.log('Telegram-бот запущен (long polling).');
  return bot;
}
