/**
 * Mock price data generator.
 * Simulates crypto price movements for testing.
 * Can be replaced with a real WebSocket feed later via pushUpdate().
 */
export class PriceFeed {
  constructor() {
    this.price = 50000; // Starting mock BTC price
    this.listeners = [];
    this.interval = null;
  }

  /**
   * Subscribe to price updates.
   * @param {Function} callback - Receives { price, direction, magnitude }
   */
  subscribe(callback) {
    this.listeners.push(callback);
  }

  /**
   * Start generating mock price movements.
   * @param {number} intervalMs - How often to emit updates (ms)
   */
  startMock(intervalMs = 1200) {
    this.interval = setInterval(() => {
      // Random walk with slight momentum
      const change = (Math.random() - 0.5) * 150;
      this.price += change;
      this.price = Math.max(100, this.price); // Don't go negative

      const direction = change > 0 ? 'up' : 'down';
      // Normalize magnitude to 0-1 range (bigger moves = more intense battle)
      const magnitude = Math.min(Math.abs(change) / 75, 1);

      const data = { price: this.price, direction, magnitude };
      this.listeners.forEach((cb) => cb(data));
    }, intervalMs);
  }

  /**
   * Stop the mock feed.
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Push a real price update from an external source (e.g., WebSocket).
   * Call this from your React app or WebSocket handler.
   * @param {number} newPrice
   */
  pushUpdate(newPrice) {
    const change = newPrice - this.price;
    this.price = newPrice;

    const direction = change >= 0 ? 'up' : 'down';
    const magnitude = Math.min(Math.abs(change) / 75, 1);

    const data = { price: this.price, direction, magnitude };
    this.listeners.forEach((cb) => cb(data));
  }
}
