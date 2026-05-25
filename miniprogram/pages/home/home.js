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
    activeCategory: '',

    // UI state
    drawerHeight: 320,
    drawerStartY: 0,
    drawerStartH: 0,
    selectedWaypoint: null,
    loading: true,
    refreshing: false,
    searchHistory: [],
    showHistory: false,
  },

  onLoad() {
    const theme = app.globalData.theme || wx.getStorageSync('theme') || 'cute';
    this.setData({ theme });
    this.applyTheme(theme);
    this.loadCategories();
    this.getCurrentLocation();
    this.loadSearchHistory();
    this.loadWaypoints();
  },

  onShow() {
    const style = app.globalData.markerStyle || wx.getStorageSync('markerStyle') || 'game';
    if (this.data.waypoints.length > 0) {
      this.setData({ markers: [] }, () => {
        const markers = this.buildMarkers(this.data.waypoints);
        this.setData({ markers });
      });
    }
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
    const { latitude, longitude, searchKeyword, activeCategory } = this.data;

    const hasFilter = searchKeyword || activeCategory;
    const action = hasFilter ? 'searchWaypoints' : 'getNearbyWaypoints';
    const params = { action, skip: 0, limit: 50 };
    if (searchKeyword) params.keyword = searchKeyword;
    if (activeCategory) params.category = activeCategory;
    if (!hasFilter) {
      params.latitude = latitude;
      params.longitude = longitude;
    }

    // 5 秒超时兜底，超时直接显示空状态
    const call = app.callFunction('waypointFunctions', params);
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));

    return Promise.race([call, timeout]).then((res) => {
      if (res && res.result && res.result.success) {
        const waypoints = (res.result.data || []).map(wp => this.formatWaypoint(wp));
        const markers = this.buildMarkers(waypoints);
        this.setData({ waypoints, markers, loading: false });
      } else {
        this.setData({ waypoints: [], markers: [], loading: false });
      }
    }).catch(() => {
      this.setData({ waypoints: [], markers: [], loading: false });
    });
  },

  formatWaypoint(wp) {
    return {
      ...wp,
      ratingStars: wp.rating > 0 ? '⭐'.repeat(Math.round(wp.rating)) : '',
      ratingRounded: Math.round(wp.rating),
    };
  },

  loadCategories() {
    const fallback = ['美食', '咖啡', '风景', '根据地', '购物', '娱乐', '其他'];
    this.setData({ categories: fallback });
    // 静默尝试云函数（5s 兜底）
    const call = app.callFunction('waypointFunctions', { action: 'getPresetCategories' });
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
    Promise.race([call, timeout]).then((res) => {
      if (res && res.result && res.result.success && res.result.data.length > 0) {
        this.setData({ categories: res.result.data });
      }
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
      const color = colors[wp.category] || '#6B7280';
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
            content: emojis[wp.category] || '📍',
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
    // 聚焦时清空上次搜索文字 + 显示历史
    this.setData({ searchKeyword: '', showHistory: true });
    this.loadSearchHistory();
  },
  onSearchBlur() {
    setTimeout(() => this.setData({ showHistory: false }), 200);
  },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value, showHistory: false });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => { this.loadWaypoints(); }, 300);
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
  onClearHistory() {
    wx.setStorageSync('searchHistory', []);
    this.setData({ searchHistory: [], showHistory: false });
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadWaypoints().finally(() => {
      this.setData({ refreshing: false });
    });
  },

  onCategoryTap(e) {
    const cat = e.currentTarget.dataset.category;
    const activeCategory = this.data.activeCategory === cat ? '' : cat;
    this.setData({ activeCategory });
    this.loadWaypoints();
  },

  // ── Drawer Drag (实时响应) ──
  onDrawerTouchStart(e) {
    this.setData({
      drawerStartY: e.touches[0].clientY,
      drawerStartH: this.data.drawerHeight,
    });
  },
  onDrawerTouchMove(e) {
    if (!this.data.drawerStartY) return;
    const dy = this.data.drawerStartY - e.touches[0].clientY;
    const newH = Math.max(120, Math.min(550, this.data.drawerStartH + dy));
    this.setData({ drawerHeight: newH });
  },
  onDrawerTouchEnd() {
    this.setData({ drawerStartY: 0 });
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
    const call = app.callFunction('waypointFunctions', { action: 'seedSamples' });
    const timeout = new Promise((r) => setTimeout(() => r(null), 10000));
    Promise.race([call, timeout]).then((res) => {
      wx.hideLoading();
      if (res && res.result && res.result.success) {
        wx.showToast({ title: res.result.data.message, icon: 'success' });
        this.loadWaypoints();
      } else {
        wx.showModal({
          title: '播种失败',
          content: '请在云开发控制台 → 数据库 → 新建集合 "waypoints"，然后再试。',
          showCancel: false,
        });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showModal({
        title: '播种失败',
        content: '请在云开发控制台 → 数据库 → 新建集合 "waypoints"，然后再试。',
        showCancel: false,
      });
    });
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/detail/detail?mode=add' });
  },

  onMapRegionChange(e) {
    if (e.type === 'end' && e.detail.centerLocation) {
      this.setData({
        latitude: e.detail.centerLocation.latitude,
        longitude: e.detail.centerLocation.longitude,
      });
    }
  },
});
