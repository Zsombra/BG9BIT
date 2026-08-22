import { soundManager } from '../audio/SoundManager.js';

export class HUD {
  constructor() {
    this.elements = {};
    this.depthCanvas = null;
    this.depthCtx = null;
    this.feedItems = [];
    this.maxFeedItems = 50;
    this.lastDepthData = null;
    this._clockInterval = null;
  }

  /**
   * Initialize all HUD elements by binding to DOM nodes.
   * Call after DOM is ready.
   */
  init() {
    // Cache DOM references
    this.elements = {
      hud: document.getElementById('hud'),
      clock: document.getElementById('hudClock'),
      price: document.getElementById('hudPrice'),
      change: document.getElementById('hudChange'),
      pressure: document.getElementById('hudPressure'),
      lastEvent: document.getElementById('hudLastEvent'),
      sellWall: document.getElementById('hudSellWall'),
      buyWall: document.getElementById('hudBuyWall'),
      depthCanvas: document.getElementById('depthCanvas'),
      depthLow: document.getElementById('depthLow'),
      depthMid: document.getElementById('depthMid'),
      depthHigh: document.getElementById('depthHigh'),
      feedList: document.getElementById('feedList'),
      loading: document.getElementById('loading'),
      loadProgress: document.getElementById('loadProgress'),
      loadStatus: document.getElementById('loadStatus'),
      btnAudio: document.getElementById('btnAudio'),
      btnFullscreen: document.getElementById('btnFullscreen'),
    };

    this.depthCanvas = this.elements.depthCanvas;
    if (this.depthCanvas) {
      this.depthCtx = this.depthCanvas.getContext('2d');
    }

    // Audio button toggle
    if (this.elements.btnAudio) {
      this.elements.btnAudio.addEventListener('click', () => {
        const isMuted = soundManager.toggleMute();
        this.elements.btnAudio.textContent = isMuted ? '🔇' : '🔊';
        this.elements.btnAudio.style.borderColor = isMuted ? 'rgba(255, 255, 255, 0.1)' : '#00f0ff';
        this.elements.btnAudio.style.color = isMuted ? '#8888aa' : '#00f0ff';
      });
    }

    // Fullscreen toggle
    if (this.elements.btnFullscreen) {
      this.elements.btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Start UTC clock
    this._startClock();
  }

  _ensureDepthCanvasSize() {
    if (!this.depthCanvas) return;
    if (!this.depthCtx) {
      this.depthCtx = this.depthCanvas.getContext('2d');
    }
    const rect = this.depthCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor((rect.width || 360) * dpr);
    const targetH = Math.floor((rect.height || 120) * dpr);

    if (this.depthCanvas.width !== targetW || this.depthCanvas.height !== targetH) {
      this.depthCanvas.width = targetW;
      this.depthCanvas.height = targetH;
      this.depthCtx = this.depthCanvas.getContext('2d');
    }
  }

  /**
   * Show the HUD (call after loading is complete).
   */
  show() {
    if (this.elements.hud) {
      this.elements.hud.style.display = '';
    }

    this._ensureDepthCanvasSize();
    if (this.lastDepthData) {
      this.updateDepthChart(this.lastDepthData);
    }

    // Fade out loading screen
    if (this.elements.loading) {
      this.elements.loading.classList.add('fade-out');
      setTimeout(() => {
        this.elements.loading.style.display = 'none';
      }, 600);
    }
  }

  /**
   * Update loading progress.
   */
  setLoadProgress(percent, statusText) {
    if (this.elements.loadProgress) {
      this.elements.loadProgress.style.width = `${percent}%`;
    }
    if (this.elements.loadStatus && statusText) {
      this.elements.loadStatus.textContent = statusText;
    }
  }

  // ========== PRICE ==========

  updatePrice({ price, percentChange24h }) {
    if (this.elements.price) {
      this.elements.price.textContent = `$${price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    if (this.elements.change) {
      const isUp = percentChange24h >= 0;
      const sign = isUp ? '+' : '';
      this.elements.change.textContent = `${sign}${percentChange24h.toFixed(2)}% 24h`;
      this.elements.change.className = `change ${isUp ? 'up' : 'down'}`;
    }
  }

  // ========== ORDER BOOK / WALLS ==========

  updateOrderBook({ buyWallTotal, sellWallTotal, pressure }) {
    if (this.elements.buyWall) {
      this.elements.buyWall.textContent = `$${this._formatMillions(buyWallTotal)}`;
    }
    if (this.elements.sellWall) {
      this.elements.sellWall.textContent = `$${this._formatMillions(sellWallTotal)}`;
    }
    this.updatePressure(pressure);
  }

  // ========== MARKET PRESSURE ==========

  updatePressure(pressure) {
    if (!this.elements.pressure) return;

    const labels = {
      contested: 'Contested',
      buyers_advancing: 'Buyers Advancing',
      sellers_advancing: 'Sellers Advancing',
    };
    const classes = {
      contested: 'contested',
      buyers_advancing: 'buyers',
      sellers_advancing: 'sellers',
    };

    this.elements.pressure.textContent = labels[pressure] || 'Contested';
    this.elements.pressure.className = `pressure-status ${classes[pressure] || 'contested'}`;
  }

  // ========== DEPTH CHART ==========

  updateDepthChart(depthData) {
    this.lastDepthData = depthData;
    this._ensureDepthCanvasSize();
    if (!this.depthCtx || !depthData) return;

    const ctx = this.depthCtx;
    const canvas = this.depthCanvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const { bids, asks, currentPrice, lowerBound, upperBound } = depthData;
    if (!bids || !asks || (!bids.length && !asks.length)) {
      ctx.restore();
      return;
    }

    const priceRange = (upperBound - lowerBound) || 1000;
    const midX = Math.max(0, Math.min(w, ((currentPrice - lowerBound) / priceRange) * w));

    // Find max cumulative value for Y scaling
    const maxBid = bids.length > 0 ? bids[bids.length - 1][1] : 0;
    const maxAsk = asks.length > 0 ? asks[asks.length - 1][1] : 0;
    const maxVal = Math.max(maxBid, maxAsk, 10000);

    const priceToX = (p) => Math.max(0, Math.min(w, ((p - lowerBound) / priceRange) * w));
    const valToY = (v) => h - Math.min(h - 8, (v / maxVal) * (h - 14));

    // 1. Draw Bids (Green area, left side)
    if (bids.length > 0) {
      ctx.beginPath();
      ctx.moveTo(midX, h);

      for (let i = 0; i < bids.length; i++) {
        const x = priceToX(bids[i][0]);
        const y = valToY(bids[i][1]);
        if (i === 0) {
          ctx.lineTo(midX, y);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, valToY(bids[i - 1][1]));
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(0, valToY(maxBid));
      ctx.lineTo(0, h);
      ctx.closePath();

      const bidGrad = ctx.createLinearGradient(0, 0, 0, h);
      bidGrad.addColorStop(0, 'rgba(0, 255, 136, 0.45)');
      bidGrad.addColorStop(1, 'rgba(0, 255, 136, 0.05)');
      ctx.fillStyle = bidGrad;
      ctx.fill();

      // Top stroke
      ctx.beginPath();
      ctx.moveTo(midX, valToY(bids[0][1]));
      for (let i = 0; i < bids.length; i++) {
        const x = priceToX(bids[i][0]);
        const y = valToY(bids[i][1]);
        if (i > 0) ctx.lineTo(x, valToY(bids[i - 1][1]));
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // 2. Draw Asks (Red area, right side)
    if (asks.length > 0) {
      ctx.beginPath();
      ctx.moveTo(midX, h);

      for (let i = 0; i < asks.length; i++) {
        const x = priceToX(asks[i][0]);
        const y = valToY(asks[i][1]);
        if (i === 0) {
          ctx.lineTo(midX, y);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, valToY(asks[i - 1][1]));
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(w, valToY(maxAsk));
      ctx.lineTo(w, h);
      ctx.closePath();

      const askGrad = ctx.createLinearGradient(0, 0, 0, h);
      askGrad.addColorStop(0, 'rgba(255, 68, 102, 0.45)');
      askGrad.addColorStop(1, 'rgba(255, 68, 102, 0.05)');
      ctx.fillStyle = askGrad;
      ctx.fill();

      // Top stroke
      ctx.beginPath();
      ctx.moveTo(midX, valToY(asks[0][1]));
      for (let i = 0; i < asks.length; i++) {
        const x = priceToX(asks[i][0]);
        const y = valToY(asks[i][1]);
        if (i > 0) ctx.lineTo(x, valToY(asks[i - 1][1]));
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ff4466';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // Center dotted divider (current price line)
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, h);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // Update axis labels
    if (this.elements.depthLow) {
      this.elements.depthLow.textContent = `$${Math.round(lowerBound).toLocaleString('en-US')}`;
    }
    if (this.elements.depthMid) {
      this.elements.depthMid.textContent = `$${Math.round(currentPrice).toLocaleString('en-US')}`;
    }
    if (this.elements.depthHigh) {
      this.elements.depthHigh.textContent = `$${Math.round(upperBound).toLocaleString('en-US')}`;
    }
  }

  // ========== MARKET FEED ==========

  addLiquidation({ side, totalUSD, price, exchange }) {
    soundManager.playLiquidation();

    const event = {
      side,
      totalUSD,
      price,
      exchange: exchange || 'Binance',
      timestamp: Date.now(),
    };

    this.feedItems.unshift(event);
    if (this.feedItems.length > this.maxFeedItems) {
      this.feedItems.pop();
    }

    // Render to DOM
    if (!this.elements.feedList) return;

    const li = document.createElement('li');
    li.className = 'feed-item';

    const sideLabel = side === 'long' ? 'Liquidated long' : 'Liquidated short';
    const sizeStr = totalUSD >= 1_000_000
      ? `$${(totalUSD / 1_000_000).toFixed(1)}M`
      : `$${(totalUSD / 1_000).toFixed(1)}K`;
    const priceStr = `$${Math.round(price).toLocaleString('en-US')}`;

    // Impact on which army
    const impactSide = side === 'long' ? 'bulls' : 'bears';
    const impactLabel = side === 'long' ? 'Bulls' : 'Bears';

    // Estimate unit impact
    const units = Math.max(1, Math.round(totalUSD / 10000));

    li.innerHTML = `
      <span class="event-text">${sideLabel} · ${sizeStr} @ ${priceStr}</span>
      <span class="event-impact ${impactSide}">${impactLabel} -${units} units</span>
    `;

    this.elements.feedList.insertBefore(li, this.elements.feedList.firstChild);

    // Keep DOM in sync — remove old items
    while (this.elements.feedList.children.length > this.maxFeedItems) {
      this.elements.feedList.removeChild(this.elements.feedList.lastChild);
    }

    // Update last event text in pressure area
    if (this.elements.lastEvent) {
      this.elements.lastEvent.textContent = `${event.exchange} · ${sideLabel} · ${sizeStr} @ ${priceStr}`;
    }
  }

  // ========== HELPERS ==========

  _formatMillions(value) {
    if (!value || isNaN(value)) return '0.0M';
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  }

  _startClock() {
    const update = () => {
      if (this.elements.clock) {
        const now = new Date();
        const h = String(now.getUTCHours()).padStart(2, '0');
        const m = String(now.getUTCMinutes()).padStart(2, '0');
        const s = String(now.getUTCSeconds()).padStart(2, '0');
        this.elements.clock.textContent = `UTC ${h}:${m}:${s}`;
      }
    };
    update();
    this._clockInterval = setInterval(update, 1000);
  }

  destroy() {
    clearInterval(this._clockInterval);
  }
}
