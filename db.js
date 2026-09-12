import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'data.json');

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { banners: [], products: [] };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function listBanners() {
  return load().banners;
}

export function addBanner(banner) {
  const data = load();
  const record = { id: randomId(), createdAt: new Date().toISOString(), ...banner };
  data.banners.push(record);
  save(data);
  return record;
}

export function deleteBanner(id) {
  const data = load();
  data.banners = data.banners.filter((b) => b.id !== id);
  save(data);
}

export function addProduct(product) {
  const data = load();
  const record = { createdAt: new Date().toISOString(), ...product };
  data.products.push(record);
  save(data);
  return record;
}

export function getProduct(id) {
  return load().products.find((p) => p.id === id);
}

export function listProducts() {
  return load().products;
}
