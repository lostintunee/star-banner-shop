import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { addBanner, deleteBanner, listBanners, getProduct } from './db.js';
import { startBot } from './bot.js';
import { createInvoiceLink } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const DATA_DIR = process.env.DATA_DIR || __dirname;
const uploadsDir = process.env.DATA_DIR
  ? path.join(DATA_DIR, 'uploads')
  : path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
  })
);

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const DEFAULT_BOT_USERNAME = process.env.BOT_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

app.get('/', (req, res) => {
  res.render('index', { banners: listBanners() });
});

app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Неверный пароль' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin', { banners: listBanners(), defaultBotUsername: DEFAULT_BOT_USERNAME });
});

app.post('/admin/banners', requireAdmin, upload.single('image'), async (req, res) => {
  const { title, description, buttonText, productId, botUsername } = req.body;
  const imagePath = req.file ? '/uploads/' + req.file.filename : null;

  const product = productId ? getProduct(productId) : null;
  let invoiceLink = null;
  let priceStars = null;

  if (product) {
    priceStars = product.priceStars;
    if (process.env.BOT_TOKEN) {
      try {
        const photoUrl =
          process.env.PUBLIC_BASE_URL && imagePath
            ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '') + imagePath
            : null;
        invoiceLink = await createInvoiceLink(process.env.BOT_TOKEN, {
          title: product.title || title || 'Контент',
          description: product.description || `Оплата ${product.priceStars} ⭐ в Telegram Stars`,
          payload: product.id,
          priceStars: product.priceStars,
          photoUrl,
        });
      } catch (err) {
        console.error('Не удалось создать прямую ссылку на оплату:', err.message);
      }
    }
  }

  addBanner({
    title: title || '',
    description: description || '',
    buttonText: buttonText || 'Купить',
    productId: productId || '',
    botUsername: botUsername || DEFAULT_BOT_USERNAME,
    imagePath,
    priceStars,
    invoiceLink,
  });
  res.redirect('/admin');
});

app.post('/admin/banners/:id/delete', requireAdmin, (req, res) => {
  deleteBanner(req.params.id);
  res.redirect('/admin');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сайт запущен: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin`);
});

if (process.env.BOT_TOKEN) {
  startBot();
} else {
  console.log('BOT_TOKEN не задан в .env — бот не запущен, работает только сайт.');
}
