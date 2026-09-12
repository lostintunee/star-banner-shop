const API_BASE = 'https://api.telegram.org';

// Direct payment link (skips the bot chat / Start button, opens the pay sheet immediately).
export async function createInvoiceLink(botToken, { title, description, payload, priceStars, photoUrl }) {
  const body = {
    title,
    description,
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: title, amount: priceStars }],
  };

  if (photoUrl) {
    body.photo_url = photoUrl;
    body.photo_width = 1024;
    body.photo_height = 576;
  }

  const res = await fetch(`${API_BASE}/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || 'createInvoiceLink failed');
  }
  return data.result;
}
