/**
 * OrderBookAggregator — maintains a local order book from Binance depth updates.
 * Computes buy/sell wall totals and market pressure status.
 */
export class OrderBookAggregator {
  constructor() {
    // Price → quantity maps
    this.bids = new Map(); // buy orders (below current price)
    this.asks = new Map(); // sell orders (above current price)

    this.lastUpdateId = 0;
    this.currentPrice = 0;
    this.snapshotLoaded = false;

    // Computed values
    this.buyWallTotal = 0;
    this.sellWallTotal = 0;
    this.pressure = 'contested';

    // Depth range: how far from current price to aggregate (in USD)
    this.depthRange = 500; // ±$500 from current price
  }

  /**
   * Load initial order book snapshot from Binance REST API.
   */
  async loadSnapshot() {
    try {
      const res = await fetch('https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=1000');
      const data = await res.json();

      this.bids.clear();
      this.asks.clear();

      for (const [price, qty] of data.bids) {
        const p = parseFloat(price);
        const q = parseFloat(qty);
        if (q > 0) this.bids.set(p, q);
      }

      for (const [price, qty] of data.asks) {
        const p = parseFloat(price);
        const q = parseFloat(qty);
        if (q > 0) this.asks.set(p, q);
      }

      if (!this.currentPrice && data.bids.length > 0) {
        this.currentPrice = parseFloat(data.bids[0][0]);
      }

      this.lastUpdateId = data.lastUpdateId;
      this.snapshotLoaded = true;
      console.log(`[OrderBook] Snapshot loaded: ${this.bids.size} bids, ${this.asks.size} asks`);

      this._recompute();
    } catch (err) {
      console.error('[OrderBook] Failed to load snapshot:', err.message);
      // Retry after 5s
      setTimeout(() => this.loadSnapshot(), 5000);
    }
  }

  /**
   * Apply incremental depth update from WebSocket.
   */
  applyUpdate(update) {
    if (!this.snapshotLoaded) return;

    // Drop updates older than our snapshot
    if (update.finalUpdateId <= this.lastUpdateId) return;

    // Apply bid updates
    for (const [price, qty] of update.bids) {
      if (qty === 0) {
        this.bids.delete(price);
      } else {
        this.bids.set(price, qty);
      }
    }

    // Apply ask updates
    for (const [price, qty] of update.asks) {
      if (qty === 0) {
        this.asks.delete(price);
      } else {
        this.asks.set(price, qty);
      }
    }

    this.lastUpdateId = update.finalUpdateId;
    this._recompute();
  }

  /**
   * Update the current mid-price (from ticker).
   */
  setPrice(price) {
    this.currentPrice = price;
    this._recompute();
  }

  /**
   * Recompute buy/sell wall totals and market pressure.
   */
  _recompute() {
    if (!this.currentPrice) return;

    const lowerBound = this.currentPrice - this.depthRange;
    const upperBound = this.currentPrice + this.depthRange;

    // Buy wall: sum of (price × quantity) for bids within range
    let buyTotal = 0;
    for (const [price, qty] of this.bids) {
      if (price >= lowerBound && price <= this.currentPrice) {
        buyTotal += price * qty;
      }
    }

    // Sell wall: sum of (price × quantity) for asks within range
    let sellTotal = 0;
    for (const [price, qty] of this.asks) {
      if (price >= this.currentPrice && price <= upperBound) {
        sellTotal += price * qty;
      }
    }

    this.buyWallTotal = buyTotal;
    this.sellWallTotal = sellTotal;

    // Determine pressure
    const ratio = buyTotal / (sellTotal || 1);
    if (ratio > 1.15) {
      this.pressure = 'buyers_advancing';
    } else if (ratio < 0.85) {
      this.pressure = 'sellers_advancing';
    } else {
      this.pressure = 'contested';
    }
  }

  /**
   * Get depth data for the depth chart (sorted arrays of [price, cumulative USD]).
   * Returns bids descending from current price, asks ascending from current price.
   */
  getDepthChartData() {
    const lowerBound = this.currentPrice - this.depthRange;
    const upperBound = this.currentPrice + this.depthRange;

    // Bids: sorted descending by price
    const bidEntries = [];
    for (const [price, qty] of this.bids) {
      if (price >= lowerBound && price <= this.currentPrice) {
        bidEntries.push([price, qty]);
      }
    }
    bidEntries.sort((a, b) => b[0] - a[0]); // descending

    // Cumulative bids
    let cumBid = 0;
    const bidDepth = bidEntries.map(([price, qty]) => {
      cumBid += price * qty;
      return [price, cumBid];
    });

    // Asks: sorted ascending by price
    const askEntries = [];
    for (const [price, qty] of this.asks) {
      if (price >= this.currentPrice && price <= upperBound) {
        askEntries.push([price, qty]);
      }
    }
    askEntries.sort((a, b) => a[0] - b[0]); // ascending

    // Cumulative asks
    let cumAsk = 0;
    const askDepth = askEntries.map(([price, qty]) => {
      cumAsk += price * qty;
      return [price, cumAsk];
    });

    return {
      bids: bidDepth,
      asks: askDepth,
      currentPrice: this.currentPrice,
      lowerBound,
      upperBound,
    };
  }

  /**
   * Get a summary snapshot for broadcasting to clients.
   */
  getSummary() {
    return {
      buyWallTotal: this.buyWallTotal,
      sellWallTotal: this.sellWallTotal,
      pressure: this.pressure,
      currentPrice: this.currentPrice,
    };
  }
}
