/**
 * PriceFeed — connects to real-time market data from the backend WebSocket relay.
 * Falls back to mock price generation for development/testing.
 *
 * Events emitted:
 *   - price:       { price, direction, magnitude, change24h, percentChange24h }
 *   - orderbook:   { buyWallTotal, sellWallTotal, pressure, currentPrice }
 *   - depth:       { bids, asks, currentPrice, lowerBound, upperBound }
 *   - liquidation: { side, price, quantity, totalUSD, timestamp, exchange }
 */
export class PriceFeed {
  constructor() {
    this.price = 0;
    this.listeners = {
      price: [],
      orderbook: [],
      depth: [],
      liquidation: [],
    };
    this.interval = null;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 15000;
    this.shouldReconnect = true;
    this.wsUrl = null;
  }

  // ========== SUBSCRIPTIONS ==========

  /**
   * Subscribe to price updates (backward-compatible with existing code).
   * @param {Function} callback - Receives { price, direction, magnitude, change24h, percentChange24h }
   */
  subscribe(callback) {
    this.listeners.price.push(callback);
  }

  /**
   * Subscribe to order book summary updates.
   * @param {Function} callback - Receives { buyWallTotal, sellWallTotal, pressure, currentPrice }
   */
  onOrderBook(callback) {
    this.listeners.orderbook.push(callback);
  }

  /**
   * Subscribe to depth chart data updates.
   * @param {Function} callback - Receives { bids, asks, currentPrice, lowerBound, upperBound }
   */
  onDepth(callback) {
    this.listeners.depth.push(callback);
  }

  /**
   * Subscribe to liquidation events.
   * @param {Function} callback - Receives { side, price, quantity, totalUSD, timestamp, exchange }
   */
  onLiquidation(callback) {
    this.listeners.liquidation.push(callback);
  }

  _emit(type, data) {
    const callbacks = this.listeners[type] || [];
    callbacks.forEach((cb) => cb(data));
  }

  // ========== LIVE WEBSOCKET ==========

  /**
   * Connect to the backend WebSocket relay for live data.
   * @param {string} wsUrl - WebSocket URL (default: 'ws://localhost:3001/ws')
   */
  connectLive(wsUrl = 'ws://localhost:3001/ws') {
    this.wsUrl = wsUrl;
    this.shouldReconnect = true;
    this._connectWs();
  }

  _connectWs() {
    if (this.ws) {
      this.ws.close();
    }

    console.log(`[PriceFeed] Connecting to ${this.wsUrl}...`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('[PriceFeed] ✅ Connected to server');
      this.reconnectDelay = 1000; // Reset backoff
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        this._handleServerMessage(type, data);
      } catch (err) {
        console.error('[PriceFeed] Parse error:', err.message);
      }
    };

    this.ws.onclose = () => {
      console.warn('[PriceFeed] Disconnected from server');
      if (this.shouldReconnect) {
        console.log(`[PriceFeed] Reconnecting in ${this.reconnectDelay}ms...`);
        setTimeout(() => this._connectWs(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[PriceFeed] WebSocket error');
    };
  }

  _handleServerMessage(type, data) {
    switch (type) {
      case 'ticker': {
        const oldPrice = this.price;
        this.price = data.price;
        const change = data.price - oldPrice;
        const direction = change >= 0 ? 'up' : 'down';
        // Normalize magnitude: $50 move = magnitude 1.0
        const magnitude = Math.min(Math.abs(change) / 50, 1);

        this._emit('price', {
          price: data.price,
          direction,
          magnitude,
          change24h: data.change24h,
          percentChange24h: data.percentChange24h,
          volume24h: data.volume24h,
          high24h: data.high24h,
          low24h: data.low24h,
        });
        break;
      }

      case 'orderbook_summary':
        this._emit('orderbook', data);
        break;

      case 'depth_chart':
        this._emit('depth', data);
        break;

      case 'liquidation':
        this._emit('liquidation', data);
        break;
    }
  }

  // ========== MOCK FEED ==========

  /**
   * Start generating mock price movements for testing.
   * @param {number} intervalMs - How often to emit updates (ms)
   */
  startMock(intervalMs = 1200) {
    this.price = this.price || 50000;
    this.interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 150;
      this.price += change;
      this.price = Math.max(100, this.price);

      const direction = change > 0 ? 'up' : 'down';
      const magnitude = Math.min(Math.abs(change) / 75, 1);

      this._emit('price', {
        price: this.price,
        direction,
        magnitude,
        change24h: 0,
        percentChange24h: 0,
      });
    }, intervalMs);

    // Mock order book data every 2 seconds
    setInterval(() => {
      const buyWall = 20_000_000 + Math.random() * 30_000_000;
      const sellWall = 20_000_000 + Math.random() * 30_000_000;
      const ratio = buyWall / sellWall;
      let pressure = 'contested';
      if (ratio > 1.15) pressure = 'buyers_advancing';
      else if (ratio < 0.85) pressure = 'sellers_advancing';

      this._emit('orderbook', {
        buyWallTotal: buyWall,
        sellWallTotal: sellWall,
        pressure,
        currentPrice: this.price,
      });
    }, 2000);

    // Mock liquidation every 5-15 seconds
    const mockLiq = () => {
      const sides = ['long', 'short'];
      const side = sides[Math.floor(Math.random() * 2)];
      const totalUSD = 10000 + Math.random() * 500000;

      this._emit('liquidation', {
        side,
        price: this.price + (Math.random() - 0.5) * 200,
        quantity: totalUSD / this.price,
        totalUSD,
        timestamp: Date.now(),
        exchange: 'Mock',
      });

      setTimeout(mockLiq, 5000 + Math.random() * 10000);
    };
    setTimeout(mockLiq, 3000);
  }

  // ========== EXTERNAL PUSH ==========

  /**
   * Push a real price update from an external source.
   * @param {number} newPrice
   */
  pushUpdate(newPrice) {
    const change = newPrice - this.price;
    this.price = newPrice;

    const direction = change >= 0 ? 'up' : 'down';
    const magnitude = Math.min(Math.abs(change) / 75, 1);

    this._emit('price', {
      price: this.price,
      direction,
      magnitude,
      change24h: 0,
      percentChange24h: 0,
    });
  }

  // ========== CLEANUP ==========

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
