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
    const { searchKeyword, activeCategory } = this.data;
    const db = app.getDb();
    if (!db) { this.setData({ loading: false }); return Promise.resolve(); }

    let query = db.collection('waypoints');
    if (searchKeyword) {
      query = query.where({ name: db.RegExp({ regexp: searchKeyword, options: 'i' }) });
    } else if (activeCategory) {
      query = query.where({ category: activeCategory });
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
    return {
      ...wp,
      ratingStars: wp.rating > 0 ? '⭐'.repeat(Math.round(wp.rating)) : '',
      ratingRounded: Math.round(wp.rating),
    };
  },

  loadCategories() {
    // 直接硬编码，不走云函数
    this.setData({ categories: ['美食', '咖啡', '风景', '根据地', '购物', '娱乐', '其他'] });
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
    const db = app.getDb();
    if (!db) return;
    wx.showLoading({ title: '播种中...' });

    const samples = [
      { name: '张记烧烤大排档', category: '美食', location: db.Geo.Point(116.4720, 39.9150), address: '朝阳区建国路88号', notes: '必点烤串和冰啤酒，周五晚上人超多', tags: ['好吃', '回头客', '深夜档'], rating: 4.5 },
      { name: '星巴克(望京店)', category: '咖啡', location: db.Geo.Point(116.4800, 40.0020), address: '望京街10号', notes: '二楼靠窗位置最舒服', tags: ['环境好', '外卖可'], rating: 4.2 },
      { name: '西山观景台', category: '风景', location: db.Geo.Point(116.1900, 39.9950), address: '海淀区香山路', notes: '秋天红叶季最美，建议工作日去人少', tags: ['风景好', '推荐'], rating: 4.8 },
      { name: '秘密基地', category: '根据地', location: db.Geo.Point(116.3890, 39.9420), address: '西城区鼓楼大街55号', notes: '藏在胡同深处的小院，有猫', tags: ['老字号', '难找'], rating: 5.0 },
      { name: '朝阳大悦城', category: '购物', location: db.Geo.Point(116.5170, 39.9210), address: '朝阳区朝阳北路101号', notes: 'B1美食广场选择超多', tags: ['品牌全', '好逛'], rating: 4.0 },
      { name: '深夜食堂', category: '美食', location: db.Geo.Point(116.4300, 39.9400), address: '东城区东直门内大街', notes: '凌晨两点还在营业的拉面馆', tags: ['深夜档', '好吃'], rating: 4.3 },
    ];

    const now = new Date();
    const tasks = samples.map(s => db.collection('waypoints').add({
      data: { ...s, images: [], create_time: now, update_time: now }
    }));

    Promise.all(tasks).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '已播种 ' + samples.length + ' 个传送点！', icon: 'success' });
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

  onMapRegionChange(e) {
    if (e.type === 'end' && e.detail.centerLocation) {
      this.setData({
        latitude: e.detail.centerLocation.latitude,
        longitude: e.detail.centerLocation.longitude,
      });
    }
  },
});
