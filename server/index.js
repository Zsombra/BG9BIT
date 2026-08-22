import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { createBinanceStreams } from './BinanceStream.js';
import { OrderBookAggregator } from './OrderBookAggregator.js';

const PORT = process.env.PORT || 3001;

// ---- Express setup ----
const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: wss.clients.size,
    orderBookReady: orderBook.snapshotLoaded,
    pressure: orderBook.pressure,
    price: orderBook.currentPrice,
  });
});

const server = http.createServer(app);

// ---- WebSocket server for browser clients ----
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws) => {
  console.log(`[Server] Client connected (total: ${wss.clients.size})`);

  // Send initial state immediately
  if (orderBook.snapshotLoaded) {
    ws.send(JSON.stringify({
      type: 'orderbook_summary',
      data: orderBook.getSummary(),
    }));
    ws.send(JSON.stringify({
      type: 'depth_chart',
      data: orderBook.getDepthChartData(),
    }));
  }

  if (latestTicker) {
    ws.send(JSON.stringify({ type: 'ticker', data: latestTicker }));
  }

  // Send recent liquidations (last 20)
  for (const liq of recentLiquidations) {
    ws.send(JSON.stringify({ type: 'liquidation', data: liq }));
  }

  ws.on('close', () => {
    console.log(`[Server] Client disconnected (total: ${wss.clients.size})`);
  });
});

// ---- Data state ----
const orderBook = new OrderBookAggregator();
let latestTicker = null;
const recentLiquidations = []; // Ring buffer of last 50
const MAX_RECENT_LIQUIDATIONS = 50;

// Throttle depth chart broadcasts (expensive computation)
let depthChartDirty = false;
let lastDepthBroadcast = 0;
const DEPTH_BROADCAST_INTERVAL = 500; // ms

// Throttle order book summary broadcasts
let lastSummaryBroadcast = 0;
const SUMMARY_BROADCAST_INTERVAL = 250; // ms

// ---- Binance streams ----
const streams = createBinanceStreams({
  onTicker(data) {
    latestTicker = data;
    orderBook.setPrice(data.price);

    // Broadcast ticker to all clients
    broadcast('ticker', data);

    // Broadcast order book summary (throttled)
    const now = Date.now();
    if (now - lastSummaryBroadcast >= SUMMARY_BROADCAST_INTERVAL) {
      lastSummaryBroadcast = now;
      broadcast('orderbook_summary', orderBook.getSummary());
    }
  },

  onDepthUpdate(data) {
    orderBook.applyUpdate(data);
    depthChartDirty = true;

    // Broadcast depth chart (throttled)
    const now = Date.now();
    if (now - lastDepthBroadcast >= DEPTH_BROADCAST_INTERVAL) {
      lastDepthBroadcast = now;
      depthChartDirty = false;
      broadcast('depth_chart', orderBook.getDepthChartData());

      // Also update summary
      broadcast('orderbook_summary', orderBook.getSummary());
    }
  },

  onLiquidation(data) {
    console.log(
      `[Liquidation] ${data.side.toUpperCase()} $${(data.totalUSD / 1000).toFixed(1)}K @ $${data.price.toFixed(0)}`
    );

    // Store in ring buffer
    recentLiquidations.push(data);
    if (recentLiquidations.length > MAX_RECENT_LIQUIDATIONS) {
      recentLiquidations.shift();
    }

    // Broadcast immediately — liquidations are important events
    broadcast('liquidation', data);
  },
});

// ---- Periodic depth chart flush ----
setInterval(() => {
  if (depthChartDirty && wss.clients.size > 0) {
    depthChartDirty = false;
    lastDepthBroadcast = Date.now();
    broadcast('depth_chart', orderBook.getDepthChartData());
  }
}, DEPTH_BROADCAST_INTERVAL);

// ---- Start everything ----
async function start() {
  console.log('[Server] Loading initial order book snapshot...');
  await orderBook.loadSnapshot();

  console.log('[Server] Connecting to Binance streams...');
  streams.connectAll();

  server.listen(PORT, () => {
    console.log(`\n🚀 BG9BIT Server running on http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`   Health:    http://localhost:${PORT}/health\n`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  streams.disconnectAll();
  wss.close();
  server.close();
  process.exit(0);
});

start().catch(console.error);
