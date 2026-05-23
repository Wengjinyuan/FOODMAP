const app = getApp();

Page({
  data: {
    // Map state
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 14,
    markers: [],

    // Theme
    theme: 'dark',

    // Waypoint data
    waypoints: [],
    categories: [],
    searchKeyword: '',
    activeCategory: '',

    // UI state
    drawerHeight: 320,
    selectedWaypoint: null,
    loading: true,
    refreshing: false,
  },

  onLoad() {
    const theme = app.globalData.theme || wx.getStorageSync('theme') || 'dark';
    this.setData({ theme });
    this.applyTheme(theme);
    this.loadCategories();
    this.getCurrentLocation();
  },

  onShow() {
    this.loadWaypoints();
  },

  // ── Theme ──
  toggleTheme() {
    const theme = this.data.theme === 'dark' ? 'light' : 'dark';
    this.setData({ theme });
    app.globalData.theme = theme;
    wx.setStorageSync('theme', theme);
    this.applyTheme(theme);
  },

  applyTheme(theme) {
    const isDark = theme === 'dark';
    wx.setNavigationBarColor({
      frontColor: isDark ? '#ffffff' : '#000000',
      backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF',
    });
    wx.setBackgroundColor({
      backgroundColor: isDark ? '#0F0F23' : '#F5F5F5',
    });
    // Rebuild markers with correct theme-dependent callout colors
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

    return app.callFunction('waypointFunctions', params).then((res) => {
      if (res.result && res.result.success) {
        const waypoints = (res.result.data || []).map(wp => this.formatWaypoint(wp));
        const markers = this.buildMarkers(waypoints);
        this.setData({ waypoints, markers, loading: false });
      } else {
        this.setData({ waypoints: [], markers: [], loading: false });
      }
    }).catch(() => {
      this.setData({ waypoints: [], markers: [], loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
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
    app.callFunction('waypointFunctions', { action: 'getPresetCategories' }).then((res) => {
      if (res.result && res.result.success) {
        this.setData({ categories: res.result.data });
      }
    });
  },

  // ── Markers ──
  buildMarkers(waypoints) {
    const markerStyle = app.globalData.markerStyle || 'game';
    const isDark = this.data.theme === 'dark';
    const calloutBgColor = isDark ? '#1A1A2E' : '#333333';
    const colors = {
      '美食': '#FF6B35', '咖啡': '#8B5E3C', '风景': '#10B981',
      '根据地': '#6366F1', '购物': '#F59E0B', '娱乐': '#EC4899', '其他': '#6B7280'
    };
    const emojis = {
      '美食': '🍜', '咖啡': '☕', '风景': '🏔️', '根据地': '🏠', '购物': '🛍️', '娱乐': '🎮', '其他': '📍'
    };

    return waypoints.map((wp, index) => {
      const loc = wp.location || {};
      const lat = loc.latitude || (loc.coordinates && loc.coordinates[1]) || 0;
      const lng = loc.longitude || (loc.coordinates && loc.coordinates[0]) || 0;
      const color = colors[wp.category] || '#6B7280';

      // Numbered style
      if (markerStyle === 'numbered') {
        return {
          id: index,
          latitude: lat, longitude: lng,
          iconPath: '', width: 1, height: 1,
          label: {
            content: String(index + 1),
            color: '#FFFFFF', fontSize: 14,
            bgColor: color, borderRadius: 20, padding: 8,
            display: 'ALWAYS', textAlign: 'center'
          },
          callout: {
            content: wp.name, color: '#FFFFFF', fontSize: 12,
            bgColor: calloutBgColor,
            borderRadius: 8, padding: 6, display: 'BYCLICK'
          },
        };
      }

      // Game style (emoji pins)
      if (markerStyle === 'game') {
        return {
          id: index,
          latitude: lat, longitude: lng,
          iconPath: '', width: 1, height: 1,
          label: {
            content: emojis[wp.category] || '📍',
            color: color, fontSize: 22,
            bgColor: 'transparent', borderRadius: 0, padding: 4,
            display: 'ALWAYS', textAlign: 'center'
          },
          callout: {
            content: wp.name, color: '#FFFFFF', fontSize: 12,
            bgColor: calloutBgColor,
            borderRadius: 8, padding: 6, display: 'BYCLICK'
          },
        };
      }

      // Minimal style (colored triangles)
      return {
        id: index,
        latitude: lat, longitude: lng,
        iconPath: '', width: 1, height: 1,
        label: {
          content: '▼',
          color: color, fontSize: 18,
          bgColor: 'transparent', borderRadius: 0, padding: 2,
          display: 'ALWAYS', textAlign: 'center'
        },
        callout: {
          content: wp.name, color: '#FFFFFF', fontSize: 12,
          bgColor: calloutBgColor,
          borderRadius: 8, padding: 6, display: 'BYCLICK'
        },
      };
    });
  },

  // ── Events ──
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
    // Debounced real-time search
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.loadWaypoints();
    }, 400);
  },
  onSearchConfirm() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.loadWaypoints();
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

  onMarkerTap(e) {
    const wp = this.data.waypoints[e.detail.markerId];
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
