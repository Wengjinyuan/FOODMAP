const app = getApp();

Page({
  data: {
    // Map state
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 14,
    markers: [],

    // Theme
    theme: 'cute',

    // Waypoint data
    waypoints: [],
    categories: [],
    searchKeyword: '',
    activeCategories: [],
    activeCategoryMap: {},

    // UI state
    drawerHeight: 550,
    drawerOffset: 650,
    drawerStartY: 0,
    drawerStartH: 0,
    selectedWaypoint: null,
    loading: true,
    refreshing: false,
    searchHistory: [],
    showHistory: false,
    historyHidden: false,
  },

  onLoad() {
    const theme = app.globalData.theme || wx.getStorageSync('theme') || 'cute';
    // 获取微信胶囊按钮位置，搜索栏避开它
    const capsule = wx.getMenuButtonBoundingClientRect();
    const { windowWidth } = wx.getWindowInfo();
    const scale = 750 / windowWidth; // px → rpx
    const gap = 12; // 搜索栏和胶囊之间间距(px)
    const searchRight = (windowWidth - capsule.left + gap) * scale;
    const searchTop = capsule.top * scale + 6;
    const searchHeight = capsule.height * scale;

    this.setData({
      theme,
      searchRight,
      searchTop,
      searchHeight,
    });
    this.applyTheme(theme);
    this.loadCategories();
    this.getCurrentLocation();
    this.loadSearchHistory();
    this.loadWaypoints();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.loadCategories();
    this.loadWaypoints();
  },

  // ── Theme ──
  toggleTheme() {
    const theme = this.data.theme === 'cute' ? 'warm' : 'cute';
    this.setData({ theme });
    app.globalData.theme = theme;
    wx.setStorageSync('theme', theme);
    this.applyTheme(theme);
  },

  applyTheme(theme) {
    const isCute = theme === 'cute';
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: isCute ? '#FFFDF7' : '#F7F8FA',
    });
    wx.setBackgroundColor({
      backgroundColor: isCute ? '#FFFDF7' : '#F7F8FA',
    });
    if (this.data.waypoints.length > 0) {
      const markers = this.buildMarkers(this.data.waypoints);
      this.setData({ markers });
    }
  },

  // ── Location ──
  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({ latitude: res.latitude, longitude: res.longitude });
        this.loadWaypoints();
      },
      fail: () => {
        this.loadWaypoints();
      },
    });
  },

  // ── Data Loading ──
  loadWaypoints() {
    this.setData({ loading: true });
    const { searchKeyword, activeCategories } = this.data;
    const db = app.getDb();
    if (!db) { this.setData({ loading: false }); return Promise.resolve(); }
    const _ = db.command;

    let query = db.collection('waypoints');
    if (searchKeyword) {
      query = query.where({ name: db.RegExp({ regexp: searchKeyword, options: 'i' }) });
    } else if (activeCategories.length > 0) {
      query = query.where(_.or([{ categories: _.in(activeCategories) }, { category: _.in(activeCategories) }]));
    }
    query = query.orderBy('create_time', 'desc').limit(50);

    return query.get().then((res) => {
      const waypoints = (res.data || []).map(wp => this.formatWaypoint(wp));
      const markers = this.buildMarkers(waypoints);
      this.setData({ waypoints, markers, loading: false });
    }).catch(() => {
      this.setData({ waypoints: [], markers: [], loading: false });
    });
  },

  formatWaypoint(wp) {
    const emojiMap = { '美食':'🍜','咖啡':'☕','风景':'🏔️','根据地':'🏠','购物':'🛍️','娱乐':'🎮','其他':'📍' };
    const cats = wp.categories || (wp.category ? [wp.category] : ['其他']);
    return {
      ...wp,
      categories: cats,
      categoryEmoji: emojiMap[cats[0]] || '📍',
      ratingStars: wp.rating > 0 ? '⭐'.repeat(Math.round(wp.rating)) : '',
      ratingRounded: Math.round(wp.rating),
    };
  },

  loadCategories() {
    const base = ['美食', '咖啡', '风景', '根据地', '购物', '娱乐', '其他'];
    const stored = wx.getStorageSync('customCategories') || [];
    const seen = new Set([...base, ...stored]);
    this.setData({ categories: [...seen].sort((a, b) => (a === '其他' ? 1 : b === '其他' ? -1 : 0)) });
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').field({ categories: true, category: true }).limit(500).get().then((res) => {
      (res.data || []).forEach(w => {
        const cats = w.categories || (w.category ? [w.category] : []);
        cats.forEach(c => { if (c) seen.add(c); });
      });
      this.setData({ categories: [...seen].sort((a, b) => (a === '其他' ? 1 : b === '其他' ? -1 : 0)) });
    }).catch(() => {});
  },

  // ── Markers ──
  buildMarkers(waypoints) {
    const markerStyle = app.globalData.markerStyle || wx.getStorageSync('markerStyle') || 'game';
    const calloutBgColor = '#FFFDF7';
    const calloutTextColor = '#4A3A35';
    const colors = {
      '美食': '#FF6B35', '咖啡': '#8B5E3C', '风景': '#10B981',
      '根据地': '#6366F1', '购物': '#F59E0B', '娱乐': '#EC4899', '其他': '#6B7280'
    };
    const emojis = {
      '美食': '🍜', '咖啡': '☕', '风景': '🏔️', '根据地': '🏠', '购物': '🛍️', '娱乐': '🎮', '其他': '📍'
    };

    // 每种风格使用不同的 id 偏移，确保切换时 map 组件检测到变化
    const idOffset = markerStyle === 'numbered' ? 2000 : markerStyle === 'minimal' ? 1000 : 0;

    return waypoints.map((wp, index) => {
      const loc = wp.location || {};
      const lat = loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0;
      const lng = loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0;
      const color = colors[wp.categories[0]] || '#6B7280';
      const markerId = idOffset + index;

      // Numbered style
      if (markerStyle === 'numbered') {
        return {
          id: markerId,
          latitude: lat, longitude: lng,
          iconPath: '', width: 1, height: 1,
          label: {
            content: String(index + 1),
            color: '#FFFFFF', fontSize: 14,
            bgColor: color, borderRadius: 20, padding: 8,
            display: 'ALWAYS', textAlign: 'center'
          },
          callout: {
            content: wp.name, color: calloutTextColor, fontSize: 12,
            bgColor: calloutBgColor,
            borderRadius: 8, padding: 6, display: 'BYCLICK'
          },
        };
      }

      // Game style (emoji pins)
      if (markerStyle === 'game') {
        return {
          id: markerId,
          latitude: lat, longitude: lng,
          iconPath: '', width: 1, height: 1,
          label: {
            content: emojis[wp.categories[0]] || '📍',
            color: color, fontSize: 22,
            bgColor: 'transparent', borderRadius: 0, padding: 4,
            display: 'ALWAYS', textAlign: 'center'
          },
          callout: {
            content: wp.name, color: calloutTextColor, fontSize: 12,
            bgColor: calloutBgColor,
            borderRadius: 8, padding: 6, display: 'BYCLICK'
          },
        };
      }

      // Minimal style (colored triangles)
      return {
        id: markerId,
        latitude: lat, longitude: lng,
        iconPath: '', width: 1, height: 1,
        label: {
          content: '▼',
          color: color, fontSize: 18,
          bgColor: 'transparent', borderRadius: 0, padding: 2,
          display: 'ALWAYS', textAlign: 'center'
        },
        callout: {
          content: wp.name, color: calloutTextColor, fontSize: 12,
          bgColor: calloutBgColor,
          borderRadius: 8, padding: 6, display: 'BYCLICK'
        },
      };
    });
  },

  // ── Events ──
  // ── Search ──
  loadSearchHistory() {
    const history = wx.getStorageSync('searchHistory') || [];
    this.setData({ searchHistory: history.slice(0, 10) });
  },
  onSearchFocus() {
    // 延迟确保 input 组件完成原生聚焦后再清空
    setTimeout(() => {
      this.setData({ searchKeyword: '', showHistory: true });
      this.loadSearchHistory();
    }, 50);
  },

  onSearchBlur() {
    setTimeout(() => this.setData({ showHistory: false }), 200);
  },
  onSearchInput(e) {
    const v = e.detail.value;
    this.setData({ searchKeyword: v, showHistory: false });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (!v || !v.trim()) {
      this.loadWaypoints();
    } else {
      this._searchTimer = setTimeout(() => { this.loadWaypoints(); }, 300);
    }
  },
  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    const kw = this.data.searchKeyword.trim();
    if (kw) {
      const history = wx.getStorageSync('searchHistory') || [];
      const filtered = history.filter(h => h !== kw);
      filtered.unshift(kw);
      wx.setStorageSync('searchHistory', filtered.slice(0, 20));
    }
    this.setData({ showHistory: false });
    this.loadWaypoints();
  },
  onHistoryTap(e) {
    const kw = e.currentTarget.dataset.keyword;
    this.setData({ searchKeyword: kw, showHistory: false });
    this.loadWaypoints();
  },
  onToggleHistory() {
    this.setData({ historyHidden: !this.data.historyHidden });
  },
  onClearHistory() {
    wx.setStorageSync('searchHistory', []);
    this.setData({ searchHistory: [], showHistory: false, historyHidden: false });
  },

  onLocateMe() {
    wx.getLocation({ type: 'gcj02', success: (res) => {
      const { drawerHeight, scale } = this.data;
      const { windowHeight, windowWidth } = wx.getWindowInfo();
      // 地图全屏渲染但下半截被抽屉遮住，把中心往北偏移让定位点落在可见区域中心
      const drawerPx = drawerHeight * windowWidth / 750;
      const visibleCenterPx = (windowHeight - drawerPx) / 2;  // 可见区域中心Y
      const screenCenterPx = windowHeight / 2;                 // 全屏中心Y
      const offsetPx = screenCenterPx - visibleCenterPx;       // 需要往上偏的像素
      const scaleVal = scale || 15;
      const degPerPx = 360 / (256 * Math.pow(2, scaleVal));
      this.setData({ latitude: res.latitude - offsetPx * degPerPx, longitude: res.longitude });
    }, fail: () => {
      wx.showToast({ title: '获取位置失败', icon: 'none' });
    }});
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadWaypoints().finally(() => {
      this.setData({ refreshing: false });
    });
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.category;
    let active = [...this.data.activeCategories];
    if (!cat) { active = []; }
    else { const i = active.indexOf(cat); i > -1 ? active.splice(i, 1) : active.push(cat); }
    const map = {};
    active.forEach(c => map[c] = true);
    this.setData({ activeCategories: active, activeCategoryMap: map }, () => this.loadWaypoints());
  },

  // ── Drawer Drag（6px死区 → 区分点击和拖拽）──
  onDrawerTouchStart(e) {
    this._dragSY = e.touches[0].clientY;
    this._dragSH = this.data.drawerHeight;
    this._dragOn = false;
  },
  onDrawerTouchMove(e) {
    if (this._dragSY == null) return;
    if (!this._dragOn && Math.abs(e.touches[0].clientY - this._dragSY) < 6) return;
    this._dragOn = true;
    const newH = Math.max(120, Math.min(1200, this._dragSH + (this._dragSY - e.touches[0].clientY)));
    this.setData({ drawerHeight: newH, drawerOffset: 1200 - newH });
  },
  onDrawerTouchEnd() {
    this._dragSY = null;
    this._dragOn = false;
  },

  onMarkerTap(e) {
    // 根据 id 偏移量反查真实 index
    const markerStyle = app.globalData.markerStyle || wx.getStorageSync('markerStyle') || 'game';
    const idOffset = markerStyle === 'numbered' ? 2000 : markerStyle === 'minimal' ? 1000 : 0;
    const idx = e.detail.markerId - idOffset;
    const wp = this.data.waypoints[idx];
    if (wp) {
      this.setData({ selectedWaypoint: wp });
    }
  },

  onCalloutClose() {
    this.setData({ selectedWaypoint: null });
  },

  onCalloutTap() {
    const wp = this.data.selectedWaypoint;
    if (wp) {
      this.setData({ selectedWaypoint: null });
      wx.navigateTo({ url: '/pages/detail/detail?id=' + wp._id });
    }
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  onSeedSamples() {
    wx.showLoading({ title: '播种中...' });
    wx.cloud.callFunction({ name: 'waypointFunctions', data: { action: 'seedSamples' } })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已播种 6 个传送点！', icon: 'success' });
        this.loadWaypoints();
    }).catch((e) => {
      wx.hideLoading();
      wx.showModal({
        title: '播种失败',
        content: '请在云开发控制台 → 数据库 → 新建集合 "waypoints"，然后再试。\n\n错误：' + (e.message || ''),
        showCancel: false,
      });
    });
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/detail/detail?mode=add' });
  },

  // 地图自己管理拖动位置，不干预
});
