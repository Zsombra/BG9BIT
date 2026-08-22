import WebSocket from 'ws';

/**
 * BinanceStream — manages WebSocket connections to Binance streams.
 * Handles connection, reconnection, heartbeat, and message parsing.
 */
export class BinanceStream {
  /**
   * @param {string} url - Full Binance WebSocket URL
   * @param {string} name - Human-readable name for logging
   * @param {Function} onMessage - Callback for parsed messages
   */
  constructor(url, name, onMessage) {
    this.url = url;
    this.name = name;
    this.onMessage = onMessage;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.pingInterval = null;
    this.isAlive = false;
    this.shouldReconnect = true;
  }

  connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    console.log(`[${this.name}] Connecting to ${this.url}...`);

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log(`[${this.name}] ✅ Connected`);
      this.reconnectDelay = 1000; // Reset backoff
      this.isAlive = true;

      // Heartbeat ping every 30s
      this.pingInterval = setInterval(() => {
        if (!this.isAlive) {
          console.warn(`[${this.name}] No pong received, reconnecting...`);
          this.ws.terminate();
          return;
        }
        this.isAlive = false;
        this.ws.ping();
      }, 30000);
    });

    this.ws.on('pong', () => {
      this.isAlive = true;
    });

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this.onMessage(parsed);
      } catch (err) {
        console.error(`[${this.name}] Parse error:`, err.message);
      }
    });

    this.ws.on('error', (err) => {
      console.error(`[${this.name}] WebSocket error:`, err.message);
    });

    this.ws.on('close', (code, reason) => {
      console.warn(`[${this.name}] Disconnected (code: ${code})`);
      clearInterval(this.pingInterval);

      if (this.shouldReconnect) {
        console.log(`[${this.name}] Reconnecting in ${this.reconnectDelay}ms...`);
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    });
  }

  /**
   * Send a subscription message (for combined streams that need it).
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Create all required Binance streams and return controllers.
 */
export function createBinanceStreams({ onTicker, onDepthUpdate, onLiquidation }) {
  // 1. 24hr Ticker — live price + 24h change
  const tickerStream = new BinanceStream(
    'wss://stream.binance.com:9443/ws/btcusdt@ticker',
    'Ticker',
    (data) => {
      onTicker({
        price: parseFloat(data.c),           // Last price
        open24h: parseFloat(data.o),         // Open 24h
        high24h: parseFloat(data.h),         // High 24h
        low24h: parseFloat(data.l),          // Low 24h
        change24h: parseFloat(data.p),       // Price change 24h
        percentChange24h: parseFloat(data.P), // Price change % 24h
        volume24h: parseFloat(data.v),       // Volume 24h (BTC)
        quoteVolume24h: parseFloat(data.q),  // Volume 24h (USDT)
        timestamp: data.E,
      });
    }
  );

  // 2. Depth stream — order book incremental updates (100ms)
  const depthStream = new BinanceStream(
    'wss://stream.binance.com:9443/ws/btcusdt@depth@100ms',
    'Depth',
    (data) => {
      onDepthUpdate({
        bids: data.b.map(([price, qty]) => [parseFloat(price), parseFloat(qty)]),
        asks: data.a.map(([price, qty]) => [parseFloat(price), parseFloat(qty)]),
        finalUpdateId: data.u,
        firstUpdateId: data.U,
        timestamp: data.E,
      });
    }
  );

  // 3. Liquidation stream (Futures) — forced orders
  const liquidationStream = new BinanceStream(
    'wss://fstream.binance.com/ws/btcusdt@forceOrder',
    'Liquidation',
    (data) => {
      const order = data.o;
      onLiquidation({
        side: order.S === 'BUY' ? 'short' : 'long', // BUY = short liquidation, SELL = long liquidation
        price: parseFloat(order.p),
        quantity: parseFloat(order.q),
        totalUSD: parseFloat(order.p) * parseFloat(order.q),
        timestamp: order.T,
        exchange: 'Binance',
      });
    }
  );

  return {
    ticker: tickerStream,
    depth: depthStream,
    liquidation: liquidationStream,
    connectAll() {
      tickerStream.connect();
      depthStream.connect();
      liquidationStream.connect();
    },
    disconnectAll() {
      tickerStream.disconnect();
      depthStream.disconnect();
      liquidationStream.disconnect();
    },
  };
}
