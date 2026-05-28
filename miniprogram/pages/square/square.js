Page({
  data: {
    latitude: 39.9042, longitude: 116.4074, scale: 14, markers: [],
    waypoints: [], allWaypoints: [], categories: [], activeCategories: [], activeCategoryMap: {},
    searchKeyword: '', loading: true,
    drawerHeight: 550, drawerOffset: 650,
    searchHistory: [], showHistory: false, historyHidden: false,
    selectedWaypoint: null,
  },

  onLoad() {
    const capsule = wx.getMenuButtonBoundingClientRect();
    const { windowWidth } = wx.getWindowInfo();
    const s = 750 / windowWidth, gap = 12;
    this.setData({
      searchRight: (windowWidth - capsule.left + gap) * s,
      searchTop: capsule.top * s + 6,
      searchHeight: capsule.height * s,
    });
    this.loadCategories();
    this.loadWaypoints();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadCategories();
    this.loadWaypoints();
  },

  loadCategories(sourceWaypoints) {
    const base = ['美食','咖啡','风景','根据地','购物','娱乐','其他'];
    const stored = wx.getStorageSync('customCategories') || [];
    const seen = new Set([...base, ...stored]);
    const waypoints = sourceWaypoints || this.data.allWaypoints || [];
    waypoints.forEach(w => { (w.categories || []).forEach(c => { if (c) seen.add(c); }); });
    this.setData({ categories: [...seen].sort((a,b) => (a==='其他'?1:b==='其他'?-1:0)) });
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.category;
    let active = [...this.data.activeCategories];
    if (!cat) { active = []; }
    else { const i = active.indexOf(cat); i > -1 ? active.splice(i, 1) : active.push(cat); }
    const map = {}; active.forEach(c => map[c] = true);
    this.setData({ activeCategories: active, activeCategoryMap: map }, () => this.applyFilters());
  },

  loadWaypoints() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'waypointFunctions',
      data: { action: 'getSquareWaypoints', limit: 500 }
    }).then(({ result }) => {
      if (!result.success) { this.setData({ allWaypoints: [], waypoints: [], markers: [], loading: false }); return; }
      const waypoints = (result.data || []).map(wp => this.formatWaypoint(wp));
      this.setData({ allWaypoints: waypoints, loading: false }, () => {
        this.loadCategories(waypoints);
        this.applyFilters();
      });
    }).catch(() => { this.setData({ allWaypoints: [], waypoints: [], markers: [], loading: false }); });
  },

  applyFilters() {
    const active = this.data.activeCategories || [];
    const keyword = (this.data.searchKeyword || '').trim().toLowerCase();
    let waypoints = this.data.allWaypoints || [];
    if (active.length > 0) {
      waypoints = waypoints.filter(wp => (wp.categories || []).some(c => active.includes(c)));
    }
    if (keyword) {
      waypoints = waypoints.filter((wp) => {
        const text = [
          wp.name, wp.address, wp.notes,
          ...(wp.categories || []),
          ...(wp.tags || []),
        ].join(' ').toLowerCase();
        return text.includes(keyword);
      });
    }
    this.setData({ waypoints, markers: this.buildMarkers(waypoints) });
  },

  formatWaypoint(wp) {
    const emojiMap = { '美食':'🍜','咖啡':'☕','风景':'🏔️','根据地':'🏠','购物':'🛍️','娱乐':'🎮','其他':'📍' };
    const cats = wp.categories || (wp.category ? [wp.category] : ['其他']);
    return { ...wp, categories: cats, categoryEmoji: emojiMap[cats[0]] || '📍' };
  },

  buildMarkers(waypoints) {
    const colors = { '美食':'#FF6B35','咖啡':'#8B5E3C','风景':'#10B981','根据地':'#6366F1','购物':'#F59E0B','娱乐':'#EC4899','其他':'#6B7280' };
    const emojis = { '美食':'🍜','咖啡':'☕','风景':'🏔️','根据地':'🏠','购物':'🛍️','娱乐':'🎮','其他':'📍' };
    return waypoints.map((wp, i) => {
      const loc = wp.location || {};
      const lat = loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0;
      const lng = loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0;
      const cat = (wp.categories && wp.categories[0]) || '其他';
      return {
        id: i, latitude: lat, longitude: lng, iconPath: '', width: 1, height: 1,
        label: { content: emojis[cat] || '📍', color: colors[cat] || '#6B7280', fontSize: 22, bgColor: 'transparent', borderRadius: 0, padding: 4, display: 'ALWAYS', textAlign: 'center' },
        callout: { content: wp.name, color: '#4A3A35', fontSize: 12, bgColor: '#FFFDF7', borderRadius: 8, padding: 6, display: 'BYCLICK' },
      };
    });
  },

  onLocateMe() {
    wx.getLocation({ type: 'gcj02', success: (res) => {
      const { drawerHeight, scale } = this.data;
      const { windowHeight, windowWidth } = wx.getWindowInfo();
      const drawerPx = drawerHeight * windowWidth / 750;
      const offsetPx = (windowHeight / 2) - ((windowHeight - drawerPx) / 2);
      const degPerPx = 360 / (256 * Math.pow(2, scale || 15));
      this.setData({ latitude: res.latitude - offsetPx * degPerPx, longitude: res.longitude });
    }, fail: () => { wx.showToast({ title: '获取位置失败', icon: 'none' }); }});
  },

  onSearchFocus() { setTimeout(() => { this.setData({ searchKeyword: '', showHistory: true }); this.loadSearchHistory(); }, 50); },
  onSearchBlur() { setTimeout(() => this.setData({ showHistory: false }), 200); },
  onSearchInput(e) {
    const v = e.detail.value;
    this.setData({ searchKeyword: v, showHistory: false });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => { this.applyFilters(); }, 160);
  },
  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    const kw = this.data.searchKeyword.trim();
    if (kw) { const history = wx.getStorageSync('searchHistory') || []; const f = history.filter(h => h !== kw); f.unshift(kw); wx.setStorageSync('searchHistory', f.slice(0, 20)); }
    this.setData({ showHistory: false });
    this.applyFilters();
  },
  loadSearchHistory() { this.setData({ searchHistory: (wx.getStorageSync('searchHistory') || []).slice(0, 10) }); },
  onHistoryTap(e) { this.setData({ searchKeyword: e.currentTarget.dataset.keyword, showHistory: false }, () => this.applyFilters()); },
  onToggleHistory() { this.setData({ historyHidden: !this.data.historyHidden }); },
  onClearHistory() { wx.setStorageSync('searchHistory', []); this.setData({ searchHistory: [], showHistory: false, historyHidden: false }); },

  onDrawerTouchStart(e) { this._dragSY = e.touches[0].clientY; this._dragSH = this.data.drawerHeight; this._dragOn = false; },
  onDrawerTouchMove(e) {
    if (this._dragSY == null) return;
    if (!this._dragOn && Math.abs(e.touches[0].clientY - this._dragSY) < 6) return;
    this._dragOn = true;
    const newH = Math.max(120, Math.min(1200, this._dragSH + (this._dragSY - e.touches[0].clientY)));
    this.setData({ drawerHeight: newH, drawerOffset: 1200 - newH });
  },
  onDrawerTouchEnd() { this._dragSY = null; this._dragOn = false; },

  onMarkerTap(e) { const wp = this.data.waypoints[e.detail.markerId]; if (wp) this.setData({ selectedWaypoint: wp }); },
  onCalloutClose() { this.setData({ selectedWaypoint: null }); },
  onCalloutTap() { const wp = this.data.selectedWaypoint; if (wp) { this.setData({ selectedWaypoint: null }); wx.navigateTo({ url: '/pages/detail/detail?id=' + wp._id }); } },
  onCardTap(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },
});
