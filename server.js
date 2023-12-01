const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(__dirname + 'public/index.html');
});
app.get('/product-details', async (req, res) => {
  const { asin } = req.query;

  try {
    const browser = await puppeteer.launch({
      headless: false, // Headless modu kapat
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Güvenlik ayarları
    });
    const page = await browser.newPage();

    const url = `https://www.amazon.com/dp/${asin}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const details = await page.evaluate(() => {
      const productDetails = {};
      const detailRows = document.querySelectorAll('#productDetails_detailBullets_sections1 tr');

      detailRows.forEach((row) => {
        const label = row.querySelector('th').textContent.trim();
        let value = row.querySelector('td').textContent.trim();

        // Clean up HTML content in 'Customer Reviews' field
        if (label === 'Customer Reviews') {
          value = value.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* ... */ comments
          value = value.replace(/\s+/g, ' ').trim(); // Remove extra spaces
        }

        productDetails[label] = value;
      });

      return productDetails;
    });
    
    await browser.close();

    res.json(details);
  } catch (error) {
    console.error('Amazon ürün detayları alınamadı:', error);
    res.status(500).json({ error: 'Amazon ürün detayları alınamadı.' });
  }
});
app.post('/search', async (req, res) => {
  const { searchKeyword } = req.body;
  const maxPages = 20;

  try {
    const browser = await puppeteer.launch({
      headless: false, // Headless modu kapat
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Güvenlik ayarları
    });
    const [pageUS, pageCanada] = await Promise.all([
      browser.newPage(),
      browser.newPage(),
    ]);

    let products = [];

    for (let pageIdx = 1; pageIdx <= maxPages; pageIdx++) {
      const urlUS = `https://www.amazon.com/s?k=${searchKeyword}&page=${pageIdx}`;
      const urlCanada = `https://www.amazon.ca/s?k=${searchKeyword}&page=${pageIdx}`;

      await Promise.all([
        pageUS.goto(urlUS, { waitUntil: 'domcontentloaded' }),
        pageCanada.goto(urlCanada, { waitUntil: 'domcontentloaded' }),
      ]);

      const [productsUS, productsCanada] = await Promise.all([
        getProductsFromPage(pageUS),
        getProductsFromPage(pageCanada),
      ]);

      products = products.concat(mergeProducts(productsUS, productsCanada));
    }
    
    await browser.close();

    res.json({ results: products });
  } catch (error) {
    console.error('Amazon verileri alınamadı:', error);
    res.status(500).json({ error: 'Amazon verileri alınamadı.' });
  }
});

async function getProductsFromPage(page) {
  return page.evaluate(() => {
    const productElements = document.querySelectorAll('.s-result-item');
    const products = [];
    
    for (const productElement of productElements) {
      const titleElement = productElement.querySelector('h2');
      const priceElement = productElement.querySelector('.a-offscreen');
      const asin = productElement.getAttribute('data-asin');

      if (titleElement && priceElement && asin) {
        const title = titleElement.textContent.trim();
        const price = priceElement.textContent.trim();

        products.push({ name: title, price, asin });
      }
    }
    
    return products;
  });
}

function mergeProducts(productsUS, productsCanada) {
  const mergedProducts = [];

  for (const productUS of productsUS) {
    const correspondingProductCanada = productsCanada.find(
      (product) => product.asin === productUS.asin
    );

    if (correspondingProductCanada) {
      mergedProducts.push({
        name: productUS.name,
        asin: productUS.asin,
        priceUS: productUS.price,
        priceCanada: correspondingProductCanada.price,
      });
    }
  }

  return mergedProducts;
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});